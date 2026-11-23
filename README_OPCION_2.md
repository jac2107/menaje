# Menaje — Opción 2 (IA aplicada: búsqueda semántica, RAG, pronóstico y panel)

La Opción 1 (chat con Gemini) sigue igual. La Opción 2 le añade cuatro capacidades **sin cambiar su lógica**:
búsqueda semántica del catálogo, contexto recuperado (RAG) en el chat, pronóstico de demanda por categoría y un
panel de administración. Todo degrada con elegancia: si una pieza cae, el chat y el catálogo siguen funcionando.

> ⚠ **El pronóstico de demanda se entrena con datos SINTÉTICOS y alquileres de EJEMPLO** (la base casi no tiene
> alquileres reales). Sus métricas miden cuánto aprende la red de patrones supuestos, no su precisión real.
> La API y el panel lo rotulan (`SINTETICOS` o `MIXTOS`) y el panel muestra la proporción de cada tipo de dato.

## Arquitectura

```
Navegador ──► Node/Express :3000 ──(X-IA-Token)──► FastAPI :8000 ──► Gemini (solo el chat)
 (frontend)   JWT + rol + rate limit              │   │
                                                   │   └─► PostgreSQL+pgvector :5433  (embeddings, conversaciones)
                                                   └─► Redis :6379 ◄── worker_tareas.py ──► python-ml (reentrenar, embeddings)
python-ml: genera embeddings (e5-small), dataset sintético y entrena la red (PyTorch CPU + MLflow local)
```

| Pieza | Qué hace |
|---|---|
| `backend/` (Node) | API, JWT/roles, CORS, rate limiting; reenvía a FastAPI con el token interno. Panel en `frontend/pages/dueno/panel-ia.html` |
| `python-ia/` (FastAPI) | `/chat`, `/busqueda-semantica`, `/pronostico-demanda`, `/tareas`, `/estado`. Swagger en `/docs` si `IA_ENV=dev` |
| `python-ia/worker_tareas.py` | Ejecuta las tareas encoladas en Redis (reentrenar pronóstico, regenerar embeddings) |
| `python-ml/` | `cargar_embeddings.py`, `pronostico/` (dataset sintético + entrenamiento), mediciones (`resultados_*.txt`) |
| `database/` | `menajedb_filled.sql`, `migrations/001–008`, `seeds/` |

## Requisitos
Docker Desktop · Python 3.12 · Node 20+ (probado con 24) · una clave de la API de Google Gemini (solo para el chat).

## Levantar todo desde cero
Comandos en bash (Git Bash). En Windows los intérpretes están en `venv/Scripts/`; en Linux/Mac, `venv/bin/`.

