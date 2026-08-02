const { test, expect } = require('@playwright/test');
const { removeRuntimeConfig } = require('./helpers/phase2b-helpers');

test.beforeEach(() => {
    removeRuntimeConfig();
});

async function openV4(page, options = {}) {
    await page.addInitScript(({ introSeen, stepMs, reducedMs }) => {
        window.MEMORIZ_V4_INTRO_STEP_MS = stepMs;
        window.MEMORIZ_V4_INTRO_REDUCED_MS = reducedMs;
        if (introSeen) sessionStorage.setItem('memoriz_v4_intro_seen', '1');
    }, {
        introSeen: options.introSeen ?? true,
        stepMs: options.stepMs ?? 30,
        reducedMs: options.reducedMs ?? 30
    });
    await page.goto('/index.html');
    await page.waitForLoadState('networkidle');
}

test('l’introduction V4 se joue automatiquement puis libère l’application', async ({ page }) => {
    await openV4(page, { introSeen: false, stepMs: 80, reducedMs: 80 });

    await expect(page.locator('#v4-intro')).toHaveClass(/is-active/);
    await expect(page.locator('#v4-intro')).not.toHaveClass(/is-active/, { timeout: 2500 });
    await expect(page.locator('#v4-intro')).toHaveAttribute('aria-hidden', 'true');
});

test('l’introduction déjà vue dans la session ne bloque pas le shell', async ({ page }) => {
    await openV4(page, { introSeen: true });

    await expect(page.locator('#v4-intro')).not.toHaveClass(/is-active/);
    await expect(page.locator('.v4-top-nav')).toBeVisible();
    await expect(page.locator('#v4-home-title')).toBeVisible();
});

test('prefers-reduced-motion affiche brièvement l’état final', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openV4(page, { introSeen: false, stepMs: 200, reducedMs: 20 });

    await expect(page.locator('#v4-intro')).not.toHaveClass(/is-active/, { timeout: 1600 });
    await expect(page.locator('#v4-intro-image')).toHaveAttribute('src', /05-ultimate-1080x1920\.webp/);
});

test('un échec de préchargement d’asset ne bloque pas l’application', async ({ page }) => {
    await page.route('**/assets/images/memoriz/intro/**/03-second-mark-*', route => route.abort());
    await openV4(page, { introSeen: false, stepMs: 80, reducedMs: 120 });

    await expect(page.locator('#v4-intro-fallback')).toBeVisible();
    await expect(page.locator('#v4-intro')).not.toHaveClass(/is-active/, { timeout: 1600 });
});

test('le shell desktop et mobile expose la navigation attendue sans débordement', async ({ page }) => {
    for (const width of [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await openV4(page, { introSeen: true });

        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        expect(hasOverflow, `overflow horizontal à ${width}px`).toBe(false);
        await expect(page.locator('.v4-top-nav')).toBeVisible();
        if (width <= 760) await expect(page.locator('.v4-bottom-nav')).toBeVisible();
    }
});

test('la navigation Accueil / Explorer met à jour aria-current', async ({ page }) => {
    await openV4(page);

    await page.locator('.v4-top-nav [data-v4-route="explorer"]').click();
    await expect(page.locator('.v4-top-nav [data-v4-route="explorer"]')).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#explorer')).toBeInViewport();
});

test('Explorer affiche exactement les 26 catégories existantes sans duplication', async ({ page }) => {
    await openV4(page);

    await expect(page.locator('.category-card[data-category]')).toHaveCount(26);
    const keys = await page.locator('.category-card[data-category]').evaluateAll(cards => cards.map(card => card.getAttribute('data-category')));
    expect(new Set(keys).size).toBe(26);
    expect(keys).toContain('series');
    expect(keys).toContain('animeParOrganisation');
});

test('la recherche Explorer filtre sans tenir compte de la casse ni des accents', async ({ page }) => {
    await openV4(page);

    await page.locator('#v4-category-search').fill('cinema');
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(1);
    await expect(page.locator('.category-card[data-category="films"]')).not.toHaveAttribute('hidden', '');

    await page.locator('#v4-category-clear').click();
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(26);
});

test('Explorer affiche un état vide quand la recherche ne correspond à rien', async ({ page }) => {
    await openV4(page);

    await page.locator('#v4-category-search').fill('categorie inconnue');
    await expect(page.locator('#v4-category-empty')).toBeVisible();
    await expect(page.locator('.category-card[data-category]:not([hidden])')).toHaveCount(0);
});

test('une catégorie reste activable au clavier et lance le quiz existant', async ({ page }) => {
    await openV4(page);

    await page.locator('.category-card[data-category="series"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#game-panel')).toBeVisible();
});

test('une image de catégorie absente utilise le fallback visuel sans erreur critique', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route('**/assets/images/memoriz/categories/series.webp', route => route.abort());
    await openV4(page);

    await expect(page.locator('.category-card[data-category="series"]')).toHaveClass(/v4-category-missing-image/);
    expect(consoleErrors.filter(text => !text.includes('Failed to load resource'))).toEqual([]);
});
