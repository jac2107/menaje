/**
 * ia-integration.js
 * FASE 3: Integración de ChatWidget + RecommendationCards
 * Conecta ambos componentes para recomendaciones automáticas
 */

class IAIntegration {
    constructor() {
        this.chatWidget = null;
        this.recommendationCards = null;
        this.init();
    }

    init() {
        const checkInterval = setInterval(() => {
            if (window.chatWidget && window.recommendationCards) {
                clearInterval(checkInterval);
                this.setupIntegration();
            }
        }, 100);

        setTimeout(() => {
            clearInterval(checkInterval);
            if (window.chatWidget && window.recommendationCards) {
                this.setupIntegration();
            } else {
                console.warn('IA Integration: Componentes no cargados a tiempo');
            }
        }, 5000);
    }

    setupIntegration() {
        console.log('✅ IA Integration iniciado');
        this.chatWidget = window.chatWidget;
        this.recommendationCards = window.recommendationCards;
        this.addRecommendationButton();
        this.setupAutoRecommendations();
    }

    addRecommendationButton() {
        setTimeout(() => {
            const chatContainer = document.getElementById('chat-container');
            if (!chatContainer) return;

            const recButton = document.createElement('button');
            recButton.id = 'ai-rec-button';
            recButton.className = 'ai-rec-button';
            recButton.title = 'Generar Recomendaciones';
            recButton.innerHTML = '🎯 Recomendaciones';

            recButton.addEventListener('click', () => {
                this.showRecommendationForm();
            });

            const recommendationsContainer = document.getElementById('recommendations-container');
            if (recommendationsContainer) {
                recommendationsContainer.parentElement.insertBefore(recButton, recommendationsContainer);
            }
        }, 500);
    }

    showRecommendationForm() {
        const modal = document.createElement('div');
        modal.className = 'rec-modal';
        modal.innerHTML = `
            <div class="rec-modal-content">
                <h3>🎯 Generar Recomendaciones de Menaje</h3>
                <form id="rec-form">
                    <div class="form-group">
                        <label for="tipoEvento">Tipo de Evento:</label>
                        <select id="tipoEvento" required>
                            <option value="">-- Selecciona --</option>
                            <option value="boda">Boda</option>
                            <option value="cumpleaños">Cumpleaños</option>
                            <option value="corporativo">Evento Corporativo</option>
                            <option value="graduacion">Graduación</option>
                            <option value="baby_shower">Baby Shower</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="numAsistentes">Número de Asistentes:</label>
                        <input type="number" id="numAsistentes" min="1" max="1000" required />
                    </div>

                    <div class="form-group">
                        <label for="presupuesto">Presupuesto (S/):</label>
                        <input type="number" id="presupuesto" min="0" step="100" placeholder="Opcional" />
                    </div>

                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Generar Recomendaciones</button>
                        <button type="button" class="btn btn-secondary" onclick="this.closest('.rec-modal').remove()">Cancelar</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('rec-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const tipoEvento = document.getElementById('tipoEvento').value;
            const numAsistentes = parseInt(document.getElementById('numAsistentes').value);
            const presupuesto = document.getElementById('presupuesto').value || null;

            modal.remove();
            this.recommendationCards.loadRecommendations(tipoEvento, numAsistentes, presupuesto);

            setTimeout(() => {
                document.getElementById('recommendations-container')?.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        });
    }

    setupAutoRecommendations() {
        const keywordsRecommendation = [
            'recomienda', 'recomendación', 'sugiere', 'necesito menaje',
            'qué menaje', 'cuánto menaje', 'menaje para', 'sugerencias',
            'opciones de menaje'
        ];

        const originalAddMessage = this.chatWidget.addMessage.bind(this.chatWidget);
        this.chatWidget.addMessage = (text, sender, ...rest) => {
            originalAddMessage(text, sender, ...rest);

            if (sender === 'user') {
                const textLower = text.toLowerCase();

                if (keywordsRecommendation.some(keyword => textLower.includes(keyword))) {
                    this.extractAndRecommend(text);
                }
            }
        };
    }

    extractAndRecommend(mensaje) {
        const mensajeLower = mensaje.toLowerCase();

        const tipoEventoMap = {
            'boda': ['boda', 'matrimonio', 'casamiento'],
            'cumpleaños': ['cumpleaños', 'cumple', 'aniversario'],
            'corporativo': ['corporativo', 'empresa', 'reunión de trabajo', 'conference'],
            'graduacion': ['graduación', 'graduacion'],
            'baby_shower': ['baby shower', 'baby', 'ducha de bebé']
        };

        let tipoEvento = 'otro';
        for (const [tipo, palabras] of Object.entries(tipoEventoMap)) {
            if (palabras.some(p => mensajeLower.includes(p))) {
                tipoEvento = tipo;
                break;
            }
        }

        const numMatch = mensaje.match(/(\d{2,4})\s*(personas|asistentes|invitados)/i);
        const numAsistentes = numMatch ? parseInt(numMatch[1]) : null;

        if (numAsistentes) {
            console.log(`🎯 Auto-recomendación detectada: ${tipoEvento}, ${numAsistentes} asistentes`);

            setTimeout(() => {
                this.recommendationCards.loadRecommendations(tipoEvento, numAsistentes);
            }, 1000);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new IAIntegration();
});
