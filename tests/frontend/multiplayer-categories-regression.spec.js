const { test, expect } = require('@playwright/test');
const { gotoHome } = require('./helpers/phase2b-helpers');

async function routeBrowserDependencies(page) {
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
}

async function installReadyProfileRuntime(page) {
    await page.addInitScript(() => {
        const profile = { id: 'profile-test', pseudo: 'Host', total_points: 0, quizzes_completed: 0 };
        const session = { access_token: 'test-access-token', user: { id: profile.id } };

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
                    async rpc(name) {
                        if (name === 'get_my_profile') return { data: [profile], error: null };
                        return { data: null, error: null };
                    }
                };
            }
        };

        window.__fakeIo = () => ({
            on() {
                return this;
            },
            once(event, handler) {
                if (event === 'connect') window.setTimeout(handler, 0);
                return this;
            },
            timeout() {
                return this;
            },
            emit(event, payload, ack) {
                ack(null, { ok: true, data: { gameCode: 'AB234C', players: [] } });
            },
            disconnect() {}
        });

        window.supabase = window.__fakeSupabase;
        window.io = window.__fakeIo;
    });
}

test('categories multijoueur: quiz-data expose les 26 options reelles', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installReadyProfileRuntime(page);
    await gotoHome(page);

    const globals = await page.evaluate(() => ({
        identifierType: typeof categoryMapping,
        windowType: typeof window.categoryMapping,
        count: Object.keys(window.categoryMapping || {}).length
    }));

    expect(globals.identifierType).toBe('object');
    expect(globals.windowType).toBe('object');
    expect(globals.count).toBe(26);
    await expect(page.locator('#multiplayer-category option')).toHaveCount(26);
    await expect(page.locator('#multiplayer-category option').first()).not.toHaveAttribute('value', '');
    await expect(page.locator('#multiplayer-category option').first()).not.toHaveText('');

    await page.locator('#multiplayer-open').click();
    await page.locator('#multiplayer-close').click();
    await page.locator('#multiplayer-open').click();
    await expect(page.locator('#multiplayer-category option')).toHaveCount(26);
});
