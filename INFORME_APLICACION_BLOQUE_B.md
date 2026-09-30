# Informe de aplicación — Bloque B de `AUDITORIA_OPCION_1_MENAJE.md`

- **Fecha:** 2026-09-27
- **Punto de partida:** commit `bddc56b` + el Bloque A ya aplicado (ver `INFORME_APLICACION_BLOQUE_A.md`).
- **Alcance ejecutado:** el Paso 0 (CAL-03 parcial) y los 10 hallazgos del **Bloque B — Siguiente iteración** (B1 → B10), más la ejecución real de la migración `002` contra la base de datos y la verificación completa del Paso 2.
- **Fuera del alcance ejecutado:** nada más de los bloques C ni D. Comprobado hallazgo por hallazgo (§6).
- **Restricción de OPCIÓN 1:** respetada. Todo es escapado de salida, acotado de cadenas, manejo de errores, política de rate limit y una restricción de integridad en PostgreSQL. **Ni entrenamiento, ni redes neuronales, ni embeddings, ni base de datos vectorial.** Lo que habría requerido OPCIÓN 2 está en §8.
- **Nada se ha commiteado.** Todos los cambios de código siguen en el working tree.

---

## ⚠️ Léelo primero: el código del Bloque B ya estaba aplicado cuando empecé

Esto es lo más importante del informe, así que va arriba.

**Cuando abrí esta sesión, los cambios de código de los 10 hallazgos del Bloque B y
del Paso 0 ya estaban en el working tree.** No los escribí yo en esta sesión. Lo sé
con certeza porque el propio `INFORME_APLICACION_BLOQUE_A.md` (§5, tabla final)
verificó explícitamente que al terminar el Bloque A **ninguno** de ellos estaba
aplicado — `rateLimitIA.js` sin cambios, `MAX_PRODUCTOS_PROMPT` con 0 apariciones,
`obtener_contexto` sin tocar, sin migración `002`, etc. — y hoy están todos ahí.
Entre ese informe y esta sesión hubo, por tanto, una pasada que aplicó el código y
**no dejó informe ni ejecutó la verificación**.

Lo que hice en consecuencia, en vez de reaplicar nada a ciegas:

1. **Verifiqué los 10 hallazgos línea por línea contra el texto de la auditoría.**
   Resultado: son fieles a lo que propone el documento, incluido el orden de
   composición en `recommendationcards.js` (B1 → B4 → B10) y las dependencias
   (B3 dentro de B2; B6 dentro de B5). Detalle en §3.
2. **Comprobé que los dos `.env.example` son idénticos, línea a línea, a los
   bloques `dotenv` de la sección CAL-03** de la auditoría (comparación automática,
   §4).
3. **Ejecuté lo único del Bloque B que faltaba de verdad: la migración `002`.**
   Existía como archivo, pero **no se había ejecutado nunca contra la base de
   datos** (`estado` seguía siendo `NULL`-able y sin `CHECK`). Con copia previa.
4. **Ejecuté la verificación completa del Paso 2** (§5), que era lo que faltaba
   para poder dar algo por bueno.

**No modifiqué ningún archivo de código fuente en esta sesión.** Los únicos cambios
que introduje son: la migración aplicada en PostgreSQL, este informe, y una copia
de seguridad en `database/backups/` (que está en `.gitignore`).

Si esperabas que el diff del Bloque B llevara mi firma, no la lleva: lleva la de esa
pasada anterior. Lo que sí es mío es la garantía de que ese diff hace lo que la
auditoría pide, y la prueba de que funciona.

## Lo que necesita tu intervención

| | Asunto | Por qué te toca a ti |
|---|---|---|
| 1 | **Rotar `API_GEMINI_KEY`** | Sigue pendiente de ti, igual que en el Bloque A. Nada de este bloque lo cambia. |
| 2 | **PostgreSQL no estaba arrancado y el servicio no se puede iniciar sin permisos de administrador** | Lo levanté con `pg_ctl` para poder verificar, así que **ahora mismo corre fuera del gestor de servicios de Windows**. Detalle y arreglo en §7.1. |
| 3 | **Revisa el `.env.example` con tus ojos antes de commitear** | CAL-03 está marcada en la auditoría como «revisión humana obligatoria» porque un nombre mal escrito impide el arranque. Yo lo verifiqué arrancando un clon limpio (§5.1), pero la revisión humana sigue siendo tu turno. |
| 4 | **Abrir `catalogo.html` en un navegador real** | Igual que en el Bloque A: mis pruebas de B1/B4/B10 validan la lógica y el HTML generado, no el renderizado ni el CSS. |

---

## 1. Resumen

**Paso 0 + 10 de 10 hallazgos aplicados y verificados.** La verificación del Paso 2
**pasa completa**: 5 de 5 comprobaciones que pediste, más 6 adicionales.

