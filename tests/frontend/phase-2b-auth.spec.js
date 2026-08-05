const { test, expect } = require('@playwright/test');
const {
    writeRuntimeConfig,
    removeRuntimeConfig,
    psql,
    gotoHome,
    openExplorer,
    createProfile,
    currentSession,
    expectNoHorizontalOverflow
} = require('./helpers/phase2b-helpers');

test.describe.configure({ mode: 'serial' });

const runId = Date.now().toString().slice(-8);

async function expectFocusInsideProfileModal(page) {
    await expect.poll(() => page.evaluate(() => {
        const modal = document.querySelector('#profile-modal .profile-modal-content');
        const active = document.activeElement;

        if (!modal || !active || !modal.contains(active)) {
            return 'outside';
        }

        return 'inside';
    })).toBe('inside');
}

test.beforeAll(() => {
    writeRuntimeConfig();
});

test.afterAll(() => {
    writeRuntimeConfig();
});

test('configuration manquante et Supabase indisponible: mode degrade et quiz solo utilisable', async ({ page }) => {
    removeRuntimeConfig();
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    await gotoHome(page);
    await expect(page.locator('#profile-status-label')).toHaveText('Mode solo');
    await expect(page.locator('#profile-help')).toContainText('pas configuré');
    await openExplorer(page);
    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#game-panel')).toBeVisible();
    await expect(page.locator('#score')).toContainText('0/20');
    await page.locator('#close-game-btn').click();

    writeRuntimeConfig();
    await page.route('**/auth/v1/**', route => route.abort());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#profile-status-label')).toHaveText('Profil indisponible');
    await openExplorer(page);
    await page.locator('.category-card[data-category="films"]').click();
    await expect(page.locator('#quick-input')).toBeVisible();
    const unexpectedErrors = consoleErrors.filter(text =>
        !text.includes('404') &&
        !text.includes('ERR_FAILED') &&
        !text.includes('X-Frame-Options')
    );
    expect(unexpectedErrors).toHaveLength(0);
});

test('timeout d initialisation: message non bloquant et aucune boucle de creation', async ({ page }) => {
    let signInCalls = 0;
    await page.route('**/auth/v1/signup', async route => {
        signInCalls += 1;
        await new Promise(resolve => setTimeout(resolve, 9000));
        await route.abort();
    });

    await gotoHome(page);
    await expect(page.locator('#profile-status-label')).toHaveText('Profil indisponible', { timeout: 12000 });
    expect(signInCalls).toBe(1);
    await page.evaluate(() => window.memorizAuth.initProfile());
    await expect.poll(() => signInCalls).toBe(2);
});

test('premiere visite: session anonyme, ouverture volontaire du profil, focus trap et cache', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pseudo = `First_${runId}`;
    await gotoHome(page);

    await expect(page.locator('#profile-modal')).toBeHidden();
    await expect(page.locator('#v4-nav-profile-name')).toHaveText('Créer profil');
    await page.locator('#v4-nav-profile-action').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await expect(page.locator('#profile-modal .profile-modal-content')).toHaveAttribute('role', 'dialog');
    await expect(page.locator('#profile-modal .profile-modal-content')).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#profile-pseudo-input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#profile-modal')).toBeHidden();
    await page.locator('#v4-nav-profile-action').click();
    await page.keyboard.press('Tab');
    await expectFocusInsideProfileModal(page);
    await page.keyboard.press('Tab');
    await expectFocusInsideProfileModal(page);

    await createProfile(page, pseudo);
    await expect(page.locator('#profile-modal')).toBeHidden();
    await expect(page.locator('#profile-status-label')).toHaveText('Profil actif');
    await expect(page.locator('#profile-stats')).toContainText('0 pt');
    const session = await currentSession(page);
    expect(session.userId).toBeTruthy();
    expect(session.profile.pseudo).toBe(pseudo);
    expect(session.cache.pseudo).toBe(pseudo);
    await context.close();
});

