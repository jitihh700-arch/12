import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputPath = path.resolve('assets/js/supabase-runtime-config.js');
const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

function fail(message) {
    console.error(`Configuration Supabase refusee: ${message}`);
    process.exit(1);
}

function mask(value) {
    if (!value) return '';
    if (value.length <= 10) return `${value.slice(0, 2)}...`;
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function assertPresent(name, value) {
    if (!value || !value.trim()) fail(`${name} est absent.`);
    return value.trim();
}

function assertUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        fail('SUPABASE_URL doit etre une URL valide.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        fail('SUPABASE_URL doit utiliser http ou https.');
    }

    return parsed.toString().replace(/\/$/, '');
}

function assertPublishableKey(value) {
    const lowered = value.toLowerCase();
    if (lowered.includes('service_role') || lowered.includes('sb_secret') || lowered.includes('secret')) {
        fail('SUPABASE_PUBLISHABLE_KEY ressemble a une cle secrete ou service_role.');
    }

    const jwtParts = value.split('.');
    if (jwtParts.length === 3) {
        try {
            const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
            if (payload.role === 'service_role') {
                fail('SUPABASE_PUBLISHABLE_KEY contient un JWT service_role.');
            }
        } catch {
            fail('SUPABASE_PUBLISHABLE_KEY ressemble a un JWT invalide.');
        }
    }

    return value;
}

const safeUrl = assertUrl(assertPresent('SUPABASE_URL', url));
const safeKey = assertPublishableKey(assertPresent('SUPABASE_PUBLISHABLE_KEY', publishableKey));

const content = [
    'window.MEMORIZ_SUPABASE_CONFIG = {',
    `    url: ${JSON.stringify(safeUrl)},`,
    `    publishableKey: ${JSON.stringify(safeKey)}`,
    '};',
    ''
].join('\r\n');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, 'utf8');

console.log(`Configuration Supabase generee: ${outputPath}`);
console.log(`SUPABASE_URL=${mask(safeUrl)}`);
console.log(`SUPABASE_PUBLISHABLE_KEY=${mask(safeKey)}`);