| Hallazgo | Estado | Aplicado tal cual |
|---|---|---|
| Paso 0 — CAL-03 (solo `.env.example` + `.gitignore`) | ✅ Aplicado | Sí, idéntico al documento |
| B1 — SEC-06, escapar HTML en las tarjetas | ✅ Aplicado | Sí, reutilizando el `escaparHTML` de A9 |
| B2 — SEC-07, rate limit por usuario + `parseInt` | ✅ Aplicado | Sí, con un añadido necesario (§3.2) |
| B3 — CAL-08, eliminar el `skip` inalcanzable | ✅ Aplicado | Sí, dentro de B2 como indica el informe |
| B4 — BUG-02, acotar el catálogo del prompt | ✅ Aplicado | Sí, en los 3 archivos |
| B5 — BUG-07, no degradar en silencio ante fallo de BD | ✅ Aplicado | Sí |
| B6 — SEC-04, no distinguir usuario existente | ✅ Aplicado | Sí, dentro de B5 |
| B7 — BUG-04, registrar el estado real | ✅ Aplicado | Sí. **La migración la ejecuté yo en esta sesión** |
| B8 — SEC-05, quitar el CORS del microservicio | ✅ Aplicado | Sí |
| B9 — SEC-09, autenticar health y ocultar el modelo | ✅ Aplicado | Sí |
| B10 — BUG-09, topar cantidades al stock | ✅ Aplicado | Sí |

**Lo que más importa de este bloque, en una línea cada cosa:**

- **B1** cierra el XSS almacenado: probado con `<script>`, `<img onerror>` y
  `<svg onload>` en el nombre, la descripción y el `motivo` del modelo. Ninguno
  llega a formar una etiqueta.
- **B7** cierra el agujero de medición que el Bloque A dejó abierto a propósito:
  `conversaciones_ia` ahora tiene **`completada` y `error` conviviendo** (30 y 1).
  Antes solo existía `completada`, y no se podía distinguir «no hubo fallos» de
  «no se miden los fallos».
- **B4** es el que tenía más riesgo de salir mal y **no salió mal**:
  `resolverContraCatalogo` sigue recibiendo el catálogo **completo**. Lo probé con
  un catálogo de 60 productos y sugerencias que el recorte deja fuera (§5.4).

**Archivos con cambios (7 modificados + 2 nuevos):**

```
.gitignore                                        |   4 +    Paso 0
backend/.env.example                              |  13 +-   Paso 0
backend/controllers/productosController.js        |  12 +-   B4, B1 (defensa en profundidad)
backend/frontend/assets/js/recommendationcards.js | 277 ++-  B1, B4, B10
backend/middleware/rateLimitIA.js                 |  33 +-   B2, B3
backend/routes/index.js                           |  10 +-   B4, B9
python-ia/main.py                                 | 153 +-   B5, B6, B7, B8, B9
python-ia/.env.example                            | nuevo    Paso 0
database/migrations/002_..._estado_check.sql       | nuevo    B7
```

---

## 2. Paso 0 — CAL-03, solo la parte urgente

**Verificado que está exactamente como manda la auditoría.** Comparé automáticamente
los dos archivos con los bloques `dotenv` de la sección CAL-03 del documento:

```
backend/.env.example       IDENTICO al bloque de la auditoria  (22 lineas)
python-ia/.env.example     IDENTICO al bloque de la auditoria  (18 lineas)
```

Y la excepción del `.gitignore`:

```gitignore
# Los .env.example SI se versionan (la regla *.env de arriba no los
# cubre, porque no terminan en .env, pero conviene ser explicito).
!*.env.example
```

Comprobado que funciona: `git ls-files -co --exclude-standard` **sí** lista los dos
`.env.example` y **no** lista ningún `.env` real.

**Respetado lo que pediste:** `backend/.env` y `python-ia/.env` (los reales) **no se
han tocado en esta sesión**, y el resto de CAL-03 (la reescritura de los `.env`
reales, los comentarios de duplicación de credenciales) **no se ha aplicado**: eso
queda para el bloque C completo.

Esto resuelve el punto 2 de «lo que necesita tu intervención» del informe anterior:
**un clon nuevo ya arranca.** Probado de verdad, no deducido (§5.1).

---

## 3. Los 10 hallazgos, verificados uno a uno

### B1 — SEC-06: escapar el HTML de las tarjetas
`recommendationcards.js:512-583`. Usa el helper `escaparHTML` **que ya existía desde
A9**, como pediste: no hay un segundo helper duplicado (comprobado: una sola
definición en el archivo, `:439`). Se escapan `nombre`, `tier` y `descripcion` (que
es donde cae el `motivo` que genera el modelo), y la imagen pasa por
`urlImagenSegura` (`:452`), que solo admite `http(s)://` o rutas relativas del propio
sitio. La tabla del resumen (`:643`) también escapa el nombre, que es el otro punto
que señala SEC-06.

Además está aplicada la **defensa en profundidad** que SEC-06 marca como
«recomendado, no imprescindible»: `productosController.js:44-50` rechaza `<` y `>`
en nombre y descripción, y exige `http(s)://` en `foto_url`.

### B2 — SEC-07: rate limit por usuario, y `RATE_LIMIT_IA` como entero
`rateLimitIA.js` completo. La clave del limitador es **`req.usuario.id`**:

```javascript
keyGenerator: (req) => (
    req.usuario?.id ? `u:${req.usuario.id}` : `ip:${ipKeyGenerator(req.ip)}`
),
```

`autenticar` va antes en `routes/index.js:61`, así que `req.usuario` está poblado; el
camino de IP es solo una red de seguridad. `limit: LIMITE_IA` es siempre un entero
(`Number.parseInt` + validación), y `standardHeaders: 'draft-7'` expone
`RateLimit`/`Retry-After`, que es lo que UX-03 necesitará. Verificado con dos
usuarios reales desde la misma red (§5.2).

### B3 — CAL-08: el `skip` inalcanzable
Eliminado dentro de B2, como indica el informe. **No se aplicó por separado.**

### B4 — BUG-02: acotar el catálogo del prompt
Los tres sitios que pide la auditoría:
- `recommendationcards.js:199-226` — `acotarCatalogoParaPrompt`, reparto round-robin
  por categoría, y `RecommendationCards.MAX_PRODUCTOS_PROMPT = 40` (`:797`).
- `routes/index.js:64-73` — `MENSAJE_IA_MAX_CHARS` con 8000 por defecto, en lugar del
  6000 cableado.
- `productosController.js:26-28` — `LIMIT 500` de seguridad en el catálogo.

Y lo crítico: en `:237` **solo el prompt** recibe el recorte; la llamada de `:145` es
`this.resolverContraCatalogo(items, catalogo)`, con el catálogo **completo**.
Verificado ejecutando, no leyendo (§5.4).

### B5 + B6 — BUG-07 y SEC-04: `obtener_contexto`
Aplicadas juntas sobre la misma función, como pediste. `main.py:144-215`:
- **B5:** el `except psycopg2.Error` ya no se traga el fallo; loguea y lanza
  `HTTPException(503)`. Antes devolvía un contexto vacío y el modelo le afirmaba al
  cliente que no había stock.
- **B6:** el usuario inexistente ya no produce 404; se registra en el log y se
  continúa con contexto anónimo (`construir_system_prompt` ya lo tolera).

### B7 — BUG-04: el estado real en `conversaciones_ia`
- `main.py:258-292` — `guardar_conversacion` acepta `estado` (por defecto
  `"completada"`), lo inserta en la columna, y sigue sin propagar excepciones.
- `main.py:376-380` — la rama de fallo de Gemini **ya llama** a
  `guardar_conversacion(..., estado="error")`. Estas son **las tres líneas que el
  Bloque A omitió a propósito** (§3.2 de aquel informe): ya están.
- `database/migrations/002_conversaciones_ia_estado_check.sql` — **la ejecuté yo en
  esta sesión** (§4).

### B8 — SEC-05: sin CORS en el microservicio
`main.py:95-110`. El `add_middleware(CORSMiddleware, ...)` está eliminado, el import
también (`main.py:25` solo trae `Depends, FastAPI, Header, HTTPException`), y queda
el comentario que explica por qué y cómo reactivarlo condicionado a `IA_ENV` si
alguna vez hiciera falta depurar desde el navegador. Comprobado que nadie dependía
de él: ningún archivo del frontend apunta al puerto 8000 (el único cliente es
`iaService.js`), y las respuestas ya no llevan cabeceras `Access-Control-*` (§5.5).

### B9 — SEC-09: health autenticado y sin modelo
`routes/index.js:106` — `router.get('/ia/health', autenticar, ...)`.
`main.py:316-322` — `GET /health` devuelve solo `status` y `timestamp`; el modelo ya
no viaja. `verificarIA()` solo lee `status`, así que no rompe nada: comprobado que
`/api/ia/health` autenticado sigue devolviendo `ia_disponible: true` (§5.5).

### B10 — BUG-09: topar cantidades al stock
`recommendationcards.js:377-397` (el tope y los campos `cantidadSugerida` /
`limitadoPorStock`), `:545-550` (el aviso «(ajustado al stock)» con el título
explicativo), `:648` (el `max` del input) y `:672-687` (`updateQuantity` también
topa, y avisa). Verificado el caso límite que pide la auditoría —evento grande con
producto de poco stock— en §5.6.

---

## 4. La migración 002: lo único que faltaba por ejecutar

**Estado que encontré:**

```
notnull=false
check=(ninguno)
idx=conversaciones_ia_pkey, idx_conversaciones_usuario, idx_conversaciones_timestamp
estado: completada|27
```

O sea: el archivo de migración existía, pero la base de datos **no la había visto
nunca**. Sin ella, la columna `estado` seguía admitiendo `NULL` y cualquier cadena.

**Lo que hice, en el orden que pediste:**

1. **Copia de seguridad primero**, antes de tocar nada:
   `database/backups/backup_pre_002_20260927_214346.sql` (87 449 bytes, `pg_dump`
   completo de `menajeDB`). El directorio está en `.gitignore`, así que la copia no
   se commitea.