```bash
# 1) Variables de entorno (ninguna clave va al repo: los .env están ignorados)
cp .env.example .env                        # POSTGRES_* del docker compose
cp backend/.env.example backend/.env        # JWT_SECRET, DB_*, IA_SERVICE_TOKEN, CORS_ORIGIN...
cp python-ml/.env.example python-ml/.env    # DB_* para los scripts de python-ml (misma clave)
cp python-ia/.env.example python-ia/.env    # API_GEMINI_KEY, IA_SERVICE_TOKEN (igual que en backend), DB_*
python -c "import secrets; print(secrets.token_hex(32))"   # úsalo para JWT_SECRET e IA_SERVICE_TOKEN
# DB_PORT=5433 y DB_PASSWORD = POSTGRES_PASSWORD en backend/.env, python-ia/.env y python-ml/.env
# POSTGRES_PASSWORD es obligatoria: docker compose no arranca sin ella (no hay valor por defecto)

# 2) PostgreSQL (pgvector) y Redis
docker compose up -d

# 3) Restaurar menaje_db. El volcado viene de PostgreSQL 17 y el contenedor es 16:
#    se filtra la línea transaction_timeout, que la 16 no reconoce.
grep -v transaction_timeout database/menajedb_filled.sql | \
  docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q

# 4) Migraciones 001 a 008 (en orden), el seed de descripciones de búsqueda y el historial de ejemplo
for f in database/migrations/00{1,2,3,4,5,6,7,8}_*.sql; do
  docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q < "$f"
done
docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q < database/seeds/descripcion_busqueda.sql
docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q < database/seeds/historial_alquileres_ejemplo.sql   # opcional: 300 alquileres de ejemplo

# 5) Entornos Python
(cd python-ia && python -m venv venv && ./venv/Scripts/python -m pip install -r requirements.txt)
(cd python-ml && python -m venv venv && ./venv/Scripts/python -m pip install -r requirements.txt \
   && ./venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu)
(cd backend && npm install)

# 6) Embeddings de los productos (descarga el modelo la primera vez)
cd python-ml
# (python-ml/.env ya trae DB_*; sin él: export DB_PORT=5433 DB_PASSWORD=<la_de_POSTGRES_PASSWORD>)
./venv/Scripts/python cargar_embeddings.py

# 7) Pronóstico: dataset sintético (semilla 42) y entrenamiento (registra el run en MLflow local)
./venv/Scripts/python -m pronostico.generar_dataset
./venv/Scripts/python -m pronostico.entrenar        # sintéticos + alquileres de ejemplo/reales de la BD; imprime MAE/RMSE
#   --solo-sinteticos reproduce el entrenamiento original (sin leer la BD)
cd ..

# 8) Arrancar (tres terminales)
cd python-ia && ./venv/Scripts/python main.py             # FastAPI :8000
cd python-ia && ./venv/Scripts/python worker_tareas.py    # worker de la cola
cd backend  && npm start                                  # Node :3000
```
Abrir `http://localhost:3000`, entrar con un usuario de rol `dueno` y pulsar **Panel IA** en el menú.
Swagger de FastAPI: poner `IA_ENV=dev` en `python-ia/.env` y abrir `http://127.0.0.1:8000/docs`.

## Variables de entorno de la Opción 2
Todas están documentadas, sin valores secretos, en los `.env.example`.

| Archivo | Variable | Para qué |
|---|---|---|
| `.env` | `POSTGRES_USER/PASSWORD/DB` | credenciales del contenedor |
| `python-ia/.env` | `API_GEMINI_KEY`, `GEMINI_MODEL` | solo el chat usa Gemini |
| ambos | `IA_SERVICE_TOKEN` | secreto Node↔FastAPI (≥ 32 caracteres, idéntico en los dos) |
| `python-ia/.env` | `BUSQUEDA_UMBRAL_SIMILITUD` (0.85), `RAG_CHAT_UMBRAL_SIMILITUD` (0.82), `MEMORIA_UMBRAL_SIMILITUD`, `RAG_PRODUCTOS_MAX`, `RAG_MEMORIA_MAX`, `RAG_MENSAJE_MAX_CHARS`, `EMBEDDING_MODEL` | búsqueda y RAG |
| `python-ia/.env` | `REDIS_URL`, `ML_PYTHON`, `TAREA_TIMEOUT_S`, `PRONOSTICO_MODELO_DIR` | cola de tareas y pronóstico |
| `backend/.env` | `RATE_LIMIT_IA` (chat y acciones de IA, por usuario/minuto, 5), `RATE_LIMIT_BUSQUEDA` (búsqueda semántica, por usuario/minuto, 20; contador **independiente** del chat), `RATE_LIMIT_PANEL_IA` (lecturas del panel), `CORS_ORIGIN` | límites y CORS |
| `backend/.env` | `REDIS_URL` | Redis donde Node anota los productos cuyo embedding hay que regenerar |
| `python-ia/.env` | `DERIVA_VENTANA_DIAS` (90), `DERIVA_MIN_ALQUILERES` (20), `DERIVA_UMBRAL_ATENCION` (1.5), `DERIVA_UMBRAL_DERIVA` (2.0) | alerta de concept drift |
| `python-ia/.env` | `REENTRENAR_MENSUAL` (1; 0 lo desactiva), `REENTRENAR_DIA_MES` (1) | reentrenamiento programado del worker |
| `python-ml/.env` | `DB_HOST/PORT/NAME/USER/PASSWORD` | conexión de los scripts de python-ml |

