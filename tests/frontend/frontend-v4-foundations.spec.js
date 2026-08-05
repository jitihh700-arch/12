const { test, expect } = require('@playwright/test');
const { removeRuntimeConfig } = require('./helpers/phase2b-helpers');

test.beforeEach(() => {
    removeRuntimeConfig();
});

async function openV4(page, options = {}) {
    await page.addInitScript(({ skipIntro, stepMs, reducedMs }) => {
        window.MEMORIZ_V4_INTRO_STEP_MS = stepMs;
        window.MEMORIZ_V4_INTRO_REDUCED_MS = reducedMs;
        window.MEMORIZ_V4_SKIP_INTRO = skipIntro;
    }, {
        skipIntro: options.skipIntro ?? true,
        stepMs: options.stepMs ?? 30,
        reducedMs: options.reducedMs ?? 30
    });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
}

test('le shell V4 démarre sans écran d’introduction', async ({ page }) => {
    await openV4(page, { skipIntro: true });

    await expect(page.locator('#v4-intro')).toHaveCount(0);
    await expect(page.locator('.v4-top-nav')).toBeVisible();
    await expect(page.locator('#v4-home-title')).toBeVisible();
});

test('le shell desktop et mobile expose la navigation attendue sans débordement', async ({ page }) => {
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await openV4(page, { skipIntro: true });

        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(hasOverflow, `overflow horizontal à ${width}px`).toBe(false);
        await expect(page.locator('.v4-top-nav')).toBeVisible();
        if (width <= 760) await expect(page.locator('#v4-menu-toggle')).toBeVisible();
    }
});

test('la navigation Accueil / Explorer met à jour aria-current', async ({ page }) => {
    await openV4(page);

    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();
    await expect(page.locator('.v4-top-nav [data-v4-route="explorer"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#explorer')).toBeInViewport();
});

test('le menu burger mobile navigue vers les cinq vues principales', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        window.MEMORIZ_V4_SKIP_INTRO = true;
    });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#v4-menu-toggle')).toBeVisible();
    await expect(page.locator('#v4-mobile-menu')).toBeHidden();

    for (const route of ['explorer', 'solo', 'multiplayer', 'community', 'home']) {
        await page.locator('#v4-menu-toggle').click();
        await expect(page.locator('#v4-menu-toggle')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#v4-mobile-menu')).toBeVisible();
        await expect(page.locator('#v4-mobile-menu [data-v4-route]')).toHaveCount(5);

        await page.locator(`#v4-mobile-menu [data-v4-route="${route}"]`).click();
        await expect(page.locator(`#v4-mobile-menu [data-v4-route="${route}"]`)).toHaveAttribute('aria-current', 'page');
        await expect(page.locator(`#${route}`)).toBeVisible();
        await expect(page.locator('#v4-mobile-menu')).toBeHidden();
    }
});

test('Multijoueur et Communauté ont de vraies pages V4 navigables', async ({ page }) => {
    await openV4(page);

    await page.locator('.v4-top-nav [data-v4-route="multiplayer"]').click();
    await expect(page.locator('.v4-top-nav [data-v4-route="multiplayer"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#multiplayer')).toBeInViewport();
    await expect(page.locator('#v4-multiplayer-title')).toBeVisible();
    await expect(page.locator('#multiplayer-modal')).toBeHidden();

    await page.locator('.v4-top-nav [data-v4-route="community"]').click();
    await expect(page.locator('.v4-top-nav [data-v4-route="community"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#community')).toBeInViewport();
    await expect(page.locator('#v4-community-title')).toBeVisible();
});

test('les actions de la page multijoueur ouvrent le flux existant', async ({ page }) => {
    await openV4(page);

    await page.locator('.v4-top-nav [data-v4-route="multiplayer"]').click();
    await expect(page.locator('#multiplayer')).toBeInViewport();
    await expect(page.locator('#multiplayer-modal')).toBeHidden();

    await page.locator('#v4-multiplayer-create').click();
    await expect(page.locator('#multiplayer-modal')).toBeVisible();
    await expect(page.locator('#multiplayer-tab-create')).toHaveAttribute('aria-selected', 'true');
});

test('Explorer affiche exactement les 26 catégories existantes sans duplication', async ({ page }) => {
    await openV4(page);
    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();

    await expect(page.locator('.category-card[data-category]')).toHaveCount(26);
    const keys = await page.locator('.category-card[data-category]').evaluateAll(cards => cards.map(card => card.getAttribute('data-category')));
    expect(new Set(keys).size).toBe(26);
    expect(keys).toContain('series');
    expect(keys).toContain('animeParOrganisation');
});

test('la recherche Explorer filtre sans tenir compte de la casse ni des accents', async ({ page }) => {
    await openV4(page);
    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();

    await page.locator('#v4-category-search').fill('cinema');
    await expect(page.locator('#v4-category-empty')).toBeHidden();
    await expect(page.locator('#v4-category-suggestions')).toBeVisible();
    await expect(page.locator('#v4-category-suggestions button').first()).toContainText(/Cinéma/i);
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.category-card[data-category="films"]')).not.toHaveAttribute('hidden', '');

    await page.locator('#v4-category-clear').click();
    await expect(page.locator('#v4-category-suggestions')).toBeHidden();
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(26);
});

test('Explorer affiche un état vide quand la recherche ne correspond à rien', async ({ page }) => {
    await openV4(page);
    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();

    await page.locator('#v4-category-search').fill('categorie inconnue');
    await expect(page.locator('#v4-category-empty')).toBeVisible();
    await expect(page.locator('#v4-category-suggestions')).toBeHidden();
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(0);
});

test('une catégorie reste activable au clavier et lance le quiz existant', async ({ page }) => {
    await openV4(page);
    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();

    const card = page.locator('.category-card[data-category="series"]');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('tabindex', '0');
    await card.dispatchEvent('keydown', { key: 'Enter' });
    await expect(page.locator('#game-panel')).toBeVisible({ timeout: 4000 }).catch(async () => {
        await card.dispatchEvent('keydown', { key: ' ' });
        await expect(page.locator('#game-panel')).toBeVisible();
    });
});

test('une image de catégorie absente utilise le fallback visuel sans erreur critique', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/assets/images/memoriz/categories/series.webp', route => route.abort());
    await openV4(page);
    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();

    await expect(page.locator('.category-card[data-category="series"]')).toHaveClass(/v4-category-missing-image/);
    expect(consoleErrors.filter(text => !text.includes('Failed to load resource'))).toEqual([]);
});
