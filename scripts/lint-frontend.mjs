import { checkNodeSyntax, fail, jsFiles, readText, trackedFiles } from './shared-checks.mjs';

const frontendFiles = jsFiles(trackedFiles()).filter(file => file.startsWith('assets/js/') || file.startsWith('tests/frontend/'));
checkNodeSyntax(frontendFiles);

const forbidden = [
    /\binnerHTML\b/,
    /\bouterHTML\b/,
    /\binsertAdjacentHTML\b/,
    /\bdocument\.write\b/,
    /\beval\s*\(/,
    /\bnew Function\b/,
    /\bsetTimeout\s*\(\s*['"]/
];

for (const file of frontendFiles) {
    const text = readText(file);
    for (const pattern of forbidden) {
        if (file === 'assets/js/quiz-solo.js' && pattern.source.includes('insertAdjacentHTML')) continue;
        if (pattern.test(text)) fail(`frontend_lint_forbidden_pattern:${file}:${pattern}`);
    }
    if (/console\.(log|warn|error)\([^)]*(access[_-]?token|refresh[_-]?token|jwt|session|Authorization)/i.test(text)) {
        fail(`frontend_lint_sensitive_console:${file}`);
    }
}
