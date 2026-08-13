        // ========== FOND ANIMÉ AVEC PARTICULES ==========
        const canvas = document.getElementById('particles-canvas');
        const ctx = canvas.getContext('2d');
        let particles = [];

        function resizeCanvas() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 4 + 1;
                this.speedX = (Math.random() - 0.5) * 0.8;
                this.speedY = (Math.random() - 0.5) * 0.8;
                this.opacity = Math.random() * 0.6 + 0.2;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x > canvas.width) this.x = 0;
                if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                if (this.y < 0) this.y = canvas.height;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
                ctx.fill();
            }
        }

        // Création des particules
        function initParticles(count = 120) {
            particles = [];
            for (let i = 0; i < count; i++) {
                particles.push(new Particle());
            }
        }
        initParticles(120);

        // Animation
        function animateParticles() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let p of particles) {
                p.update();
                p.draw();
            }
            requestAnimationFrame(animateParticles);
        }
        animateParticles();

        // Garde les particules cohérentes avec le thème actif.
        function updateParticlesForTheme(isLight) {
            Particle.prototype.draw = function() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                const color = document.body.classList.contains('light-mode') ? 'rgba(0, 0, 0, 0.25)' : `rgba(255, 255, 255, ${this.opacity})`;
                ctx.fillStyle = color;
                ctx.fill();
            };
        }
        updateParticlesForTheme(false);

        // Observer le changement de thème
        const themeToggle = document.getElementById('themeToggle');
        themeToggle?.addEventListener('click', function() {
            setTimeout(() => {
                updateParticlesForTheme(document.body.classList.contains('light-mode'));
            }, 50);
        });

        function showMessage(msg, type) { const messageDiv = document.getElementById('message'); if (!messageDiv) return; const box = document.createElement('div'); box.className = `message ${type}`; box.textContent = msg; messageDiv.replaceChildren(box); setTimeout(() => { if (messageDiv) messageDiv.replaceChildren(); }, 3000); }
        const legalContent = {
            privacy: { title: "🔒 Confidentialité", heading: "Politique de Confidentialité", paragraphs: [
                "Le quiz solo reste utilisable sans profil. Si vous créez un profil, Supabase conserve un identifiant technique anonyme, votre pseudo, une session stockée dans le navigateur, les dates techniques du profil, le score total, le nombre de quiz associés au profil, les sessions de quiz classées, les réponses soumises, les points cumulés, les statistiques par catégorie et la date de dernière activité.",
                "Le classement affiche aux utilisateurs connectés le pseudo, les points et le nombre de quiz complétés. Le serveur empêche la falsification directe des points, mais ne garantit pas qu'un joueur ne connaisse pas déjà les réponses publiques du mode entraînement, présentes dans le JavaScript public.",
                "Les commentaires peuvent conserver le contenu publié, le pseudo associé au profil courant, les dates de création et de modification, ainsi qu'une date de suppression logique. Un commentaire supprimé n'est plus retourné par l'interface publique, mais il peut rester présent techniquement dans la base.",
                "Les parties multijoueurs utilisent un code de partie, des statuts de présence, des réponses soumises au backend, des scores serveur, un classement final et des réactions sans effet sur le score. Le backend temps réel reçoit les informations techniques nécessaires à la connexion Socket.io.",
                "Memoriz ne demande pas d'email ni de mot de passe obligatoire. Si vous effacez le stockage du navigateur, l'accès au profil anonyme peut être perdu. Aucun cookie de traçage n'est utilisé sur notre site. Pour toute question, contactez-nous à : jitihh700@gmail.com."
            ] },
            terms: { title: "📜 Conditions Générales", heading: "Conditions Générales d'Utilisation", paragraphs: [
                "1. Acceptation des conditions : en utilisant Memoriz, vous acceptez pleinement nos conditions.",
                "2. Service gratuit : Memoriz est entièrement gratuit. Aucun abonnement ni paiement n'est requis.",
                "3. Propriété intellectuelle : le contenu des quiz, noms de personnages et œuvres appartient à leurs propriétaires respectifs. Memoriz est un site éducatif et ludique.",
                "4. Limitation de responsabilité : Memoriz s'efforce de maintenir l'exactitude des informations mais ne peut garantir l'absence d'erreur.",
                "5. Contact : pour toute réclamation, écrivez à jitihh700@gmail.com."
            ] },
            mentions: { title: "⚖️ Mentions légales", heading: "Mentions légales", paragraphs: [
                "Éditeur du site : Memoriz. Email : jitihh700@gmail.com.",
                "Hébergement : à configurer selon l'hébergeur réellement retenu avant mise en production.",
                "Directeur de publication : l'équipe Memoriz.",
                "Propriété intellectuelle : l'ensemble des contenus textuels et graphiques de Memoriz sont protégés par le droit d'auteur. Les noms de personnages et œuvres cités appartiennent à leurs ayants droit respectifs."
            ] },
            about: { title: "ℹ️ À propos de Memoriz", heading: "Notre histoire", paragraphs: [
                "Memoriz est né en 2022 d'une passion commune pour les quiz, la culture pop et les jeux de mémoire. Notre mission : rendre l'apprentissage ludique et accessible à tous.",
                "Notre objectif : créer une grande base de quiz francophone sur les célébrités, animés, sports et musiques.",
                "Pour nous contacter : jitihh700@gmail.com. Retrouvez-nous aussi via les liens en bas de page."
            ] },
            contact: { title: "📧 Contact", heading: "Contactez-nous", paragraphs: [
                "Une question, une suggestion de quiz ou un problème technique ? Écrivez à jitihh700@gmail.com.",
                "Délai de réponse indicatif : sous 48h ouvrées.",
                "Réseaux sociaux : YouTube @noironik, TikTok @noironik, Twitch noironik1."
            ] }
        };
        function showLegalPage(page) { const modal = document.getElementById('legal-modal'); const modalBody = document.getElementById('modal-body'); const content = legalContent[page]; if (content) { const wrapper = document.createElement('div'); wrapper.className = 'legal-content'; const heading = document.createElement('h2'); heading.textContent = content.heading; wrapper.append(heading); content.paragraphs.forEach(text => { const paragraph = document.createElement('p'); paragraph.textContent = text; wrapper.append(paragraph); }); modalBody.replaceChildren(wrapper); modal.style.display = 'block'; } }
        function initLegalPages() { const modal = document.getElementById('legal-modal'); const closeBtn = document.querySelector('.close-modal'); document.getElementById('privacy-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('privacy'); }); document.getElementById('terms-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('terms'); }); document.getElementById('mentions-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('mentions'); }); document.getElementById('about-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('about'); }); document.getElementById('contact-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('contact'); }); if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; }; window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; }; }
        function initBlogArticles() { document.querySelectorAll('.read-more').forEach(button => { button.addEventListener('click', (e) => { const blogId = button.getAttribute('data-blog'); const content = document.getElementById(`${blogId}-content`); if (content) { const isVisible = content.classList.contains('show'); if (!isVisible) { content.classList.add('show'); button.textContent = 'Réduire ↑'; } else { content.classList.remove('show'); button.textContent = 'Lire la suite →'; } } }); }); }
        function initTheme() { document.body.classList.remove('light-mode'); localStorage.removeItem('memoriz_theme'); }
// 🔴 Empêche tout autre script d'intercepter les clics sur les réseaux sociaux
document.querySelectorAll('.social-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.stopPropagation();
    });
});
