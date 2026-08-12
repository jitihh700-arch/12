const { test, expect } = require('@playwright/test');
const { gotoHome, expectNoHorizontalOverflow } = require('./helpers/phase2b-helpers');

test.describe.configure({ mode: 'serial' });

async function installFakeMultiplayer(page) {
    await page.addInitScript(() => {
        window.MEMORIZ_MULTIPLAYER_CONFIG = { url: 'http://backend.test' };
        window.__multiplayerPayloads = [];
        window.__xssRan = false;
        window.memorizAuth = {
            getState() {
                return { hasProfile: true, profile: { id: 'u1', pseudo: 'Host', total_points: 0 } };
            },
            async initProfile() {
                return this.getState().profile;
            }
        };
        window.__fakeSnapshot = {
            gameCode: 'AB234C',
            categoryId: 'series',
            status: 'waiting',
            maxPlayers: 4,
            currentPlayers: 1,
            hostId: 'u1',
            durationSeconds: 600,
            startedAt: null,
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            finishedAt: null,
            players: [
                { playerId: 'p1', pseudo: 'Host<script>window.__xssRan=true</script>', score: 0, correctAnswers: 0, isReady: true, isConnected: true, isHost: true, isCurrent: true, rank: 1 }
            ],
            myFoundAnswers: []
        };
        window.io = () => ({
            connected: false,
            handlers: {},
            on(event, handler) {
                this.handlers[event] = handler;
                if (event === 'connect') setTimeout(handler, 0);
                return this;
            },
            once(event, handler) {
                this.handlers[event] = handler;
                if (event === 'connect') setTimeout(handler, 0);
                return this;
            },
            timeout() {
                return this;
            },
            emit(event, payload, ack) {
                window.__multiplayerPayloads.push({ event, payload });
                const snapshot = window.__fakeSnapshot;
                if (event === 'createGame') {
                    ack(null, { ok: true, data: { created: { game_code: 'AB234C' }, snapshot } });
                    this.handlers.gameCreated?.(snapshot);
                    return;
                }
                if (event === 'joinGame') {
                    snapshot.currentPlayers = 2;
                    snapshot.players.push({ playerId: 'p2', pseudo: 'Beta', score: 0, correctAnswers: 0, isReady: false, isConnected: true, isHost: false, isCurrent: false, rank: 2 });
                    ack(null, { ok: true, data: { joined: { result: 'joined' }, snapshot } });
                    this.handlers.playerJoined?.(snapshot);
                    return;
                }
                if (event === 'setReady') {
                    snapshot.players[0].isReady = payload.ready;
                    ack(null, { ok: true, data: { updated: { result: 'ready_updated' }, snapshot } });
                    this.handlers.playerUpdated?.(snapshot);
                    return;
                }
                if (event === 'startGame') {
                    snapshot.status = 'playing';
                    snapshot.startedAt = new Date().toISOString();
                    snapshot.expiresAt = new Date(Date.now() + 600000).toISOString();
                    ack(null, { ok: true, data: { started: { result: 'started' }, snapshot } });
                    this.handlers.gameStarted?.(snapshot);
                    return;
                }
                if (event === 'submitAnswer') {
                    snapshot.players[0].score = 10;
                    snapshot.players[0].correctAnswers = 1;
                    snapshot.myFoundAnswers = [{ display: 'Walter White', displayOrder: 1, answerYear: null, hint: null }];
                    ack(null, { ok: true, data: { result: { result: 'correct' }, snapshot } });
                    this.handlers.scoreUpdate?.(snapshot);
                    return;
                }
                if (event === 'sendReaction') {
                    const eventData = { reactionType: payload.reactionType, pseudo: '<b>Beta</b>', gameCode: payload.gameCode };
                    ack(null, { ok: true, data: eventData });
                    this.handlers.reactionReceived?.(eventData);
                    return;
                }
                if (event === 'leaveGame') {
                    ack(null, { ok: true, data: { result: 'left' } });
                    return;
                }
                ack(null, { ok: true, data: snapshot });
            },
            disconnect() {}
        });
    });
    await gotoHome(page);
    await page.waitForTimeout(700);
    await page.evaluate(() => {
        window.MemorizMultiplayerSocket = {
            async connect() {
                document.dispatchEvent(new CustomEvent('memoriz:multiplayer-network', { detail: { connected: true } }));
            },
            on() {},
            disconnect() {},
            getState() {
                return { connected: true };
            },
            async emitWithAck(event, payload) {
                window.__multiplayerPayloads.push({ event, payload });
                const snapshot = window.__fakeSnapshot;
                if (event === 'createGame') {
                    window.__createAttempts = (window.__createAttempts || 0) + 1;
                    if (window.__failCreateOnceWithActive && window.__createAttempts === 1) {
                        throw new Error('active_game_exists');
                    }
                    return { created: { game_code: 'AB234C' }, snapshot };
                }
                if (event === 'joinGame') {
                    window.__joinAttempts = (window.__joinAttempts || 0) + 1;
                    if (window.__failJoinOnceWithActive && window.__joinAttempts === 1) {
                        throw new Error('active_game_exists');
                    }
                    snapshot.currentPlayers = 2;
                    if (snapshot.players.length === 1) {
                        snapshot.players.push({ playerId: 'p2', pseudo: 'Beta', score: 0, correctAnswers: 0, isReady: false, isConnected: true, isHost: false, isCurrent: false, rank: 2 });
                    }
                    return { joined: { result: 'joined' }, snapshot };
                }
                if (event === 'setReady') {
                    snapshot.players[0].isReady = payload.ready;
                    return { updated: { result: 'ready_updated' }, snapshot };
                }
                if (event === 'startGame') {
                    snapshot.status = 'playing';
                    snapshot.startedAt = new Date().toISOString();
                    snapshot.expiresAt = new Date(Date.now() + 600000).toISOString();
                    return { started: { result: 'started' }, snapshot };
                }
                if (event === 'submitAnswer') {
                    if (window.__submitAlreadyFound) {
                        return { result: { result: 'already_found_by_other' }, snapshot };
                    }
                    snapshot.players[0].score = 10;
                    snapshot.players[0].correctAnswers = 1;
                    snapshot.myFoundAnswers = [{ display: 'Walter White', displayOrder: 1, answerYear: null, hint: null }];
                    return { result: { result: 'correct' }, snapshot };
                }
                if (event === 'sendReaction') {
                    window.MemorizReactions.showReaction({ reactionType: payload.reactionType, pseudo: '<b>Beta</b>', gameCode: payload.gameCode });
                    return { reactionType: payload.reactionType, pseudo: '<b>Beta</b>' };
                }
                if (event === 'leaveGame') return { result: 'left' };
                if (event === 'leaveActiveGames') return { result: 'released', released_count: 1 };
                return snapshot;
            }
        };
        window.memorizAuth = {
            getState() {
                return { hasProfile: true, profile: { id: 'u1', pseudo: 'Host', total_points: 0 } };
            },
            async initProfile() {
                return this.getState().profile;
            }
        };
        const modal = document.getElementById('profile-modal');
        if (modal) {
            modal.hidden = true;
            modal.setAttribute('aria-hidden', 'true');
            modal.style.display = 'none';
        }
        document.dispatchEvent(new CustomEvent('memoriz:profile-ready', { detail: { profile: { pseudo: 'Host', total_points: 0 } } }));
    });
}

