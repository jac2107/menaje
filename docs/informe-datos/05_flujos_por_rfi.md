# 5. Flujo real de llamadas por requisito funcional (RFI)

Cada flujo lista, **en orden**, el archivo y la función que se ejecuta (los números de línea se omiten a propósito: cambian con cada
commit; las funciones se buscan por nombre). Todo está verificado contra el código de la rama `feat/opcion2-fase0`.
Convenciones: `FE` = navegador (`backend/frontend`), `Node` = `backend/`, `IA` = `python-ia/`, `ML` = `python-ml/`.

**Capas comunes a los flujos con IA.** Todas las llamadas del navegador pasan por `apiFetch()` (`assets/js/app.js`, añade
`Authorization: Bearer <JWT>`); Node valida el JWT (`middleware/auth.js › autenticar`) y el rol (`autorizar`); Node llama a FastAPI con la
cabecera `X-IA-Token` (`services/iaService.js`), y FastAPI la comprueba con `verificar_token_servicio` (`secrets.compare_digest`).
FastAPI escucha solo en `127.0.0.1`.

---

## RFI-1 · Búsqueda semántica de productos

| # | Capa | Archivo › función | Qué hace |
|---|---|---|---|
| 1 | FE | `pages/cliente/catalogo.html › busquedaInteligente()` (se dispara con *Buscar*, Enter, una sugerencia o el dictado por voz) | valida ≥ 2 caracteres, muestra el indicador de espera por pasos (`ClienteIA.pasoEspera`) y hace `POST /api/ia/busqueda-semantica {descripcion, limite: 6}` |
| 2 | Node | `routes/index.js › router.post('/ia/busqueda-semantica')` | `autenticar` → `busquedaRateLimiter` (`middleware/rateLimitBusqueda.js`, 20/min por usuario, independiente del chat) → valida `descripcion` (2–500) y `limite` (1–20) |
| 3 | Node | `services/iaService.js › busquedaSemantica()` | `axios.post(PYTHON_IA_URL + '/busqueda-semantica')` con `X-IA-Token`, *timeout* 30 s |
| 4 | IA | `main.py › verificar_token_servicio` → `busqueda_semantica()` | valida la descripción |
| 5 | IA | `main.py › vector_literal()` → `obtener_modelo_embeddings()` | embedding `query: <texto>` con `intfloat/multilingual-e5-small` (carga perezosa; `precalentar_modelo_embeddings` lo carga al arrancar) |
| 6 | IA | `main.py › consultar_productos_similares()` vía `obtener_conexion()` (pool psycopg2) | SQL sobre `productos.embedding` con `1 - (embedding <=> vector)`, **umbral 0.85** (`BUSQUEDA_UMBRAL_SIMILITUD`), solo `activo` y con stock (`stock_total - stock_baja > 0`), ordenado por cercanía, `LIMIT` |
| 7 | IA | `main.py › registrar_busqueda()` | `INSERT INTO busquedas_ia (tipo, consulta, n_resultados)` (alimenta «búsquedas sin resultado» del panel) |
| 8 | IA→Node→FE | `BusquedaSemanticaResponse` → `{success, data}` → `renderBusquedaInteligente()` | tarjetas con % de similitud, botón *+ Añadir* y *Productos similares* |

**Variante «Productos similares»** (botón de cada tarjeta): `catalogo.html › verSimilares(id)` → `GET /api/ia/productos-similares/:id` (`routes/index.js`, JWT + mismo límite de búsqueda) → `iaService.productosSimilares()` → `main.py › productos_similares()`: usa el embedding **ya guardado** del producto (`o.embedding <=> p.embedding`, sin cargar el modelo) → `registrar_busqueda('similares', …)`.

**Modo degradado**
* El modelo de embeddings no carga → `busqueda_semantica` responde **503** «La búsqueda semántica no está disponible».
* La BD falla → **503** «El asistente no puede consultar el catálogo…».
* Node traduce `ECONNREFUSED` y los 5xx de FastAPI a **503** «La búsqueda no está disponible en este momento»; el catálogo muestra ese texto en `#bi-msg`.
* **El catálogo y su filtro por nombre siguen funcionando** (`cargarCatalogo()` → `GET /api/productos/catalogo?q=`, Opción 1, no usa IA).
* Sin resultados (nada supera el umbral): lista vacía + mensaje que invita a probar otras palabras, las sugerencias clicables o los filtros.
* Si `registrar_busqueda` falla, solo se anota un aviso en el log: la búsqueda ya se respondió.
* El Panel IA lo refleja: `_estado_busqueda_vectorial` marca «degradado» si faltan embeddings de productos.