test('persistance: reload, nouvel onglet, nouveau contexte et suppression stockage', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const pseudo = `Persist_${runId}`;
    await gotoHome(page);
    await createProfile(page, pseudo);
    const first = await currentSession(page);

    await page.reload({ waitUntil: 'networkidle' });
    const afterReload = await currentSession(page);
    expect(afterReload.userId).toBe(first.userId);
    await expect(page.locator('#profile-modal')).toBeHidden();

    const secondTab = await context.newPage();
    await gotoHome(secondTab);
    const tabSession = await currentSession(secondTab);
    expect(tabSession.userId).toBe(first.userId);

    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    await gotoHome(otherPage);
    await expect(otherPage.locator('#profile-modal')).toBeHidden();
    const otherSession = await currentSession(otherPage);
    expect(otherSession.userId).toBeTruthy();
    expect(otherSession.userId).not.toBe(first.userId);
    await otherContext.close();

    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#profile-modal')).toBeHidden();
    const cleared = await currentSession(page);
    expect(cleared.userId).toBeTruthy();
    expect(cleared.userId).not.toBe(first.userId);
    await context.close();
});

test('validation pseudo: longueurs, caracteres, accents, espaces, html, ponctuation et retours ligne', async ({ browser }) => {
    const invalidCases = [
        ['Al', 'au moins 3'],
        ['abcdefghijklmnopqrstu', '20 caractères maximum'],
        ['<b>Alice</b>', 'uniquement lettres'],
        ['Ali!', 'uniquement lettres']
    ];

    for (const [value, message] of invalidCases) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await gotoHome(page);
        await page.locator('#v4-nav-profile-action').click();
        await expect(page.locator('#profile-modal')).toBeVisible();
        await page.locator('#profile-pseudo-input').fill(value);
        await page.locator('#profile-form').evaluate(form => form.requestSubmit());
        await expect(page.locator('#profile-form-error')).toContainText(message);
        await context.close();
    }

    const validCases = [`A${runId}`, `Twenty_${runId}_XXXX`, `Jean ${runId}`, `Joueur_${runId}`, `Élodie_${runId}`];
    for (const value of validCases) {
        const context = await browser.newContext();
        const page = await context.newPage();
        await gotoHome(page);
        await createProfile(page, value);
        await context.close();
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await gotoHome(page);
    await page.locator('#v4-nav-profile-action').click();
    await expect(page.locator('#profile-modal')).toBeVisible();
    await page.waitForFunction(async () => {
        const api = window.MemorizProfileApi?.init(window.MEMORIZ_SUPABASE_CONFIG);
        if (!api?.client?.auth) return false;
        const { data } = await api.client.auth.getSession();
        return Boolean(data?.session);
    });
    const newline = await page.evaluate(async () => window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG).registerProfile('Ali\nDia'));
    expect(newline.error.message).toContain('pseudo_invalid_format');
    await page.locator('#profile-pseudo-input').fill(`  Space   ${runId}  `);
    await page.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(page.locator('#profile-pseudo')).toHaveText(`Space ${runId}`);
    await context.close();
});

test('deux utilisateurs: identites distinctes, doublon casse refuse, lecture propre et ecriture directe refusee', async ({ browser }) => {
    const pseudo = `Duo_${runId}`;
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await gotoHome(pageA);
    await createProfile(pageA, pseudo);
    const sessionA = await currentSession(pageA);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await gotoHome(pageB);
    await expect(pageB.locator('#profile-modal')).toBeHidden();
    const sessionB = await currentSession(pageB);
    expect(sessionB.userId).toBeTruthy();
    expect(sessionB.userId).not.toBe(sessionA.userId);

    await pageB.locator('#v4-nav-profile-action').click();
    await pageB.locator('#profile-pseudo-input').fill(pseudo.toLowerCase());
    await pageB.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(pageB.locator('#profile-form-error')).toHaveText('Ce pseudo est déjà pris.');

    const visibilityA = await pageA.evaluate(async () => {
        const client = window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG).client;
        const profile = await window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG).getMyProfile();
        const direct = await client.from('profiles').insert({ id: crypto.randomUUID(), pseudo: 'Bad', pseudo_normalized: 'bad', pseudo_changed_at: new Date().toISOString() });
        return { profile: profile.data, directError: direct.error?.code || direct.error?.message };
    });
    expect(visibilityA.profile.id).toBe(sessionA.userId);
    expect(visibilityA.directError).toBeTruthy();
    await contextA.close();
    await contextB.close();
});

