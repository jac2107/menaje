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
        // Estado de una generacion en curso (D5/UX-04): guardia de concurrencia,
        // controlador de aborto y temporizador del contador de segundos.
        this.cargando = false;
        this.abortController = null;
        this.temporizador = null;

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

        // Sin esta guardia, dos clics lanzan dos peticiones que escriben en el mismo
        // grid (gana la que responda ultima) y consumen el doble de cuota.
        if (this.cargando) {
            this.showErrorMessage('Ya estoy preparando una propuesta, espera un momento.');
            return;
        }
        this.cargando = true;
        this.abortController = new AbortController();
        this.ultimaPeticion = { tipoEvento, numAsistentes, presupuesto };
        this.showLoadingState();

        try {
            const catalogo = await this.fetchCatalogo();

            if (!catalogo.length) {
                this.mostrarGridVacio(
                    'No hay productos disponibles ahora mismo',
                    'El catálogo no tiene productos con stock disponible en este momento.',
                    ['Vuelve a intentarlo más tarde.', 'Consulta con la empresa por disponibilidad para tu fecha.']
                );
                return;
            }

            const respuestaIA = await this.pedirRecomendacionesIA(tipoEvento, numAsistentes, presupuesto, catalogo);
            const items = this.parseRecomendacionesJSON(respuestaIA);

            if (!items.length) {
                // El modelo respondio, pero no en el formato JSON pedido.
                this.mostrarGridVacio(
                    'El asistente no pudo preparar la propuesta',
                    'La respuesta del asistente no se pudo interpretar. Suele resolverse al reintentar.',
                    ['Pulsa "Volver a intentarlo".', 'Si se repite, prueba con otro tipo de evento.']
                );
                return;
            }

            this.recommendations = this.resolverContraCatalogo(items, catalogo);

            if (!this.recommendations.length) {
                // Los productos sugeridos no existen en el catalogo real: se descartan
                // a proposito para no mostrar precios ni stock inventados.
                const descartados = (this.ultimosDescartados || []).slice(0, 3);
                this.mostrarGridVacio(
                    'No se encontraron productos que coincidan con la sugerencia',
                    'El asistente propuso artículos que no están en el catálogo, así que se descartaron ' +
                    'para no mostrarte precios ni stock que no podemos garantizar.',
                    [
                        'Pulsa "Volver a intentarlo": suele funcionar en el segundo intento.',
                        'Prueba con otro tipo de evento o con otro número de asistentes.',
                        ...(descartados.length ? [`Sugerencias descartadas: ${descartados.join(', ')}`] : [])
                    ]
                );
                return;
            }

            this.renderRecommendations();

        } catch (error) {
            if (error.name === 'AbortError') {
                this.mostrarGridVacio(
                    'Generación cancelada',
                    'Puedes volver a pedir recomendaciones cuando quieras.'
                );
                return;
            }
            console.error('Error generando recomendaciones:', error);
            this.mostrarGridVacio(
                'No se pudieron generar las recomendaciones',
                error.message || 'Hubo un problema al contactar con el asistente.',
                ['Comprueba tu conexión y pulsa "Volver a intentarlo".']
            );
        } finally {
            // Se ejecuta tambien en los return tempranos del try: sin esto, cancelar o
            // salir por un camino de error dejaria cargando=true (guardia trabada para
            // siempre) y el temporizador del contador corriendo.
            this.cargando = false;
            this.abortController = null;
            this.hideLoadingState();
        }
    }

    /**
     * Obtener el catálogo real (id, precio, stock) desde el backend Node
     */
    async fetchCatalogo() {
        const response = await fetch(this.catalogoApiUrl, {
            headers: window.IAAuth.authHeaders()
        });

        if (!response.ok) throw new Error('No se pudo cargar el catálogo de productos');
        return response.json();
    }

    /**
     * El prompt de recomendaciones incluye el catalogo serializado, asi que su
     * longitud crece con el numero de productos. Se acota a MAX_PRODUCTOS_PROMPT
     * repartiendo el cupo por categoria (round-robin) para no dejar fuera familias
     * enteras: sin esto, un catalogo grande hace que el prompt supere el limite de
     * /api/ia/chat y las recomendaciones dejan de funcionar por completo.
     */
    acotarCatalogoParaPrompt(catalogo, maxProductos = RecommendationCards.MAX_PRODUCTOS_PROMPT) {
        if (catalogo.length <= maxProductos) return catalogo;

        const porCategoria = new Map();
        for (const p of catalogo) {
            const clave = p.categoria || 'Otro';
            if (!porCategoria.has(clave)) porCategoria.set(clave, []);
            porCategoria.get(clave).push(p);
        }

        // Dentro de cada categoria, primero los de mas stock (mas utiles para eventos grandes).
        for (const lista of porCategoria.values()) {
            lista.sort((a, b) => Number(b.stock_disponible) - Number(a.stock_disponible));
        }

        const seleccion = [];
        const colas = [...porCategoria.values()];
        let quedan = true;
        while (seleccion.length < maxProductos && quedan) {
            quedan = false;
            for (const cola of colas) {
                if (!cola.length) continue;
                seleccion.push(cola.shift());
                quedan = true;
                if (seleccion.length >= maxProductos) break;
            }
        }
        return seleccion;
    }

    /**
     * Pedirle a Gemini (vía Node /api/ia/chat) que elija productos del catálogo
     * real y devuelva un JSON con nombre/cantidad/motivo
     */
    async pedirRecomendacionesIA(tipoEvento, numAsistentes, presupuesto, catalogo) {
        // OJO: solo el PROMPT recibe el catalogo acotado. resolverContraCatalogo()
        // debe seguir recibiendo el catalogo COMPLETO, o descartaria como "inventado"
        // cualquier producto real que no hubiera entrado en el recorte.
        const catalogoAcotado = this.acotarCatalogoParaPrompt(catalogo);
        if (catalogoAcotado.length < catalogo.length) {
            console.info(
                `Catálogo acotado para el prompt: ${catalogoAcotado.length} de ${catalogo.length} productos`
            );
        }

        const listado = catalogoAcotado
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
            signal: this.abortController?.signal,
            headers: window.IAAuth.authHeaders({ 'Content-Type': 'application/json' }),
            // Sin usuario_id: lo determina el backend a partir del JWT.
            body: JSON.stringify({
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
     * Normaliza un nombre de producto para comparar: quita tildes (incluidas las
     * escritas en forma NFD, que se ven igual pero no son === a la forma NFC),
     * signos de puntuacion y espacios repetidos. Sin esto, una sola tilde de
     * diferencia en la respuesta del modelo descarta un producto real del catalogo.
     */
    normalizarNombre(valor) {
        return String(valor ?? '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')   // diacriticos combinantes
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')       // puntuacion, parentesis, guiones -> espacio
            .trim()
            .replace(/\s+/g, ' ');
    }

    /**
     * Resuelve el nombre devuelto por el modelo contra el catalogo real en tres
     * pasadas, de la mas estricta a la mas laxa. La ultima solo acepta el resultado
     * si es UNICO: con dos candidatos se descarta, para no atribuirle al cliente un
     * producto (y un precio) que el modelo no eligio.
     */
    buscarProductoEnCatalogo(nombreIA, catalogo) {
        const objetivo = this.normalizarNombre(nombreIA);
        if (!objetivo) return null;

        // 1. Coincidencia exacta normalizada.
        const exacto = catalogo.find(p => this.normalizarNombre(p.nombre) === objetivo);
        if (exacto) return exacto;

        // 2. El nombre del catalogo contiene el del modelo, o al contrario
        //    ("Plato de Sitio de Vidrio..." vs "Plato de Sitio Vidrio...").
        const contenidos = catalogo.filter(p => {
            const n = this.normalizarNombre(p.nombre);
            return n.includes(objetivo) || objetivo.includes(n);
        });
        if (contenidos.length === 1) return contenidos[0];

        // 3. Coincidencia por palabras: todas las palabras significativas del nombre
        //    del catalogo aparecen en el del modelo (y viceversa para el caso corto).
        const palabras = objetivo.split(' ').filter(w => w.length > 2);
        if (palabras.length) {
            const porPalabras = catalogo.filter(p => {
                const n = this.normalizarNombre(p.nombre);
                const suyas = n.split(' ').filter(w => w.length > 2);
                if (!suyas.length) return false;
                const compartidas = suyas.filter(w => palabras.includes(w)).length;
                return compartidas === suyas.length || compartidas === palabras.length;
            });
            if (porPalabras.length === 1) return porPalabras[0];
        }

        return null; // sigue descartando lo que el modelo haya inventado
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
        const descartados = [];
        for (const item of items) {
            const producto = this.buscarProductoEnCatalogo(item.nombre, catalogo);
            if (!producto) {
                // No existe en el catalogo real: el modelo se lo invento.
                descartados.push(String(item.nombre || '(sin nombre)'));
                continue;
            }

            const stockDisponible = Number(producto.stock_disponible) || 0;
            const cantidadSugerida = Math.max(1, parseInt(item.cantidad) || 1);
            // El servidor rechaza el alquiler si se pide mas stock del disponible
            // (controllers/alquileresController.js:41). Mejor topar aqui y avisarlo
            // que dejar al cliente descubrirlo al confirmar el pago.
            const cantidad = stockDisponible > 0
                ? Math.min(cantidadSugerida, stockDisponible)
                : cantidadSugerida;
            const precio_unidad = parseFloat(producto.precio_unidad);

            resueltos.push({
                id: producto.id,
                nombre: producto.nombre,
                categoria: producto.categoria,
                tier: this.clasificarPorPrecio(precio_unidad, min, max),
                descripcion: item.motivo || producto.descripcion || '',
                cantidad,
                cantidadSugerida,
                limitadoPorStock: cantidad < cantidadSugerida,
                precio_unidad,
                stock_disponible: stockDisponible,
                subtotal: precio_unidad * cantidad,
                imagen: producto.foto_url
            });
        }
        // Se guarda para poder explicar al usuario cuantas sugerencias se descartaron
        // por no existir en el catalogo real (ver renderRecommendations / estado vacio).
        this.ultimosDescartados = descartados;
        if (descartados.length) {
            console.warn('Recomendaciones descartadas (no existen en el catálogo):', descartados);
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
        if (!grid) return;

        const inicio = Date.now();
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:28px 16px;color:#666">
                <p style="margin:0 0 6px">⏳ Generando recomendaciones con IA…</p>
                <p style="margin:0;font-size:.9rem">
                    Suele tardar entre 20 y 50 segundos · <span id="rec-transcurrido">0 s</span>
                </p>
                <p style="margin:14px 0 0">
                    <button class="btn btn-secondary" id="rec-cancelar">Cancelar</button>
                </p>
            </div>
        `;

        // Un contador visible es la senal de que el proceso sigue vivo: con un texto
        // estatico durante hasta 2 minutos el usuario vuelve a pulsar el boton.
        this.temporizador = setInterval(() => {
            const span = document.getElementById('rec-transcurrido');
            if (span) span.textContent = `${Math.round((Date.now() - inicio) / 1000)} s`;
        }, 1000);

        document.getElementById('rec-cancelar')?.addEventListener('click', () => {
            this.abortController?.abort();
        });
    }

    /**
     * Para el contador de segundos. Tiene cuerpo desde D5/UX-04: el Bloque C la habia
     * eliminado por estar vacia (CAL-07), y la propia auditoria advierte de que UX-04
     * la recupera. El contenido del grid lo reemplazan renderRecommendations() o
     * mostrarGridVacio(); aqui solo se libera el temporizador.
     */
    hideLoadingState() {
        clearInterval(this.temporizador);
        this.temporizador = null;
    }

    /**
     * Escapa texto para interpolarlo en HTML. El nombre/descripcion de un producto
     * los escribe un trabajador o dueno en el inventario, y el "motivo" lo genera
     * el modelo: ninguno de los dos es contenido confiable.
     */
    escaparHTML(valor) {
        return String(valor ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Solo admite URLs http(s) o rutas relativas del propio sitio; cualquier otra
     * cosa (javascript:, data:, un atributo roto) cae al logo por defecto.
     */
    urlImagenSegura(valor) {
        const url = String(valor ?? '').trim();
        if (/^https?:\/\//i.test(url) || /^\/[^/]/.test(url)) {
            return this.escaparHTML(url);
        }
        return '/assets/img/logo.png';
    }

    /**
     * Estado vacio explicativo DENTRO del grid. El mensaje transitorio de
     * showErrorMessage() se inserta fuera del contenedor y se borra a los 5s, asi que
     * tras una espera de 20-50s el usuario se quedaba mirando un rectangulo en blanco.
     */
    mostrarGridVacio(titulo, detalle, sugerencias = []) {
        const grid = document.getElementById('recommendations-grid');
        if (!grid) return;

        const lista = sugerencias.length
            ? `<ul style="text-align:left;display:inline-block;margin:12px 0 0;padding-left:20px">
                   ${sugerencias.map(s => `<li>${this.escaparHTML(s)}</li>`).join('')}
               </ul>`
            : '';

        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:28px 16px;color:#666">
                <p style="font-size:1.05rem;margin:0 0 8px"><strong>${this.escaparHTML(titulo)}</strong></p>
                <p style="margin:0">${this.escaparHTML(detalle)}</p>
                ${lista}
                <p style="margin:16px 0 0">
                    <button class="btn btn-secondary" id="rec-reintentar">Volver a intentarlo</button>
                </p>
            </div>
        `;

        document.getElementById('rec-reintentar')?.addEventListener('click', () => {
            if (this.ultimaPeticion) {
                const { tipoEvento, numAsistentes, presupuesto } = this.ultimaPeticion;
                this.loadRecommendations(tipoEvento, numAsistentes, presupuesto);
            }
        });
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

        // El nombre y la descripcion de un producto los escribe un trabajador o dueno
        // en el inventario (sin saneado en el servidor), y el "motivo" lo genera el
        // modelo: interpolarlos sin escapar permitia XSS almacenado y, con el JWT en
        // localStorage, el robo de la sesion de cualquier cliente o dueno.
        const nombreSeguro = this.escaparHTML(recomendacion.nombre);
        const tierSeguro = this.escaparHTML(recomendacion.tier);
        const descripcionSegura = this.escaparHTML(recomendacion.descripcion);
        const imagenSegura = this.urlImagenSegura(recomendacion.imagen);

        card.innerHTML = `
            <div class="card-header">
                <h3>${nombreSeguro}</h3>
                <span class="card-badge ${tierSeguro}">${tierSeguro}</span>
            </div>

            <div class="card-image">
                <img src="${imagenSegura}"
                     alt="${nombreSeguro}"
                     onerror="this.src='/assets/img/logo.png'">
            </div>

            <div class="card-description">
                <p>${descripcionSegura}</p>
            </div>

            <div class="card-details">
                <div class="detail-row">
                    <strong>Cantidad sugerida:</strong>
                    <span>${recomendacion.cantidad} unidades${
                        recomendacion.limitadoPorStock
                            ? ` <em title="La IA sugirió ${recomendacion.cantidadSugerida}, pero solo hay ${recomendacion.stock_disponible} disponibles">(ajustado al stock)</em>`
                            : ''
                    }</span>
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
                                <td>${this.escaparHTML(prod.nombre)}</td>
                                <td>
                                    <input type="number"
                                           value="${prod.cantidad}"
                                           min="1"
                                           max="${prod.stock_disponible}"
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
            const pedida = Math.max(1, parseInt(nuevaCantidad) || 1);
            // Tope en el stock disponible: el servidor rechazaria el alquiler igualmente.
            const tope = Number(producto.stock_disponible) || pedida;
            producto.cantidad = Math.min(pedida, tope);
            if (producto.cantidad < pedida) {
                this.showErrorMessage(
                    `Solo hay ${tope} unidades disponibles de "${producto.nombre}"`
                );
            }
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
        const boton = document.getElementById('confirm-selection');
        if (boton?.disabled) return;

        if (this.selectedProducts.length === 0) {
            this.showErrorMessage('Por favor selecciona al menos un producto');
            return;
        }
        if (boton) boton.disabled = true;

        // try/finally para rehabilitar el boton por CUALQUIER camino de salida: uno de
        // los return tempranos de abajo lo dejaria deshabilitado para siempre.
        try {
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
        } finally {
            if (boton) boton.disabled = false;
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
     * Sesion: delegada en window.IAAuth (assets/js/ia-auth.js), compartida con
     * ChatWidget. Antes estaba duplicada en los dos componentes, y el catch de
     * getUserId divergia: aqui devolvia null y alli consultaba localStorage.
     * Ahora hay un solo comportamiento (el de ia-auth.js).
     */
    getJWT() {
        return window.IAAuth.getJWT();
    }

    getUserId() {
        return window.IAAuth.getUserId();
    }
}

// 40 productos x ~78 caracteres por linea + ~600 de plantilla = ~3.7k caracteres,
// holgadamente por debajo del limite de /api/ia/chat y del presupuesto de tokens.
RecommendationCards.MAX_PRODUCTOS_PROMPT = 40;

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