2. **Ejecuté la migración completa**, incluido su `UPDATE` de normalización previo al
   `ALTER`, con `ON_ERROR_STOP=1`:

```
UPDATE 0
ALTER TABLE
CREATE INDEX
```

`UPDATE 0` significa que no había ninguna fila fuera de dominio que normalizar (las
27 eran `completada`, ninguna `NULL`). El `UPDATE` era la red de seguridad que pedías
y no hizo falta, pero se ejecutó igual: si hubiera habido filas raras, el `ALTER`
habría fallado sin él.

3. **Verifiqué el resultado:**

```
notnull=true
check=CHECK (estado IN ('completada','error'))
idx=idx_conversaciones_estado
```

4. **Probé que las restricciones muerden de verdad**, no solo que existen:

```
INSERT ... estado='pendiente'  -> ERROR: viola la restricción «conversaciones_ia_estado_check»
INSERT ... estado=NULL         -> ERROR: viola la restricción «not-null»
```

---

## 5. Verificación del Paso 2

Ejecutada con PostgreSQL `menajeDB` (38 productos activos), FastAPI en
`127.0.0.1:8000` y Node en `:3000`.

```
5.1  clon limpio arranca con solo copiar .env.example      OK
5.2  B2/SEC-07: rate limit por usuario, no por IP          OK
5.3  B7: fallo real de Gemini deja fila estado='error'     OK
5.4  B4/BUG-02: catalogo COMPLETO a resolverContraCatalogo OK
5.5  B1/SEC-06: HTML de producto se muestra literal        OK
--- adicionales ---
5.6  B10: tope de stock, incluido el caso limite           OK
5.7  B5/BUG-07: BD caida -> 503, no un 200 con mentiras    OK
5.8  B6/SEC-04: usuario inexistente -> 200, no 404         OK
5.9  B8/SEC-05: sin cabeceras CORS                         OK
5.10 B9/SEC-09: health autenticado y sin modelo            OK
5.11 A6 (regresion): /docs, /redoc, /openapi.json -> 404   OK
```

### 5.1 Un clon limpio arranca copiando solo los `.env.example`

Como los cambios no están commiteados, un `git clone` no los traería. Reproduje el
clon con **exactamente el conjunto de archivos que tendría un clon si esto se
commiteara**: `git ls-files -co --exclude-standard` → 57 archivos, cero `.env`
reales, los dos `.env.example` presentes. Dependencias aparte (`node_modules` y el
venv no van en el repo; en un clon real se instalan con `npm install` y
`pip install -r requirements.txt`).

Luego, **copiando `.env.example` → `.env` y rellenando solo valores propios**
(contraseña de PostgreSQL, nombre real de la base de datos, `JWT_SECRET`, clave de
Gemini, y un `IA_SERVICE_TOKEN` **nuevo** generado con el comando que el propio
`.env.example` documenta). Comprobado que no añadí ni quité ninguna clave:

```
[backend]    misma estructura de claves, sin añadir ni quitar ninguna
[python-ia]  misma estructura de claves, sin añadir ni quitar ninguna
```

Resultado:

```
FastAPI del clon:  Application startup complete. Uvicorn running on http://127.0.0.1:8000
Node del clon:     Servidor corriendo en http://localhost:3000 / Conectado a PostgreSQL
chat end-to-end en el clon (Node -> FastAPI -> Gemini): HTTP 200, respuesta real
/api/ia/health autenticado en el clon:  {"success":true,"ia_disponible":true}
/docs en el clon:  404
el IA_SERVICE_TOKEN del clon es distinto al de esta maquina:  OK
```

Es decir: **los dos servicios arrancan y se hablan entre sí con un token generado de
cero**, que era justo lo que el `.env.example` roto del Bloque A hacía imposible.

**Y comprobé también el modo de fallo**, porque el `.env.example` trae
`IA_SERVICE_TOKEN=` vacío a propósito. Si alguien no lo rellena, no obtiene un
misterio, obtiene una instrucción:

```
FastAPI: RuntimeError: ❌ IA_SERVICE_TOKEN no está configurada (o es demasiado corta)
         en el archivo .env. Debe tener el mismo valor que la de backend/.env.
         Genera una con: python -c "import secrets; print(secrets.token_hex(32))"
Node:    Error: Falta la variable de entorno IA_SERVICE_TOKEN
         (debe coincidir con la de python-ia/.env)
```

El clon se borró al terminar, porque su `.env` contenía secretos reales.

### 5.2 B2/SEC-07 — el rate limit es por usuario, no por IP

Pediste dos usuarios distintos desde la misma red. Los tuve: `cliente.demo@menaje.com`
(id 2) y `maria.torres@menaje.com` (id 3), ambos desde `127.0.0.1`.

Agoté la cuota del usuario 2 (7 peticiones, límite 5):

```
req 1 -> RateLimit: limit=5, remaining=4
req 2 -> RateLimit: limit=5, remaining=3
req 3 -> RateLimit: limit=5, remaining=2
req 4 -> RateLimit: limit=5, remaining=1
req 5 -> RateLimit: limit=5, remaining=0
req 6 -> RateLimit: limit=5, remaining=0   (bloqueada)
req 7 -> RateLimit: limit=5, remaining=0   (bloqueada)

usuario id=2 -> HTTP 429  {"error":"Demasiadas solicitudes. Intenta de nuevo en 1 minuto."}
              Retry-After: 43
```

