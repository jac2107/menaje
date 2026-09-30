# Informe de aplicación — Bloque A de `AUDITORIA_OPCION_1_MENAJE.md`

- **Fecha:** 2026-09-27
- **Punto de partida:** commit `bddc56b`, más el documento `AUDITORIA_OPCION_1_MENAJE.md` (sin commitear).
- **Alcance ejecutado:** los 10 hallazgos del **Bloque A — Antes de la presentación**, en orden A1 → A10.
- **Fuera del alcance ejecutado:** nada de los bloques B, C ni D. Verificado con comprobaciones explícitas (ver §5).
- **Restricción de OPCIÓN 1:** respetada. Todo el trabajo es configuración, validación de cadenas y manejo de errores contra la API de Gemini vía prompt. No se ha introducido entrenamiento de modelos, redes neuronales, embeddings ni base de datos vectorial. Lo que habría requerido OPCIÓN 2 está en §7.
- **Nada se ha commiteado.** Todos los cambios están en el working tree para que puedas revisarlos.

## ⚠️ Lo que necesita tu intervención (léelo primero)

| | Asunto | Por qué te toca a ti |
|---|---|---|
| 1 | **Rotar `API_GEMINI_KEY`** (A5) | Requiere revocar y generar la clave en Google AI Studio, fuera de mi alcance. La clave **actual sigue en uso y funcionando**; dejé un aviso visible en `python-ia/.env:9-12`. Detalle en §4. |
| 2 | **`backend/.env.example` quedó desactualizado y ahora rompe un clon nuevo** | Consecuencia directa de A10: `iaService.js:8-9` aborta el arranque si falta `IA_SERVICE_TOKEN`, y el `.env.example` no la menciona. Arreglarlo es **CAL-03 (C5)**, que me pediste no tocar. Detalle en §6. |
| 3 | **`IA_SERVICE_TOKEN` solo existe en esta máquina** | Los `.env` están en `.gitignore`, así que el secreto no viaja con el repo. Cualquier otro equipo o despliegue necesita generar el suyo y ponerlo **idéntico** en los dos archivos. |

---

## 1. Resumen

**10 de 10 hallazgos aplicados.** La verificación de salida del informe (6 pasos) **pasa completa**, y además ejecuté las dos comprobaciones específicas que el informe exige para A7 y A8.

| Hallazgo | Estado | Aplicado tal cual |
|---|---|---|
| A1 — BUG-05, URL cableada | ✅ Aplicado | Sí |
| A2 — BUG-01, doble inicialización | ✅ Aplicado | Sí |
| A3 — BUG-08, clase CSS inexistente | ✅ Aplicado | Sí |
| A4 — BUG-06, eliminar `GROQ_API_KEY` | ✅ Aplicado | Opción recomendada (eliminar) + texto del README ajustado |
| A5 — SEC-08, clave de Gemini | ⚠️ **Parcial** | Se sacó de `backend/.env`; **la rotación queda pendiente** |
| A6 — SEC-02, cerrar `/docs` | ✅ Aplicado | Sí |
| A7 — SEC-03, no filtrar errores | ✅ Aplicado | Sí, menos 3 líneas que el propio informe dice omitir |
| A8 — BUG-03, normalizar nombres | ✅ Aplicado | Sí. Resuelve **6 de los 7** casos de su tabla (antes: 0 de 7) |
| A9 — UX-01, estado vacío explicativo | ✅ Aplicado | Sí, incluyendo el helper `escaparHTML` que el informe autoriza |
| A10 — SEC-01, autenticar `POST /chat` | ✅ Aplicado | Sí, con dos ajustes de `.env` necesarios para que funcione |

**Verificación:** 6/6 pasos. **Un único punto por debajo de lo prometido:** A8 no cubre el caso `Champán` → `Champagne` (§3.1). No es una regresión —antes no funcionaba ninguno— sino que **el informe sobrestimó su propio fix**.

**Archivos modificados (7):**

