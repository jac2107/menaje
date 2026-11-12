# Fase 5 — Cierre del código de la Opción 2

## 1. Swagger (`/docs`, con `IA_ENV=dev`)
`/busqueda-semantica`, `/pronostico-demanda`, `/tareas` (POST, GET, GET `{id}`) y `/estado` llevan resumen y descripción en
español, ejemplos de petición y respuesta (validados contra sus propios modelos) y los errores 401, 403, 409, 422, 503 (más
400/404 donde aplican), cada uno con ejemplo. **Matiz:** FastAPI nunca emite 403; lo aplica el backend Node (JWT con rol `dueno`).
Se documenta así en el propio Swagger. Cubierto por `test_openapi.py` (6 pruebas).

## 2. Precision@k de la búsqueda semántica (`python-ml/medir_precision_busqueda.py`)
15 consultas redactadas como las de la caja de búsqueda; los productos relevantes los fijé yo a mano sobre el catálogo real (38 productos).
Ranking sin umbral, solo productos con stock.

| Métrica | Valor | Techo posible | Normalizada |
|---|---:|---:|---:|
| precision@3 | **0.489** | 0.511 | 0.957 |
| precision@5 | **0.320** | 0.320 | 1.000 |

El "techo" existe porque casi todas las consultas tienen 1–2 productos relevantes (con un solo relevante, P@3 máx. = 0.33).
**El producto esperado quedó en el puesto 1 en 14 de 15 consultas**, y todos entraron en el top 5. El único relevante fuera del
top 3 es la Copa Flauta Dorada (puesto 4) en "copas para brindar con champagne". Salvedades: 15 consultas es una muestra pequeña,
la relevancia es un juicio mío (p. ej. "tenedor de acero inoxidable" marca solo el tenedor de acero, aunque el dorado también es un tenedor) y las
consultas son mías, no de clientes reales. Detalle por consulta: `python-ml/resultados_precision_busqueda.txt`.

## 3. Carga de la búsqueda (`backend/tests/carga_busqueda.js`, 50 peticiones seguidas)
| Ruta | Media | p95 | Máx. | Códigos |
|---|---:|---:|---:|---|
| Vía Node (`/api/ia/busqueda-semantica`) | 114.6 ms | 140.9 ms | 174.1 ms | 50 × 200 |
| FastAPI directo (`/busqueda-semantica`) | 108.6 ms | 120.9 ms | 125.0 ms | 50 × 200 |

(Sin contar la primera petición, que fue de 352 ms vía Node y 198 ms directa; con ella: media 119.3 / 110.4 ms.) La capa de Node
(JWT + rate limit + reenvío) añade ≈ 6 ms de media. `RATE_LIMIT_IA` se subió a 1000 **solo en el proceso de Node de la prueba** (variable
de entorno de ese proceso); `backend/.env` no se tocó y sigue en 60. Es una prueba secuencial en una máquina de desarrollo con 38
productos, no una prueba de concurrencia. Detalle: `python-ml/resultados_carga_busqueda.txt`.

## 4. Seguridad (`python-ml/resultados_seguridad.txt`)
- **Prompt del chat, sin gastar Gemini** (`test_seguridad_prompt.py`, 10 pruebas). Encontré y corregí dos debilidades reales del
  bloque RAG: (a) los **productos** recuperados no iban marcados como "solo referencia" (los recuerdos sí); (b) un **recuerdo** con saltos de
  línea o comillas podía fabricar líneas/roles dentro del prompt y romper su comillado. Ahora ambos bloques están marcados y el texto recuperado
  se aplana a una línea y se le sustituyen las comillas. Solo toca el bloque RAG: sin RAG, el prompt es idéntico al de la Opción 1.
- **En vivo:** 16/16 comprobaciones — 401 sin token y 403 con rol cliente en todas las rutas del panel y en el pronóstico; FastAPI 401 sin
  `X-IA-Token` o con uno incorrecto; CORS: el origen configurado se acepta, el ajeno no se refleja (ni `*`), `X-IA-Token` no es cabecera
  permitida desde el navegador, FastAPI no tiene CORS; rate limiting: 5 × 200 y luego 429, y es por usuario.
- **No verificado:** si Gemini *obedece* una orden inyectada ("ignora tus instrucciones…"); eso exige llamadas reales. El prompt base de la
  Opción 1 no incluye una regla de "no reveles estas instrucciones"; añadirla cambia la lógica de la Opción 1, así que queda como recomendación.

## 5. Pruebas
| Suite | Total |
|---|---:|
| Python (`unittest discover`, con la BD real levantada) | **70** (test_rag 15, test_estado 16, test_pronostico 13, test_tareas 10, test_seguridad_prompt 10, test_openapi 6) |
| Node (`npm test`) | **11** |
| **Total** | **81, todas pasan** |

Arreglo de pruebas: los módulos compartían `main` con un pool de BD simulado y `test_rag` (que usa la BD real) fallaba al ejecutarse todo junto;
`python-ia/_importar_main.py` usa ahora el pool real y solo simula si la BD no responde.

## 7. Revisión previa al push (historial de la rama, 99 commits; 42 nuevos respecto de `origin/main`)
- **Archivos `.env` o de claves en cualquier commit:** ninguno. Solo hay tres `.env.example` (sin valores secretos).
- **Patrones de claves** (Gemini `AIza…`, `sk-…`, tokens de GitHub, AWS, claves privadas, URLs `postgres://usuario:clave@`): 0 coincidencias.
- **Valores reales de tus `.env`** buscados en todo el historial: `API_GEMINI_KEY`, `JWT_SECRET` e `IA_SERVICE_TOKEN` → **0 commits**.
- **⚠ Contraseña de la BD (`DB_PASSWORD` / `POSTGRES_PASSWORD`): es trivial (9 dígitos) y SÍ está en el historial, pero ya en `origin/main`**, no en
  los 42 commits nuevos: en `backend/config/db.js` (commits antiguos `e2db9d6`, `f0277d0`) y escrita en `AUDITORIA_OPCION_1_MENAJE.md` y
  `INFORME_APLICACION_BLOQUE_A.md` (commit `f4ffa4b`). Subir la rama no la expone más de lo que ya está. Otros 5 aciertos de esa búsqueda
  son falsos positivos (la cadena `0123456789` dentro de mis tokens de prueba). Recomendación: cambiar esa contraseña en la BD y en los
  `.env`, y si el repositorio es público, tratarla como comprometida (reescribir el historial solo si realmente importa; no lo hice).
- **Tamaño:** el mayor archivo nuevo es el CSV sintético (122 KB); nada se acerca a 5 MB. `mlflow.db`, `mlruns/` y `__pycache__` están ignorados.
- **Árbol de trabajo (no se incluyó en ningún commit):** `python-ml/modelos/pronostico/meta.json` modificado (solo cambia el `run_id` de MLflow tras un
  reentrenamiento hecho desde el panel), `INFORME_SEGUIMIENTO_D2_D3_DETECCION_EVENTO.md` sin seguir, y los archivos de auditoría borrados.

### Comando para subir la rama (NO ejecutado)
```bash
git push -u origin feat/opcion2-fase0
```