Y **acto seguido, desde la misma IP**, el usuario 3:

```
usuario id=3 -> HTTP 400  {"error":"El campo \"mensaje\" es requerido y debe ser texto"}
              RateLimit: limit=5, remaining=4
```

El usuario 3 arranca con su cuota intacta (`remaining=4`) mientras el 2 está
bloqueado. **Con el limitador por IP anterior, el 3 habría recibido 429 sin haber
hecho ninguna petición.** Eso es exactamente el escenario del NAT compartido que
describe SEC-07.

Y la otra mitad de B2, el `parseInt`, probada con seis valores:

```
RATE_LIMIT_IA="5"    -> limit=5 (number)
RATE_LIMIT_IA="abc"  -> limit=5 (number)  + aviso en consola
RATE_LIMIT_IA="0"    -> limit=5 (number)  + aviso en consola
RATE_LIMIT_IA="-3"   -> limit=5 (number)  + aviso en consola
RATE_LIMIT_IA="7.9"  -> limit=7 (number)
RATE_LIMIT_IA=""     -> limit=5 (number)
```

Siempre un entero, nunca la cadena que pasaba antes. (Sobre el `7.9`, ver §7.3.)

### 5.3 B7 — un fallo real de Gemini deja una fila `estado='error'`

Reproduje el fallo igual que en A7: arrancando el microservicio con
`API_GEMINI_KEY` inválida **por variable de entorno**, sin tocar el `.env`
(`load_dotenv()` no sobreescribe el entorno).

**Antes del fallo:** `completada|27`, sin ninguna fila `error`.

**Lo que ve el cliente:**
```json
{"success":false,"error":"El asistente no está disponible en este momento. Intenta de nuevo en unos minutos."}
```

**Lo que queda en la base de datos — esto es lo nuevo:**
```
id=2722405c-…  usuario_id=3  estado=error  tokens=0
mensaje="que copas me recomiendas para una boda de 100"
respuesta_ia="[error ee33db4c5b50]"
```

**Y la trazabilidad completa con un solo identificador:**
```
FastAPI: [ee33db4c5b50] Error llamando a Gemini API (usuario_id=3, modelo=gemini-3.6-flash):
         InvalidArgument('API key not valid. Please pass a valid API key.')
FastAPI: 💾 Conversación guardada (estado=error) para usuario_id=3
Node:    ❌ Error 502 del servicio IA: { detail: 'El asistente no esta disponible
         en este momento (ref: ee33db4c5b50)' }
BD:      respuesta_ia = '[error ee33db4c5b50]'
```

El mismo `error_id` correlaciona los dos logs **y la fila de la base de datos**. En
el Bloque A esto solo llegaba a los logs. Tras restaurar la clave real, un chat
normal volvió a registrar `completada`, así que ambos estados conviven:

```
estados finales:  completada|30   error|1
```

Esto cierra el §6.3 del informe anterior: ya se puede distinguir «no hubo fallos» de
«no se miden los fallos», y `SELECT estado, COUNT(*) ... GROUP BY estado` (con el
índice nuevo) responde de verdad.

### 5.4 B4/BUG-02 — `resolverContraCatalogo` sigue recibiendo el catálogo COMPLETO

Este es el error que señalabas como el más fácil de cometer, así que no me fié de
leer el código: lo probé cargando el `recommendationcards.js` real en Node con un
DOM mínimo, un catálogo sintético de **60 productos en 4 categorías**, y un Gemini
simulado que elige **a propósito 3 productos que el recorte deja fuera del prompt**.

```
=== B4 / BUG-02 : el prompt se acota; resolverContraCatalogo recibe el catalogo COMPLETO ===
  OK   acotarCatalogoParaPrompt(60 productos) devuelve 40
  OK   las 4 categorias siguen representadas en el recorte (4)
  OK   20 productos reales quedan FUERA del prompt
  OK   el prompt enviado lista 40 productos, no 60
  OK   el prompt (3359 chars) cabe en MENSAJE_IA_MAX_CHARS=8000
  OK   "Producto Sintetico 01" NO estaba en el prompt
  OK   "Producto Sintetico 02" NO estaba en el prompt
  OK   "Producto Sintetico 03" NO estaba en el prompt
  OK   las 3 sugerencias fuera del recorte SE RESUELVEN igualmente (resueltas: 3)
       -> resolverContraCatalogo recibe el catalogo completo
  OK   ninguna se descarto como inventada (descartadas: 0)
  OK   id/nombre de cada recomendacion provienen del catalogo real
```

La línea que importa es la penúltima: **los 3 productos que no entraron en el prompt
se resuelven igualmente**. Si `resolverContraCatalogo` recibiera el recorte, se
habrían descartado como «inventados por el modelo» y el usuario habría visto el grid
vacío de UX-01 — que es la forma peor de reintroducir BUG-03, exactamente como
advertías. No pasa.