```
backend/frontend/assets/js/chatwidget.js            |  11 +-     A1, A3
backend/frontend/assets/js/ia-integration.js        |  23 +-     A2
backend/frontend/assets/js/recommendationcards.js   | 160 +-     A8, A9
backend/services/iaService.js                       |  27 +-     A7, A10
python-ia/main.py                                   |  74 +-     A6, A7, A10
python-ia/README.md                                 |  19 +-     A4, A6
backend/frontend/README_FASE3_CHAT_RECOMMENDATIONS.md | 30 +-    A5, A10
backend/.env        (no versionado)                             A4, A5, A10
python-ia/.env      (no versionado)                             A4, A5, A10
```

---

## 2. Aplicado tal cual, sin desviaciones

### A1 — BUG-05: URL cableada a `localhost:3000`
`backend/frontend/assets/js/chatwidget.js:20` (antes `:17`). Sustituida la URL absoluta por la ruta relativa `/api/ia/chat`, con el comentario del informe. `recommendationcards.js` ya funcionaba así.

### A2 — BUG-01: doble inicialización de `ia-integration.js`
`backend/frontend/assets/js/ia-integration.js:8-31` y `:52`. Aplicado el fix del informe: bandera `this.integrado` (`:11`), guarda de idempotencia en `setupIntegration` (`:36-37`), el `setTimeout` de los 5 s ya solo limpia y avisa (`:24-30`) en vez de volver a inicializar, y guarda extra contra el botón duplicado (`:52`).

Verificado midiendo contra la versión original del archivo (§5, paso 6): antes **2** inicializaciones, **2** botones y `addMessage` envuelto **2** veces; ahora **1, 1, 1**.

### A3 — BUG-08: clase CSS inexistente en `clearChat`
`backend/frontend/assets/js/chatwidget.js:313` (`'bot-message'` → `'bot'`, que producía la clase inexistente `bot-message-message`) y `:214` (la condición `tipo === 'bot-message'` que nunca era cierta → `tipo === 'bot'`).

### A6 — SEC-02: cerrar `/docs`, `/redoc` y `/openapi.json`
`python-ia/main.py:45-46` (`IA_ENV` / `DOCS_HABILITADOS`), `:92-94` (los tres `*_url` condicionados) y `:370-379` (el banner de arranque ya no anuncia una URL que puede no existir). `IA_ENV=production` añadida a `python-ia/.env:23`, de modo que el valor por defecto es el seguro.

Comprobado: las tres rutas devuelven **404** (§5, paso 1).

### A8 — BUG-03: normalizar nombres en la validación anti-alucinación
`backend/frontend/assets/js/recommendationcards.js:262-275` (`normalizarNombre`), `:278-310` (`buscarProductoEnCatalogo`, las tres pasadas) y `:320-354` (el bucle de `resolverContraCatalogo`, que ahora usa el buscador y acumula `this.ultimosDescartados`).

Respetado el requisito que el informe marca como no negociable: **la tercera pasada solo acepta candidato único.** Comprobado explícitamente con dos casos ambiguos (§3.1).

### A9 — UX-01: estado vacío explicativo en el grid
`backend/frontend/assets/js/recommendationcards.js:117` (`ultimaPeticion`), `:119-177` (los cuatro caminos de fallo diferenciados) y `:383-421` (`escaparHTML` y `mostrarGridVacio` con botón «Volver a intentarlo»).

El cambio de fondo: `renderRecommendations()` ya **no** se llama en el caso vacío, que es lo que borraba el grid y dejaba el rectángulo en blanco. Sobre el helper `escaparHTML`: el informe indica en la fila A9 que UX-01 «depende de `escaparHTML` (SEC-06), así que aplicar SEC-06 primero **o incluir el helper en este mismo cambio**». Tomé la segunda opción. **Solo el helper** — el escapado de las tarjetas, que es la sustancia de SEC-06/B1, sigue sin aplicar (verificado en §5).

### A10 — SEC-01: autenticar `POST /chat` y escuchar solo en loopback

**Lado Python** (`python-ia/main.py`): imports `secrets` y `Header`/`Depends` (`:8`, `:24`); `IA_SERVICE_TOKEN`, `IA_HOST`, `IA_PORT` (`:51-54`); validación de arranque que aborta si el token falta o es corto (`:75-80`); dependencia `verificar_token_servicio` con `secrets.compare_digest` (`:269-276`); `dependencies=[Depends(...)]` en el endpoint (`:294`); y `uvicorn.run(app, host=IA_HOST, port=IA_PORT)` (`:381`).

