import { fail, readText, trackedFiles } from './shared-checks.mjs';

const textExtensions = /\.(css|html|js|json|md|mjs|sql|toml|yml|yaml|ps1)$/i;
const legacyFormatExceptions = new Set([
    'google022ca97efd079e8b.html',
    'pinterest-96d89.html',
    'index.html'
]);

for (const file of trackedFiles().filter(file => textExtensions.test(file))) {
    if (legacyFormatExceptions.has(file)) continue;
    const text = readText(file);
    const lines = text.split(/\n/);
    lines.forEach((line, index) => {
        if (/[ \t]\r?$/.test(line)) fail(`format_trailing_whitespace:${file}:${index + 1}`);
    });
    if (!text.endsWith('\n')) fail(`format_missing_final_newline:${file}`);
}
