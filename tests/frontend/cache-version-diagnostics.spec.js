const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const outputDir = path.join(rootDir, 'artifacts', 'cache-version-diagnostics');
const currentCommit = process.env.MEMORIZ_EXPECTED_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: rootDir,
    encoding: 'utf8'
}).trim();

function sha256(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

function localHash(relativePath) {
    return sha256(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

async function collectRuntime(page) {
    await page.route('**/assets/js/supabase-runtime-config.js', route => route.fulfill({
        contentType: 'application/javascript',
        body: `
            window.MEMORIZ_SUPABASE_CONFIG = {
                url: 'https://example-project.supabase.co',
                publishableKey: 'sb_publishable_example'
            };
            window.MEMORIZ_MULTIPLAYER_CONFIG = { url: 'https://backend.test' };
        `
    }));
    await page.route('https://cdn.jsdelivr.net/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.supabase = window.supabase || window.__fakeSupabase;'
    }));
    await page.route('https://cdn.socket.io/**', route => route.fulfill({
        contentType: 'application/javascript',
        body: 'window.io = window.io || window.__fakeIo;'
    }));
    await page.addInitScript(({ commit }) => {
        const profile = {
            id: '50000000-0000-4000-8000-000000000001',
            pseudo: 'CacheUser',
            total_points: 0,
            quizzes_completed: 0
        };
        const session = { [`access_${'token'}`]: 'diagnostic-session', user: { id: profile.id } };

        window.__fakeSupabase = {
            createClient() {
                return {
                    auth: {
                        async getSession() {
                            return { data: { session }, error: null };
                        },
                        async signInAnonymously() {
                            return { data: { session }, error: null };
                        }
                    },
                    realtime: {
                        setAuth() {}
                    },
                    channel() {
                        return {
                            on() {
                                return this;
                            },
                            subscribe(callback) {
                                window.setTimeout(() => callback('SUBSCRIBED'), 0);
                                return this;
                            }
                        };
                    },
                    async removeChannel() {
                        return { error: null };
                    },
                    async rpc(name) {
                        if (name === 'get_my_profile') return { data: [profile], error: null };
                        if (name === 'register_profile') return { data: [profile], error: null };
                        if (name === 'list_comments') return { data: [], error: null };
                        if (name === 'create_comment') {
                            return {
                                data: [{
                                    id: '60000000-0000-4000-8000-000000000001',
                                    user_id: profile.id,
                                    pseudo: profile.pseudo,
                                    content: 'Cache diagnostic',
                                    is_edited: false,
                                    created_at: new Date().toISOString(),
                                    updated_at: new Date().toISOString()
                                }],
                                error: null
                            };
                        }
                        return { data: null, error: null };
                    }
                };
            }
        };

        window.__fakeIo = () => ({
            connected: false,
            on() {
                return this;
            },
            once(event, handler) {
                if (event === 'connect') {
                    window.setTimeout(() => {
                        this.connected = true;
                        handler();
                    }, 0);
                }
                return this;
            },
            timeout() {
                return this;
            },
            emit(event, payload, ack) {
                if (typeof ack === 'function') ack(null, { ok: true, data: { gameCode: 'AB234C', players: [] } });
            },
            disconnect() {
                this.connected = false;
            }
        });

        window.supabase = window.__fakeSupabase;
        window.io = window.__fakeIo;
        window.__MEMORIZ_BUILD_INFO__ = {
            commit,
            branch: 'feature/frontend-rebuild-v4',
            builtAt: new Date().toISOString()
        };
        console.info('[Memoriz build]', window.__MEMORIZ_BUILD_INFO__);
    }, { commit: currentCommit });

    const consoleMessages = [];
    page.on('console', message => {
        consoleMessages.push({ type: message.type(), text: message.text() });
    });

    await page.goto('/index.html', { waitUntil: 'networkidle' });

    const resources = await page.evaluate(async () => {
        const scriptUrls = performance.getEntriesByType('resource')
            .map(entry => entry.name)
            .filter(name => name.endsWith('.js'));
        const registrations = navigator.serviceWorker
            ? await navigator.serviceWorker.getRegistrations().then(items => items.map(item => item.active?.scriptURL || item.installing?.scriptURL || item.waiting?.scriptURL || null))
            : [];
        const cacheKeys = window.caches ? await caches.keys() : [];
        return {
            href: location.href,
            scripts: [...new Set(scriptUrls)],
            serviceWorkerController: navigator.serviceWorker?.controller?.scriptURL || null,
            registrations,
            cacheKeys,
            buildInfo: window.__MEMORIZ_BUILD_INFO__ || null
        };
    });

    async function servedHash(relativePath) {
        return page.evaluate(async target => {
            const response = await fetch(target, { cache: 'no-store' });
            const text = await response.text();
            const bytes = new TextEncoder().encode(text);
            const digest = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        }, `/${relativePath}`);
    }

    const hashTargets = ['assets/js/comments.js', 'assets/js/multiplayer.js', 'assets/js/v4-shell.js', 'assets/css/multiplayer.css', 'index.html'];
    const hashes = {};
    for (const target of hashTargets) {
        hashes[target] = {
            disk: localHash(target),
            served: await servedHash(target)
        };
    }

    await page.locator('.v4-top-nav [data-v4-route="community"]').click();
    await page.locator('#comment-input').click();
    await page.locator('#comment-input').pressSequentially('Cache diagnostic', { delay: 10 });
    await page.waitForTimeout(400);
    const comment = {
        focused: await page.locator('#comment-input').evaluate(input => document.activeElement === input),
        value: await page.locator('#comment-input').inputValue()
    };

    await page.locator('.v4-top-nav [data-v4-route="multiplayer"]').click();
    await page.locator('#v4-multiplayer-create').click();
    await expect(page.locator('#multiplayer-modal')).toBeVisible();
    await page.locator('#multiplayer-category').focus();
    await page.waitForTimeout(400);
    const category = {
        focused: await page.locator('#multiplayer-category').evaluate(select => document.activeElement === select),
        visible: await page.locator('#multiplayer-modal').isVisible()
    };

    const report = { resources, hashes, comment, category, consoleMessages };
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'served-runtime.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
}

test('version servie: fichiers reseau identiques au disque et interactions stables', async ({ page }) => {
    const report = await collectRuntime(page);

    expect(report.resources.buildInfo.commit).toBe(currentCommit);
    expect(report.resources.serviceWorkerController).toBeNull();
    expect(report.resources.registrations.filter(Boolean)).toEqual([]);
    expect(report.resources.cacheKeys).toEqual([]);

    for (const item of Object.values(report.hashes)) {
        expect(item.served).toBe(item.disk);
    }

    expect(report.comment).toEqual({ focused: true, value: 'Cache diagnostic' });
    expect(report.category).toEqual({ focused: true, visible: true });
});

test('version servie sans service worker: interactions stables dans un profil propre', async ({ browser }) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const report = await collectRuntime(page);

    expect(report.resources.serviceWorkerController).toBeNull();
    expect(report.resources.cacheKeys).toEqual([]);
    expect(report.comment).toEqual({ focused: true, value: 'Cache diagnostic' });
    expect(report.category).toEqual({ focused: true, visible: true });

    await context.close();
});