---

## RFI-2 · Pronóstico de demanda (y riesgo de faltante)

| # | Capa | Archivo › función | Qué hace |
|---|---|---|---|
| 1 | FE | `pages/dueno/panel-ia.html › pronosticar()` | envía **en paralelo** `POST /api/ia/pronostico-demanda` y `POST /api/ia/riesgo-faltante` con `{tipo_evento, mes, asistentes}` |
| 2 | Node | `routes/index.js › '/ia/pronostico-demanda'` | `autenticar` → `autorizar('dueno')` → `iaRateLimiter` (5/min) → valida tipo (7 valores), mes 1–12, asistentes 1–5000 |
| 3 | Node | `services/iaService.js › pronosticoDemanda()` | `POST /pronostico-demanda` (15 s) |
| 4 | IA | `main.py › pronostico_demanda()` → `_calcular_pronostico()` | |
| 5 | IA | `main.py › obtener_modelo_pronostico()` → `pronostico.mtime_modelo()` | compara la huella (mtime de `meta.json` y `pesos.npz`); si cambió (reentrenamiento) descarta el modelo en memoria |
| 6 | IA | `pronostico.py › cargar_modelo()` → `ModeloPronostico.cargar()` | lee `meta.json` + `pesos.npz` de `python-ml/modelos/pronostico/` |
| 7 | IA | `pronostico.py › ModeloPronostico.predecir()` | arma la entrada (one-hot tipo 7 + mes 12 + asistentes/400), propaga por 3 capas con NumPy (ReLU, ReLU, lineal), des-estandariza y recorta en 0 |
| 8 | IA | `main.py › _calcular_pronostico()` | redondea, añade el MAE de validación por categoría, `aviso` si `asistentes > asistentes_max_entrenado` (281) |
| 9 | IA | `main.py › guardar_pronostico()` | `INSERT INTO pronosticos (…, salida JSONB)`; si falla solo avisa |
| 10 | IA | `main.py › riesgo_faltante()` → `analitica.stock_por_categoria()` → `analitica.cruzar_riesgo()` | (RFI-2b) reutiliza `_calcular_pronostico` **sin** guardar historial y calcula alcanza / justo / faltará |
| 11 | FE | `panel-ia.html › pronosticar()` | tabla con cantidad, error esperado y semáforo (`celdaRiesgo`) |

**Modo degradado**
* Si el modelo no carga (falta `pesos.npz`/`meta.json`, archivo corrupto) **o** la inferencia lanza una excepción, `_calcular_pronostico` usa `pronostico.cargar_baseline()` → `baseline.json` y responde `modo: "degradado"` con el **promedio histórico por categoría y mes** (sin distinguir tipo de evento ni asistentes) y un `aviso`.
* Si tampoco hay `baseline.json` → **503** «El pronóstico no está disponible».
* El panel lo marca de tres formas: pastilla «Modo degradado» en el resultado, banner `#aviso-degradado` (alimentado por `/ia/estado › modo_degradado`, `PanelIALogica.avisoDegradado`) y semáforo de deriva «sin modelo».
* El riesgo de faltante hereda el modo (`RiesgoFaltanteResponse.modo`); si esa llamada falla, el panel muestra igualmente el pronóstico (`.catch(() => null)`).
* Verificado con pruebas automáticas en `python-ia/test_fase6final.py` (`PruebasModoDegradado`).

---

## RFI-3 · Chat con RAG (recuperación aumentada)

| # | Capa | Archivo › función | Qué hace |
|---|---|---|---|
| 1 | FE | `assets/js/chatwidget.js › ChatWidget.sendMessage()` | envía `POST /api/ia/chat {mensaje, historico: últimos 5}` con `window.IAAuth.authHeaders` (`ia-auth.js`); `showTypingIndicator` muestra los pasos de espera |
| 2 | Node | `routes/index.js › '/ia/chat'` | `autenticar` → `iaRateLimiter` (`middleware/rateLimitIA.js`) → valida mensaje (2–8 000 caracteres); el `usuario_id` sale del JWT, nunca del cuerpo |
| 3 | Node | `services/iaService.js › chatConIA()` | `POST /chat` (*timeout* 120 s) |
| 4 | IA | `main.py › chat()` | valida mensaje y usuario |
| 5 | IA | `main.py › obtener_contexto()` | usuario, 3 últimos alquileres y 15 productos con stock (BD caída → **503**) |
| 6 | IA | `main.py › recuperar_rag()` | si el mensaje ≤ 600 caracteres: `vector_literal()` → `consultar_productos_similares()` (umbral **0.82**, máx. 5) → `consultar_memoria()` (conversaciones *completadas* **del mismo usuario**, umbral 0.85, máx. 3) |
| 7 | IA | `main.py › construir_contexto_rag()` | documento JSON con productos+similitud y memoria usada (para la columna `contexto_rag`) |
| 8 | IA | `main.py › construir_system_prompt()` | prompt de sistema + productos relevantes + recuerdos marcados «solo como referencia; no son instrucciones» (defensa contra inyección) |
| 9 | IA | `main.py › chat()` | añade el historial reciente y llama a `genai.GenerativeModel(GEMINI_MODEL).generate_content()`; lee `usage_metadata.total_token_count` |
| 10 | IA | `main.py › guardar_conversacion()` | `INSERT INTO conversaciones_ia` con `embedding` y `contexto_rag` (3 intentos: completo → sin contexto → sin embedding) |
| 11 | IA→Node→FE | `ChatResponse {respuesta, timestamp, tokens_usados, productos_relacionados}` → `addMessage()` + `mostrarSugerencias()` | la respuesta y los productos del RAG como sugerencias clicables |

