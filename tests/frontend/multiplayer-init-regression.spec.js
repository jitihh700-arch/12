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

async function installControlledRuntime(page, options = {}) {
    await page.addInitScript(({ profileMode, socketMode }) => {
        const profile = { id: 'profile-test', pseudo: 'Host', total_points: 0, quizzes_completed: 0 };
        const session = { access_token: 'test-access-token', user: { id: profile.id } };

        window.__connectCalls = 0;
        window.__profileCalls = 0;
        window.__resolveProfile = null;
        window.__socketMode = socketMode || 'success';
        window.__profilePromise = new Promise(resolve => {
            window.__resolveProfile = resolve;
        });

        function profileResponse() {
            window.__profileCalls += 1;
            if (profileMode === 'missing') {
                return { data: null, error: new Error('profile_not_found') };
            }
            if (profileMode === 'delayed') {
                return window.__profilePromise;
            }
            return { data: [profile], error: null };
        }

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
                        if (name === 'get_my_profile') return profileResponse();
                        if (name === 'register_profile') return { data: [profile], error: null };
                        if (name === 'list_comments') return { data: [], error: null };
                        return { data: null, error: null };
                    }
                };
            }
        };

        window.__fakeIo = () => {
            window.__connectCalls += 1;
            const failFirst = window.__socketMode === 'profile-required-once' && window.__connectCalls === 1;
            const handlers = {};

            function addHandler(event, handler) {
                handlers[event] = handlers[event] || [];
                handlers[event].push(handler);
            }

            function emitLocal(event, payload) {
                (handlers[event] || []).forEach(handler => handler(payload));
            }

            window.__lastSocketHandlers = handlers;
            window.__emitLastSocket = emitLocal;

            return {
                connected: false,
                on(event, handler) {
                    addHandler(event, handler);
                    return this;
                },
                once(event, handler) {
                    addHandler(event, handler);
                    if (event === 'connect') {
                        window.setTimeout(() => {
                            if (!failFirst) {
                                this.connected = true;
                                emitLocal('connect');
                            }
                        }, 0);
                    }
                    if (event === 'connect_error') {
                        window.setTimeout(() => {
                            if (failFirst) emitLocal('connect_error', new Error('profile_required'));
                        }, 0);
                    }
                    return this;
                },
                timeout() {
                    return this;
                },
                emit(event, payload, ack) {
                    ack(null, { ok: true, data: { gameCode: 'AB234C', players: [] } });
                },
                disconnect() {
                    this.connected = false;
                }
            };
        };

        window.supabase = window.__fakeSupabase;
        window.io = window.__fakeIo;
    }, options);
}

async function openMultiplayerFlow(page) {
    await page.evaluate(() => window.MemorizMultiplayer.open());
}

test('profil disponible: le socket demarre avec session et profil valides', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await openMultiplayerFlow(page);

    await expect.poll(() => page.evaluate(() => window.__connectCalls)).toBe(1);
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
    await expect.poll(() => page.evaluate(() => window.MemorizMultiplayerSocket.getState().lastError)).toBe(null);
});

test('lobby: les evenements recus apres connexion mettent a jour l hote', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await openMultiplayerFlow(page);
    await expect.poll(() => page.evaluate(() => window.__connectCalls)).toBe(1);

    await page.evaluate(() => {
        window.__emitLastSocket('gameCreated', {
            gameCode: 'AB234C',
            categoryId: 'series',
            status: 'waiting',
            maxPlayers: 4,
            currentPlayers: 1,
            hostId: 'profile-test',
            players: [
                { pseudo: 'Host', isHost: true, isCurrent: true, isConnected: true, isReady: true }
            ]
        });
    });
    await expect(page.locator('#multiplayer-count-label')).toHaveText('1/4 joueurs');

    await page.evaluate(() => {
        window.__emitLastSocket('playerJoined', {
            gameCode: 'AB234C',
            categoryId: 'series',
            status: 'waiting',
            maxPlayers: 4,
            currentPlayers: 2,
            hostId: 'profile-test',
            players: [
                { pseudo: 'Host', isHost: true, isCurrent: true, isConnected: true, isReady: true },
                { pseudo: 'Rosey', isHost: false, isCurrent: false, isConnected: true, isReady: false }
            ]
        });
    });

    await expect(page.locator('#multiplayer-count-label')).toHaveText('2/4 joueurs');
    await expect(page.locator('#multiplayer-start')).toBeEnabled();
});