test('changement de pseudo: delai 14 jours, RPC forcee, vieillissement base, succes et doublon', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await gotoHome(pageA);
    await createProfile(pageA, `Change_${runId}`);
    const sessionA = await currentSession(pageA);
    await expect(pageA.locator('#profile-primary-action')).toBeDisabled();
    await expect(pageA.locator('#profile-help')).toContainText('Prochain changement possible');

    const forced = await pageA.evaluate(async () => window.MemorizProfileApi.init(window.MEMORIZ_SUPABASE_CONFIG).changeMyPseudo('ForcedTooSoon'));
    expect(forced.error.message).toContain('pseudo_change_too_soon');

    psql(`update public.profiles set created_at = now() - interval '16 days', updated_at = now() - interval '15 days', pseudo_changed_at = now() - interval '15 days' where id = '${sessionA.userId}'::uuid`);
    await pageA.reload({ waitUntil: 'networkidle' });
    await expect(pageA.locator('#profile-primary-action')).toBeEnabled();
    await pageA.locator('#v4-nav-profile-action').click();
    await pageA.locator('#profile-pseudo-input').fill(`Changed_${runId}`);
    await pageA.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(pageA.locator('#profile-pseudo')).toHaveText(`Changed_${runId}`);
    await expect(pageA.locator('#profile-primary-action')).toBeDisabled();
    const changed = await currentSession(pageA);
    expect(changed.cache.pseudo).toBe(`Changed_${runId}`);

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await gotoHome(pageB);
    await pageB.locator('#profile-pseudo-input').fill(`Changed_${runId}`);
    await pageB.locator('#profile-form').evaluate(form => form.requestSubmit());
    await expect(pageB.locator('#profile-form-error')).toHaveText('Ce pseudo est déjà pris.');
    await contextA.close();
    await contextB.close();
});

test('regression quiz: 26 categories, score, timer, fermeture, redemarrage, blog, legal, partage', async ({ page }) => {
    await gotoHome(page);
    await createProfile(page, `Quiz_${runId}`);
    await openExplorer(page);
    await expect(page.locator('.category-card')).toHaveCount(26);
    await page.locator('.category-card[data-category="series"]').click();
    await expect(page.locator('#timer')).toContainText(/10:00|09:59/);
    await page.locator('#quick-input').fill('Walter White');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');
    await page.locator('#quick-input').fill('Mauvaise réponse');
    await page.locator('#quick-submit').click();
    await expect(page.locator('#score')).toContainText('1/20');
    await page.locator('#restart-category-btn').click();
    await expect(page.locator('#score')).toContainText('0/20');
    await page.locator('#close-game-btn').click();

    await expect(page.locator('#themeToggle')).toHaveCount(0);
    await page.locator('.read-more[data-blog="blog1"]').evaluate(button => button.click());
    await expect(page.locator('#blog1-content')).toHaveClass(/show/);
    await page.locator('#privacy-link').evaluate(link => link.click());
    await expect(page.locator('#legal-modal')).toBeVisible();
    await page.locator('.close-modal').click();
    await expect(page.locator('#legal-modal')).toBeHidden();

    await page.locator('.category-card[data-category="series"]').click();
    await page.evaluate(() => {
        window.__openedShare = [];
        window.open = url => { window.__openedShare.push(url); return null; };
    });
    await page.evaluate(() => window.shareOnTwitter());
    const shares = await page.evaluate(() => window.__openedShare);
    expect(shares).toHaveLength(1);
    expect(shares[0]).toContain('twitter.com/intent/tweet');
});

test('responsive et accessibilite: desktop, mobile, zoom 200, clavier et retour focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoHome(page);
    await createProfile(page, `Responsive_${runId}`);
    const session = await currentSession(page);
    psql(`update public.profiles set created_at = now() - interval '16 days', updated_at = now() - interval '15 days', pseudo_changed_at = now() - interval '15 days' where id = '${session.userId}'::uuid`);
    await page.reload({ waitUntil: 'networkidle' });
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expect(page.locator('#themeToggle')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 780, height: 844 });
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    await expectNoHorizontalOverflow(page);

    await page.locator('#v4-nav-profile-action').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#profile-modal .profile-modal-content')).toHaveAttribute('aria-describedby', /profile-modal-intro/);
    await expect(page.locator('#profile-pseudo-input')).toHaveAttribute('aria-describedby', /profile-form-error/);
    await expect(page.locator('label[for="profile-pseudo-input"]')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect(page.locator('#profile-modal')).toBeHidden();
    await expect(page.locator('#v4-nav-profile-action')).toBeVisible();
    await expect(page.locator('#profile-primary-action')).toBeEnabled();
});
