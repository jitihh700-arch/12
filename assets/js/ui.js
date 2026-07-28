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

        // Adapter les couleurs en mode clair
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
        themeToggle.addEventListener('click', function() {
            setTimeout(() => {
                updateParticlesForTheme(document.body.classList.contains('light-mode'));
            }, 50);
        });

        function showMessage(msg, type) { const messageDiv = document.getElementById('message'); if (!messageDiv) return; const box = document.createElement('div'); box.className = `message ${type}`; box.textContent = msg; messageDiv.replaceChildren(box); setTimeout(() => { if (messageDiv) messageDiv.replaceChildren(); }, 3000); }
        const legalContent = { privacy: { title: "🔒 Confidentialité", content: "<h2>Politique de Confidentialité</h2><p>Le quiz solo reste utilisable sans profil. Si vous créez un profil, Supabase conserve un identifiant technique anonyme, votre pseudo, une session stockée dans le navigateur, les dates techniques du profil, le score total, le nombre de quiz associés au profil, les sessions de quiz classées, les réponses soumises, les points cumulés, les statistiques par catégorie et la date de dernière activité. Le classement affiche aux utilisateurs connectés le pseudo, les points et le nombre de quiz complétés. Le serveur empêche la falsification directe des points, mais ne garantit pas qu'un joueur ne connaisse pas déjà les réponses publiques du quiz. Les commentaires peuvent aussi conserver le contenu publié, le pseudo associé au profil courant, les dates de création et de modification, ainsi qu'une date de suppression logique lorsque vous supprimez un commentaire. Un commentaire supprimé n'est plus retourné par l'interface publique, mais il peut rester présent techniquement dans la base. Les commentaires visibles sont diffusés en temps réel aux utilisateurs connectés via Supabase. Dans cette phase, Memoriz ne demande pas d'email ni de mot de passe obligatoire. Si vous effacez le stockage du navigateur, l'accès au profil anonyme peut être perdu. Aucun cookie de traçage n'est utilisé sur notre site. Pour toute question, contactez-nous à : <strong>jitihh700@gmail.com</strong></p>" }, terms: { title: "📜 Conditions Générales", content: "<h2>Conditions Générales d'Utilisation</h2><p><strong>1. Acceptation des conditions</strong><br>En utilisant Memoriz, vous acceptez pleinement nos conditions.</p><p><strong>2. Service gratuit</strong><br>Memoriz est entièrement gratuit. Aucun abonnement ni paiement n'est requis.</p><p><strong>3. Propriété intellectuelle</strong><br>Le contenu des quiz (noms de personnages, œuvres) appartient à leurs propriétaires respectifs. Memoriz est un site éducatif et ludique.</p><p><strong>4. Limitation de responsabilité</strong><br>Memoriz s'efforce de maintenir l'exactitude des informations mais ne peut garantir l'absence d'erreur.</p><p><strong>5. Contact</strong><br>Pour toute réclamation : <strong>jitihh700@gmail.com</strong></p>" }, mentions: { title: "⚖️ Mentions légales", content: "<h2>Mentions légales</h2><p><strong>Éditeur du site :</strong><br>Memoriz<br>Email : jitihh700@gmail.com</p><p><strong>Hébergement :</strong><br>Render Inc.<br>525 Brannan St, San Francisco, CA 94107, États-Unis</p><p><strong>Directeur de publication :</strong><br>L'équipe Memoriz</p><p><strong>Propriété intellectuelle :</strong><br>L'ensemble des contenus textuels et graphiques de Memoriz sont protégés par le droit d'auteur. Les noms de personnages et œuvres cités appartiennent à leurs ayants droit respectifs.</p>" }, about: { title: "ℹ️ À propos de Memoriz", content: "<h2>Notre histoire</h2><p>Memoriz est né en 2022 d'une passion commune pour les quiz, la culture pop et les jeux de mémoire. Notre mission : rendre l'apprentissage ludique et accessible à tous.</p><p><strong>🎯 Notre objectif :</strong> Créer la plus grande base de quiz francophone sur les célébrités, animés, sports et musiques.</p><p><strong>📈 Chiffres clés :</strong><br>- 20 catégories de quiz<br>- Plus de 300 questions uniques<br>- Des milliers de joueurs chaque mois</p><p><strong>💡 Pour nous contacter :</strong> jitihh700@gmail.com</p><p><strong>📱 Retrouvez-nous sur les réseaux :</strong><br>YouTube, TikTok, Twitch, WhatsApp - Tous les liens sont en bas de page !</p>" }, contact: { title: "📧 Contact", content: "<h2>Contactez-nous</h2><p>Une question ? Une suggestion de quiz ? Un problème technique ? Nous sommes là pour vous !</p><p><strong>📨 Email :</strong> <a href='mailto:jitihh700@gmail.com'>jitihh700@gmail.com</a></p><p><strong>⏰ Délai de réponse :</strong> Sous 48h ouvrées.</p><p><strong>📱 Réseaux sociaux :</strong></p><ul><li>🎥 YouTube : <a href='https://youtube.com/@noironik' target='_blank'>@noironik</a></li><li>🎵 TikTok : <a href='https://tiktok.com/@noironik' target='_blank'>@noironik</a></li><li>📺 Twitch : <a href='https://twitch.tv/noironik1' target='_blank'>noironik1</a></li><li>💬 WhatsApp : <a href='https://wa.me/2250708608958?text=Salut%20Memoriz%20!' target='_blank'>noironik</a></li></ul><p>N'hésitez pas à nous suivre pour ne rien rater des nouveautés Memoriz !</p>" } };
        function showLegalPage(page) { const modal = document.getElementById('legal-modal'); const modalBody = document.getElementById('modal-body'); const content = legalContent[page]; if (content) { modalBody.innerHTML = `<div class="legal-content">${content.content}</div>`; modal.style.display = 'block'; } }
        function initLegalPages() { const modal = document.getElementById('legal-modal'); const closeBtn = document.querySelector('.close-modal'); document.getElementById('privacy-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('privacy'); }); document.getElementById('terms-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('terms'); }); document.getElementById('mentions-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('mentions'); }); document.getElementById('about-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('about'); }); document.getElementById('contact-link')?.addEventListener('click', (e) => { e.preventDefault(); showLegalPage('contact'); }); if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; }; window.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; }; }
        function initBlogArticles() { document.querySelectorAll('.read-more').forEach(button => { button.addEventListener('click', (e) => { const blogId = button.getAttribute('data-blog'); const content = document.getElementById(`${blogId}-content`); if (content) { const isVisible = content.classList.contains('show'); if (!isVisible) { content.classList.add('show'); button.textContent = 'Réduire ↑'; } else { content.classList.remove('show'); button.textContent = 'Lire la suite →'; } } }); }); }
        function initTheme() { const savedTheme = localStorage.getItem('memoriz_theme'); if (savedTheme === 'light') document.body.classList.add('light-mode'); document.getElementById('themeToggle').addEventListener('click', () => { document.body.classList.toggle('light-mode'); localStorage.setItem('memoriz_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark'); }); }