De paso quedan medidos los dos números que BUG-02 usaba como justificación: 3 359
caracteres de prompt con 60 productos, contra los 6 000 del límite viejo que se
habría superado.

### 5.5 B1/SEC-06 — el HTML de un producto se muestra como texto, no se ejecuta

Simulé lo que pedías: una respuesta de Gemini que trae HTML y `<script>` en el
producto. Concretamente, tres payloads en los tres orígenes distintos que SEC-06
identifica como no confiables:

| Origen | Payload |
|---|---|
| `nombre` del producto (lo escribe un trabajador) | `<script>alert("xss-nombre")</script>` |
| `descripcion` del producto (inventario) | `"><img src=x onerror=alert("xss-img")>` |
| `motivo` (**lo genera el modelo**) | `<svg/onload=alert("xss-motivo")>` |
| `foto_url` (inventario) | `javascript:alert("xss-url")` |

```
=== B1 / SEC-06 : HTML de Gemini y del inventario se muestra como texto literal ===
  OK   la recomendacion maliciosa se resolvio (el producto existe en el catalogo)
  OK   el HTML de la tarjeta no contiene <script
  OK   el nombre aparece escapado como texto literal
  OK   el payload <img src=x no genera etiqueta
  OK   el motivo del modelo aparece escapado
  OK   el payload <svg/onload= del modelo no genera etiqueta
  OK   solo una etiqueta real lleva manejador de evento, y es el onerror estatico
       de la plantilla (etiquetas con manejador: 1)
  OK   ninguna etiqueta real contiene javascript:
  OK   no queda ningun < sin escapar en el texto: los payloads son texto inerte
  OK   la foto_url javascript: no llega al src
  OK   la foto_url insegura cae al logo por defecto
  OK   ninguna etiqueta fuera de la plantilla (intrusas: [])
  OK   la tabla del resumen tambien escapa el nombre
```

En el HTML generado, el payload aparece así —texto, no marcado—:

```html
<h3>Copa Maliciosa &lt;script&gt;alert(&quot;xss-nombre&quot;)&lt;/script&gt;</h3>
```

La comprobación fuerte es la de las etiquetas: extraje **todas** las etiquetas reales
del HTML generado y confirmé que (a) no hay ninguna fuera de las de la plantilla,
(b) solo una lleva manejador de evento y es el `onerror="this.src='/assets/img/logo.png'"`
estático, y (c) no queda ningún `<` sin escapar en el texto. Una cadena como
`onerror=` puede seguir **apareciendo** dentro del texto escapado, y eso es inofensivo:
lo que importa es que no forme parte de ninguna etiqueta. No la forma.

`urlImagenSegura` probada aparte con los cinco casos que importan:

```
javascript:alert(1)                      -> /assets/img/logo.png
data:text/html,<script>alert(1)</script> -> /assets/img/logo.png
//evil.com/x.png                         -> /assets/img/logo.png
https://example.com/ok.png               -> https://example.com/ok.png
/uploads/ok.png                          -> /uploads/ok.png
```

### 5.6 B10 — el tope de stock, incluido el caso límite

La auditoría pide verificar el evento grande con producto de poco stock. Probado con
la IA pidiendo **500 unidades** de productos con stock 1, 2 y 3:

```
"Producto Sintetico 01": IA pidio 500, se muestra 1 <= stock 1  | limitadoPorStock | subtotal recalculado
"Producto Sintetico 02": IA pidio 500, se muestra 2 <= stock 2  | limitadoPorStock | subtotal recalculado
"Producto Sintetico 03": IA pidio 500, se muestra 3 <= stock 3  | limitadoPorStock | subtotal recalculado
updateQuantity(999) con stock 1 -> queda en 1
```

El `subtotal` se recalcula con la cantidad topada, no con la sugerida: si no, el
cliente vería un precio que no corresponde a lo que puede alquilar.

### 5.7 B5/BUG-07 — con la base de datos caída, 503 honesto

Apagué PostgreSQL a propósito, como exige la auditoría.

**Microservicio directo:**
```
POST :8000/chat -> HTTP 503
{"detail":"El asistente no puede consultar el catalogo en este momento"}

log: Error de PostgreSQL obteniendo contexto (usuario_id=3):
     OperationalError('connection to server at "localhost" … Connection refused')
```

**Lo que ve el cliente (vía Node):**
```
HTTP 500
{"success":false,"error":"El asistente no está disponible en este momento. Intenta de nuevo en unos minutos."}
log Node: ❌ Error 503 del servicio IA
```

Lo importante: **el asistente ya no responde con información inventada**. Antes de
B5, esta misma situación daba un `200` con el prompt diciéndole al modelo que no
había stock, y el modelo se lo afirmaba al cliente como un hecho. Sobre el 503 que
llega al cliente como 500, ver §7.2.

### 5.8 B6/SEC-04 — el usuario inexistente no se distingue