async function openMultiplayerFlow(page) {
    await page.evaluate(() => window.MemorizMultiplayer.open());
}

test('lobby: creation, code, rendu texte et payloads sans champs interdits', async ({ page }) => {
    await installFakeMultiplayer(page);
    await openMultiplayerFlow(page);
    await expect(page.locator('#multiplayer-modal .multiplayer-modal-content')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#multiplayer-modal .multiplayer-modal-content')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#multiplayer-close')).toBeFocused();
    await page.locator('#multiplayer-create').click();
    await expect(page.locator('#multiplayer-code-display')).toHaveText('AB234C');
    await expect(page.locator('#multiplayer-players')).toContainText('Host<script>window.__xssRan=true</script>');
    expect(await page.evaluate(() => window.__xssRan)).toBe(false);
    const serialized = await page.evaluate(() => JSON.stringify(window.__multiplayerPayloads));
    for (const key of ['user_id', 'pseudo', 'score', 'points', 'correctAnswers', 'answer_id', 'host_id']) {
        expect(serialized).not.toContain(key);
    }
});

test('partie: start serveur, timer expiresAt, score serveur et reactions texte', async ({ page }) => {
    await installFakeMultiplayer(page);
    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-create').click();
    await page.evaluate(() => {
        window.__fakeSnapshot.currentPlayers = 2;
        window.__fakeSnapshot.players.push({
            playerId: 'p2',
            pseudo: 'Beta',
            score: 0,
            correctAnswers: 0,
            isReady: true,
            isConnected: true,
            isHost: false,
            isCurrent: false,
            rank: 2
        });
        window.MemorizMultiplayer.renderState(window.__fakeSnapshot);
    });
    await page.locator('#multiplayer-start').click();
    await expect(page.locator('#multiplayer-game')).toBeVisible();
    await expect(page.locator('#multiplayer-timer')).toContainText(/10:00|09:59/);
    await page.locator('#multiplayer-answer-input').fill('Walter White');
    await page.locator('#multiplayer-answer-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#multiplayer-score-live')).toContainText('10 pts');
    await expect(page.locator('#multiplayer-found-list')).toContainText('Walter White');
    await expect(page.locator('#multiplayer-answer-grid')).toContainText('Walter White');
    await page.locator('.reaction-button[data-reaction-type="fire"]').click();
    await expect(page.locator('.reaction-toast')).toContainText('<b>Beta</b>');
    expect(await page.evaluate(() => window.__xssRan)).toBe(false);
});