**Lado Node** (`backend/services/iaService.js`): lectura del token con aborto si falta (`:5-10`), cabecera `X-IA-Token` en `chatConIA` (`:30`) y en `verificarIA` (`:83`).

**Confirmado a nivel de sistema operativo** que ya no escucha en todas las interfaces:

```
$ netstat -ano | grep :8000
  TCP    127.0.0.1:8000    0.0.0.0:0    LISTENING    12120
```

Antes era `0.0.0.0:8000`. Y `POST /chat` sin cabecera, o con un token erróneo, devuelve **401** (§5, paso 2).

---

## 3. Lo que tuve que ajustar, y por qué

### 3.1 A8 — el fix del informe no cubre uno de los 7 casos de su propia tabla

Ejecuté la batería que el informe exige («probar con los 7 casos de la tabla de BUG-03 antes de dar por bueno»), más el caso NFD invisible y tres productos inventados:

| Entrada del modelo | Resultado |
|---|---|
| `Plato de Sitio de Vidrio Bordes Dorados` | ✅ resuelto |
| `Copa Flauta Premium para Champán` | ❌ **descartado** |
| `Vaso Alto Validus 12 oz` | ✅ resuelto |
| `Camino de Mesa Yute Rustico` (sin tilde) | ✅ resuelto |
| `Mantel  Rectangular Blanco Jacquard` (doble espacio) | ✅ resuelto |
| `Cubeta de Hielo (Acero Inoxidable)` | ✅ resuelto |
| `Servilletero de Metal.` | ✅ resuelto |
| `Vaso Ru`+`́`+`stico de Madera` (tilde en forma NFD) | ✅ resuelto |
| 3 productos inventados y un nombre vacío | ✅ descartados (correcto) |
| `Premium Dorado` (varios candidatos) | ✅ descartado por ambigüedad |
| `Mantel` (4 candidatos) | ✅ descartado por ambigüedad |

**Diagnóstico del caso que falla.** Normalizado, el modelo dice `copa flauta premium para champan` y el catálogo tiene `copa flauta premium para champagne`. Ninguna de las tres pasadas del informe lo alcanza: no es coincidencia exacta; `champan` no es subcadena de `champagne`; y por palabras comparten 4 de 5 (`copa`, `flauta`, `premium`, `para`), mientras la tercera pasada exige que coincidan **todas**.

La causa es que `Champán`/`Champagne` **no es una diferencia de tilde ni de puntuación, es una variante de traducción**. El informe lo metió en la misma tabla que los demás, pero el algoritmo que propone —correctamente centrado en diacríticos, puntuación y espacios— no puede cubrirlo.

**Qué hice: apliqué el algoritmo del informe sin modificarlo.** No añadí una cuarta pasada más laxa por iniciativa propia, por tres razones: (1) me pediste el fix exacto y aquí el informe no ofrece una decisión alternativa; (2) el propio informe es enfático en que atribuirle al cliente un producto que el modelo no eligió es **peor** que descartarlo, y toda pasada adicional aumenta ese riesgo; (3) es una decisión tuya, no mía.

**Contexto para que decidas:** el algoritmo anterior resolvía **0 de los 7** casos. El nuevo resuelve **6 de 7**. Y en la prueba real contra Gemini (§5, paso 4) se resolvieron **7 de 7** sugerencias, con 0 descartes. Si quieres cubrir también las variantes de traducción, lo natural es tratarlo como un hallazgo nuevo del bloque B y decidir el umbral con calma.

### 3.2 A7 — omití 3 líneas, siguiendo la instrucción del propio informe

El bloque de código de SEC-03 incluye una llamada a `guardar_conversacion(..., estado="error")`. Esa llamada necesita la firma nueva de la función, que es **BUG-04 (bloque B7)**. El informe lo anticipa literalmente: *«si se aplica SEC-03 antes que BUG-04, omitir esas tres líneas y aplicarlas juntas después»*. Las omití.

