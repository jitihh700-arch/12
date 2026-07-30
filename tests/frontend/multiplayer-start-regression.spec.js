const { test, expect } = require('@playwright/test');
const { gotoHome } = require('./helpers/phase2b-helpers');

test.describe.configure({ mode: 'serial' });

const hostProfileId = '10000000-0000-4000-8000-000000000001';
const guestProfileId = '10000000-0000-4000-8000-000000000002';

function baseSnapshot(overrides = {}) {
    const snapshot = {
        gameCode: 'AB234C',
        categoryId: 'series',
        status: 'waiting',
        maxPlayers: 2,
        currentPlayers: 2,
        hostId: hostProfileId,
        durationSeconds: 600,
        startedAt: null,
        expiresAt: new Date(Date.now() + 600000).toISOString(),
        finishedAt: null,
        players: [
            {
                playerId: 'player-host-row',
                pseudo: 'abdoul',
                score: 0,
                correctAnswers: 0,
                isReady: true,
                isConnected: true,
                isHost: false,
                isCurrent: true,
                rank: 1
            },
            {
                playerId: 'player-guest-row',
                pseudo: 'Beta',
                score: 0,
                correctAnswers: 0,
                isReady: true,
                isConnected: true,
                isHost: false,
                isCurrent: false,
                rank: 2
            }
        ],
        myFoundAnswers: []
    };

    return {
        ...snapshot,
        ...overrides,
        players: overrides.players || snapshot.players
    };
}

async function installRuntime(page, profileId, snapshot) {
    await page.addInitScript(({ profileId: id, snapshot: initialSnapshot }) => {
        window.MEMORIZ_MULTIPLAYER_CONFIG = { url: 'http://backend.test' };
        window.__startCalls = 0;
        window.__startBlocked = false;
        window.__snapshot = initialSnapshot;
        window.io = () => ({ on() { return this; }, once() { return this; }, timeout() { return this; }, emit() {}, disconnect() {} });
        window.memorizAuth = {
            getState() {
                return { hasProfile: true, profile: { id, pseudo: id.endsWith('1') ? 'abdoul' : 'Beta' } };
            },
            async initProfile() {
                return this.getState().profile;
            }
        };
    }, { profileId, snapshot });

    await gotoHome(page);
    await page.waitForTimeout(700);
    await page.evaluate(id => {
        window.memorizAuth = {
            getState() {
                return { hasProfile: true, profile: { id, pseudo: id.endsWith('1') ? 'abdoul' : 'Beta' } };
            },
            async initProfile() {
                return this.getState().profile;
            }
        };
        window.MemorizMultiplayerSocket = {
            async connect() {},
            on() {},
            disconnect() {},
            getState() {
                return { connected: true };
            },
            async emitWithAck(event, payload) {
                if (event === 'startGame') {
                    window.__startCalls += 1;
                    const snapshot = window.__snapshot;
                    const connected = snapshot.players.filter(player => player.isConnected);
                    const isHost = snapshot.hostId === id;
                    if (!isHost || snapshot.status !== 'waiting' || connected.length < 2 || connected.some(player => !player.isReady)) {
                        window.__startBlocked = true;
                        throw new Error(isHost ? 'players_not_ready' : 'host_required');
                    }
                    snapshot.status = 'playing';
                    snapshot.startedAt = new Date().toISOString();
                    snapshot.expiresAt = new Date(Date.now() + 600000).toISOString();
                    return { started: { result: 'started' }, snapshot };
                }
                return { snapshot: window.__snapshot };
            }
        };

        document.dispatchEvent(new CustomEvent('memoriz:profile-ready', {
            detail: { profile: { id, pseudo: id.endsWith('1') ? 'abdoul' : 'Beta' } }
        }));
        window.MemorizMultiplayer.renderState(window.__snapshot);
        const modal = document.getElementById('multiplayer-modal');
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
    }, profileId);
}

async function startButtonState(page) {
    return page.locator('#multiplayer-start').evaluate(button => {
        const style = window.getComputedStyle(button);
        const rect = button.getBoundingClientRect();
        return {
            hidden: button.hidden,
            disabled: button.disabled,
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
            position: style.position,
            width: rect.width,
            height: rect.height
        };
    });
}

async function installDeferredStart(page, mode = 'success') {
    await page.evaluate(selectedMode => {
        window.__startCalls = 0;
        window.__startResolvers = [];
        window.__startRejecters = [];
        window.__startMode = selectedMode;
        window.MemorizMultiplayerSocket.emitWithAck = event => {
            if (event !== 'startGame') return Promise.resolve({ snapshot: window.__snapshot });

            window.__startCalls += 1;
            return new Promise((resolve, reject) => {
                window.__startResolvers.push(resolve);
                window.__startRejecters.push(reject);
            });
        };
    }, mode);
}