## Fase 6A — datos de ejemplo, deriva, historial y embeddings automáticos

**Cambiar la contraseña de postgres.** La variable `POSTGRES_PASSWORD` solo actúa al crear el volumen, así que además hay que
alterar el usuario (`ALTER USER postgres WITH PASSWORD '...'` dentro del contenedor) y poner la misma clave en `.env` (raíz),
`backend/.env`, `python-ia/.env` y `python-ml/.env`. Ningún archivo versionado la contiene.

**Alquileres de ejemplo.** `database/seeds/historial_alquileres_ejemplo.sql` crea 300 alquileres cerrados (ene-2025 a oct-2026) con los 7
tipos de evento, los 12 meses, 10-250 asistentes e ítems por categoría proporcionales a los asistentes. Se distinguen así:
`alquileres.es_ejemplo = TRUE` (migración 006), cliente ficticio inactivo `ejemplo@menaje.invalid` y estado `cerrado`
(no restan stock ni salen como activos). Es reproducible (`setseed`) y se puede repetir. **Aviso:** `reportes.html` suma todos los
alquileres, los de ejemplo incluidos; `database/seeds/historial_alquileres_ejemplo_quitar.sql` los retira.
La migración 006 añade también `tipo_evento` y `num_asistentes` a `alquileres` (NULL en los reales ya existentes). La app de la Opción 1
no los pide todavía, así que **solo los alquileres que tengan esos dos datos alimentan el entrenamiento y la deriva**.

**Entrenamiento y panel.** `pronostico.entrenar` mezcla el CSV sintético (3600) con los alquileres de la BD con evento. `meta.json`
guarda `composicion_datos`, `entrenado_en` y `version_modelo`; el panel (tarjeta *Calidad del modelo*) muestra la proporción de
sintéticos / ejemplo / reales del último entrenamiento.

**Historial de pronósticos.** Migración 007, tabla `pronosticos` (tipo, mes, asistentes, modo, versión del modelo, salida JSON, fecha).
Cada `/pronostico-demanda` guarda una fila; si guardar falla solo se avisa en el log y el pronóstico se responde igual.

**Alerta de concept drift** (`python-ia/deriva.py`, campo `deriva` de `/estado`, semáforo en el panel).
`razón = MAE reciente / MAE de validación`: el MAE reciente es el error medio (unidades, sobre las 6 categorías) del modelo vigente
en los alquileres con evento de los últimos 90 días (mínimo 20; si no, «sin datos» y no se alerta) y el de validación sale de `meta.json`.
**normal** `< 1.5` · **atención** `1.5 – 2.0` · **deriva** `≥ 2.0` (reentrenar). Un error 1.5 veces mayor ya es llamativo; el doble indica
que el modelo aprendió algo que dejó de cumplirse. Los umbrales se ajustan con las variables `DERIVA_*`. Limitación: los alquileres recientes
también pueden estar en el entrenamiento (no es una prueba fuera de muestra), y tras reentrenar la razón tiende a bajar.

**Reentrenamiento mensual.** `worker_tareas.py` encola `reentrenar_pronostico` una vez por mes calendario (clave `ia:programada:reentrenar:AAAA-MM`
en Redis, a partir de `REENTRENAR_DIA_MES`; si el worker estaba apagado ese día, lo hace al volver). A mano: botón del Panel IA,
`POST /api/ia/tareas {"tipo":"reentrenar_pronostico"}` o `python worker_tareas.py --reentrenar-ahora`.

**Embeddings automáticos.** Al crear (`POST /api/productos`) o editar (`PATCH /api/productos/:id`, nuevo, solo dueño; solo si cambia nombre,
categoría o descripción) un producto, Node hace `SADD ia:embeddings_pendientes <id>`; el worker vacía el SET en lotes y ejecuta
`cargar_embeddings.py --ids ...` (si falla, los ids vuelven a la cola). Si Redis no responde, el producto se guarda igual y Node registra un aviso;
`regenerar_embeddings` en el Panel IA recupera los pendientes.

