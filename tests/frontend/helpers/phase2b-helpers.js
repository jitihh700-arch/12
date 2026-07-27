const { execFileSync, execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');

const rootDir = path.resolve(__dirname, '..', '..', '..');
const runtimeConfigPath = path.join(rootDir, 'assets', 'js', 'supabase-runtime-config.js');

function dockerEnv() {
    return {
        ...process.env,
        PATH: `C:\\Program Files\\Docker\\Docker\\resources\\bin;${process.env.PATH || ''}`
    };
}

function supabaseStatus() {
    const raw = execSync('npx supabase status --output json', {
        cwd: rootDir,
        env: dockerEnv(),
        encoding: 'utf8',
        shell: 'cmd.exe',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    return JSON.parse(raw);
}

function writeRuntimeConfig() {
    const status = supabaseStatus();
    execFileSync(process.execPath, ['scripts/generate-supabase-config.mjs'], {
        cwd: rootDir,
        env: {
            ...process.env,
            SUPABASE_URL: status.API_URL,
            SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
}

function removeRuntimeConfig() {
    if (fs.existsSync(runtimeConfigPath)) fs.unlinkSync(runtimeConfigPath);
}

function psql(sql) {
    return execFileSync('docker.exe', ['exec', '-i', 'supabase_db_12', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', sql], {
        cwd: rootDir,
        env: dockerEnv(),
        encoding: 'utf8'
    }).trim();
}

async function gotoHome(page) {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
}

async function createProfile(page, pseudo) {
    await page.locator('#profile-pseudo-input').fill(pseudo);
    await page.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#profile-pseudo')).toHaveText(pseudo.trim().replace(/\s+/g, ' '));
}

async function currentSession(page) {
    return page.evaluate(async () => {
        const state = window.memorizAuth.getState();
        const { data } = await window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG).client.auth.getSession();
        return {
            userId: data.session?.user?.id || null,
            profile: state.profile,
            cache: JSON.parse(localStorage.getItem('memoriz_profile_cache') || 'null')
        };
    });
}

async function expectNoHorizontalOverflow(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
}

module.exports = {
    rootDir,
    runtimeConfigPath,
    writeRuntimeConfig,
    removeRuntimeConfig,
    psql,
    gotoHome,
    createProfile,
    currentSession,
    expectNoHorizontalOverflow
};
