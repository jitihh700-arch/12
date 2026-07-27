(function() {
    const KNOWN_ERRORS = [
        'not_authenticated',
        'profile_not_found',
        'profile_already_exists',
        'pseudo_empty',
        'pseudo_too_short',
        'pseudo_too_long',
        'pseudo_invalid_format',
        'pseudo_already_taken',
        'pseudo_change_too_soon'
    ];

    const state = {
        client: null,
        api: null,
        profile: null,
        initialized: false,
        canChangePseudo: false,
        initPromise: null,
        modalMode: null,
        lastFocusedElement: null
    };

    const labels = {
        idle: 'Profil local',
        loading: 'Connexion anonyme...',
        ready: 'Profil actif',
        needsPseudo: 'Pseudo requis',
        offline: 'Mode solo',
        error: 'Profil indisponible'
    };

    function getEls() {
        return {
            card: document.getElementById('profile-card'),
            status: document.getElementById('profile-status-label'),
            pseudo: document.getElementById('profile-pseudo'),
            help: document.getElementById('profile-help'),
            stats: document.getElementById('profile-stats'),
            primary: document.getElementById('profile-primary-action'),
            retry: document.getElementById('profile-retry-action'),
            modal: document.getElementById('profile-modal'),
            modalTitle: document.getElementById('profile-modal-title'),
            modalIntro: document.getElementById('profile-modal-intro'),
            form: document.getElementById('profile-form'),
            input: document.getElementById('profile-pseudo-input'),
            error: document.getElementById('profile-form-error'),
            close: document.getElementById('profile-modal-close'),
            cancel: document.getElementById('profile-modal-cancel'),
            submit: document.getElementById('profile-modal-submit')
        };
    }

    function setCard(statusKey, pseudoText, helpText) {
        const els = getEls();
        if (!els.card) return;

        els.card.dataset.state = statusKey;
        els.status.textContent = labels[statusKey] || labels.idle;
        els.pseudo.textContent = pseudoText;
        els.help.textContent = helpText;
        if (els.stats) els.stats.textContent = '';
    }

    function setActionState(mode) {
        const els = getEls();
        if (!els.primary || !els.retry) return;

        els.primary.hidden = mode === 'offline' || mode === 'loading' || mode === 'error';
        els.retry.hidden = mode !== 'error';
        els.primary.disabled = mode === 'locked';

        if (mode === 'create') els.primary.textContent = 'Créer mon pseudo';
        if (mode === 'change') els.primary.textContent = 'Modifier mon pseudo';
        if (mode === 'locked') els.primary.textContent = 'Modification verrouillée';
    }

    function cleanPseudo(value) {
        return String(value || '').trim().replace(/ {2,}/g, ' ');
    }

    function validatePseudo(value) {
        if (/[\r\n]/.test(String(value || ''))) return { ok: false, message: 'Utilise uniquement lettres, chiffres, espaces et underscores.' };
        const pseudo = cleanPseudo(value);

        if (!pseudo) return { ok: false, message: 'Choisis un pseudo.' };
        if ([...pseudo].length < 3) return { ok: false, message: 'Le pseudo doit contenir au moins 3 caractères.' };
        if ([...pseudo].length > 20) return { ok: false, message: 'Le pseudo doit contenir 20 caractères maximum.' };
        if (!/^[\p{L}\p{N}_ ]+$/u.test(pseudo)) return { ok: false, message: 'Utilise uniquement lettres, chiffres, espaces et underscores.' };

        return { ok: true, pseudo };
    }

    function extractErrorKey(error) {
        if (!error) return '';
        const haystack = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ');
        return KNOWN_ERRORS.find(key => haystack.includes(key)) || error.message || 'unknown_error';
    }

    function describeError(error) {
        const key = extractErrorKey(error);
        const messages = {
            not_authenticated: 'La session anonyme n’est pas disponible.',
            profile_not_found: 'Crée un pseudo pour activer ton profil.',
            profile_already_exists: 'Ce profil existe déjà. Je recharge les données.',
            pseudo_empty: 'Choisis un pseudo.',
            pseudo_too_short: 'Le pseudo doit contenir au moins 3 caractères.',
            pseudo_too_long: 'Le pseudo doit contenir 20 caractères maximum.',
            pseudo_invalid_format: 'Utilise uniquement lettres, chiffres, espaces et underscores.',
            pseudo_already_taken: 'Ce pseudo est déjà pris.',
            pseudo_change_too_soon: 'Le pseudo ne peut être modifié qu’une fois tous les 14 jours.'
        };

        return messages[key] || 'Le profil est momentanément indisponible.';
    }

    function getNextChangeDate(profile) {
        if (!profile || !profile.pseudo_changed_at) return null;
        const changedAt = new Date(profile.pseudo_changed_at);
        if (Number.isNaN(changedAt.getTime())) return null;
        return new Date(changedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    }

    function profileStats(profile) {
        const points = Number(profile.total_points || 0);
        const completed = Number(profile.quizzes_completed || 0);
        return `${points} pt${points > 1 ? 's' : ''} · ${completed} quiz`;
    }

    function cacheProfile(profile) {
        localStorage.setItem('memoriz_profile_cache', JSON.stringify({
            id: profile.id,
            pseudo: profile.pseudo,
            total_points: profile.total_points,
            quizzes_completed: profile.quizzes_completed,
            pseudo_changed_at: profile.pseudo_changed_at
        }));
    }

    function formatDate(date) {
        if (!date) return '';
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }).format(date);
    }

    function renderProfile(profile) {
        state.profile = profile;
        const nextChangeDate = getNextChangeDate(profile);
        state.canChangePseudo = !nextChangeDate || nextChangeDate <= new Date();

        setCard(
            'ready',
            profile.pseudo,
            state.canChangePseudo
                ? 'Tu peux modifier ton pseudo.'
                : `Prochain changement possible le ${formatDate(nextChangeDate)}.`
        );
        const els = getEls();
        if (els.stats) els.stats.textContent = profileStats(profile);
        setActionState(state.canChangePseudo ? 'change' : 'locked');
        cacheProfile(profile);
        window.memorizProfile = Object.freeze({ ...profile });
    }

    function focusableModalElements(modal) {
        return [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
            .filter(element => {
                const style = window.getComputedStyle(element);
                return !element.disabled && !element.hidden && style.display !== 'none' && style.visibility !== 'hidden';
            });
    }

    function openModal(mode = state.profile ? 'change' : 'create') {
        const els = getEls();
        if (!els.modal || !els.input) return;

        const hasProfile = Boolean(state.profile);
        const isRequired = mode === 'required';
        state.modalMode = mode;
        state.lastFocusedElement = document.activeElement;
        els.modalTitle.textContent = hasProfile ? 'Modifier mon pseudo' : 'Créer mon pseudo';
        els.modalIntro.textContent = hasProfile
            ? 'La base vérifie le délai de 14 jours et l’unicité.'
            : 'Ton profil anonyme sera lié à cette session Supabase.';
        els.submit.textContent = hasProfile ? 'Enregistrer' : 'Créer le profil';
        els.error.textContent = '';
        els.close.hidden = isRequired;
        els.cancel.hidden = isRequired;
        els.input.value = hasProfile ? state.profile.pseudo : '';
        els.modal.hidden = false;
        els.modal.setAttribute('aria-hidden', 'false');
        window.setTimeout(() => els.input.focus(), 0);
    }

    function closeModal(force = false) {
        const els = getEls();
        if (state.modalMode === 'required' && !force) {
            if (els.input) els.input.focus();
            return;
        }
        if (!els.modal) return;
        els.modal.hidden = true;
        els.modal.setAttribute('aria-hidden', 'true');
        state.modalMode = null;
        if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === 'function') {
            state.lastFocusedElement.focus();
        }
    }

    async function ensureAnonymousSession() {
        const { data: sessionData, error: sessionError } = await state.client.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData && sessionData.session) return sessionData.session;

        const { data, error } = await state.client.auth.signInAnonymously();
        if (error) throw error;
        return data.session;
    }

    async function loadProfile() {
        const { data, error } = await state.api.getMyProfile();
        if (!error && data) {
            renderProfile(data);
            return;
        }

        if (extractErrorKey(error) === 'profile_not_found') {
            state.profile = null;
            setCard('needsPseudo', 'Choisis ton pseudo', 'Le quiz solo reste jouable même sans profil.');
            setActionState('create');
            openModal('required');
            return;
        }

        throw error;
    }

    function withTimeout(promise, milliseconds) {
        let timeoutId;
        const timeout = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('supabase_init_timeout')), milliseconds);
        });

        return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
    }

    async function initProfile() {
        if (state.initPromise) return state.initPromise;
        const config = window.MEMORIZ_SUPABASE_CONFIG || {};
        const hasConfig = Boolean(config.url && config.publishableKey);

        if (!hasConfig) {
            setCard('offline', 'Quiz solo disponible', 'Supabase n’est pas configuré sur cet environnement.');
            setActionState('offline');
            return;
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            setCard('offline', 'Quiz solo disponible', 'Le client Supabase n’a pas pu être chargé.');
            setActionState('offline');
            return;
        }

        setCard('loading', 'Connexion en cours', 'Création ou reprise de la session anonyme...');
        setActionState('loading');

        state.initPromise = (async () => {
            try {
                state.api = window.MemorizProfileApi.init(config);
                state.client = state.api.client;
                await withTimeout((async () => {
                    await ensureAnonymousSession();
                    await loadProfile();
                })(), 8000);
                state.initialized = true;
            } catch (error) {
                setCard('error', 'Quiz solo disponible', describeError(error));
                setActionState('error');
            } finally {
                state.initPromise = null;
            }
        })();

        return state.initPromise;
    }

    async function submitProfileForm(event) {
        event.preventDefault();
        const els = getEls();
        const validation = validatePseudo(els.input.value);
        if (!validation.ok) {
            els.error.textContent = validation.message;
            return;
        }

        els.submit.disabled = true;
        els.error.textContent = '';

        try {
            const result = state.profile
                ? await state.api.changeMyPseudo(validation.pseudo)
                : await state.api.registerProfile(validation.pseudo);

            if (result.error) {
                if (extractErrorKey(result.error) === 'profile_already_exists') {
                    await loadProfile();
                    closeModal(true);
                    return;
                }
                throw result.error;
            }

            renderProfile(result.data);
            closeModal(true);
        } catch (error) {
            els.error.textContent = describeError(error);
        } finally {
            els.submit.disabled = false;
        }
    }

    function bindProfileUi() {
        const els = getEls();
        if (!els.card) return;

        els.primary.addEventListener('click', () => {
            if (!els.primary.disabled) openModal();
        });
        els.retry.addEventListener('click', () => initProfile());
        els.close.addEventListener('click', () => closeModal());
        els.cancel.addEventListener('click', () => closeModal());
        els.form.addEventListener('submit', submitProfileForm);
        els.modal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeModal();
            }
            if (event.key === 'Tab') {
                const focusable = focusableModalElements(els.modal);
                if (focusable.length === 0) return;
                event.preventDefault();
                const currentIndex = focusable.indexOf(document.activeElement);
                const direction = event.shiftKey ? -1 : 1;
                const nextIndex = currentIndex === -1
                    ? 0
                    : (currentIndex + direction + focusable.length) % focusable.length;
                focusable[nextIndex].focus();
            }
        });
        els.modal.addEventListener('click', (event) => {
            if (event.target === els.modal) closeModal();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindProfileUi();
        initProfile();
    });

    window.memorizAuth = {
        initProfile,
        openModal,
        getState: () => ({ initialized: state.initialized, hasProfile: Boolean(state.profile), profile: state.profile })
    };
})();
