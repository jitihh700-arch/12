function renderGamePanel(categoryKey) {
    let tableRows = '';
    for (let i = 0; i < currentGame.questions.length; i++) {
        tableRows += `<tr><td>${i + 1}</td><td id="answer-display-${i}">${initialDisplayFor(i)}</td><td id="status-${i}">⏳</td></tr>`;
    }

    const modeLabel = currentGame.mode === 'ranked' ? 'Mode classé' : 'Mode entraînement';
    const modeHelp = currentGame.mode === 'ranked'
        ? 'Score validé par le serveur.'
        : 'Aucun point classé ne sera enregistré.';
    
    const gameHTML = `
    <div id="game-panel" class="game-panel">
        <div class="game-container">
            <div class="game-header">
                <h2>🎯 ${currentGame.category}</h2>
                <div class="timer" id="timer">⏱️ 10:00</div>
                <button id="close-game-btn" class="close-btn">✕</button>
            </div>
            <div class="score-display" id="score">🎯 0 pts · 0/${currentGame.questions.length}</div>
            <div class="progress-display" id="progress">📊 Progression: 0/${currentGame.questions.length} (0%)</div>
            <div class="mode-badge">${modeLabel}<span class="mode-help">${modeHelp}</span></div>
            <div class="info-text">${infoHtmlFor(categoryKey)}</div>
            <div class="quick-input-container">
                <input type="text" id="quick-input" class="quick-input" placeholder="Tape la réponse ici..." autocomplete="off">
                <button id="quick-submit" class="quick-submit-btn">Valider</button>
            </div>
            <div id="found-list" class="found-list">💡 Tape une réponse pour commencer l'aventure Memoriz !</div>
            <table class="answers-table">
                <thead><tr><th>#</th><th>${currentGame.hintList ? 'Indice' : (currentGame.showYears ? 'Année' : 'Nom')}</th><th>✅ Statut</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', gameHTML);
}
