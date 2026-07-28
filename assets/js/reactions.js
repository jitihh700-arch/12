(function() {
    const TYPES = [
        { type: 'like', emoji: '👍', label: 'Envoyer une réaction j’aime' },
        { type: 'heart', emoji: '❤️', label: 'Envoyer une réaction cœur' },
        { type: 'fire', emoji: '🔥', label: 'Envoyer une réaction feu' },
        { type: 'party', emoji: '🎉', label: 'Envoyer une réaction fête' },
        { type: 'shocked', emoji: '😱', label: 'Envoyer une réaction surpris' }
    ];

    function emojiFor(type) {
        return TYPES.find(item => item.type === type)?.emoji || '';
    }

    function render(container, onSend) {
        if (!container) return;
        container.replaceChildren();
        TYPES.forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'reaction-button';
            button.dataset.reactionType = item.type;
            button.setAttribute('aria-label', item.label);
            button.textContent = item.emoji;
            button.addEventListener('click', () => onSend(item.type));
            container.append(button);
        });
    }

    function setDisabled(container, disabled) {
        container?.querySelectorAll('button').forEach(button => {
            button.disabled = disabled;
        });
    }

    function showReaction(event) {
        let layer = document.querySelector('.reaction-float-layer');
        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'reaction-float-layer';
            layer.setAttribute('aria-live', 'polite');
            document.body.append(layer);
        }
        const toast = document.createElement('div');
        toast.className = 'reaction-toast';
        const pseudo = event?.pseudo || 'Joueur';
        toast.textContent = `${pseudo} ${emojiFor(event?.reactionType)}`;
        layer.append(toast);
        window.setTimeout(() => toast.remove(), 1800);
    }

    window.MemorizReactions = { TYPES, render, setDisabled, showReaction, emojiFor };
})();
