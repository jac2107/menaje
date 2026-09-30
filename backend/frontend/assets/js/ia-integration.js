/**
 * ia-integration.js
 * FASE 3: Integración de ChatWidget + RecommendationCards
 * Conecta ambos componentes para recomendaciones automáticas
 */

class IAIntegration {
    constructor() {
        this.chatWidget = null;
        this.recommendationCards = null;
        this.integrado = false;   // evita una segunda inicializacion
        this.checkInterval = null;
        this.timeoutId = null;
        this.init();
    }

    init() {
        this.checkInterval = setInterval(() => {
            if (window.chatWidget && window.recommendationCards) {
                this.setupIntegration();
            }
        }, 100);

        // Red de seguridad: si a los 5s no se logro, se avisa y se deja de intentar.
        this.timeoutId = setTimeout(() => {
            clearInterval(this.checkInterval);
            if (!this.integrado) {
                console.warn('IA Integration: Componentes no cargados a tiempo');
            }
        }, 5000);
    }

    setupIntegration() {
        // setupIntegration() envuelve addMessage e inserta un boton: ejecutarlo dos
        // veces duplicaria ambos (dos peticiones por cada auto-recomendacion).
        if (this.integrado) return;
        this.integrado = true;
        clearInterval(this.checkInterval);
        clearTimeout(this.timeoutId);

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
            if (document.getElementById('ai-rec-button')) return; // ya insertado

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

    /**
     * Extrae el numero de asistentes del mensaje. Acepta cifras de 1 a 4 digitos
     * ("para 8 personas" fallaba con el patron anterior, que exigia 2 digitos),
     * numeros escritos en palabras ("cincuenta invitados") y un numero suelto
     * cuando el mensaje ya habla de un evento ("somos 120").
     * Devuelve null si no hay una cantidad plausible (1-1000, el rango del formulario).
     */
    extraerNumeroAsistentes(mensaje) {
        const texto = mensaje
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')   // "cumpleanos", "dieciseis"
            .toLowerCase();

        const sustantivos = IAIntegration.SUSTANTIVOS_ASISTENTES;

        // 1. Cifra seguida (o precedida) del sustantivo: "80 invitados", "invitados: 80"
        const porCifra =
            texto.match(new RegExp(`(\\d{1,4})\\s*(?:${sustantivos})`)) ||
            texto.match(new RegExp(`(?:${sustantivos})\\D{0,10}?(\\d{1,4})`));
        if (porCifra) {
            const n = parseInt(porCifra[1], 10);
            if (n >= 1 && n <= 1000) return n;
        }

        // 2. Numero en palabras seguido del sustantivo: "cincuenta invitados"
        const palabras = Object.keys(IAIntegration.NUMEROS_EN_PALABRAS).join('|');
        const porPalabra = texto.match(new RegExp(`\\b(${palabras})\\b\\s*(?:${sustantivos})`));
        if (porPalabra) {
            return IAIntegration.NUMEROS_EN_PALABRAS[porPalabra[1]];
        }

        // 3. Cifra suelta con verbo de cantidad: "somos 120", "seremos unos 45"
        const porVerbo = texto.match(/\b(?:somos|seremos|seran|serian|vienen|asisten|para)\s+(?:unos?\s+|unas?\s+)?(\d{1,4})\b/);
        if (porVerbo) {
            const n = parseInt(porVerbo[1], 10);
            if (n >= 1 && n <= 1000) return n;
        }

        return null;
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

        const numAsistentes = this.extraerNumeroAsistentes(mensaje);

        if (numAsistentes) {
            console.log(`🎯 Intención de recomendación detectada: ${tipoEvento}, ${numAsistentes} asistentes`);
            // Se ofrece en lugar de ejecutarse: una peticion automatica extra gasta 2 de
            // las 5 del minuto por mensaje, y la deteccion por palabras clave tiene
            // falsos positivos ("no me recomiendes copas").
            setTimeout(() => this.ofrecerRecomendaciones(tipoEvento, numAsistentes), 800);
        } else {
            // El usuario pidio recomendaciones pero no dijo cuantos asistentes: mejor
            // preguntarselo que no hacer nada sin explicacion.
            setTimeout(() => {
                this.chatWidget.addMessage(
                    'Para preparar una propuesta necesito saber cuántos asistentes habrá. ' +
                    'Dímelo en el chat (por ejemplo, «somos 40») o usa el botón ' +
                    '🎯 Recomendaciones para rellenar el formulario.',
                    'bot'
                );
            }, 600);
        }
    }

    /**
     * Propone generar recomendaciones con un boton en el chat, en vez de lanzarlas solo.
     */
    ofrecerRecomendaciones(tipoEvento, numAsistentes) {
        const contenedor = document.getElementById('chat-messages');
        if (!contenedor) return;

        const etiquetas = {
            boda: 'boda', 'cumpleaños': 'cumpleaños', corporativo: 'evento corporativo',
            graduacion: 'graduación', baby_shower: 'baby shower', otro: 'evento'
        };

        const aviso = document.createElement('div');
        aviso.className = 'chat-message bot-message';
        const texto = document.createElement('div');
        texto.className = 'message-content';
        texto.textContent =
            `¿Quieres que prepare una propuesta de menaje para tu ${etiquetas[tipoEvento] || 'evento'} ` +
            `de ${numAsistentes} asistentes?`;

        const boton = document.createElement('button');
        boton.className = 'btn btn-secondary';
        boton.style.marginTop = '8px';
        boton.textContent = '🎯 Generar propuesta';
        boton.addEventListener('click', () => {
            boton.disabled = true;
            boton.textContent = 'Preparando…';
            this.recommendationCards.loadRecommendations(tipoEvento, numAsistentes);
            document.getElementById('recommendations-container')
                ?.scrollIntoView({ behavior: 'smooth' });
        });

        texto.appendChild(document.createElement('br'));
        texto.appendChild(boton);
        aviso.appendChild(texto);
        contenedor.appendChild(aviso);
        contenedor.scrollTop = contenedor.scrollHeight;
    }
}

// Numeros escritos en palabras que aparecen de forma realista al describir un evento.
IAIntegration.NUMEROS_EN_PALABRAS = {
    'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
    'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
    'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
    'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
    'veinte': 20, 'veinticinco': 25, 'treinta': 30, 'cuarenta': 40,
    'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'ochenta': 80,
    'noventa': 90, 'cien': 100, 'ciento': 100, 'doscientos': 200,
    'trescientos': 300, 'cuatrocientos': 400, 'quinientos': 500, 'mil': 1000
};

// Sustantivos con los que la gente cuantifica a los asistentes de un evento.
IAIntegration.SUSTANTIVOS_ASISTENTES =
    'personas?|asistentes?|invitados?|comensales?|pax|convidados?|gente|puestos?|cubiertos?|sillas?';

document.addEventListener('DOMContentLoaded', () => {
    new IAIntegration();
});