Consecuencia visible: los fallos de Gemini quedan en el log con su `error_id`, pero **no** se registran en `conversaciones_ia`. Por eso el paso 5 de la verificación sigue mostrando solo `completada` (§5).

### 3.3 A4 — ajusté el texto del README para no documentar algo que no es cierto

El fragmento de README que propone BUG-06 afirma que el incidente «queda registrado […] en `conversaciones_ia` con `estado = 'error'`». Eso **todavía no es verdad**, por lo mismo que explica §3.2. Escribí la parte que sí se cumple (el `error_id` correlacionable en el log) y dejé la otra marcada explícitamente como pendiente del bloque B, en `python-ia/README.md`.

Decisión de A4: tomé la **opción recomendada por el informe**, eliminar la variable, no implementar el fallback a Groq.

### 3.4 A10 — dos ajustes de `.env` sin los que el fix no habría funcionado

El informe da el código de `main.py` e `iaService.js`, pero el resultado dependía de dos valores de `.env` que habrían anulado el arreglo:

1. **`python-ia/.env:17`: `PYTHON_IA_HOST` pasó de `0.0.0.0` a `127.0.0.1`.** El código lee `os.getenv("PYTHON_IA_HOST", "127.0.0.1")`, así que el valor por defecto es seguro **pero el `.env` lo sobrescribía**: el servicio habría seguido escuchando en todas las interfaces y SEC-01 habría quedado a medias.
2. **`backend/.env:15`: `PYTHON_IA_URL` pasó de `http://localhost:8000` a `http://127.0.0.1:8000`.** En Windows `localhost` puede resolverse a `::1` (IPv6), y el microservicio ahora escucha solo en la IPv4 de loopback. Sin este cambio, Node habría fallado al conectar. El informe ya usa `127.0.0.1` en el fix de `iaService.js:5`; esto es la contraparte en el `.env`.

### 3.5 Dos pasadas sobre `main.py` en lugar de una

Me pediste una sola pasada de reescritura para SEC-01/02/03 y, en el punto 3, que A10 fuera lo último y se probara después de todo lo demás. Las dos cosas no caben a la vez, porque A8 y A9 van entre A7 y A10.

Lo resolví con **dos** pasadas coherentes: una con A6+A7, otra con A10 al final. Cumple el punto 3 (A10 último, probado inmediatamente) y el propósito de tu instrucción, que era no parchear el archivo diez veces.

### 3.6 Cambio de codificación corregido
Al editar, `chatwidget.js` se convirtió de LF a CRLF. Lo devolví a LF para mantenerlo consistente con el resto del proyecto y que el diff no saliera como archivo entero reescrito. Verificado: los 7 archivos conservan sus finales de línea originales.

---

## 4. A5 — qué queda pendiente

**Hecho:**
- `API_GEMINI_KEY` y `GEMINI_MODEL` eliminadas de `backend/.env`. Confirmado antes de borrarlas que **ningún** `.js` las lee (`grep -rn "GEMINI\|API_GEMINI" --include=*.js backend/` → 0 resultados); solo aparecían en documentación. Ahora la clave vive en un único archivo en lugar de dos.
- Aviso de rotación pendiente, bien visible, en `python-ia/.env:9-12`.
- `backend/frontend/README_FASE3_CHAT_RECOMMENDATIONS.md` corregido: instruía poner la clave en `backend/.env`, justo lo contrario de lo que pide SEC-08. Ahora documenta también `IA_SERVICE_TOKEN` y el requisito de que coincida en ambos archivos.

**Pendiente, para ti:**

1. **Rotar la clave.** En <https://aistudio.google.com/apikey>: revocar la actual (`AQ.Ab8RN6L…`) y generar otra. Sustituir el valor en `python-ia/.env:13` y borrar el bloque de aviso de `:9-12`. Después, reiniciar el microservicio y enviar un mensaje de chat para confirmar.

   **Por qué no la dejé como placeholder:** habría dejado el servicio inoperativo y los pasos 3, 4 y 5 de la verificación no se habrían podido ejecutar, que es precisamente lo que el informe pide comprobar antes de la presentación. Preferí dejarlo funcionando y verificado, con la rotación marcada.

