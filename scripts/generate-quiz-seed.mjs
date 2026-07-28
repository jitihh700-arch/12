import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quizDataPath = path.join(rootDir, 'assets', 'js', 'quiz-data.js');
const indexPath = path.join(rootDir, 'index.html');
const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260728150100_quiz_seed.sql');
const expectedCategoryCount = 26;
const durationSeconds = 600;

function normalizeQuizAnswer(value) {
    if (!value) return '';
    let normalized = String(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    normalized = normalized.replace(/^\d{4}\s*:\s*/, '');
    normalized = normalized.replace(/[^a-z0-9\s]/g, '').trim();
    return normalized;
}

function sql(value) {
    if (value === null || value === undefined) return 'null';
    return `'${String(value).replace(/'/g, "''")}'`;
}

function extractQuizData(source) {
    const forbidden = /\b(import|require|fetch|XMLHttpRequest|document|window|globalThis|process|Function|eval)\b/;
    if (forbidden.test(source)) {
        throw new Error('quiz-data.js contient une instruction non attendue pour le seed');
    }

    const context = {};
    vm.createContext(context, {
        codeGeneration: {
            strings: false,
            wasm: false
        }
    });
    vm.runInContext(`${source}\nthis.categoryMapping = categoryMapping;`, context, {
        filename: 'quiz-data.js',
        timeout: 1000
    });

    if (!context.categoryMapping || typeof context.categoryMapping !== 'object') {
        throw new Error('categoryMapping est introuvable');
    }

    return context.categoryMapping;
}

function extractDescriptions(indexHtml) {
    const descriptions = new Map();
    const cardPattern = /<div class="category-card" data-category="([^"]+)"><h3>[^<]*<\/h3><p>([^<]*)<\/p><span class="questions-count">([^<]*)<\/span><\/div>/g;
    let match;

    while ((match = cardPattern.exec(indexHtml)) !== null) {
        descriptions.set(match[1], `${match[2]} (${match[3]})`);
    }

    return descriptions;
}

function validateCategories(categoryMapping, descriptions) {
    const entries = Object.entries(categoryMapping);

    if (entries.length !== expectedCategoryCount) {
        throw new Error(`Nombre de categories inattendu: ${entries.length}`);
    }

    for (const [categoryId, category] of entries) {
        if (!/^[A-Za-z0-9]+$/.test(categoryId)) {
            throw new Error(`Identifiant de categorie invalide: ${categoryId}`);
        }
        if (!category || typeof category.title !== 'string' || !Array.isArray(category.data)) {
            throw new Error(`Structure invalide pour ${categoryId}`);
        }
        if (category.data.length === 0) {
            throw new Error(`Categorie vide: ${categoryId}`);
        }
        if (!descriptions.has(categoryId)) {
            throw new Error(`Description introuvable pour ${categoryId}`);
        }
        if (category.hintList && category.hintList.length !== category.data.length) {
            throw new Error(`Nombre d'indices incoherent pour ${categoryId}`);
        }
        if (category.showYears && (!category.yearsList || category.yearsList.length !== category.data.length)) {
            throw new Error(`Nombre d'annees incoherent pour ${categoryId}`);
        }
        for (const [index, answer] of category.data.entries()) {
            if (typeof answer !== 'string' || answer.length === 0) {
                throw new Error(`Reponse invalide pour ${categoryId} position ${index + 1}`);
            }
            if (normalizeQuizAnswer(answer).length === 0) {
                throw new Error(`Normalisation vide pour ${categoryId} position ${index + 1}`);
            }
        }
    }

    return entries;
}

function buildMigration(entries, descriptions) {
    const lines = [
        '-- Phase 4A: seed canonique du quiz genere depuis assets/js/quiz-data.js.',
        '-- Ne pas modifier manuellement: npm run generate:quiz-seed.',
        '',
        'truncate table private.quiz_answers restart identity cascade;',
        'delete from private.quiz_categories;',
        '',
        'insert into private.quiz_categories (id, title, description, duration_seconds, is_active, display_order)',
        'values'
    ];

    lines.push(entries.map(([categoryId, category], index) => {
        return `  (${sql(categoryId)}, ${sql(category.title)}, ${sql(descriptions.get(categoryId))}, ${durationSeconds}, true, ${index + 1})`;
    }).join(',\n') + ';');

    lines.push(
        '',
        'insert into private.quiz_answers (category_id, answer_text, answer_normalized, hint, answer_year, display_order)',
        'values'
    );

    const answerRows = [];
    for (const [categoryId, category] of entries) {
        category.data.forEach((answer, index) => {
            const hint = category.hintList ? category.hintList[index] : null;
            const year = category.showYears && category.yearsList ? String(category.yearsList[index]) : null;
            answerRows.push(
                `  (${sql(categoryId)}, ${sql(answer)}, ${sql(normalizeQuizAnswer(answer))}, ${sql(hint)}, ${sql(year)}, ${index + 1})`
            );
        });
    }

    lines.push(answerRows.join(',\n') + ';', '');
    return lines.join('\n');
}

const source = fs.readFileSync(quizDataPath, 'utf8');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
const categoryMapping = extractQuizData(source);
const descriptions = extractDescriptions(indexHtml);
const entries = validateCategories(categoryMapping, descriptions);
const migration = buildMigration(entries, descriptions);

fs.writeFileSync(migrationPath, migration, 'utf8');
console.log(`Seed quiz genere: ${entries.length} categories, ${entries.reduce((total, [, category]) => total + category.data.length, 0)} reponses.`);