**Límite de la búsqueda.** `/api/ia/busqueda-semantica` usa `RATE_LIMIT_BUSQUEDA` con contador propio; `RATE_LIMIT_IA` queda solo para el chat y las acciones.

## Pruebas
```bash
cd python-ia && ./venv/Scripts/python -m unittest discover -p "test_*.py"   # 145; test_rag, test_fase6b y parte de test_fase6a necesitan la BD levantada (con la migración 008)
cd backend  && npm test                                                     # 48 (401/403, CORS, rate limit, cola de embeddings, rutas de la Fase 6B, lógica del panel y del cliente; la de Redis real se omite sin Redis)
```
No llaman a Gemini. Mediciones guardadas: `python-ml/resultados_precision_busqueda.txt`,
`resultados_carga_busqueda.txt`, `resultados_seguridad.txt`, `resultados_umbral_chat.txt`.
Informes por fase: `INFORME_FASE3_PRONOSTICO_DEMANDA.md`, `INFORME_FASE4_PANEL_ADMIN.md`.

## Fase 6B — contexto RAG, serie temporal, riesgo de faltante, métricas y mejoras del cliente

Migración `008_fase6b_contexto_serie_metricas.sql` (aditiva): columna `conversaciones_ia.contexto_rag` (JSONB), vista `demanda_categoria_mes` y tabla `busquedas_ia`.

* **Modelo documental.** Cada respuesta del chat guarda en `contexto_rag` los productos que recuperó el RAG (id, nombre, similitud) y las conversaciones de memoria usadas. `NULL` si el RAG no corrió (mensaje largo o sin embedding). Si guardarlo falla, el chat y el registro básico siguen funcionando.
* **Serie temporal.** La vista da unidades reales por categoría y mes. El Panel IA la dibuja (barras apiladas) y la alerta de deriva la usa: si la demanda real de una categoría cambia más de `SERIE_UMBRAL_CAMBIO` (50 %) en el último mes completo frente al promedio de los 6 previos y el semáforo estaba en *normal*, sube a *atención* (nunca a *deriva*). El mes en curso se ignora.
* **Riesgo de faltante.** `POST /api/ia/riesgo-faltante` cruza el pronóstico con el stock disponible (`stock_total − stock_baja`, activos; **no** descuenta alquileres ya reservados): *alcanza* (stock ≥ demanda × `RIESGO_MARGEN_JUSTO`, 1.2), *justo* (entre la demanda y esa cifra), *faltará* (stock < demanda). El panel lo muestra por categoría junto al pronóstico.
* **Métricas de uso.** `GET /api/ia/metricas-uso?dias=14`: consultas, tokens, errores de Gemini y búsquedas sin resultado por día (de `conversaciones_ia` y `busquedas_ia`; cada búsqueda semántica o de similares queda anotada).
* **Cliente.** Botón *Productos similares* en las tarjetas del catálogo (`GET /api/ia/productos-similares/:id`, pgvector sobre el embedding ya guardado), sugerencias clicables bajo la búsqueda y en el chat (preguntas de ejemplo y productos que halló el RAG), indicador de espera por pasos y dictado por voz con la API del navegador (el botón 🎤 solo aparece si el navegador la soporta; en Chrome/Edge necesita internet y permiso de micrófono).
* **Búsqueda por imagen: no implementada.** Solo 8 de 38 productos tienen foto real; ver `docs/fase6b-busqueda-por-imagen.md`.
* Datos para el informe: `docs/informe-datos/`.

## Rutas nuevas (todas solo rol `dueno`, salvo búsqueda)
`POST /api/ia/busqueda-semantica` (JWT) · `POST /api/ia/pronostico-demanda` · `GET /api/ia/estado` ·
`POST|GET /api/ia/tareas` · `GET /api/ia/tareas/:id` · `POST /api/ia/riesgo-faltante` · `GET /api/ia/serie-demanda` · `GET /api/ia/metricas-uso` ·
`GET /api/ia/productos-similares/:id` (cualquier usuario con JWT).