2. **`DB_PASSWORD=123456789`** sigue igual en los dos `.env`. SEC-08 lo señala en su punto 4, pero la fila A5 de la tabla no lo incluye, así que no lo toqué: cambiarlo implica cambiar la contraseña real de PostgreSQL. No es urgente en local; sí antes de cualquier despliegue.

---

## 5. Verificación de salida del Bloque A

Ejecutada con los dos servicios levantados (FastAPI en `127.0.0.1:8000`, Node en `:3000`, PostgreSQL `menajeDB` con 38 productos activos y usuario `cliente.demo@menaje.com`).

```
PASO 1 — /docs, /redoc y /openapi.json deben dar 404
  OK    GET /docs         -> 404
  OK    GET /redoc        -> 404
  OK    GET /openapi.json -> 404

PASO 2 — POST /chat sin token debe dar 401
  OK    sin cabecera      -> 401   {"detail":"No autorizado"}
  OK    token erroneo     -> 401   {"detail":"No autorizado"}
  info  GET /health       -> 200   (sigue publico: SEC-09 es del bloque B)

PASO 3 — login + chat por el camino completo (Node -> FastAPI -> Gemini)
  OK    login             -> 200
  OK    POST /api/ia/chat -> 200 en 5.73s
  info  success=true tokens=1542 respuesta=627 caracteres

PASO 4 — recomendaciones (boda / 120) con productos, precios y stock reales
  OK    Resueltos contra el catalogo real: 7 de 7
        id/precio/stock provienen del catalogo real: true

PASO 5 — estados en conversaciones_ia
  completada: 27
  OK    hay 27 filas registradas

PASO 6 — una sola inicializacion, sin errores en consola
  "IA Integration iniciado" logueado: 1 vez        -> CORRECTO
  botones #ai-rec-button insertados : 1           -> CORRECTO
  addMessage procesa 1 mensaje de usuario: 1 vez  -> CORRECTO (envuelto 1 vez)
  console.error: 0  |  console.warn: 0            -> ninguno

RESULTADO: los 6 pasos PASAN
```

### Detalle del paso 4
Las 7 sugerencias de Gemini se resolvieron contra el catálogo real, con `id`, `precio_unidad` y `stock_disponible` verificados uno a uno contra la respuesta de `/api/productos/catalogo`:

```
id= 12 | Plato de Sitio Vidrio Bordes Dorados | S/  5.50 | cant 120 | stock 120 | datos reales: si
id=  2 | Plato Fondo Redondo Cúpula 27cm      | S/  2.00 | cant 120 | stock 200 | datos reales: si
id=  3 | Copa Flauta Premium para Champagne   | S/  1.80 | cant 120 | stock 160 | datos reales: si
id=  4 | Copa de Vino Tinto Tradicional       | S/  1.60 | cant 120 | stock 250 | datos reales: si
id=  9 | Tenedor Dorado Premium               | S/  1.40 | cant 120 | stock 200 | datos reales: si
id= 10 | Cuchillo Dorado Premium              | S/  1.50 | cant 120 | stock 200 | datos reales: si
id= 25 | Mantel Redondo Satinado Blanco       | S/ 18.00 | cant  12 | stock  30 | datos reales: si
```

### Comprobación adicional que exige la fila A7: fallo provocado
El informe pide verificar «con un fallo provocado (clave inválida temporal) que el cliente ve el mensaje genérico y que el log del servidor **sí** tiene el detalle y el `error_id`». Lo hice arrancando el microservicio con `API_GEMINI_KEY` inválida **por variable de entorno**, sin tocar el `.env` (`load_dotenv()` usa `override=False`, así que el entorno tiene precedencia).

**Lo que ve el cliente** (`POST /api/ia/chat`):
```json
{"success":false,"error":"El asistente no está disponible en este momento. Intenta de nuevo en unos minutos."}
```

**Log de Node:**
```
❌ Error 502 del servicio IA: { detail: 'El asistente no esta disponible en este momento (ref: 4ff2d5c0da63)' }
```

**Log de FastAPI:**
```
[4ff2d5c0da63] Error llamando a Gemini API (usuario_id=2, modelo=gemini-3.6-flash): InvalidArgument('API key not valid. Please pass a valid API key.')
```

