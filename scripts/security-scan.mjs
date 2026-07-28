import { fail, readText, trackedFiles } from './shared-checks.mjs';

const allowedFiles = new Set([
    'README.md',
    'backend/tests/unit/backend-core.test.js',
    'docs/testing/02-phase-2b-frontend-auth-validation.md',
    'docs/testing/08-phase-6-production-readiness.md',
    'scripts/security-scan.mjs'
]);

const forbiddenFiles = [
    '.env',
    'backend/.env',
    'assets/js/supabase-runtime-config.js',
    'supabase/.temp',
    'supabase/.branches',
    'test-results',
    'playwright-report',
    'node_modules',
    'backend/node_modules'
];

const patterns = [
    ['supabase_secret_key', /sb_secret_[A-Za-z0-9_-]+/g],
    ['jwt', /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
    ['postgres_url', /postgres:\/\/(?!user:password@host:5432\/database)[^\s"'<>]+/gi],
    ['authorization_bearer', /Bearer\s+(?!<token>|redacted|fake-token|token)[A-Za-z0-9._-]+/gi],
    ['github_token', /gh[pousr]_[A-Za-z0-9_]{20,}/g],
    ['socket_token', /socket[_-]?token\s*[:=]\s*['"][^'"]{8,}['"]/gi]
];

const files = trackedFiles();
for (const forbidden of forbiddenFiles) {
    if (files.some(file => file === forbidden || file.startsWith(`${forbidden}/`))) {
        fail(`security_forbidden_tracked_file:${forbidden}`);
    }
}

for (const file of files) {
    const text = readText(file);
    for (const [name, pattern] of patterns) {
        const matches = text.match(pattern) || [];
        const realMatches = matches.filter(match => {
            if (file === 'scripts/security-scan.mjs') return false;
            if (allowedFiles.has(file) && name === 'authorization_bearer') return false;
            if (allowedFiles.has(file) && /sb_secret_abc123|eyJaaa\.bbb\.ccc|Bearer abc\.def\.ghi|postgres:\/\/|chaine `postgres:\/\/`/.test(match)) return false;
            if (/placeholder|example|fake|redacted|<|>|\[|\]/i.test(match)) return false;
            return true;
        });
        if (realMatches.length) fail(`security_secret_pattern:${name}:${file}`);
    }
}
