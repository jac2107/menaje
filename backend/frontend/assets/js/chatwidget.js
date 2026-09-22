/**
 * ChatWidget.js
 * Widget de chat conversacional con IA (Gemini API)
 * Integración OPCIÓN 1: Sistema Menaje
 */

class ChatWidget {
    constructor(containerId = 'chat-container') {
        this.container = document.getElementById(containerId);
        this.messagesContainer = null;
        this.inputField = null;
        this.sendButton = null;
        this.isOpen = false;
        this.userId = this.getUserId(); // Obtener de JWT
        this.conversationHistory = [];
        this.isLoading = false;
        this.apiUrl = 'http://localhost:3000/api/ia/chat'; // Ruta Node.js
        
        this.init();
    }

    /**
     * Inicializar el widget
     */
    init() {
        this.createChatUI();
        this.attachEventListeners();
    }

    /**
     * Crear estructura HTML del chat
     */
    createChatUI() {
        if (!this.container) {
            console.error('Container para chat no encontrado');
            return;
        }

        const chatHTML = `
            <button class="chat-launcher" id="chat-launcher" aria-label="Abrir chat">🤖</button>
            <div class="chat-widget hidden">
                <!-- Cabecera del chat -->
                <div class="chat-header">
                    <h3>🤖 Asistente de Menaje</h3>
                    <button class="chat-close-btn" id="close-chat">✕</button>
                </div>

                <!-- Área de mensajes -->
                <div class="chat-messages" id="chat-messages">
                    <div class="chat-message bot-message">
                        <div class="message-content">
                            ¡Hola! 👋 Soy tu asistente especializado en alquiler de menaje.
                            <br><br>
                            Puedo ayudarte con:
                            <ul style="margin-top: 10px; text-align: left;">
                                <li>📋 Recomendar productos según tu evento</li>
                                <li>🔍 Consultar disponibilidad de stock</li>
                                <li>💰 Analizar tu presupuesto</li>
                                <li>ℹ️ Explicar garantías y políticas</li>
                            </ul>
                            <br>¿Cuéntame sobre tu evento! 🎉
                        </div>
                        <span class="message-timestamp">Justo ahora</span>
                    </div>
                </div>

                <!-- Área de entrada -->
                <div class="chat-input-area">
                    <input 
                        type="text" 
                        id="chat-input" 
                        class="chat-input" 
                        placeholder="Escribe tu pregunta aquí..."
                        autocomplete="off"
                    >
                    <button id="send-btn" class="chat-send-btn">
                        <span class="send-icon">▶</span>
                    </button>
                </div>

                <!-- Indicador de escritura -->
                <div class="chat-typing" id="typing-indicator" style="display: none;">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;

        this.container.innerHTML = chatHTML;
        this.messagesContainer = document.getElementById('chat-messages');
        this.inputField = document.getElementById('chat-input');
        this.sendButton = document.getElementById('send-btn');
    }

    /**
     * Adjuntar event listeners
     */
    attachEventListeners() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        document.getElementById('close-chat').addEventListener('click', () => {
            this.toggle();
        });

        document.getElementById('chat-launcher').addEventListener('click', () => {
            this.toggle();
        });
    }

    /**
     * Enviar mensaje
     */
    async sendMessage() {
        const mensaje = this.inputField.value.trim();
        
        if (!mensaje) return;
        if (this.isLoading) return; // Evitar múltiples requests

        // Mostrar mensaje del usuario
        this.addMessage(mensaje, 'user');
        this.inputField.value = '';
        this.inputField.focus();

        // Mostrar indicador de escritura
        this.showTypingIndicator(true);
        this.isLoading = true;

        try {
            // Enviar a Backend Node.js que a su vez llamará a FastAPI
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getJWT()}`
                },
                body: JSON.stringify({
                    usuario_id: this.userId,
                    mensaje: mensaje,
                    historico: this.conversationHistory.slice(-5) // Últimos 5 mensajes
                })
            });

            const body = await response.json().catch(() => ({}));

            if (!response.ok || body.success === false) {
                throw new Error(body.error || `Error ${response.status}: ${response.statusText}`);
            }

            // Node envuelve la respuesta de FastAPI en { success, data: { respuesta, timestamp, tokens_usados } }
            const data = body.data || {};

            // Agregar respuesta de IA
            this.addMessage(data.respuesta, 'bot', {
                timestamp: data.timestamp,
                tokens: data.tokens_usados
            });

            // Guardar en historial
            this.conversationHistory.push({
                usuario: mensaje,
                ia: data.respuesta,
                timestamp: data.timestamp
            });

        } catch (error) {
            console.error('Error en chat:', error);
            this.addMessage(
                `❌ Error: ${error.message}. Por favor, intenta de nuevo.`,
                'bot-error'
            );
        } finally {
            this.showTypingIndicator(false);
            this.isLoading = false;
        }
    }

    /**
     * Agregar mensaje a la conversación
     */
    addMessage(contenido, tipo = 'user', metadata = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${tipo}-message`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = this.sanitizeHTML(contenido);

        messageDiv.appendChild(contentDiv);

        // Agregar timestamp si existe
        if (metadata.timestamp) {
            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'message-timestamp';
            timestampSpan.textContent = this.formatTime(metadata.timestamp);
            messageDiv.appendChild(timestampSpan);
        }

        this.messagesContainer.appendChild(messageDiv);
        
        // Scroll al último mensaje
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

        // Reproducir sonido de notificación (opcional)
        if (tipo === 'bot-message' || tipo === 'bot-error') {
            this.playNotificationSound();
        }
    }

    /**
     * Mostrar indicador de escritura
     */
    showTypingIndicator(show) {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.style.display = show ? 'flex' : 'none';
        }
    }

    /**
     * Obtener JWT del localStorage
     */
    getJWT() {
        return localStorage.getItem('token') || '';
    }

    /**
     * Obtener ID del usuario del JWT o localStorage
     */
    getUserId() {
        const token = this.getJWT();
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id || payload.usuario_id;
        } catch {
            return localStorage.getItem('usuario_id');
        }
    }

    /**
     * Limpiar HTML (XSS prevention)
     */
    sanitizeHTML(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.*?)__/g, '<em>$1</em>');
    }

    /**
     * Formatear timestamp
     */
    formatTime(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Justo ahora';
        if (diffMins < 60) return `Hace ${diffMins}m`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Hace ${diffHours}h`;

        return date.toLocaleTimeString('es-PE', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    /**
     * Reproducir sonido de notificación (opcional)
     */
    playNotificationSound() {
        // Descomentar si quieres agregar sonido
        // const audio = new Audio('/sounds/notification.mp3');
        // audio.play().catch(e => console.log('Audio play prevented:', e));
    }

    /**
     * Alternar visibilidad del widget
     */
    toggle() {
        this.isOpen = !this.isOpen;
        const widget = document.querySelector('.chat-widget');
        const launcher = document.getElementById('chat-launcher');
        if (widget) widget.classList.toggle('hidden', !this.isOpen);
        if (launcher) launcher.classList.toggle('hidden', this.isOpen);
        if (this.isOpen) this.inputField?.focus();
    }

    /**
     * Limpiar conversación
     */
    clearChat() {
        this.messagesContainer.innerHTML = '';
        this.conversationHistory = [];
        this.addMessage(
            '¡Conversación limpiada! Estoy listo para ayudarte de nuevo. 🎉',
            'bot-message'
        );
    }

    /**
     * Exportar historial de chat
     */
    exportHistory() {
        const json = JSON.stringify(this.conversationHistory, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `chat-history-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Inicializar cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    window.chatWidget = new ChatWidget('chat-container');
});