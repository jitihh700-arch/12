import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dockerExe = process.env.DOCKER_EXE || 'docker';

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

function loadFrontendQuiz() {
    const source = fs.readFileSync(path.join(rootDir, 'assets/js/quiz-data.js'), 'utf8');
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

    return Object.entries(context.categoryMapping).map(([id, category], categoryIndex) => ({
        id,
        title: category.title,
        duration_seconds: 600,
        display_order: categoryIndex + 1,
        answers: category.data.map((answer, answerIndex) => ({
            answer_text: answer,
            answer_normalized: normalizeQuizAnswer(answer),
            hint: category.hintList ? category.hintList[answerIndex] : null,
            answer_year: category.showYears && category.yearsList ? String(category.yearsList[answerIndex]) : null,
            display_order: answerIndex + 1
        }))
    }));
}

function queryDatabaseQuiz() {
    const sql = String.raw`
select coalesce(jsonb_agg(category_row order by (category_row->>'display_order')::int), '[]'::jsonb)
from (
  select jsonb_build_object(
    'id', qc.id,
    'title', qc.title,
    'duration_seconds', qc.duration_seconds,
    'display_order', qc.display_order,
    'answers', (
      select jsonb_agg(jsonb_build_object(
        'answer_text', qa.answer_text,
        'answer_normalized', qa.answer_normalized,
        'hint', qa.hint,
        'answer_year', qa.answer_year,
        'display_order', qa.display_order
      ) order by qa.display_order)
      from private.quiz_answers as qa
      where qa.category_id = qc.id
    )
  ) as category_row
  from private.quiz_categories as qc
) as q;
`;

    const output = execFileSync(dockerExe, [
        'exec',
        '-i',
        'supabase_db_12',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-t',
        '-A',
        '-c',
        sql
    ], {
        cwd: rootDir,
        encoding: 'utf8'
    }).trim();

    return JSON.parse(output);
}

function assertSame(frontend, database) {
    if (frontend.length !== database.length) {
        throw new Error(`Nombre de categories different: js=${frontend.length} db=${database.length}`);
    }

    for (let categoryIndex = 0; categoryIndex < frontend.length; categoryIndex += 1) {
        const expectedCategory = frontend[categoryIndex];
        const actualCategory = database[categoryIndex];
        const label = `${expectedCategory.id}#${categoryIndex + 1}`;

        for (const key of ['id', 'title', 'duration_seconds', 'display_order']) {
            if (expectedCategory[key] !== actualCategory[key]) {
                throw new Error(`Categorie differente ${label}: champ=${key}`);
            }
        }

        if (expectedCategory.answers.length !== actualCategory.answers.length) {
            throw new Error(`Nombre de reponses different ${label}`);
        }

        for (let answerIndex = 0; answerIndex < expectedCategory.answers.length; answerIndex += 1) {
            const expectedAnswer = expectedCategory.answers[answerIndex];
            const actualAnswer = actualCategory.answers[answerIndex];
            for (const key of ['answer_text', 'answer_normalized', 'hint', 'answer_year', 'display_order']) {
                if (expectedAnswer[key] !== actualAnswer[key]) {
                    throw new Error(`Reponse differente ${label}: position=${answerIndex + 1}, champ=${key}`);
                }
            }
        }
    }
}

const frontendQuiz = loadFrontendQuiz();
const databaseQuiz = queryDatabaseQuiz();
assertSame(frontendQuiz, databaseQuiz);

console.log(`Cohérence seed quiz OK: ${frontendQuiz.length} categories, ${frontendQuiz.reduce((total, category) => total + category.answers.length, 0)} reponses.`);