async function resolveDeferredStart(page, overrides = {}) {
    await page.evaluate(nextSnapshot => {
        window.__snapshot = {
            ...window.__snapshot,
            ...nextSnapshot,
            startedAt: nextSnapshot.startedAt || new Date().toISOString(),
            expiresAt: nextSnapshot.expiresAt || new Date(Date.now() + 600000).toISOString()
        };
        window.__startResolvers.shift()?.({ started: { result: 'started' }, snapshot: window.__snapshot });
    }, overrides);
}

async function rejectDeferredStart(page, message) {
    await page.evaluate(errorMessage => {
        window.__startRejecters.shift()?.(new Error(errorMessage));
    }, message);
}

test('hote: bouton deduit par hostId utilisateur, puis lancement synchronise', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await installRuntime(hostPage, hostProfileId, baseSnapshot());
    await installRuntime(guestPage, guestProfileId, baseSnapshot({
        players: [
            { ...baseSnapshot().players[0], isCurrent: false },
            { ...baseSnapshot().players[1], isCurrent: true }
        ]
    }));

    await expect(hostPage.locator('#multiplayer-host-label')).toContainText('Hôte');
    await expect(guestPage.locator('#multiplayer-host-label')).toContainText('Hôte');
    await expect(hostPage.locator('#multiplayer-start')).toBeVisible();
    await expect(hostPage.locator('#multiplayer-start')).toBeEnabled();
    await expect(guestPage.locator('#multiplayer-start')).toBeHidden();

    const before = await startButtonState(hostPage);
    expect(before).toEqual(expect.objectContaining({
        hidden: false,
        disabled: false,
        display: expect.not.stringMatching(/^none$/),
        visibility: 'visible',
        opacity: '1'
    }));
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeGreaterThan(0);

    await hostPage.locator('#multiplayer-start').click();
    await expect(hostPage.locator('#multiplayer-game')).toBeVisible();
    expect(await hostPage.evaluate(() => window.__snapshot.status)).toBe('playing');
    expect(await hostPage.evaluate(() => window.__startCalls)).toBe(1);

    await hostPage.locator('#multiplayer-start').evaluate(button => button.click());
    expect(await hostPage.evaluate(() => window.__startCalls)).toBe(1);

    await hostContext.close();
    await guestContext.close();
});

test('double clic rapide: une seule demande est emise avant ACK', async ({ page }) => {
    await installRuntime(page, hostProfileId, baseSnapshot());
    await installDeferredStart(page);

    await expect(page.locator('#multiplayer-start')).toBeVisible();
    await expect(page.locator('#multiplayer-start')).toBeEnabled();

    await page.locator('#multiplayer-start').click();
    await expect(page.locator('#multiplayer-start')).toBeDisabled();
    await page.locator('#multiplayer-start').click({ force: true });
    await page.evaluate(() => window.MemorizMultiplayer.startGame());

    expect(await page.evaluate(() => window.__startCalls)).toBe(1);
    expect(await page.evaluate(() => window.MemorizMultiplayer.getState().startGamePending)).toBe(true);

    await resolveDeferredStart(page, { status: 'playing' });
    await expect(page.locator('#multiplayer-game')).toBeVisible();
    expect(await page.evaluate(() => window.__snapshot.status)).toBe('playing');
    expect(await page.evaluate(() => window.MemorizMultiplayer.getState().startGamePending)).toBe(false);

    await page.evaluate(() => window.MemorizMultiplayer.startGame());
    expect(await page.evaluate(() => window.__startCalls)).toBe(1);
});

test('ACK en erreur: le pending est nettoye et une tentative controlee reste possible', async ({ page }) => {
    await installRuntime(page, hostProfileId, baseSnapshot());
    await installDeferredStart(page, 'error');

    await page.locator('#multiplayer-start').click();
    await expect(page.locator('#multiplayer-start')).toBeDisabled();
    await page.evaluate(() => window.MemorizMultiplayer.startGame());
    expect(await page.evaluate(() => window.__startCalls)).toBe(1);

    await rejectDeferredStart(page, 'players_not_ready');
    await expect(page.locator('#multiplayer-status')).toContainText('Démarrage refusé');
    await expect(page.locator('#multiplayer-start')).toBeEnabled();
    expect(await page.evaluate(() => window.MemorizMultiplayer.getState().startGamePending)).toBe(false);

    await page.locator('#multiplayer-start').click();
    expect(await page.evaluate(() => window.__startCalls)).toBe(2);
});

