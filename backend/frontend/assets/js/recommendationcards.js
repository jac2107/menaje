/**
 * RecommendationCards.js
 * Componente para mostrar recomendaciones de menaje generadas por IA
 * Integración OPCIÓN 1: Sistema Menaje
 *
 * No existe un endpoint /api/ia/recommendations ni /api/ia/alquileres en el
 * backend (y no se crean nuevos endpoints Node.js). En su lugar:
 *  - Las recomendaciones se generan reutilizando POST /api/ia/chat: se le pide
 *    a Gemini un JSON estructurado eligiendo SOLO productos de un catálogo real
 *    obtenido de GET /api/productos/catalogo (así el id/precio/stock siempre
 *    son datos reales, nunca inventados por el modelo).
 *  - "Confirmar Selección" reutiliza el carrito de compras que ya existe en
 *    catalogo.html (agregarItemAlCarrito/abrirCarrito) en vez de crear un
 *    alquiler directamente, porque crear un alquiler requiere dirección,
 *    fechas/horas y método de pago que este componente no recolecta.
 */

class RecommendationCards {
    constructor(containerId = 'recommendations-container') {
        this.container = document.getElementById(containerId);
        this.recommendations = [];
        this.selectedProducts = [];
        this.userId = this.getUserId();
        this.chatApiUrl = '/api/ia/chat';
        this.catalogoApiUrl = '/api/productos/catalogo';

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
                <div class="recommendations-grid" id="recommendations-grid">
                    <p style="text-align:center;color:#999;grid-column:1/-1">
                        Usa el botón "🎯 Recomendaciones" del chat para generar propuestas.
                    </p>
                </div>

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
        this.container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
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
     * Cargar recomendaciones: obtiene el catálogo real y le pide a Gemini
     * (vía /api/ia/chat, ya existente) que elija productos de esa lista.
     */
    async loadRecommendations(tipoEvento, numAsistentes, presupuesto = null) {
        if (!this.container) return;

        this.showLoadingState();

        try {
            const catalogo = await this.fetchCatalogo();

            if (!catalogo.length) {
                this.showErrorMessage('No hay productos disponibles para recomendar en este momento');
                return;
            }

            const respuestaIA = await this.pedirRecomendacionesIA(tipoEvento, numAsistentes, presupuesto, catalogo);
            const items = this.parseRecomendacionesJSON(respuestaIA);
            this.recommendations = this.resolverContraCatalogo(items, catalogo);

            if (!this.recommendations.length) {
                this.showErrorMessage('El asistente no encontró productos adecuados. Intenta con otro tipo de evento o número de asistentes.');
            }

            this.renderRecommendations();

        } catch (error) {
            console.error('Error generando recomendaciones:', error);
            this.showErrorMessage(error.message || 'No se pudieron generar las recomendaciones');
        } finally {
            this.hideLoadingState();
        }
    }

    /**
     * Obtener el catálogo real (id, precio, stock) desde el backend Node
     */
    async fetchCatalogo() {
        const response = await fetch(this.catalogoApiUrl, {
            headers: {
                'Authorization': `Bearer ${this.getJWT()}`
            }
        });

        if (!response.ok) throw new Error('No se pudo cargar el catálogo de productos');
        return response.json();
    }

    /**
     * Pedirle a Gemini (vía Node /api/ia/chat) que elija productos del catálogo
     * real y devuelva un JSON con nombre/cantidad/motivo
     */
    async pedirRecomendacionesIA(tipoEvento, numAsistentes, presupuesto, catalogo) {
        const listado = catalogo
            .map(p => `- ${p.nombre} (categoría: ${p.categoria}, S/ ${p.precio_unidad} c/u, stock: ${p.stock_disponible})`)
            .join('\n');

        const restriccionPresupuesto = presupuesto
            ? `El presupuesto máximo aproximado es de S/ ${presupuesto}.`
            : 'No se especificó un presupuesto máximo.';

        const mensaje = `Necesito recomendaciones de menaje para un evento de tipo "${tipoEvento}" con ${numAsistentes} asistentes. ${restriccionPresupuesto}

Productos disponibles (usa EXCLUSIVAMENTE estos nombres exactos, no inventes productos):
${listado}

Responde ÚNICAMENTE con un arreglo JSON válido (sin texto adicional, sin markdown), con este formato exacto:
[{"nombre": "nombre exacto del producto de la lista", "cantidad": numero_entero, "motivo": "breve razón"}]

Elige entre 4 y 8 productos distintos de la lista que tengan sentido para ese evento y esa cantidad de asistentes.`;

        const response = await fetch(this.chatApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getJWT()}`
            },
            body: JSON.stringify({
                usuario_id: this.userId,
                mensaje,
                historico: []
            })
        });

        const body = await response.json().catch(() => ({}));

        if (!response.ok || body.success === false) {
            throw new Error(body.error || 'Error generando recomendaciones con IA');
        }

        return body.data?.respuesta || '';
    }

    /**
     * Extraer y parsear el JSON que devolvió Gemini (puede venir envuelto en
     * bloques de markdown ```json ... ``` a pesar de habérselo pedido en texto plano)
     */
    parseRecomendacionesJSON(texto) {
        const limpio = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
        const inicio = limpio.indexOf('[');
        const fin = limpio.lastIndexOf(']');
        if (inicio === -1 || fin === -1) return [];

        try {
            const data = JSON.parse(limpio.slice(inicio, fin + 1));
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.warn('No se pudo parsear la respuesta de la IA como JSON:', error);
            return [];
        }
    }

    /**
     * Resolver los nombres que devolvió Gemini contra el catálogo real, para
     * garantizar que id/precio/stock que se usan en el carrito son datos reales
     */
    resolverContraCatalogo(items, catalogo) {
        const precios = catalogo.map(p => parseFloat(p.precio_unidad));
        const min = Math.min(...precios);
        const max = Math.max(...precios);

        const resueltos = [];
        for (const item of items) {
            const nombreBuscado = String(item.nombre || '').trim().toLowerCase();
            const producto = catalogo.find(p => p.nombre.trim().toLowerCase() === nombreBuscado);
            if (!producto) continue; // descarta lo que la IA haya inventado

            const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
            const precio_unidad = parseFloat(producto.precio_unidad);

            resueltos.push({
                id: producto.id,
                nombre: producto.nombre,
                categoria: producto.categoria,
                tier: this.clasificarPorPrecio(precio_unidad, min, max),
                descripcion: item.motivo || producto.descripcion || '',
                cantidad,
                precio_unidad,
                stock_disponible: producto.stock_disponible,
                subtotal: precio_unidad * cantidad,
                imagen: producto.foto_url
            });
        }
        return resueltos;
    }

    /**
     * Clasifica un precio en premium/intermedio/económico según su posición
     * relativa al rango de precios del catálogo (los filtros de la UI usan estos 3 niveles)
     */
    clasificarPorPrecio(precio, min, max) {
        if (max === min) return 'intermedio';
        const posicion = (precio - min) / (max - min);
        if (posicion < 0.33) return 'economico';
        if (posicion < 0.66) return 'intermedio';
        return 'premium';
    }

    showLoadingState() {
        const grid = document.getElementById('recommendations-grid');
        if (grid) {
            grid.innerHTML = '<p style="text-align:center;color:#999;grid-column:1/-1">⏳ Generando recomendaciones con IA (puede tardar 20-50s)...</p>';
        }
    }

    hideLoadingState() {
        // renderRecommendations()/showErrorMessage() reemplazan el contenido del grid
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
        card.className = `recommendation-card ${recomendacion.tier}`;
        card.dataset.index = index;
        card.dataset.productoId = recomendacion.id;
        card.innerHTML = `
            <div class="card-header">
                <h3>${recomendacion.nombre}</h3>
                <span class="card-badge ${recomendacion.tier}">${recomendacion.tier}</span>
            </div>

            <div class="card-image">
                <img src="${recomendacion.imagen || '/assets/img/logo.png'}"
                     alt="${recomendacion.nombre}"
                     onerror="this.src='/assets/img/logo.png'">
            </div>

            <div class="card-description">
                <p>${recomendacion.descripcion}</p>
            </div>

            <div class="card-details">
                <div class="detail-row">
                    <strong>Cantidad sugerida:</strong>
                    <span>${recomendacion.cantidad} unidades</span>
                </div>
                <div class="detail-row">
                    <strong>Precio Unitario:</strong>
                    <span>S/ ${recomendacion.precio_unidad.toFixed(2)}</span>
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
                <button class="btn btn-secondary add-to-selection" data-index="${index}" ${recomendacion.stock_disponible > 0 ? '' : 'disabled'}>
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
        const existe = this.selectedProducts.find(p => p.id === producto.id);

        if (existe) {
            existe.cantidad++;
        } else {
            this.selectedProducts.push({ ...producto });
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
        if (!summaryContent || !totalPrice) return;

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
                    ${this.selectedProducts.map((prod) => {
                        const subtotal = prod.cantidad * prod.precio_unidad;
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
                                <td>S/ ${prod.precio_unidad.toFixed(2)}</td>
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
            producto.cantidad = Math.max(1, parseInt(nuevaCantidad) || 1);
            this.updateSummary();
        }
    }

    /**
     * Resaltar tarjetas seleccionadas
     */
    highlightSelectedCards() {
        this.container.querySelectorAll('.recommendation-card').forEach(card => {
            const id = parseInt(card.dataset.productoId);
            const seleccionado = this.selectedProducts.some(p => p.id === id);
            card.classList.toggle('selected', seleccionado);
        });
    }

    /**
     * Filtrar recomendaciones por nivel de precio (premium/intermedio/económico)
     */
    filterRecommendations(filter) {
        const grid = document.getElementById('recommendations-grid');
        if (!grid) return;
        const cards = grid.querySelectorAll('.recommendation-card');

        cards.forEach(card => {
            if (filter === 'all') {
                card.style.display = '';
            } else {
                card.style.display = card.classList.contains(filter) ? '' : 'none';
            }
        });
    }

    /**
     * Confirmar selección: reutiliza el carrito de catalogo.html (no crea un
     * alquiler directamente, porque eso requiere dirección/fechas/horas/pago
     * que este componente no recolecta)
     */
    async submitRecommendation() {
        if (this.selectedProducts.length === 0) {
            this.showErrorMessage('Por favor selecciona al menos un producto');
            return;
        }

        if (typeof window.agregarItemAlCarrito !== 'function' || typeof window.abrirCarrito !== 'function') {
            this.showErrorMessage('Ve a la página de Catálogo para agregar estos productos a tu carrito y completar el pedido.');
            return;
        }

        this.selectedProducts.forEach(p => {
            window.agregarItemAlCarrito(p.id, p.nombre, p.precio_unidad, p.cantidad);
        });

        if (typeof window.actualizarCarritoUI === 'function') {
            window.actualizarCarritoUI();
        }

        this.showSuccessMessage(`✅ ${this.selectedProducts.length} producto(s) añadidos a tu carrito`);
        this.selectedProducts = [];
        this.updateSummary();
        this.highlightSelectedCards();

        window.abrirCarrito();
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
            return null;
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
