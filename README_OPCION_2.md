# Menaje — Opción 2 (IA aplicada: búsqueda semántica, RAG, pronóstico y panel)

La Opción 1 (chat con Gemini) sigue igual. La Opción 2 le añade cuatro capacidades **sin cambiar su lógica**:
búsqueda semántica del catálogo, contexto recuperado (RAG) en el chat, pronóstico de demanda por categoría y un
panel de administración. Todo degrada con elegancia: si una pieza cae, el chat y el catálogo siguen funcionando.

> ⚠ **El pronóstico de demanda se entrenó con datos SINTÉTICOS** (la base casi no tiene alquileres reales).
> Sus métricas miden cuánto aprende la red de patrones supuestos, no su precisión real. La API y el panel lo rotulan.

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
| `database/` | `menajedb_filled.sql`, `migrations/001–005`, `seeds/` |

## Requisitos
Docker Desktop · Python 3.12 · Node 20+ (probado con 24) · una clave de la API de Google Gemini (solo para el chat).

## Levantar todo desde cero
Comandos en bash (Git Bash). En Windows los intérpretes están en `venv/Scripts/`; en Linux/Mac, `venv/bin/`.

```bash
# 1) Variables de entorno (ninguna clave va al repo: los .env están ignorados)
cp .env.example .env                        # POSTGRES_* del docker compose
cp backend/.env.example backend/.env        # JWT_SECRET, DB_*, IA_SERVICE_TOKEN, CORS_ORIGIN...
cp python-ia/.env.example python-ia/.env    # API_GEMINI_KEY, IA_SERVICE_TOKEN (igual que en backend), DB_*
python -c "import secrets; print(secrets.token_hex(32))"   # úsalo para JWT_SECRET e IA_SERVICE_TOKEN
# DB_PORT=5433 y DB_PASSWORD = POSTGRES_PASSWORD en backend/.env y python-ia/.env

# 2) PostgreSQL (pgvector) y Redis
docker compose up -d

# 3) Restaurar menaje_db. El volcado viene de PostgreSQL 17 y el contenedor es 16:
#    se filtra la línea transaction_timeout, que la 16 no reconoce.
grep -v transaction_timeout database/menajedb_filled.sql | \
  docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q

# 4) Migraciones 001 a 005 (en orden) y el seed de descripciones de búsqueda
for f in database/migrations/00{1,2,3,4,5}_*.sql; do
  docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q < "$f"
done
docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q < database/seeds/descripcion_busqueda.sql

# 5) Entornos Python
(cd python-ia && python -m venv venv && ./venv/Scripts/python -m pip install -r requirements.txt)
(cd python-ml && python -m venv venv && ./venv/Scripts/python -m pip install -r requirements.txt \
   && ./venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cpu)
(cd backend && npm install)

# 6) Embeddings de los productos (descarga el modelo la primera vez)
cd python-ml
export DB_PORT=5433 DB_PASSWORD=<la_de_POSTGRES_PASSWORD>
./venv/Scripts/python cargar_embeddings.py

# 7) Pronóstico: dataset sintético (semilla 42) y entrenamiento (registra el run en MLflow local)
./venv/Scripts/python -m pronostico.generar_dataset
./venv/Scripts/python -m pronostico.entrenar        # imprime MAE/RMSE frente a la línea base
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
| `backend/.env` | `RATE_LIMIT_IA` (acciones de IA, por usuario/minuto), `RATE_LIMIT_PANEL_IA` (lecturas del panel), `CORS_ORIGIN` | límites y CORS |

## Pruebas
```bash
cd python-ia && ./venv/Scripts/python -m unittest discover -p "test_*.py"   # 70; test_rag necesita la BD levantada
cd backend  && npm test                                                     # 11 (401/403, CORS, rate limit)
```
No llaman a Gemini. Mediciones guardadas: `python-ml/resultados_precision_busqueda.txt`,
`resultados_carga_busqueda.txt`, `resultados_seguridad.txt`, `resultados_umbral_chat.txt`.
Informes por fase: `INFORME_FASE3_PRONOSTICO_DEMANDA.md`, `INFORME_FASE4_PANEL_ADMIN.md`.

## Rutas nuevas (todas solo rol `dueno`, salvo búsqueda)
`POST /api/ia/busqueda-semantica` (JWT) · `POST /api/ia/pronostico-demanda` · `GET /api/ia/estado` ·
`POST|GET /api/ia/tareas` · `GET /api/ia/tareas/:id`.