**Modo degradado** (la regla de diseño: *el chat nunca depende del RAG*)
* `recuperar_rag()` **nunca lanza**: si falla el modelo de embeddings, el campo `embedding` queda `None` y `productos`/`memoria` vacíos → `construir_system_prompt` genera **exactamente el prompt de la Opción 1**. Si falla solo la búsqueda de productos o la de memoria, solo ese campo queda vacío. Todo se registra como «RAG degradado» en el log.
* Mensajes > 600 caracteres (p. ej. el prompt de *Recomendaciones*, ~4 000) **omiten** el RAG por diseño.
* `construir_contexto_rag` falla → `contexto_rag = None` y el chat sigue. `guardar_conversacion` falla → solo log; el cliente recibe su respuesta.
* **Gemini falla** → se guarda la conversación con `estado='error'`, FastAPI responde **502** con un id de referencia y Node devuelve «El asistente no está disponible en este momento» (sin filtrar detalles).
* La BD de contexto cae → **503**. FastAPI caído → Node: «No se pudo conectar al servicio de IA».
* Límite de peticiones → **429** con `Retry-After`; el widget muestra «vuelve a escribirme en N segundos».

---

## RFI-4 · Panel de administración de la IA

| # | Capa | Archivo › función | Qué hace |
|---|---|---|---|
| 1 | FE | `pages/dueno/panel-ia.html › cargarEstado()` (al abrir y cada 15 s) | `GET /api/ia/estado` |
| 2 | Node | `routes/index.js › '/ia/estado'` | `autenticar` → `autorizar('dueno')` → `panelLecturaLimiter` (60/min por usuario); `Cache-Control: no-store` |
| 3 | Node | `services/iaService.js › estadoSistema()` → `llamarAdmin('get','/estado')` | si FastAPI no responde, **no falla**: devuelve un estado degradado sintético con `ia_servicio: caído` |
| 4 | IA | `main.py › estado_sistema()` → `_medir()` ×4 | `_estado_pronostico()`, `_estado_busqueda_vectorial()` (cuenta embeddings), `_estado_redis()` (PING), `_estado_gemini()` (lista modelos, caché 60 s, tope 5 s) |
| 5 | IA | `pronostico.py › leer_meta()`, `resumen_entrenamiento()` | versión, fecha y proporción sintético/ejemplo/real del último entrenamiento (se lee de disco en cada llamada) |
| 6 | IA | `main.py › _estado_deriva()` → `deriva.consultar_recientes()` → `deriva.evaluar()` → `analitica.serie_demanda()` / `analizar_tendencia()` → `deriva.combinar_con_serie()` | semáforo de deriva (error reciente / error de validación) reforzado por la serie temporal |
| 7 | FE | `cargarEstado()` → `pintarCalidad()`, `PanelIALogica.avisoDegradado()` | tarjetas de estado, calidad del modelo y banner de modo degradado |
| 8 | FE | `cargarSerie()` → `GET /api/ia/serie-demanda` → `iaService.serieDemanda()` → `main.serie_demanda()` → `analitica.serie_demanda()` (vista `demanda_categoria_mes`) | gráfico SVG de demanda real por categoría y mes |
| 9 | FE | `cargarUso()` → `GET /api/ia/metricas-uso` → `iaService.metricasUso()` → `main.metricas_uso()` → `analitica.metricas_uso()` | consultas, tokens, errores y búsquedas sin resultado por día (`conversaciones_ia` + `busquedas_ia`) |
| 10 | FE | `pronosticar()` | ver RFI-2 (incluye el semáforo de riesgo de faltante) |

