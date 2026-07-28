import { checkNodeSyntax, fail, jsFiles, readText, trackedFiles } from './shared-checks.mjs';

const backendFiles = jsFiles(trackedFiles()).filter(file => file.startsWith('backend/src/') || file.startsWith('backend/tests/'));
checkNodeSyntax(backendFiles);

for (const file of backendFiles) {
    const text = readText(file);
    if (/console\.(log|warn|error)\(/.test(text) && !file.endsWith('backend/src/utils/logger.js')) {
        fail(`backend_lint_raw_console:${file}`);
    }
    if (/process\.env\.(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY)/.test(text) && !file.endsWith('backend/src/config/env.js')) {
        fail(`backend_lint_direct_secret_env:${file}`);
    }
}
