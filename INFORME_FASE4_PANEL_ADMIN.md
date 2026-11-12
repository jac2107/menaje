# Fase 4 — Panel de administración, tareas asíncronas y modo degradado (Opción 2)

## Qué se construyó
| Pieza | Dónde |
|---|---|
| Cola Redis + ejecución de tareas | `python-ia/tareas.py`, worker `python-ia/worker_tareas.py` |
| FastAPI (X-IA-Token): `POST /tareas`, `GET /tareas`, `GET /tareas/{id}`, `GET /estado` | `python-ia/main.py` |
| Node (solo rol `dueno`): `GET /api/ia/estado`, `POST/GET /api/ia/tareas`, `GET /api/ia/tareas/:id` | `backend/routes/index.js`, `backend/services/iaService.js` |
| Panel | `backend/frontend/pages/dueno/panel-ia.html` (+ enlace "Panel IA" en el menú de las páginas del dueño) |

- **Tareas**: `reentrenar_pronostico` (`python -m pronostico.entrenar`) y `regenerar_embeddings`
  (`cargar_embeddings.py`), ejecutadas como subprocesos de `python-ml`. Estados: pendiente → en_curso →
  completada | error (con las últimas 1500 caracteres de salida). Un candado en Redis impide lanzar dos
  del mismo tipo a la vez (409). Tras reentrenar, FastAPI recarga el modelo solo (compara el mtime de `meta.json`).
- **Estado** (`/estado`): pronóstico, búsqueda vectorial (BD + embeddings), Redis (PING) y Gemini
  (lista de modelos, sin generar texto ni gastar tokens; cacheado 60 s, tope 5 s). `modo_degradado` = falla el
  modelo de pronóstico o la búsqueda vectorial. Si FastAPI entero no responde, Node devuelve 200 con
  `ia_servicio: caido` (el panel lo muestra, no se rompe).
- **Panel**: aviso naranja de modo degradado; estado de cada pieza con latencia; formulario de pronóstico con
  etiqueta "Datos SINTÉTICOS" y confianza por categoría; botones de reentrenar/regenerar con su estado (consulta
  cada 3 s mientras hay tareas activas). Todo texto de la API se escapa (probado con un `<img onerror>`).
- **Opción 1 sin cambios**: el chat ya degradaba el RAG sin lanzar excepciones; solo se añadieron rutas y
  endpoints nuevos. Ningún controlador usa `iaService`, así que el catálogo no depende de FastAPI.
  Único cambio fuera de lo nuevo: `server.js` exporta `app` y solo escucha si es el módulo principal (para poder probar CORS).

## Pruebas (todas sin Gemini, Redis ni PostgreSQL reales)
- `test_tareas.py` (10): cola, estados, candado, errores/timeout del subproceso, worker con cola vacía.
- `test_estado.py` (16): 401 sin token, /tareas por HTTP (202/409/422/404/503 sin Redis), /estado en cada
  combinación de fallo, Gemini cacheado y sin `generate_content`, **chat 200 con el pronóstico caído o la
  búsqueda vectorial caída**, recarga del modelo.
- `test_pronostico.py` (13, de la Fase 3) siguen pasando: total 39.
- `backend/tests/panel_ia.test.js` (11, `npm test`): sin token 401; token falso/otro secreto 401; cliente y
  trabajador 403 en todas las rutas del panel y en `/pronostico-demanda` (sin llegar a FastAPI); validaciones;
  5xx enmascarado; id de tarea validado (no hay path traversal hacia FastAPI); CORS: un origen ajeno no recibe
  `Access-Control-Allow-Origin` y `X-IA-Token` no se permite desde el navegador; rate limiting: 429 en la 4.ª
  acción (límite 3) y en la 5.ª lectura (límite 4), por usuario.
- La lógica del panel se ejercitó con jsdom y una API simulada (escenarios ok / degradado / FastAPI caído); jsdom
  no se añade al repo. **No se vio en un navegador real** (no hay Chrome/Edge en esta máquina).

## Límites y pendientes
- **Redis y PostgreSQL no estaban corriendo** (Docker Desktop apagado), así que no se probó el worker contra un
  Redis real ni `/estado` contra la BD real. Sí se ejecutó una tarea real de reentrenamiento (subproceso de
  `python-ml`) sobre fakeredis: terminó `completada`. Con Docker arriba, la prueba de humo está en los pasos de abajo.
- El panel de lectura usa un límite propio (`RATE_LIMIT_PANEL_IA`, 60/min) porque el de IA (5/min) no admite sondeo.
- Los embeddings solo se pueden regenerar con la BD y el modelo e5 disponibles; si falla, la tarea queda en `error` con el motivo.
- Los datos del pronóstico siguen siendo **sintéticos** (se rotula en la API y en el panel).