test('timeout Socket.io: le pending est nettoye sans relance automatique', async ({ page }) => {
    await installRuntime(page, hostProfileId, baseSnapshot());
    await installDeferredStart(page, 'timeout');

    await page.locator('#multiplayer-start').click();
    await page.evaluate(() => window.MemorizMultiplayer.startGame());
    expect(await page.evaluate(() => window.__startCalls)).toBe(1);

    await rejectDeferredStart(page, 'socket_timeout');
    await expect(page.locator('#multiplayer-status')).toContainText('Démarrage refusé');
    await expect(page.locator('#multiplayer-start')).toBeEnabled();
    expect(await page.evaluate(() => window.__startCalls)).toBe(1);
});

test('changement de salle: un pending ancien ne bloque pas le nouveau lobby', async ({ page }) => {
    await installRuntime(page, hostProfileId, baseSnapshot());
    await installDeferredStart(page);

    await page.locator('#multiplayer-start').click();
    await expect(page.locator('#multiplayer-start')).toBeDisabled();
    expect(await page.evaluate(() => window.MemorizMultiplayer.getState().startGamePending)).toBe(true);

    await page.evaluate(snapshot => {
        window.__snapshot = snapshot;
        window.MemorizMultiplayer.renderState(snapshot);
    }, baseSnapshot({ gameCode: 'CD345E' }));

    await expect(page.locator('#multiplayer-start')).toBeEnabled();
    expect(await page.evaluate(() => window.MemorizMultiplayer.getState().startGamePending)).toBe(false);

    await page.locator('#multiplayer-start').click();
    expect(await page.evaluate(() => window.__startCalls)).toBe(2);
});

test('conditions de lancement: joueur seul, pret incomplet, deconnexion et invite', async ({ page }) => {
    const snapshots = {
        alone: baseSnapshot({ currentPlayers: 1, players: [baseSnapshot().players[0]] }),
        oneReady: baseSnapshot({ players: [baseSnapshot().players[0], { ...baseSnapshot().players[1], isReady: false }] }),
        disconnected: baseSnapshot({ players: [baseSnapshot().players[0], { ...baseSnapshot().players[1], isConnected: false }] }),
        guest: baseSnapshot({
            players: [
                { ...baseSnapshot().players[0], isCurrent: false },
                { ...baseSnapshot().players[1], isCurrent: true }
            ]
        })
    };

    await installRuntime(page, hostProfileId, snapshots.alone);
    await expect(page.locator('#multiplayer-start')).toBeVisible();
    await expect(page.locator('#multiplayer-start')).toBeDisabled();

    await page.evaluate(snapshot => window.MemorizMultiplayer.renderState(snapshot), snapshots.oneReady);
    await expect(page.locator('#multiplayer-start')).toBeVisible();
    await expect(page.locator('#multiplayer-start')).toBeDisabled();
    await page.locator('#multiplayer-start').click({ force: true });
    expect(await page.evaluate(() => window.__startCalls)).toBe(0);
    await page.evaluate(async () => {
        try {
            await window.MemorizMultiplayerSocket.emitWithAck('startGame', { gameCode: 'AB234C' });
        } catch (error) {
            window.__startBlocked = true;
        }
    });
    expect(await page.evaluate(() => window.__startBlocked)).toBe(true);

    await page.evaluate(snapshot => {
        window.__startBlocked = false;
        window.MemorizMultiplayer.renderState(snapshot);
    }, snapshots.disconnected);
    await expect(page.locator('#multiplayer-start')).toBeDisabled();
    await page.locator('#multiplayer-start').click({ force: true });
    expect(await page.evaluate(() => window.__startCalls)).toBe(1);
    await page.evaluate(async () => {
        try {
            await window.MemorizMultiplayerSocket.emitWithAck('startGame', { gameCode: 'AB234C' });
        } catch (error) {
            window.__startBlocked = true;
        }
    });
    expect(await page.evaluate(() => window.__startBlocked)).toBe(true);

    await page.evaluate(({ snapshot, guestProfileId: id }) => {
        window.__startBlocked = false;
        window.memorizAuth = {
            getState() {
                return { hasProfile: true, profile: { id, pseudo: 'Beta' } };
            },
            async initProfile() {
                return this.getState().profile;
            }
        };
        document.dispatchEvent(new CustomEvent('memoriz:profile-ready', {
            detail: { profile: { id, pseudo: 'Beta' } }
        }));
        window.MemorizMultiplayer.renderState(snapshot);
    }, { snapshot: snapshots.guest, guestProfileId });
    await expect(page.locator('#multiplayer-start')).toBeHidden();
    await page.evaluate(async () => {
        try {
            await window.MemorizMultiplayerSocket.emitWithAck('startGame', { gameCode: 'AB234C' });
        } catch (error) {
            window.__startBlocked = true;
        }
    });
    expect(await page.evaluate(() => window.__startBlocked)).toBe(true);
});