```
POST :8000/chat con usuario_id=999999 -> HTTP 200
respuesta: "¡Hola! Bienvenido a Menaje. Actualmente contamos con las siguientes
            copas disponibles para tu evento: * Copa Margarita Cristal: S/ 1.40 …"
log: Contexto sin usuario: usuario_id=999999 no existe en BD
```

200 con contexto anónimo y catálogo real, en vez del `404 "Usuario no encontrado"`
que permitía enumerar cuentas. El hecho queda en el log del servidor, donde debe
estar.

### 5.9 y 5.10 B8 y B9 — CORS, health

```
=== B8 / SEC-05 ===
OPTIONS /chat (preflight de navegador)  -> HTTP 405
cabeceras Access-Control-* en respuestas -> 0

=== B9 / SEC-09 ===
GET :8000/health              -> {"status":"ok","timestamp":"…"}   (sin "model")
GET :3000/api/ia/health SIN token -> HTTP 401 {"error":"Token no proporcionado"}
GET :3000/api/ia/health CON token -> HTTP 200 {"success":true,"ia_disponible":true}
```

Sobre el riesgo que la auditoría señala en B9 («si alguna monitorización externa
sondea `/api/ia/health` sin token, este cambio la rompe»): busqué y **no existe
ninguna** en el repositorio. El único consumidor de `/api/ia/health` es
`verificarIA()` en `iaService.js`, que ya manda el token desde A10, y sigue
devolviendo `true`.

### 5.11 Sin regresiones del Bloque A

```
/docs -> 404    /redoc -> 404    /openapi.json -> 404
FastAPI escuchando en 127.0.0.1:8000 (no 0.0.0.0)
POST /api/ia/chat autenticado -> HTTP 200 en 4.5 s
GET /api/productos/catalogo   -> 38 productos reales
```

---

## 6. Nada de los bloques C ni D se aplicó

Comprobado sobre el árbol final, hallazgo por hallazgo:

| Hallazgo | Comprobación | Resultado |
|---|---|---|
| C1 / CAL-01 — pool de conexiones | `grep pool python-ia/main.py` | 0 apariciones ✔ sin aplicar |
| C3 / CAL-02 — `httpx` sin usar | `grep httpx requirements.txt` | sigue pinado ✔ sin aplicar |
| C5 / CAL-03 — resto de la consolidación | `.env` reales | sin reescribir ✔ solo el Paso 0 |
| CAL-04 — validar el modelo al arrancar | `grep list_models` | 0 apariciones ✔ sin aplicar |
| CAL-05 — `getJWT()` duplicado | 2 archivos | sigue duplicado ✔ sin aplicar |
| CAL-06 — `logging` en vez de `print` | `grep logging` | 0 apariciones ✔ sin aplicar |
| CAL-07 — código muerto | `playNotificationSound` | sigue ahí ✔ sin aplicar |
| C2 / CAL-09 — `usuario_id` en el cuerpo | `chatwidget.js` | sigue enviándose ✔ sin aplicar |
| UX-02 — números de un dígito y en palabras | `ia-integration.js` | sin aplicar ✔ |
| UX-03 — cuánto esperar con el rate limit | `chatwidget.js` | sin aplicar ✔ (B2 solo **habilita** las cabeceras que necesitará) |
| UX-04 — progreso, cancelar, doble clic | `AbortController` | 0 apariciones ✔ sin aplicar |
| UX-05 — conversación al recargar | `sessionStorage` | 0 apariciones ✔ sin aplicar |

---

## 7. Pendiente y observaciones

### 7.1 PostgreSQL está corriendo fuera del gestor de servicios — conviene arreglarlo

El servicio `postgresql-x64-18` estaba **detenido** al empezar (arranque
`Automatic`, pero parado), y no pude iniciarlo: `Start-Service` y `net start`
devuelven **acceso denegado** porque esta sesión no tiene permisos de
administrador.

Para poder verificar, lo levanté directamente con `pg_ctl`:

```
pg_ctl start -D "C:\Program Files\PostgreSQL\18\data"
```

Funciona, pero **el proceso no está bajo el control del gestor de servicios**: no se
reiniciará solo, y `Start-Service` seguirá viendo el servicio como detenido. Cuando
puedas, en una consola **como administrador**:

```powershell
Stop-Process -Name postgres -Force      # o pg_ctl stop -D "C:\Program Files\PostgreSQL\18\data"
Start-Service postgresql-x64-18
```

No es un problema causado por este bloque, pero te lo señalo porque **si reinicias la
máquina antes de la presentación, la base de datos podría no arrancar sola** y los
dos servicios fallarían de formas distintas (Node con «Error conectando a
PostgreSQL», el asistente con el 503 nuevo de B5).

### 7.2 Node sigue traduciendo 502 y 503 a 500 para el cliente

Lo señalaba el §6.2 del informe anterior y **sigue igual**, ahora con un caso más:
el 503 de B5. `routes/index.js:81` tiene el `500` fijo, así que el cliente no puede
distinguir «el asistente está caído» de «la base de datos está caída» de «error
interno». El cuerpo del mensaje sí es el correcto y el usuario no ve el código, así
que no afecta a la experiencia.