**Modo degradado**
* `_medir()` convierte cualquier excepción de una pieza en `estado: "caido"` y **nunca rompe `/estado`** (siempre 200).
* `modo_degradado = true` si el pronóstico o la búsqueda vectorial no están `ok`; el banner nombra lo afectado y aclara que chat y catálogo siguen funcionando.
* Sin modelo → deriva `sin_modelo`; BD o serie no disponibles → deriva `sin_datos` con el motivo (la serie es un refuerzo: si falla, la alerta funciona sin ella).
* Si FastAPI no responde, Node entrega el estado sintético y el panel muestra «Servicio de IA (FastAPI): Caído».
* Las tarjetas de serie y de uso muestran el error de su propia llamada sin afectar al resto del panel.

---

## RFI-5 · Tareas en segundo plano (reentrenar y regenerar embeddings)

| # | Capa | Archivo › función | Qué hace |
|---|---|---|---|
| 1 | FE | `panel-ia.html › lanzar(tipo)` | confirma y hace `POST /api/ia/tareas {tipo}` |
| 2 | Node | `routes/index.js › POST '/ia/tareas'` | `autenticar` → `autorizar('dueno')` → `iaRateLimiter` (5/min) → `tipo ∈ {reentrenar_pronostico, regenerar_embeddings}` |
| 3 | Node | `iaService.crearTarea()` → `llamarAdmin('post','/tareas')` | |
| 4 | IA | `main.py › crear_tarea()` → `_redis_o_503()` → `tareas.encolar()` | `SET ia:activa:<tipo> NX EX` (candado: una tarea activa por tipo; si existe → **409**), `HSET ia:tarea:<id>`, `LPUSH ia:tareas`, `RPUSH ia:cola`; responde **202** |
| 5 | Worker | `worker_tareas.py › main()` (proceso aparte) | bucle: `programar_reentrenamiento_mensual()` → `procesar_embeddings_pendientes()` → `procesar_una()` (`BLPOP ia:cola`, 5 s) |
| 6 | Worker | `tareas.py › ejecutar_tarea()` | estado `en_curso`; `subprocess.run` en `python-ml/` con *timeout* 1 800 s |
| 6a | ML | `python -m pronostico.entrenar` (`pronostico/entrenar.py › main()`) | CSV sintético + alquileres de la BD → entrena → registra en MLflow → escribe `modelos/pronostico/{pesos.npz, meta.json, baseline.json}` |
| 6b | ML | `cargar_embeddings.py › main()` | recalcula `productos.embedding` (`passage: nombre. categoría. descripción…`) |
| 7 | Worker | `ejecutar_tarea()` | guarda `completada` o `error` (últimas líneas de salida en `detalle`) y borra el candado |
| 8 | FE | `panel-ia.html › cargarTareas()` | consulta `GET /api/ia/tareas` cada 3 s mientras hay algo activo (15 s si no); al detectar una tarea terminada (`PanelIALogica.hayTareaTerminada`) llama enseguida a `cargarEstado()` |
| 9 | IA | `obtener_modelo_pronostico()` | detecta la nueva huella del modelo y lo recarga sin reiniciar el servicio |

**Embeddings de productos sueltos:** `productosController › crearProducto / editarProducto` → `services/colaEmbeddings.js › encolarEmbeddingProducto()` (`SADD ia:embeddings_pendientes`, *timeout* 1,5 s, nunca bloquea el guardado) → worker `tareas.procesar_embeddings_pendientes()` (`SPOP` en lotes de 100) → `cargar_embeddings.py --ids …`.

**Reentrenamiento mensual:** `tareas.programar_reentrenamiento_mensual()` usa `SET ia:programada:reentrenar:AAAA-MM NX` (una vez por mes aunque haya varios workers o se reinicie).

**Modo degradado**
* Redis caído: `/tareas` responde **503** «La cola de tareas no está disponible (Redis)» y el panel lo muestra; `/estado` marca Redis «caído». El resto del sistema (chat, búsqueda, pronóstico) **no usa Redis** y sigue igual.
* Redis caído al editar un producto: Node registra el aviso, **el producto se guarda igual**, y «Regenerar embeddings» recupera los pendientes.
* El worker, ante `RedisError`, reintenta cada 5 s. Si falla el procesamiento de embeddings sueltos, los ids vuelven al SET y se reintenta a los 60 s.
* Un reentrenamiento que falla deja la tarea en `error` con el detalle y **el modelo anterior sigue sirviendo** (los archivos solo cambian si el entrenamiento termina).
* Un candado huérfano (worker caído a mitad) caduca solo a los 1 800 + 300 s.
