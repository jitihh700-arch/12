import { cp, mkdir, rm, writeFile, copyFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

const publicRootFiles = [
    'index.html',
    'robots.txt',
    'sitemap.xml',
    'google022ca97efd079e8b.html',
    'pinterest-96d89.html',
    'favicon-96x96.png',
    'apple-touch-icon.png',
    'web-app-manifest-512x512.png'
];

function fail(message) {
    console.error(`Build Render refuse: ${message}`);
    process.exit(1);
}

function requiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) fail(`${name} est absent.`);
    assertPublicValue(name, value);
    return value;
}

function assertPublicValue(name, value) {
    const lowered = value.toLowerCase();
    const privateMarkers = [
        'service_role',
        'private key',
        'begin private key',
        'access_token',
        'refresh_token',
        'postgres://'
    ];

    if (lowered.startsWith('sb_' + 'secret_')) fail(`${name} ressemble a une cle backend.`);
    if (privateMarkers.some(marker => lowered.includes(marker))) fail(`${name} contient une valeur privee.`);
    if (/password|mot[-_ ]?de[-_ ]?passe/i.test(value)) fail(`${name} ressemble a un mot de passe.`);
}

function cleanUrl(name, value, options = {}) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        fail(`${name} doit etre une URL valide.`);
    }

    if (options.requireHttps && parsed.protocol !== 'https:') {
        fail(`${name} doit utiliser HTTPS en production.`);
    }

    if (options.supabase && !/\.supabase\.co$/i.test(parsed.hostname)) {
        fail(`${name} doit pointer vers un projet Supabase public.`);
    }

    if (parsed.username || parsed.password) fail(`${name} ne doit pas contenir d'identifiants.`);

    return parsed.toString().replace(/\/$/, '');
}

function cleanPublishableKey(value) {
    assertPublicValue('PUBLIC_SUPABASE_PUBLISHABLE_KEY', value);

    if (!value.startsWith('sb_publishable_')) {
        fail('PUBLIC_SUPABASE_PUBLISHABLE_KEY doit etre une cle publishable.');
    }

    return value;
}

async function copyIfExists(file) {
    const source = path.join(rootDir, file);
    if (!fs.existsSync(source)) return;
    const target = path.join(distDir, file);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
}

async function copyAssets() {
    const source = path.join(rootDir, 'assets');
    const target = path.join(distDir, 'assets');

    await cp(source, target, {
        recursive: true,
        filter: sourcePath => {
            const relative = path.relative(rootDir, sourcePath).replaceAll(path.sep, '/');
            return relative !== 'assets/js/supabase-runtime-config.js';
        }
    });
}

async function writeRuntimeConfig(config) {
    const outputPath = path.join(distDir, 'assets', 'js', 'supabase-runtime-config.js');
    const content = [
        'window.MEMORIZ_SUPABASE_CONFIG = {',
        `    url: ${JSON.stringify(config.supabaseUrl)},`,
        `    publishableKey: ${JSON.stringify(config.publishableKey)}`,
        '};',
        '',
        'window.MEMORIZ_MULTIPLAYER_CONFIG = {',
        `    url: ${JSON.stringify(config.backendUrl)}`,
        '};',
        ''
    ].join('\n');

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, 'utf8');
}

async function writeBrowserMetadata() {
    const manifest = {
        name: 'Memoriz',
        short_name: 'Memoriz',
        icons: [
            {
                src: '/favicon-96x96.png',
                sizes: '96x96',
                type: 'image/png'
            },
            {
                src: '/web-app-manifest-512x512.png',
                sizes: '512x512',
                type: 'image/png'
            }
        ],
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone'
    };

    await writeFile(path.join(distDir, 'site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await writeFile(
        path.join(distDir, 'favicon.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="18" fill="#121212"/><text x="48" y="61" text-anchor="middle" font-size="46" font-family="Arial, sans-serif" fill="#ffffff">M</text></svg>\n',
        'utf8'
    );
    await copyFile(path.join(rootDir, 'favicon-96x96.png'), path.join(distDir, 'favicon.ico'));
}

const supabaseUrl = cleanUrl('PUBLIC_SUPABASE_URL', requiredEnv('PUBLIC_SUPABASE_URL'), {
    requireHttps: true,
    supabase: true
});
const publishableKey = cleanPublishableKey(requiredEnv('PUBLIC_SUPABASE_PUBLISHABLE_KEY'));
const backendUrl = cleanUrl('PUBLIC_BACKEND_URL', requiredEnv('PUBLIC_BACKEND_URL'), { requireHttps: true });

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

for (const file of publicRootFiles) {
    await copyIfExists(file);
}

await copyAssets();
await writeRuntimeConfig({ supabaseUrl, publishableKey, backendUrl });
await writeBrowserMetadata();

console.log('Build Render frontend pret dans dist/.');