test('profil retarde: openModal attend profile-ready avant de connecter le socket', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'delayed', socketMode: 'success' });
    await gotoHome(page);

    await page.evaluate(() => {
        window.__openDone = false;
        window.MemorizMultiplayer.open().then(() => {
            window.__openDone = true;
        });
    });

    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__connectCalls)).toBe(0);

    await page.evaluate(() => {
        window.__resolveProfile({
            data: [{ id: 'profile-test', pseudo: 'Host', total_points: 0, quizzes_completed: 0 }],
            error: null
        });
    });

    await expect.poll(() => page.evaluate(() => window.__connectCalls)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__openDone)).toBe(true);
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
});

test('profil absent: le socket ne demarre pas et le message reste explicite', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'missing', socketMode: 'success' });
    await gotoHome(page);

    await page.evaluate(() => window.MemorizMultiplayer.open());

    expect(await page.evaluate(() => window.__connectCalls)).toBe(0);
    await expect(page.locator('#multiplayer-status')).toHaveText('Ton profil doit être chargé avant d’utiliser le multijoueur.');
});

test('profil absent: aucune modale forcee ne vole le focus des champs', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'missing', socketMode: 'success' });
    await gotoHome(page);

    await expect(page.locator('#profile-modal')).toBeHidden();
    await expect(page.locator('#v4-nav-profile-name')).toHaveText('Créer profil');

    await page.evaluate(() => window.MemorizMultiplayer.open());
    await page.locator('#multiplayer-category').focus();
    await expect(page.locator('#multiplayer-category')).toBeFocused();
    await expect(page.locator('#profile-modal')).toBeHidden();
});

test('profil disponible: le menu categorie multijoueur garde le focus apres connexion', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await openMultiplayerFlow(page);
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
    await page.locator('#multiplayer-category').focus();
    await page.waitForTimeout(150);

    await expect(page.locator('#multiplayer-category')).toBeFocused();
    await expect(page.locator('#multiplayer-modal')).toBeVisible();
});

test('profil actif: le champ commentaire garde le focus', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await page.locator('.v4-top-nav [data-v4-route="community"]').click();
    await expect(page.locator('#comment-input')).toBeEnabled();
    await page.locator('#comment-input').click();
    await page.locator('#comment-input').fill('Message de test');

    await expect(page.locator('#comment-input')).toBeFocused();
    await expect(page.locator('#comment-input')).toHaveValue('Message de test');
    await expect(page.locator('#profile-modal')).toBeHidden();
});

test('navigation rapide: le champ commentaire ne perd pas le focus', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await page.locator('.v4-top-nav [data-v4-route="community"]').click();
    await page.locator('#comment-input').click();
    await page.locator('#comment-input').pressSequentially('Mon commentaire de test', { delay: 20 });
    await page.waitForTimeout(350);

    await expect(page.locator('#comment-input')).toBeFocused();
    await expect(page.locator('#comment-input')).toHaveValue('Mon commentaire de test');
});

test('profil absent: le champ commentaire reste cliquable et propose la creation du profil', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'missing', socketMode: 'success' });
    await gotoHome(page);

    await page.locator('.v4-top-nav [data-v4-route="community"]').click();
    await expect(page.locator('#comment-input')).toBeEnabled();
    await expect(page.locator('#comment-input')).toHaveAttribute('readonly', '');
    await expect(page.locator('#comments-status')).toHaveText('Pseudo requis');

    await page.locator('#comment-input').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
});

test('navigation rapide: le menu categorie multijoueur ne se referme pas par focus tardif', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'success' });
    await gotoHome(page);

    await page.locator('.v4-top-nav [data-v4-route="multiplayer"]').click();
    await page.locator('#v4-multiplayer-create').click();
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
    await page.locator('#multiplayer-category').focus();
    await page.waitForTimeout(350);

    await expect(page.locator('#multiplayer-category')).toBeFocused();
    await expect(page.locator('#multiplayer-modal')).toBeVisible();
});

test('profile_required puis profil disponible: une reconnexion nettoie lastError', async ({ page }) => {
    await routeBrowserDependencies(page);
    await installControlledRuntime(page, { profileMode: 'ready', socketMode: 'profile-required-once' });
    await gotoHome(page);

    await openMultiplayerFlow(page);

    await expect.poll(() => page.evaluate(() => window.__connectCalls)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.MemorizMultiplayerSocket.getState().lastError)).toBe('profile_required');
    await expect(page.locator('#multiplayer-status')).toHaveText('Ton profil doit être chargé avant d’utiliser le multijoueur.');

    await page.evaluate(() => {
        document.dispatchEvent(new CustomEvent('memoriz:profile-ready', {
            detail: { profile: { id: 'profile-test', pseudo: 'Host', total_points: 0, quizzes_completed: 0 } }
        }));
    });

    await expect.poll(() => page.evaluate(() => window.__connectCalls)).toBe(2);
    await expect.poll(() => page.evaluate(() => window.MemorizMultiplayerSocket.getState().lastError)).toBe(null);
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
});