El `error_id` `4ff2d5c0da63` correlaciona ambos logs, y el cliente no ve ni el proveedor, ni el modelo, ni el estado de la credencial. **Antes de A7** ese mismo fallo mostraba `API key not valid. Please pass a valid API key.` dentro de la burbuja del chat. Tras la prueba restauré el servicio con la clave real.

### Sobre el paso 6: no había navegador disponible
El paso 6 pide mirar la consola del navegador. En esta sesión no tengo navegador ni hay headless instalado en el proyecto (`jsdom`, `puppeteer`, `playwright`: ninguno en `backend/node_modules`).

Lo sustituí por un equivalente que reproduce el ciclo de vida real: carga los tres scripts en el mismo orden que `catalogo.html`, dispara `DOMContentLoaded` y espera a que venza el `setTimeout` de 5 s que causaba el bug.

Para que la prueba no pasara de forma vacía, **la ejecuté también contra las versiones originales de los archivos** (`git show HEAD:…`):

| | Original (pre-fix) | Actual |
|---|---|---|
| «IA Integration iniciado» | **2 veces** | 1 vez |
| botones `#ai-rec-button` | **2** | 1 |
| `addMessage` procesa 1 mensaje | **2 veces** | 1 vez |

Detecta el bug donde existe y lo ve corregido donde se arregló. **Aun así, conviene que abras `catalogo.html` en un navegador real antes de la presentación**: mi equivalente valida la lógica de inicialización, no el renderizado ni el CSS.

### Nada de B, C ni D se aplicó
Comprobado explícitamente sobre el árbol final:

| Hallazgo | Comprobación | Resultado |
|---|---|---|
| B1 / SEC-06 | `recommendationcards.js:451` | sigue `<h3>${recomendacion.nombre}</h3>` sin escapar ✔ |
| B2 / SEC-07 + B3 / CAL-08 | `git diff backend/middleware/rateLimitIA.js` | sin cambios ✔ |
| B4 / BUG-02 | `grep MAX_PRODUCTOS_PROMPT` | 0 apariciones; `routes/index.js:64` sigue con 6000 ✔ |
| B5 / BUG-07 + B6 / SEC-04 | `obtener_contexto` en `main.py` | sin cambios ✔ |
| B7 / BUG-04 | `guardar_conversacion` en `main.py` | sin cambios; sin migración 002 ✔ |
| B8 / SEC-05 | `CORSMiddleware` en `main.py` | sigue presente ✔ |
| B9 / SEC-09 | `routes/index.js:102` | `/ia/health` sigue sin `autenticar` ✔ |
| B10 / BUG-09 | `grep limitadoPorStock` | 0 apariciones ✔ |
| C2 / CAL-09 | `chatwidget.js:145`, `recommendationcards.js:222` | `usuario_id` sigue en el cuerpo ✔ |

La única excepción, deliberada y autorizada por el informe, es el helper `escaparHTML` de SEC-06, que A9 necesita. El escapado de las tarjetas —la sustancia de B1— no se aplicó.

---

## 6. Pendiente y observaciones

### 6.1 `backend/.env.example` ahora rompe un clon nuevo — **lo más importante de esta lista**

A10 hace que `iaService.js:8-9` aborte el arranque de Node si falta `IA_SERVICE_TOKEN`. Pero `backend/.env.example` sigue sin mencionarla, y encima ofrece una `API_GEMINI_KEY` que Node ya no usa. Quien clone el repositorio y copie el ejemplo obtendrá un backend **que no arranca**, con este error:

```
Error: Falta la variable de entorno IA_SERVICE_TOKEN (debe coincidir con la de python-ia/.env)
```

Arreglarlo es exactamente **CAL-03 (C5)**, que el informe ya anticipaba («absorbe las ediciones de `.env` de A4, A5, SEC-01»), y que me pediste no tocar. Lo dejo así a propósito, pero **conviene aplicar C5 antes que el resto del bloque C**: el contenido completo de los cuatro archivos está ya escrito en la sección CAL-03 de la auditoría.

Mientras no se aplique, el estado actual funciona porque los `.env` reales de esta máquina ya están completos.