test('partie: une reponse deja trouvee affiche un message sans ajouter de points', async ({ page }) => {
    await installFakeMultiplayer(page);
    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-create').click();
    await page.evaluate(() => {
        window.__fakeSnapshot.status = 'playing';
        window.__fakeSnapshot.allFoundAnswers = [{ display: 'Walter White', displayOrder: 1, answerYear: null, hint: null }];
        window.__submitAlreadyFound = true;
        window.MemorizMultiplayer.renderState(window.__fakeSnapshot);
        window.__fakeSnapshot.allFoundAnswers = [];
        window.__fakeSnapshot.myFoundAnswers = [];
    });

    await page.locator('#multiplayer-answer-input').fill('Walter White');
    await page.locator('#multiplayer-answer-form').evaluate(form => form.requestSubmit());

    await expect(page.locator('#multiplayer-status')).toHaveText('Cette réponse a déjà été trouvée par un autre joueur.');
    await expect(page.locator('.multiplayer-toast')).toHaveText('Cette réponse a déjà été trouvée par un autre joueur.');
    await expect(page.locator('[role="alertdialog"]')).toBeVisible();
    await expect(page.locator('#multiplayer-answer-dialog-title')).toHaveText('Réponse déjà trouvée');
    await expect(page.locator('#multiplayer-answer-dialog-message')).toHaveText('Cette réponse a déjà été trouvée par un autre joueur.');
    await expect(page.locator('#multiplayer-score-live')).toContainText('0 pts');
    await expect(page.locator('#multiplayer-answer-grid')).toContainText('Walter White');
    await page.locator('[role="alertdialog"] button').click();
    await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
});

test('rejoindre, quitter et cache minimal', async ({ page }) => {
    await installFakeMultiplayer(page);
    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-tab-join').click();
    await page.locator('#multiplayer-code-input').fill('ab234c');
    await page.locator('#multiplayer-join').click();
    await expect(page.locator('#multiplayer-count-label')).toHaveText('2/4 joueurs');
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('memoriz_multiplayer_game')));
    expect(cache.gameCode).toBe('AB234C');
    expect(typeof cache.ts).toBe('number');
    await page.locator('#multiplayer-leave').click();
    expect(await page.evaluate(() => localStorage.getItem('memoriz_multiplayer_game'))).toBe(null);
});

test('creation: ancienne salle en cache ignoree puis quittee si le serveur bloque', async ({ page }) => {
    await installFakeMultiplayer(page);
    await page.evaluate(() => {
        localStorage.setItem('memoriz_multiplayer_game', JSON.stringify({ gameCode: 'OLD123' }));
        window.__failCreateOnceWithActive = true;
    });

    await openMultiplayerFlow(page);
    await expect(page.locator('#multiplayer-lobby')).toBeHidden();
    await expect(page.locator('#multiplayer-status')).toHaveText('Choisis une catégorie ou rejoins un code.');
    expect(await page.evaluate(() => window.__multiplayerPayloads.some(entry => entry.event === 'requestGameState'))).toBe(false);

    await page.locator('#multiplayer-create').click();
    await expect(page.locator('#multiplayer-code-display')).toHaveText('AB234C');
    const events = await page.evaluate(() => window.__multiplayerPayloads.map(entry => `${entry.event}:${entry.payload?.gameCode || ''}`));
    expect(events).toContain('leaveGame:OLD123');
    expect(await page.evaluate(() => window.__createAttempts)).toBe(2);
});

test('creation: ancienne salle serveur liberee sans code en cache', async ({ page }) => {
    await installFakeMultiplayer(page);
    await page.evaluate(() => {
        localStorage.removeItem('memoriz_multiplayer_game');
        window.__failCreateOnceWithActive = true;
    });

    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-create').click();
    await expect(page.locator('#multiplayer-code-display')).toHaveText('AB234C');
    const events = await page.evaluate(() => window.__multiplayerPayloads.map(entry => entry.event));
    expect(events).toContain('leaveActiveGames');
    expect(events).not.toContain('requestGameState');
    expect(await page.evaluate(() => window.__createAttempts)).toBe(2);
});

test('rejoindre: ancienne salle serveur liberee avant connexion', async ({ page }) => {
    await installFakeMultiplayer(page);
    await page.evaluate(() => {
        localStorage.removeItem('memoriz_multiplayer_game');
        window.__failJoinOnceWithActive = true;
    });

    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-tab-join').click();
    await page.locator('#multiplayer-code-input').fill('ab234c');
    await page.locator('#multiplayer-join').click();
    await expect(page.locator('#multiplayer-code-display')).toHaveText('AB234C');
    const events = await page.evaluate(() => window.__multiplayerPayloads.map(entry => entry.event));
    expect(events).toContain('leaveActiveGames');
    expect(await page.evaluate(() => window.__joinAttempts)).toBe(2);
});

test('responsive, zoom et clavier', async ({ page }) => {
    await installFakeMultiplayer(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openMultiplayerFlow(page);
    await page.locator('#multiplayer-create').click();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('#multiplayer-modal')).toBeHidden();

    await page.setViewportSize({ width: 780, height: 844 });
    await openMultiplayerFlow(page);
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expectNoHorizontalOverflow(page);
});
