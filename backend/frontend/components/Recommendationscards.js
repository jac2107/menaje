/**
 * RecommendationCards.js
 * Componente para mostrar recomendaciones de menaje generadas por IA
 * Integración OPCIÓN 1: Sistema Menaje
 */

class RecommendationCards {
    constructor(containerId = 'recommendations-container') {
        this.container = document.getElementById(containerId);
        this.recommendations = [];
        this.selectedProducts = [];
        this.userId = this.getUserId();
        this.apiUrl = 'http://localhost:3000/api/ia';
        
        this.init();
    }

    /**
     * Inicializar el componente
     */
    init() {
        this.createRecommendationUI();
        this.attachEventListeners();
    }

    /**
     * Crear estructura HTML
     */
    createRecommendationUI() {
        if (!this.container) {
            console.error('Container para recomendaciones no encontrado');
            return;
        }

        const html = `
            <div class="recommendations-section">
                <!-- Cabecera -->
                <div class="recommendations-header">
                    <h2>💡 Recomendaciones Personalizadas de Menaje</h2>
                    <div class="recommendations-filters">
                        <button class="filter-btn active" data-filter="all">Todas</button>
                        <button class="filter-btn" data-filter="premium">Premium</button>
                        <button class="filter-btn" data-filter="economico">Económico</button>
                        <button class="filter-btn" data-filter="intermedio">Intermedio</button>
                    </div>
                </div>

                <!-- Grid de recomendaciones -->
                <div class="recommendations-grid" id="recommendations-grid"></div>

                <!-- Carrito de seleccionados -->
                <div class="recommendations-summary">
                    <h3>📦 Tu Propuesta Personalizada</h3>
                    <div class="summary-content" id="summary-content">
                        <p style="text-align: center; color: #999;">
                            Haz clic en un producto para agregarlo a tu propuesta
                        </p>
                    </div>
                    <div class="summary-footer">
                        <div class="summary-total">
                            <strong>Total Estimado:</strong>
                            <span id="total-price">S/ 0.00</span>
                        </div>
                        <button class="btn btn-primary" id="confirm-selection">
                            Confirmar Selección
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    /**
     * Adjuntar event listeners
     */
    attachEventListeners() {
        // Filtros
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterRecommendations(e.target.dataset.filter);
            });
        });

        // Confirmar selección
        document.getElementById('confirm-selection')?.addEventListener('click', () => {
            this.submitRecommendation();
        });
    }

    /**
     * Cargar recomendaciones desde IA
     */
    async loadRecommendations(tipoEvento, numAsistentes, presupuesto = null) {
        try {
            const response = await fetch(`${this.apiUrl}/recommendations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getJWT()}`
                },
                body: JSON.stringify({
                    usuario_id: this.userId,
                    tipo_evento: tipoEvento,
                    num_asistentes: numAsistentes,
                    presupuesto: presupuesto
                })
            });

            if (!response.ok) throw new Error('Error cargando recomendaciones');

            const data = await response.json();
            this.recommendations = data.recomendaciones || [];
            this.renderRecommendations();

        } catch (error) {
            console.error('Error:', error);
            this.showErrorMessage('No se pudieron cargar las recomendaciones');
        }
    }

    /**
     * Renderizar tarjetas de recomendaciones
     */
    renderRecommendations() {
        const grid = document.getElementById('recommendations-grid');
        if (!grid) return;

        grid.innerHTML = '';

        this.recommendations.forEach((rec, index) => {
            const card = this.createRecommendationCard(rec, index);
            grid.appendChild(card);
        });
    }

    /**
     * Crear una tarjeta de recomendación
     */
    createRecommendationCard(recomendacion, index) {
        const card = document.createElement('div');
        card.className = `recommendation-card ${recomendacion.categoria}`;
        card.dataset.index = index;
        card.innerHTML = `
            <div class="card-header">
                <h3>${recomendacion.nombre}</h3>
                <span class="card-badge ${recomendacion.categoria}">${recomendacion.categoria}</span>
            </div>

            <div class="card-image">
                <img src="${recomendacion.imagen || '/images/menaje-default.png'}" 
                     alt="${recomendacion.nombre}"
                     onerror="this.src='/images/menaje-default.png'">
            </div>

            <div class="card-description">
                <p>${recomendacion.descripcion}</p>
            </div>

            <div class="card-details">
                <div class="detail-row">
                    <strong>Cantidad:</strong>
                    <span>${recomendacion.cantidad} unidades</span>
                </div>
                <div class="detail-row">
                    <strong>Precio Unitario:</strong>
                    <span>S/ ${recomendacion.precio_unitario.toFixed(2)}</span>
                </div>
                <div class="detail-row">
                    <strong>Stock Disponible:</strong>
                    <span class="stock ${recomendacion.stock_disponible > 0 ? 'in-stock' : 'out-stock'}">
                        ${recomendacion.stock_disponible > 0 ? recomendacion.stock_disponible : 'Sin stock'}
                    </span>
                </div>
            </div>