**No lo toqué porque no es ninguno de los 10 hallazgos del Bloque B**, y me pediste
el bloque en el orden de la tabla. Ahora que B5 introduce un segundo código de
estado con significado propio, gana algo de valor: es un candidato claro para el
bloque C.

### 7.3 `RATE_LIMIT_IA=7.9` se convierte en 7 sin avisar

Detalle menor encontrado al probar B2. `Number.parseInt("7.9")` da `7`, que **es** un
entero positivo válido, así que la comprobación `LIMITE_IA !== limiteConfigurado` no
se cumple y no se emite el aviso. El comportamiento es razonable (truncar) y seguro
(nunca queda una cadena), pero un valor decimal en el `.env` se acepta en silencio.
No es un fallo del fix ni algo que la auditoría pida; lo anoto por si quieres que el
aviso cubra también ese caso.

### 7.4 Una conversación de un usuario inexistente no se registra en la BD

Observado durante 5.8: con `usuario_id=999999`, el chat responde 200 pero **no queda
fila** en `conversaciones_ia`, porque la clave ajena `usuario_id` la rechaza y
`guardar_conversacion` se traga la excepción a propósito (ese `except` es
deliberado: auditar no debe romper la respuesta).

Es coherente y no afecta al camino real —Node siempre sobrescribe el `usuario_id` con
el del JWT (`routes/index.js`), así que por la vía normal el usuario siempre existe—
pero significa que un fallo del microservicio invocado directamente con un id
inexistente no dejaría rastro en la tabla, solo en el log. Lo apunto para que la
próxima consulta de ratios no se lea como una garantía absoluta.

### 7.5 El caso `Champán`/`Champagne` sigue sin cubrir

Es lo que el §3.1 del informe del Bloque A dejó abierto como decisión tuya, y no
forma parte de ningún hallazgo del Bloque B, así que sigue igual. Dato nuevo, por si
ayuda a decidir: en las llamadas reales a Gemini de esta verificación, el modelo
escribió **«Copa Flauta Premium para Champagne», con el nombre exacto del catálogo**,
sin inventarse la variante castellanizada. La instrucción del prompt («usa
EXCLUSIVAMENTE estos nombres exactos») está funcionando en la práctica.

### 7.6 Las pruebas siguen sin vivir en el repositorio

Como en el Bloque A, las pruebas que escribí (la del catálogo de 60 productos y
B4/B10, y la batería de XSS de B1) están en el directorio temporal de la sesión y
**se perderán**. Son las más rentables del proyecto: lógica pura, sin red ni base de
datos, y cubren justo los dos hallazgos donde un cambio futuro puede reintroducir el
problema sin que nadie lo note —volver a pasar el catálogo acotado a
`resolverContraCatalogo`, o añadir un campo a la tarjeta sin escaparlo—. Si quieres,
las paso a `backend/tests/` con un `npm test`; es esfuerzo bajo y no toca código de
producción.

### 7.7 Estado en que te dejo las cosas

- PostgreSQL arrancado (con `pg_ctl`, ver §7.1), migración `002` aplicada.
- FastAPI en `127.0.0.1:8000` y Node en `:3000`, ambos con los archivos reales del
  repositorio y la clave de Gemini real.
- `conversaciones_ia`: 30 `completada` + 1 `error` (la fila de error es de mi prueba
  de 5.3; puedes borrarla si molesta:
  `DELETE FROM conversaciones_ia WHERE respuesta_ia = '[error ee33db4c5b50]';`).
- Copia de seguridad previa a la migración en
  `database/backups/backup_pre_002_20260927_214346.sql`.
- El clon de prueba se borró, porque su `.env` contenía secretos reales.

---

## 8. Fuera de alcance de OPCIÓN 1

Nada de este bloque necesitó salirse de OPCIÓN 1, y no encontré ningún hallazgo del
Bloque B que lo requiriera. Dos anotaciones que surgieron durante la verificación:

1. **Resolución semántica de nombres de producto** (el caso `Champán`/`Champagne`,
   §7.5). Sigue siendo lo que ya decía el informe del Bloque A: cubrirlo de forma
   general exigiría comparar significados —embeddings del catálogo y búsqueda por
   similitud vectorial, o un modelo de similitud entrenado—, que es **OPCIÓN 2**. No
   implementado. Las alternativas dentro de OPCIÓN 1 (tabla de sinónimos del dominio,
   cuarta pasada por solapamiento mayoritario, reforzar el prompt) siguen sobre la
   mesa como decisión de producto.

2. **Detección de contenido malicioso «por significado» en nombres de producto.**
   La defensa que aplica B1 es la correcta y suficiente: escapar en la salida, y
   rechazar `<`/`>` en la entrada. Alguien podría proponer «clasificar» descripciones
   sospechosas con un modelo. No haría falta y sería peor: un clasificador tiene
   falsos negativos, y el escapado no tiene ninguno. Lo anoto para dejarlo
   descartado explícitamente, no como pendiente.