### 6.2 Node devuelve 500 al cliente cuando FastAPI devuelve 502
Detectado durante la prueba de A7: el microservicio responde 502, Node lo registra como 502, pero al cliente le llega **500**, porque `backend/routes/index.js:77` tiene el código fijo. Es **anterior** a estos cambios y no está en el Bloque A, así que no lo toqué. El cuerpo del error sí es el correcto, y el navegador no muestra el código, así que no afecta a la experiencia. Vale como candidato menor a bloque B.

### 6.3 `conversaciones_ia` sigue registrando solo `completada`
Esperado: es BUG-04 (B7). Hasta entonces, los fallos de Gemini solo quedan en el log del microservicio con su `error_id`. Sigue sin poderse distinguir «no hubo fallos» de «no se miden fallos».

### 6.4 Sobre `GEMINI_MODEL`
Aprovechando A5, quedó aclarada la duda que la auditoría dejaba abierta en CAL-04: `gemini-3.6-flash` **es válido y está operativo** con la clave actual, confirmado en tres llamadas reales a Gemini durante esta verificación (5,7 s / 8,0 s / 11,5 s de latencia, 1 542–3 722 tokens). No hizo falta tocar el valor.

### 6.5 El `JWT_SECRET` real estaba en la auditoría, y lo saqué

Al revisar los dos documentos en busca de fugas encontré que
`AUDITORIA_OPCION_1_MENAJE.md:1745` reproducía el `JWT_SECRET` real en texto
plano, dentro del contenido propuesto para `backend/.env` en la sección CAL-03.
Es un documento pensado para commitearse, así que lo sustituí por un marcador.

**Esto no cambia nada en el código**, pero conviene que lo sepas: si esa versión
del documento se compartió o se subió en algún momento, el `JWT_SECRET` debería
rotarse igual que la clave de Gemini. Rotarlo invalida las sesiones abiertas
—los usuarios tendrán que volver a iniciar sesión—, nada más.

Comprobado que ninguno de los dos documentos contiene ya el `JWT_SECRET` ni el
`IA_SERVICE_TOKEN`.

### 6.6 Estado de los servicios
Los dejé levantados para que puedas probar en el navegador: FastAPI en `127.0.0.1:8000` y Node en `127.0.0.1:3000`. Si necesitas reiniciarlos, `python main.py` desde `python-ia/` (con el venv activado) y `npm start` desde `backend/`.

### 6.7 Sin pruebas automatizadas en el repositorio
Como ya señalaba la auditoría, el proyecto no tiene pruebas. Las tres que escribí para verificar A8 y A2 (los 7 casos de nombres, la ambigüedad y el ciclo de vida de la inicialización) están en el directorio temporal de la sesión y **se perderán**. Las dos primeras son lógica pura y son exactamente las que la auditoría recomienda como más rentables. Si quieres, las paso a `backend/tests/` con un script `npm test`; es trabajo de esfuerzo bajo y no toca código de producción.

---

## 7. Fuera de alcance de OPCIÓN 1

Una sola observación nueva, surgida del caso que falla en A8:

**Resolución semántica de nombres de producto.** Cubrir variantes de traducción como `Champán`/`Champagne` de forma general requeriría comparar significados, no cadenas: embeddings del catálogo y búsqueda por similitud vectorial, o un modelo de similitud entrenado. Eso es **OPCIÓN 2** y no lo implementé.

Dentro de OPCIÓN 1, las alternativas para ese caso concreto serían: (a) una cuarta pasada por solapamiento mayoritario de palabras exigiendo candidato único —relaja el control anti-alucinación, decisión tuya—; (b) una tabla pequeña de sinónimos conocidos del dominio (`champan`↔`champagne`, `copa`↔`cáliz`), que es comparación de cadenas y no requiere nada nuevo; o (c) reforzar el prompt para que el modelo copie los nombres literalmente, que ya se le pide en `recommendationcards.js:207` («usa EXCLUSIVAMENTE estos nombres exactos») y que en la prueba real funcionó: 7 de 7 sin descartes.

Ninguna de las tres la apliqué: las tres son decisiones de producto que exceden el Bloque A.