            <div class="card-footer">
                <div class="card-price">
                    <strong>S/ ${recomendacion.subtotal.toFixed(2)}</strong>
                </div>
                <button class="btn btn-secondary add-to-selection" data-index="${index}">
                    ➕ Agregar
                </button>
            </div>
        `;

        // Event listener para agregar
        card.querySelector('.add-to-selection').addEventListener('click', () => {
            this.addToSelection(recomendacion);
        });

        return card;
    }

    /**
     * Agregar producto a la selección
     */
    addToSelection(producto) {
        // Verificar si ya está seleccionado
        const existe = this.selectedProducts.find(p => p.id === producto.id);
        
        if (existe) {
            existe.cantidad++;
        } else {
            this.selectedProducts.push({
                ...producto,
                cantidad: producto.cantidad || 1
            });
        }

        this.updateSummary();
        this.highlightSelectedCards();
    }

    /**
     * Eliminar producto de la selección
     */
    removeFromSelection(productoId) {
        this.selectedProducts = this.selectedProducts.filter(p => p.id !== productoId);
        this.updateSummary();
        this.highlightSelectedCards();
    }

    /**
     * Actualizar resumen de selección
     */
    updateSummary() {
        const summaryContent = document.getElementById('summary-content');
        const totalPrice = document.getElementById('total-price');

        if (this.selectedProducts.length === 0) {
            summaryContent.innerHTML = `
                <p style="text-align: center; color: #999;">
                    Haz clic en un producto para agregarlo a tu propuesta
                </p>
            `;
            totalPrice.textContent = 'S/ 0.00';
            return;
        }

        let total = 0;
        const html = `
            <table class="summary-table">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>Subtotal</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
                    ${this.selectedProducts.map((prod, idx) => {
                        const subtotal = prod.cantidad * prod.precio_unitario;
                        total += subtotal;
                        return `
                            <tr>
                                <td>${prod.nombre}</td>
                                <td>
                                    <input type="number" 
                                           value="${prod.cantidad}" 
                                           min="1"
                                           onchange="window.recommendationCards.updateQuantity(${prod.id}, this.value)">
                                </td>
                                <td>S/ ${prod.precio_unitario.toFixed(2)}</td>
                                <td>S/ ${subtotal.toFixed(2)}</td>
                                <td>
                                    <button class="btn-remove" onclick="window.recommendationCards.removeFromSelection(${prod.id})">
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        summaryContent.innerHTML = html;
        totalPrice.textContent = `S/ ${total.toFixed(2)}`;
    }

    /**
     * Actualizar cantidad de un producto
     */
    updateQuantity(productoId, nuevaCantidad) {
        const producto = this.selectedProducts.find(p => p.id === productoId);
        if (producto) {
            producto.cantidad = parseInt(nuevaCantidad) || 1;
            this.updateSummary();
        }
    }

    /**
     * Resaltar tarjetas seleccionadas
     */
    highlightSelectedCards() {
        document.querySelectorAll('.recommendation-card').forEach(card => {
            card.classList.remove('selected');
        });

        this.selectedProducts.forEach(prod => {
            const card = document.querySelector(`[data-producto-id="${prod.id}"]`);
            if (card) card.classList.add('selected');
        });
    }

    /**
     * Filtrar recomendaciones
     */
    filterRecommendations(filter) {
        const grid = document.getElementById('recommendations-grid');
        const cards = grid.querySelectorAll('.recommendation-card');

        cards.forEach(card => {
            if (filter === 'all') {
                card.style.display = 'block';
            } else {
                card.style.display = card.classList.contains(filter) ? 'block' : 'none';
            }
        });
    }

    /**
     * Enviar recomendación (crear alquiler)
     */
    async submitRecommendation() {
        if (this.selectedProducts.length === 0) {
            this.showErrorMessage('Por favor selecciona al menos un producto');
            return;
        }

        try {
            const response = await fetch(`${this.apiUrl}/alquileres`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.getJWT()}`
                },
                body: JSON.stringify({
                    cliente_id: this.userId,
                    items: this.selectedProducts.map(p => ({
                        producto_id: p.id,
                        cantidad: p.cantidad,
                        precio_unitario: p.precio_unitario
                    })),
                    fecha_entrega: new Date().toISOString().split('T')[0],
                    fecha_recojo: new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0]
                })
            });

            if (!response.ok) throw new Error('Error creando alquiler');

            const data = await response.json();
            this.showSuccessMessage(`✅ ¡Alquiler creado! ID: ${data.id}`);
            this.selectedProducts = [];
            this.updateSummary();

        } catch (error) {
            console.error('Error:', error);
            this.showErrorMessage('Error al crear el alquiler');
        }
    }

    /**
     * Mostrar mensaje de éxito
     */
    showSuccessMessage(message) {
        const msg = document.createElement('div');
        msg.className = 'alert alert-success';
        msg.textContent = message;
        this.container.insertAdjacentElement('beforebegin', msg);
        
        setTimeout(() => msg.remove(), 5000);
    }

    /**
     * Mostrar mensaje de error
     */
    showErrorMessage(message) {
        const msg = document.createElement('div');
        msg.className = 'alert alert-error';
        msg.textContent = message;
        this.container.insertAdjacentElement('beforebegin', msg);
        
        setTimeout(() => msg.remove(), 5000);
    }

    /**
     * Obtener JWT
     */
    getJWT() {
        return localStorage.getItem('token') || '';
    }

    /**
     * Obtener ID del usuario
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
}

// Inicializar cuando el DOM está listo
document.addEventListener('DOMContentLoaded', () => {
    window.recommendationCards = new RecommendationCards('recommendations-container');
});

// Método para cargar recomendaciones desde otros scripts
function loadRecommendationsFor(tipoEvento, numAsistentes, presupuesto = null) {
    if (window.recommendationCards) {
        window.recommendationCards.loadRecommendations(tipoEvento, numAsistentes, presupuesto);
    }
}