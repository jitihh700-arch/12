(function() {
    let initialized = false;

    function byId(id) {
        return document.getElementById(id);
    }

    function normalize(text) {
        return String(text || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    function categoryTheme(key) {
        if (/anime|manga|transformations|combats|arcs|techniques|filles/i.test(key)) return 'anime';
        if (/foot|sport|ballon|ligue/i.test(key)) return 'sport';
        return 'culture';
    }

    function categoryCards() {
        return [...document.querySelectorAll('.category-card[data-category]')];
    }

    function addFootballRecordsCategory() {
        if (!window.categoryMapping || window.categoryMapping.footballRecords) return;

        const data = [
            'Lionel Messi',
            'Robert Lewandowski',
            'Sadio Mané',
            'Real Madrid',
            'Lionel Messi',
            'Lionel Messi',
            'Pelé',
            'Bayern Munich',
            'Lionel Messi',
            'Real Madrid'
        ];
        const hints = [
            '⚽ 91 buts inscrits sur une année civile en 2012.',
            '🔥 5 buts marqués en seulement 9 minutes avec le Bayern Munich.',
            '⚡ 3 buts inscrits en 2 minutes et 56 secondes avec Southampton.',
            '🏆 Club recordman avec 15 titres de Ligue des Champions.',
            '🥇 Premier joueur à remporter le Ballon d’Or 4 fois consécutivement : 2009, 2010, 2011 et 2012.',
            '👑 Recordman avec 8 Ballons d’Or remportés.',
            '🌍 Seul joueur à avoir remporté 3 Coupes du Monde : 1958, 1962 et 1970.',
            '💥 A battu le FC Barcelone 8-2 en quart de finale de la Ligue des Champions 2019/20.',
            '👟 Recordman avec 6 Souliers d’Or européens.',
            '🏆 A remporté les 5 premières Coupes d’Europe des clubs champions consécutivement, de 1956 à 1960.'
        ];

        window.categoryMapping.footballRecords = {
            data,
            title: '⚽ Football - Top 10 des records & statistiques',
            showYears: false,
            yearsList: null,
            hintList: hints
        };

        const grid = document.querySelector('.category-grid');
        if (!grid || grid.querySelector('[data-category="footballRecords"]')) return;

        const card = document.createElement('div');
        card.className = 'category-card';
        card.dataset.category = 'footballRecords';
        card.innerHTML = '<h3>⚽ Football</h3><p>Top 10 des records & statistiques</p><span class="questions-count">10 records</span>';
        grid.append(card);

        const stats = document.querySelector('.v4-home-stats');
        if (stats) {
            [...stats.children].forEach(item => {
                if (/26 catégories/i.test(item.textContent)) item.textContent = '27 catégories';
            });
        }

        document.querySelectorAll('.v4-feature-list li').forEach(item => {
            if (/26 catégories existantes/i.test(item.textContent)) item.textContent = '27 catégories disponibles.';
        });
    }

    function enrichCategories() {
        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            const key = card.getAttribute('data-category');
            if (!key || card.dataset.v4Ready === 'true') return;
            const title = card.querySelector('h3')?.textContent?.trim() || key;
            const description = card.querySelector('p')?.textContent?.trim() || '';
            const count = card.querySelector('.questions-count')?.textContent?.trim() || '';

            const image = document.createElement('img');
            image.className = 'v4-category-image';
            image.src = `assets/images/memoriz/categories/${key}.webp`;
            image.alt = `Illustration de la catégorie ${title}`;
            image.width = 640;
            image.height = 400;
            image.loading = 'lazy';
            image.onerror = () => {
                image.hidden = true;
                card.classList.add('v4-category-missing-image');
            };

            const body = document.createElement('div');
            body.className = 'v4-category-body';

            const heading = document.createElement('h3');
            heading.textContent = title;
            const text = document.createElement('p');
            text.textContent = description;
            const badge = document.createElement('span');
            badge.className = 'questions-count';
            badge.textContent = count;

            body.append(heading, text, badge);
            card.replaceChildren(image, body);
            card.dataset.v4Ready = 'true';
            card.dataset.v4Search = normalize(`${title} ${description} ${count} ${key}`);
            card.dataset.v4Theme = categoryTheme(key);
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Lancer le quiz ${title}`);
        });
    }

    function renderHomeGuide() {
        const home = byId('home');
        const profile = byId('profile-card');
        if (!home || !profile || byId('v4-home-guide')) return;

        const section = document.createElement('section');
        section.id = 'v4-home-guide';
        section.className = 'v4-page-panel';
        section.setAttribute('aria-labelledby', 'v4-home-guide-title');
        section.style.marginTop = '24px';

        const heading = document.createElement('h2');
        heading.id = 'v4-home-guide-title';
        heading.textContent = '📚 Comment fonctionne Memoriz ?';
        section.append(heading);

        const articles = [
            ['🎯 1. Choisis ton quiz', 'Va dans Explorer, cherche une catégorie ou utilise les filtres. Clique ensuite sur une catégorie pour lancer le quiz.'],
            ['⚡ 2. Réponds et progresse', 'Réponds aux questions dans le temps prévu. Ton score et tes résultats sont calculés selon les règles du quiz.'],
            ['🏆 3. Profil et classement', 'Tu peux jouer sans profil. Crée un pseudo si tu veux enregistrer ta progression et retrouver ton classement personnel.']
        ];

        articles.forEach(([title, text]) => {
            const article = document.createElement('article');
            article.className = 'blog-article';
            const articleTitle = document.createElement('h3');
            articleTitle.textContent = title;
            const paragraph = document.createElement('p');
            paragraph.textContent = text;
            article.append(articleTitle, paragraph);
            section.append(article);
        });

        profile.insertAdjacentElement('afterend', section);
    }

    function suggestionLabel(card) {
        return card.querySelector('h3')?.textContent?.trim() || card.dataset.category || '';
    }

    function renderCategorySuggestions(query, activeFilter) {
        const input = byId('v4-category-search');
        const suggestions = byId('v4-category-suggestions');
        if (!input || !suggestions) return;

        suggestions.replaceChildren();
        if (!query) {
            suggestions.hidden = true;
            return;
        }

        const matches = categoryCards()
            .filter(card => {
                const matchesFilter = activeFilter === 'all' || card.dataset.v4Theme === activeFilter;
                return matchesFilter && card.dataset.v4Search.includes(query);
            })
            .slice(0, 5);

        if (!matches.length) {
            suggestions.hidden = true;
            return;
        }

        matches.forEach(card => {
            const label = suggestionLabel(card);
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = label;
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                input.value = label;
                input.focus({ preventScroll: true });
                filterCategories();
            });
            suggestions.append(button);
        });
        suggestions.hidden = false;
    }

    function filterCategories() {
        const input = byId('v4-category-search');
        const clear = byId('v4-category-clear');
        const empty = byId('v4-category-empty');
        const activeFilter = document.querySelector('[data-v4-filter].is-active')?.getAttribute('data-v4-filter') || 'all';
        const query = normalize(input?.value || '');
        let visibleCount = 0;

        categoryCards().forEach(card => {
            const matchesQuery = !query || card.dataset.v4Search.includes(query);
            const matchesFilter = activeFilter === 'all' || card.dataset.v4Theme === activeFilter;
            const visible = matchesQuery && matchesFilter;
            card.hidden = !visible;
            if (visible) visibleCount += 1;
        });

        if (clear) clear.hidden = !query;
        renderCategorySuggestions(query, activeFilter);
        if (empty) empty.hidden = visibleCount !== 0;
    }

    function bindExplorer() {
        const search = byId('v4-category-search');
        const clear = byId('v4-category-clear');
        const searchForm = document.querySelector('.v4-search');

        search?.addEventListener('mousedown', event => event.stopPropagation());
        search?.addEventListener('click', event => event.stopPropagation());
        search?.addEventListener('input', filterCategories);
        search?.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                filterCategories();
            }
        });

        clear?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            search.value = '';
            search.focus({ preventScroll: true });
            filterCategories();
        });

        searchForm?.addEventListener('submit', event => {
            event.preventDefault();
            filterCategories();
        });

        document.querySelectorAll('[data-v4-filter]').forEach(button => {
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                document.querySelectorAll('[data-v4-filter]').forEach(item => item.classList.remove('is-active'));
                button.classList.add('is-active');
                filterCategories();
            });
        });

        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            card.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();
                const category = card.getAttribute('data-category');
                if (category && typeof window.showGamePanel === 'function') window.showGamePanel(category);
            });
        });

        document.querySelectorAll('.category-card[data-category]').forEach(card => {
            card.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                const category = card.getAttribute('data-category');
                if (category && typeof window.showGamePanel === 'function') window.showGamePanel(category);
                else card.click();
            });
        });
    }

    function setCurrentRoute(route) {
        document.querySelectorAll('[data-v4-route]').forEach(link => {
            const isCurrent = link.getAttribute('data-v4-route') === route;
            if (isCurrent) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        const viewRoute = route === 'profile' ? 'home' : route;
        document.querySelectorAll('[data-v4-view]').forEach(view => {
            view.classList.toggle('is-v4-current', view.getAttribute('data-v4-view') === viewRoute);
        });
        document.body.dataset.v4Route = route;
    }

    function routeTarget(route) {
        const targets = { home: 'home', explorer: 'explorer', solo: 'solo', multiplayer: 'multiplayer', community: 'community', articles: 'articles', profile: 'profile-card' };
        return byId(targets[route] || route);
    }

    function routeFromHash(hash) {
        const value = hash ? hash.replace(/^#/, '') : 'home';
        const hashRoutes = { home: 'home', explorer: 'explorer', solo: 'solo', multiplayer: 'multiplayer', community: 'community', articles: 'articles', 'profile-card': 'profile' };
        return hashRoutes[value] || 'home';
    }

    function goToRoute(route, options = {}) {
        const target = routeTarget(route);
        if (!target) return;
        setCurrentRoute(route);
        window.location.hash = target.id;
        if (!options.silent) target.scrollIntoView({ behavior: 'auto', block: 'start' });
        if (options.focus) {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    }

    function setMobileMenu(open) {
        const button = byId('v4-menu-toggle');
        const menu = byId('v4-mobile-menu');
        if (!button || !menu) return;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
        menu.hidden = !open;
    }

    function bindNavigation() {
        document.addEventListener('click', event => {
            if (event.target.closest('.multiplayer-modal, .profile-modal, .leaderboard-modal, .comments-section, .modal, [aria-modal="true"], #game-panel, .game-panel')) return;

            const emptyAnchor = event.target.closest('a[href="#"]:not([data-v4-route])');
            if (emptyAnchor) {
                event.preventDefault();
                return;
            }

            const menuButton = event.target.closest('#v4-menu-toggle');
            if (menuButton) {
                event.preventDefault();
                const expanded = menuButton.getAttribute('aria-expanded') === 'true';
                setMobileMenu(!expanded);
                return;
            }

            const link = event.target.closest('[data-v4-route]');
            if (!link) return;
            const route = link.getAttribute('data-v4-route');
            if (!route) return;
            event.preventDefault();
            setMobileMenu(false);
            goToRoute(route, { focus: true });
        });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') setMobileMenu(false); });
        byId('v4-nav-profile-action')?.addEventListener('click', () => window.memorizAuth?.openModal?.());
        byId('v4-multiplayer-create')?.addEventListener('click', () => { window.MemorizMultiplayer?.open?.(); byId('multiplayer-tab-create')?.click(); });
        byId('v4-multiplayer-join')?.addEventListener('click', () => { window.MemorizMultiplayer?.open?.(); byId('multiplayer-tab-join')?.click(); });
    }

    function syncProfileName() {
        const target = byId('v4-nav-profile-name');
        if (!target) return;
        const profile = window.memorizAuth?.getState?.().profile || window.memorizProfile;
        const hasConfig = Boolean(window.MEMORIZ_SUPABASE_CONFIG?.url && window.MEMORIZ_SUPABASE_CONFIG?.publishableKey && window.supabase);
        target.textContent = profile?.pseudo ? profile.pseudo : (hasConfig ? 'Créer profil' : 'Mode solo');
    }

    function init() {
        if (initialized) return;
        initialized = true;
        addFootballRecordsCategory();
        enrichCategories();
        renderHomeGuide();
        bindExplorer();
        bindNavigation();
        syncProfileName();
        filterCategories();
        setCurrentRoute(routeFromHash(window.location.hash));
        document.addEventListener('memoriz:profile-ready', syncProfileName);
        document.addEventListener('memoriz:profile-needed', syncProfileName);
        document.addEventListener('memoriz:profile-unavailable', syncProfileName);
        window.addEventListener('hashchange', () => setCurrentRoute(routeFromHash(window.location.hash)));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
