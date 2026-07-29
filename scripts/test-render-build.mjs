import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

const testEnv = {
    ...process.env,
    PUBLIC_SUPABASE_URL: 'https://example-project.supabase.co',
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
    PUBLIC_BACKEND_URL: 'https://memoriz-backend.onrender.com'
};

function fail(message) {
    console.error(`Test Render build refuse: ${message}`);
    process.exit(1);
}

function assertExists(relativePath) {
    const absolutePath = path.join(distDir, relativePath);
    if (!fs.existsSync(absolutePath)) fail(`${relativePath} est absent de dist/.`);
    return absolutePath;
}

function listFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listFiles(absolutePath));
        else files.push(absolutePath);
    }
    return files;
}

function toLocalPath(publicPath) {
    const cleanPath = publicPath.split('#')[0].split('?')[0];
    if (!cleanPath || /^(https?:|mailto:|tel:|data:|#)/i.test(cleanPath)) return null;
    return cleanPath.replace(/^\/+/, '');
}

execFileSync(process.execPath, ['scripts/build-render-frontend.mjs'], {
    cwd: rootDir,
    env: testEnv,
    stdio: 'inherit'
});

assertExists('index.html');
assertExists('assets/js/supabase-runtime-config.js');

const configText = fs.readFileSync(path.join(distDir, 'assets/js/supabase-runtime-config.js'), 'utf8');
for (const expected of [
    testEnv.PUBLIC_SUPABASE_URL,
    testEnv.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    testEnv.PUBLIC_BACKEND_URL
]) {
    if (!configText.includes(expected)) fail(`valeur publique absente: ${expected}`);
}

const allFiles = listFiles(distDir).map(file => path.relative(distDir, file).replaceAll(path.sep, '/'));
const forbiddenRoots = ['backend/', 'supabase/', 'tests/', 'docs/', 'node_modules/', '.git/'];
for (const file of allFiles) {
    if (file === '.env' || file.startsWith('.env.')) fail(`fichier env copie: ${file}`);
    if (forbiddenRoots.some(root => file === root.slice(0, -1) || file.startsWith(root))) {
        fail(`fichier interdit copie: ${file}`);
    }
}

const distText = allFiles
    .filter(file => /\.(html|js|json|css|svg|txt|xml)$/i.test(file))
    .map(file => fs.readFileSync(path.join(distDir, file), 'utf8'))
    .join('\n');

if (/sb_secret_[A-Za-z0-9_-]+/i.test(distText)) fail('cle backend detectee.');
if (/service_role/i.test(distText)) fail('service_role detecte.');
if (/postgres:\/\//i.test(distText)) fail('URL PostgreSQL detectee.');
if (/\b(?:password|db_password|postgres_password)\s*[:=]\s*["'][^"']+["']/i.test(distText)) {
    fail('valeur de mot de passe detectee.');
}

const indexText = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
const references = [...indexText.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)].map(match => match[1]);
for (const reference of references) {
    const localPath = toLocalPath(reference);
    if (!localPath) continue;
    assertExists(localPath);
}

const runtimeIndex = indexText.indexOf('assets/js/supabase-runtime-config.js');
for (const script of [
    'assets/js/api.js',
    'assets/js/auth.js',
    'assets/js/quiz-session.js',
    'assets/js/leaderboard.js',
    'assets/js/multiplayer-socket.js',
    'assets/js/multiplayer.js',
    'assets/js/comments.js'
]) {
    const scriptIndex = indexText.indexOf(script);
    if (scriptIndex === -1) fail(`${script} n'est pas reference par index.html.`);
    if (runtimeIndex === -1 || runtimeIndex > scriptIndex) {
        fail(`la config runtime doit etre chargee avant ${script}.`);
    }
}

console.log('Test Render build OK.');
