# Informe de aplicación — Bloque D de `AUDITORIA_OPCION_1_MENAJE.md`

**Bloque D — Experiencia de usuario (mejoras, no correcciones)**
Fecha: 2026-09-29 · Rama: `main` · Los cinco hallazgos (D1…D5) quedan aplicados, más el
**cierre de C6** que quedaba pendiente de tu decisión.

Con esto se completan los cuatro bloques del plan de corrección de la auditoría.

---

## 1. Resumen

| # | Hallazgo | Archivo | Estado | Verificación |
|---|---|---|---|---|
| — | **Cierre de C6 / CAL-04** — valor por defecto de `GEMINI_MODEL` | `python-ia/main.py:48` | ✅ aplicado | Arranque real con `GEMINI_MODEL` ausente |
| D1 | **UX-03** — el 429 dice cuánto hay que esperar | `chatwidget.js:152-164` | ✅ tal cual | 4 variantes de `Retry-After` + 429 real del servidor |
| D2 | **UX-02** — detección del número de asistentes | `ia-integration.js:147-186`, `:207`, `:216-225`, `:269-283` | ✅ tal cual | 12 casos, incluidos los 5 de la auditoría |
| D3 | **UX-06** — ofrecer en vez de lanzar | `ia-integration.js:209-214`, `:229-266` | ✅ tal cual | 4 escenarios con DOM real |
| D4 | **UX-05** — persistir en `sessionStorage` | `chatwidget.js:31`, `:185`, `:299-347`, `:356-357` | ✅ tal cual + 1 comentario reforzado | Orden de inicialización verificado empíricamente |
| D5 | **UX-04** — contador, cancelación y doble clic | `recommendationcards.js:26-30`, `:122-199`, `:287`, `:444-482`, `:771-806` | ⚠️ aplicado con **un ajuste** | Cancelación + segundo intento inmediato |

**Nada falló en la verificación.** Las 64 comprobaciones automatizadas pasan (12 de D2,
4 de D3, 22 de D4+D5, 26 de D1 + regresiones de A/B/C), más 9 comprobaciones en vivo
contra PostgreSQL, el microservicio y Gemini reales.

**Lo único que necesita tu atención** está en §6: dos cuentas de prueba que creé en la
base de datos y que conviene borrar, y tres observaciones de comportamiento nuevas
(no defectos) que conviene que conozcas antes de la presentación.

---

## 2. Cierre de C6 / CAL-04 — el modelo por defecto

El informe del Bloque C (§7.1) dejaba esto como decisión tuya, entre **(a)** poner
`gemini-3.6-flash` como valor por defecto y **(b)** abortar el arranque si falta la
variable. Elegiste **(a)**. Es el cambio de una línea que pedías:

```python
# python-ia/main.py:45-48
# El valor por defecto debe ser un modelo servible: "gemini-1.5-flash" ya no lo es
# para esta clave (verificado en C6/CAL-04), y un .env incompleto daba un arranque
# limpio que fallaba en TODAS las peticiones. El .env sigue mandando sobre esto.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
```

No toqué nada más: `verificar_modelo_disponible()` (C6) y el `print` del arranque (C7)
siguen exactamente como estaban.

### La línea de log que pedías

Con el `.env` normal (que trae `GEMINI_MODEL=gemini-3.6-flash`), el arranque sigue
mostrando el modelo verificado contra la API:

```
2026-09-29T19:45:04-0500 INFO     [menaje.ia] Gemini configurado con el modelo: gemini-3.6-flash
2026-09-29T19:45:04-0500 INFO     [menaje.ia] Pool de PostgreSQL creado (1-5 conexiones)
...
📦 Modelo Gemini: gemini-3.6-flash
```

Ese mensaje lo emite `verificar_modelo_disponible()` **solo cuando el modelo aparece
entre los disponibles para la clave**. Si no apareciera, saldría el `logger.error` con
la lista de modelos servibles, así que la línea de arriba es la confirmación de que el
identificador sigue siendo válido, no un eco de la variable.

### Pero eso no probaba el valor por defecto

Con el `.env` presente, ese log no distingue "el `.env` manda" de "el valor por defecto
funciona": son el mismo texto. Así que comprobé el caso que motiva el cambio, un `.env`
incompleto. Comenté temporalmente la línea en `python-ia/.env` (con copia de seguridad),
arranqué una segunda instancia en el puerto 8010 y obtuve:

```
2026-09-29T19:45:45-0500 INFO     [menaje.ia] Gemini configurado con el modelo: gemini-3.6-flash
```

Es decir: sin `GEMINI_MODEL` en el `.env`, el servicio ahora cae en un modelo que existe
y lo verifica contra la API. Antes de este cambio ese mismo escenario daba un arranque
limpio con `gemini-1.5-flash` y un `logger.error` seguido de un 502 en cada petición.

Después restauré `python-ia/.env` y verifiqué con `diff` que quedó **byte a byte idéntico**
al original. La copia de seguridad no se dejó en el repositorio.

---

## 3. Aplicado tal cual

### D1 — UX-03: el 429 informa del tiempo real de espera

`backend/frontend/assets/js/chatwidget.js:152-164`. El bloque propuesto entró sin
cambios: se lee el cuerpo, se intercepta `response.status === 429` antes del `throw`, se
lee `Retry-After` y se degrada a "unos segundos" si la cabecera no llega o no es un
número.

Era autónomo, como decías: `standardHeaders: 'draft-7'` ya está en
`backend/middleware/rateLimitIA.js:32` desde B2/SEC-07, y lo confirmé leyendo las
cabeceras de una respuesta real (§5.2).

### D2 — UX-02: detección del número de asistentes

`backend/frontend/assets/js/ia-integration.js`. Tres piezas, en los sitios que indica la
auditoría, localizados **por nombre de función** (los números de línea del documento ya
no valían: el método `extractAndRecommend` está hoy en la línea 188, no en la 138):

- `extraerNumeroAsistentes()` (`:147-186`), justo antes de `extractAndRecommend`, con las
  tres pasadas: cifra junto al sustantivo, número en palabras, y cifra suelta tras un
  verbo de cantidad.
- Las dos propiedades estáticas tras el cierre de la clase (`:269-283`):
  `IAIntegration.NUMEROS_EN_PALABRAS` y `IAIntegration.SUSTANTIVOS_ASISTENTES`.
- La sustitución de la expresión regular antigua (`:207`) y la rama `else` que **pregunta**
  en vez de fallar en silencio (`:216-225`).

El aviso de la auditoría sobre la recursión se respeta: la rama `else` llama a
`addMessage(..., 'bot')`, y el envoltorio de `setupAutoRecommendations` solo actúa sobre
`sender === 'user'`, así que no se reentra.

### D3 — UX-06: ofrecer las recomendaciones en vez de lanzarlas

Aplicado **sobre la versión que dejó D2**, como indica la auditoría. El bloque de disparo
automático (`:209-214`) pasa a llamar a `ofrecerRecomendaciones()` a los 800 ms, y el
método nuevo (`:229-266`) construye el aviso con `createElement`/`textContent` —sin
`innerHTML`, para no reintroducir SEC-06— e inserta el botón directamente en
`#chat-messages`.

### D4 — UX-05: persistir la conversación en `sessionStorage`

`backend/frontend/assets/js/chatwidget.js`: `storageKey()`, `persistirHistorial()` y
`restaurarHistorial()` junto a `clearChat` (`:299-347`), la llamada en `init()` (`:31`),
la persistencia tras el `push` al historial (`:185`) y el `removeItem` en `clearChat`
(`:355-357`).

Apliqué la **versión mínima** (`sessionStorage`), que es la que el Bloque D pide. La
versión completa con `GET /api/ia/historial` sigue pendiente y la dejo en §6.4.

### D5 — UX-04 (la mayor parte)

`backend/frontend/assets/js/recommendationcards.js`: la guardia de concurrencia y el
`AbortController` al inicio de `loadRecommendations` (`:122-131`), el `finally`
(`:193-199`), la rama `AbortError` en el `catch` (`:180-185`), el `signal` en el `fetch`
de `pedirRecomendacionesIA` (`:287`), y el `showLoadingState` con contador y botón
Cancelar (`:444-471`).

**`hideLoadingState()` está recreada con cuerpo real** (`:473-482`), como pedías. El
Bloque C la había eliminado junto con `playNotificationSound()` (C4/CAL-07); la propia
auditoría advertía del conflicto y resuelve a favor de UX-04. El comentario del método lo
deja escrito para que nadie la vuelva a borrar por parecer código muerto:

```javascript
    /**
     * Para el contador de segundos. Tiene cuerpo desde D5/UX-04: el Bloque C la había
     * eliminado por estar vacía (CAL-07), y la propia auditoría advierte de que UX-04
     * la recupera. El contenido del grid lo reemplazan renderRecommendations() o
     * mostrarGridVacio(); aquí solo se libera el temporizador.
     */
```

`playNotificationSound()` sigue eliminada: esa parte de C4 no entra en conflicto con nada.

---

## 4. Lo que tuve que ajustar, y por qué

### 4.1 D5 — el fragmento de `submitRecommendation` dejaba el botón deshabilitado para siempre

**Este es el único ajuste de comportamiento del bloque, y es una corrección de un defecto
del fragmento propuesto.**

La auditoría propone, para `submitRecommendation`:

```javascript
    async submitRecommendation() {
        const boton = document.getElementById('confirm-selection');
        if (boton?.disabled) return;

        if (this.selectedProducts.length === 0) { ...; return; }
        if (boton) boton.disabled = true;
```

…y rehabilitarlo "al final del método, tras `window.abrirCarrito()`".

El problema es que entre el `disabled = true` y el final del método hay **un `return`
temprano** que el fragmento no contempla, y que existe en el código actual:

```javascript
        if (typeof window.agregarItemAlCarrito !== 'function' || typeof window.abrirCarrito !== 'function') {
            this.showErrorMessage('Ve a la página de Catálogo para agregar estos productos…');
            return;
        }
```

Ese camino se recorre en `mi-cuenta.html`, `mis-alquileres.html` y `perfil.html`, donde el
carrito de `catalogo.html` no existe. Aplicado literalmente, el primer clic de
"Confirmar Selección" en cualquiera de esas tres páginas mostraría el aviso y dejaría el
botón deshabilitado **de forma permanente**: la guardia `if (boton?.disabled) return;`
haría que todos los clics siguientes salieran en silencio, sin ni siquiera repetir el
aviso. Es decir, el fragmento cambia un botón que funcionaba (mal, sin protección de doble
clic) por uno que se rompe al primer clic en tres de las cuatro páginas.

Mantuve la guardia y el `disabled = true` donde los pone la auditoría, y envolví el resto
del método en `try/finally`:

```javascript
        if (boton) boton.disabled = true;

        // try/finally para rehabilitar el boton por CUALQUIER camino de salida: uno de
        // los return tempranos de abajo lo dejaria deshabilitado para siempre.
        try {
            ...
            window.abrirCarrito();
        } finally {
            if (boton) boton.disabled = false;
        }
```

Es más robusto que rehabilitarlo tras `window.abrirCarrito()`: cubre los `return`
tempranos, y también cubriría una excepción de `agregarItemAlCarrito` (que es código de
`catalogo.html`, fuera de este componente). Verificado en los dos caminos (§5.1, últimas
dos comprobaciones).

### 4.2 D5 — el estado nuevo se inicializa explícitamente en el constructor

La auditoría introduce `this.cargando`, `this.abortController` y `this.temporizador` sin
declararlos. Funcionaría (`undefined` es falsy), pero añadí tres líneas al constructor
(`recommendationcards.js:26-30`) para que el estado del componente esté en un solo sitio,
como ya lo está el resto. No cambia el comportamiento.

### 4.3 D4 — el comentario del orden de inicialización dice más de lo que pedía la auditoría

La auditoría pide dejar escrito que `restaurarHistorial()` debe correr antes del
envoltorio, y justifica que hoy se cumple **por temporización**: "`init()` corre en el
constructor … y `setupIntegration` se instala como mínimo 100 ms después".

Al verificarlo encontré que la garantía es más fuerte que eso, y me pareció que el
comentario debía decirlo, porque un lector que solo lea "100 ms" puede concluir que el
orden es frágil y "arreglarlo" moviendo cosas:

- `window.chatWidget` solo se asigna **cuando el constructor ya ha devuelto**
  (`chatwidget.js:381`), es decir después de que `init()` → `restaurarHistorial()` haya
  terminado.
- `setupIntegration()` no hace nada hasta que `window.chatWidget && window.recommendationCards`
  existan (`ia-integration.js:19`).

Por tanto el envoltorio **no puede** instalarse antes de que la restauración haya
acabado, ni aunque el intervalo fuera de 0 ms. El comentario del método recoge esto y
nombra las dos formas de romperlo (sacar la llamada del constructor, o asignar
`window.chatWidget` antes de restaurar). Lo confirmé además empíricamente (§5.1).

### 4.4 Ubicación de los hallazgos: por nombre, no por línea

Como en los bloques anteriores, los números de línea de la auditoría ya no valen tras A,
B y C. Las desviaciones mayores:

| La auditoría dice | Dónde estaba de verdad |
|---|---|
| `chatwidget.js:148-152` (429) | `:137-142` antes del cambio (hoy `:152-164`) |
| `ia-integration.js:157-166` (detección) | `:166-175` |
| `ia-integration.js:138` (antes de `extractAndRecommend`) | `:147` |
| `chatwidget.js:25-28` (`init`) | `:28-31` |
| `chatwidget.js:303-310` (`clearChat`) | `:286-293` |
| `recommendationcards.js:269-278` (`showLoadingState`) | `:418-423`, y **sin** `hideLoadingState` (la borró C4) |
| `recommendationcards.js:484-509` (`submitRecommendation`) | `:712-737` (hoy `:771-806`) |

Además, dos fragmentos ya no coincidían literalmente con el código porque bloques
anteriores los habían reescrito, y los apliqué sobre la versión actual:

- El `catch` de `loadRecommendations` ya usaba `mostrarGridVacio()` (de A9/UX-01), no el
  texto que suponía UX-04. Le añadí la rama `AbortError` delante, conservando el resto.
- El cierre de `loadRecommendations` tenía un comentario de A9 que decía *"Sin finally:
  renderRecommendations()/mostrarGridVacio() ya reemplazan el contenido del grid"*. Ese
  comentario queda obsoleto con D5 (ahora sí hace falta un `finally`, para el temporizador
  y la guardia), así que lo sustituí por uno que explica por qué el `finally` es
  necesario y que se ejecuta también en los `return` tempranos del `try`.

### 4.5 Una corrección de mi propio proceso, no del código

En el primer intento escribí `extraerNumeroAsistentes` mediante un *heredoc* de Bash, y
el shell colapsó los `\\` de las expresiones regulares: `\\d` quedó como `\d` dentro de
una plantilla de JavaScript (donde `\d` se evalúa como `d`), y `\\b` se convirtió en un
byte de retroceso literal (0x08) incrustado en el archivo. `node --check` pasaba, porque
sintácticamente era válido, pero las tres expresiones estaban rotas.

Lo detecté al leer el archivo escrito y lo corregí reescribiendo el método desde un
archivo de parche, sin pasar por el shell. Verifiqué después que los tres archivos
JavaScript no contienen **ningún** byte de control indebido:

```
backend/frontend/assets/js/chatwidget.js: 0 byte(s) de control indebidos
backend/frontend/assets/js/recommendationcards.js: 0 byte(s) de control indebidos
backend/frontend/assets/js/ia-integration.js: 0 byte(s) de control indebidos
```

Lo anoto porque el fallo era silencioso para las comprobaciones de sintaxis: si alguien
vuelve a editar estos archivos por *heredoc*, conviene releer el resultado.

---

## 5. Verificación

Nada falló. Detallo qué se probó y cómo, porque parte de la verificación exige un DOM y
no se puede hacer con `node --check`.

### 5.0 El arnés de pruebas

El proyecto no tiene pruebas (lo sigue diciendo el informe del Bloque C, §7.6), y D1…D5
son todos cambios de cliente. Para probarlos de verdad instalé **`jsdom` fuera del
proyecto**, en el directorio temporal de la sesión, con `--no-save`: **`backend/package.json`
y `backend/package-lock.json` no se han tocado**, y no queda ninguna dependencia nueva en
el repositorio.

Los arneses cargan los cuatro scripts como `<script>` reales y en el mismo orden que las
páginas de cliente (`ia-auth.js` → `chatwidget.js` → `recommendationcards.js` →
`ia-integration.js`), y dejan que jsdom dispare `DOMContentLoaded` por su cuenta, como un
navegador. No copian código de los componentes: ejecutan el archivo del repositorio.

> Dos defectos del arnés que corregí antes de fiarme de él, por si alguien lo reconstruye:
> (1) al principio despachaba `DOMContentLoaded` a mano *además* del que dispara jsdom, y
> cada componente se inicializaba dos veces —parecía una regresión de BUG-01 y no lo era;
> (2) mi doble de `GET /api/productos/catalogo` devolvía `{success, data}`, pero el
> endpoint real devuelve el array de filas tal cual (`productosController.js:30`), así que
> el grid caía en el estado vacío antes de llegar a lo que quería probar.

### 5.1 D4 y D5, con DOM real (22/22)

```
--- D4 / UX-05: persistencia en sessionStorage ---
OK     restaura los turnos guardados al cargar la pagina — 5 burbujas (1 de bienvenida + 4 restauradas)
OK     el historial en memoria queda cargado para el contexto del modelo
OK     restaurarHistorial() corre ANTES del envoltorio de addMessage — orden observado: restaurarHistorial -> envoltorio addMessage
OK     setupIntegration corre una sola vez (sin regresion de BUG-01) — 1 envoltorio(s)
OK     restaurar NO dispara ninguna peticion de recomendaciones — ninguna peticion
OK     persiste el intercambio bajo la clave por usuario menaje:chat:7
OK     clearChat() borra la clave de sessionStorage
OK     sessionStorage que lanza no rompe el widget — persistir/restaurar/clearChat no lanzan

--- D5 / UX-04: contador, cancelacion y doble clic ---
OK     muestra el contador de segundos y el boton Cancelar
OK     cargando = true mientras se genera
OK     un segundo clic NO lanza una peticion en paralelo — peticiones a la IA: 1
OK     el segundo clic avisa al usuario en vez de no hacer nada — Ya estoy preparando una propuesta, espera un momento.
OK     el contador avanza (no es un texto inmovil) — 0 s -> 1 s
OK     la cancelacion aborta el fetch en curso
OK     la cancelacion se distingue de un error real
OK     tras cancelar, cargando = false (guardia liberada)
OK     tras cancelar, el temporizador esta parado
OK     tras cancelar, abortController liberado
OK     un segundo intento inmediato funciona limpio — 1 tarjeta(s), 1 recomendacion(es)
OK     el estado queda limpio tras el segundo intento
OK     submitRecommendation rehabilita el boton en el camino de error
OK     submitRecommendation rehabilita el boton en el camino normal

22/22 comprobaciones pasan
```

Sobre los puntos que pediste explícitamente:

- **La recarga a mitad de conversación** se simula sembrando `sessionStorage` con dos
  turnos, uno de ellos *"recomienda menaje para una boda de 50 personas"* —exactamente el
  caso peligroso— y cargando la página. Los cuatro mensajes reaparecen, el historial en
  memoria queda con los 2 turnos (así que el modelo recupera el contexto) y **no sale
  ninguna petición**: ni de chat ni de recomendaciones. Esperé 1,4 s antes de comprobarlo,
  más que los `setTimeout` de 600/800/1000 ms de los dos caminos de recomendación.
- **El orden de inicialización** no se deduce, se observa: instrumento
  `ChatWidget.prototype.restaurarHistorial` y
  `IAIntegration.prototype.setupAutoRecommendations` y registro cuál corre primero. Sale
  `restaurarHistorial -> envoltorio addMessage`. El orden relativo entre `chatwidget.js` e
  `ia-integration.js` en las páginas **no cambió con C9**: `ia-auth.js` se insertó delante
  de los dos (líneas 113-116 de `catalogo.html`, 40-43 de `mi-cuenta.html`, 74-77 de
  `mis-alquileres.html`).
- **Limpiar el chat** borra `menaje:chat:7`; queda `null`.
- **Cancelar y reintentar**: el `fetch` en curso se aborta (1 aborto), el grid dice
  "Generación cancelada" en vez de mostrar un error, y `cargando`/`temporizador`/
  `abortController` quedan en `false`/`null`/`null`. El **segundo intento inmediatamente
  después** entra sin tropezar con la guardia y renderiza su tarjeta: no se queda
  "cargando" para siempre.

### 5.2 D1, con DOM real y contra el servidor real (17 comprobaciones)

Las cuatro variantes de la cabecera:

```
OK     Retry-After="7" -> "7 segundos" — ⏳ Estoy recibiendo muchas preguntas a la vez. Vuelve a escribirme en 7 segundos.
OK     Retry-After="1" -> "1 segundo"  — … Vuelve a escribirme en 1 segundo.
OK     Retry-After=null -> "unos segundos"
OK     Retry-After="no-numero" -> "unos segundos"
```

Y para cada una: se presenta como `bot-message` (no `bot-error`, sin "❌"), el indicador
de escritura se apaga, `isLoading` se libera, y el 429 **no** entra en el historial ni en
`sessionStorage`. Un 500 real sigue saliendo como error, así que el camino nuevo no se
come los fallos de verdad.

Contra el servidor real, con `RATE_LIMIT_IA=1` para no gastar cuota de Gemini:

```
usuario 15, peticion 1 -> HTTP 200
usuario 15, peticion 2 -> HTTP 429
  RateLimit-Policy: 1;w=60
  RateLimit: limit=1, remaining=0, reset=58
  Retry-After: 58
usuario 16, peticion 1 -> HTTP 200
```

`Retry-After: 58`, no 60: es justo el dato que UX-03 quería aprovechar y la prueba de que
la ventana es deslizante. Y el `200` del usuario 16 mientras el 15 está bloqueado,
**desde la misma IP**, confirma que la clave del limitador es el usuario (B2/SEC-07).

### 5.3 Regresiones de los bloques anteriores

**En vivo**, con PostgreSQL, el microservicio y Gemini reales:

| Comprobación | Resultado |
|---|---|
| SEC-02 — `/docs`, `/redoc`, `/openapi.json` del microservicio | `404`, `404`, `404` |
| SEC-01 — `POST /chat` sin `X-IA-Token` | `401` |
| SEC-01 — el microservicio escucha solo en loopback | `TCP 127.0.0.1:8000 LISTENING` |
| Login real (dos cuentas) | `200`, JWT válido en ambas |
| Catálogo real | 38 productos con stock |
| Chat real contra Gemini | `success: true`, 2553 tokens, respuesta coherente sobre 50 invitados |
| Cabeceras de rate limit en una respuesta normal | `RateLimit-Policy: 5;w=60`, `RateLimit: limit=5, remaining=4, reset=60` |
| Rate limit por usuario | §5.2 |
| C6/C7/C8 — arranque del microservicio | modelo verificado, pool 1-5, `/docs` deshabilitado |

**Recomendaciones con datos reales**, punta a punta (catálogo de PostgreSQL → prompt →
Gemini → parseo y resolución del cliente → tarjetas en el DOM), ejecutando las funciones
del repositorio, no una copia:

```
tiempo total: 9.3 s
recomendaciones resueltas contra el catalogo real: 7
tarjetas renderizadas: 7
descartadas por no existir en el catalogo: 0
estado final: cargando=false temporizador=null abortController=null
  - id=12 Plato de Sitio Vidrio Bordes Dorados | 50 u | S/ 5.50 | economico
  - id=2  Plato Fondo Redondo Cúpula 27cm      | 50 u | S/ 2.00 | economico
  - id=3  Copa Flauta Premium para Champagne   | 50 u | S/ 1.80 | economico
  - id=4  Copa de Vino Tinto Tradicional       | 50 u | S/ 1.60 | economico
  - id=9  Tenedor Dorado Premium               | 50 u | S/ 1.40 | economico
  - id=10 Cuchillo Dorado Premium              | 50 u | S/ 1.50 | economico
  - id=25 Mantel Redondo Satinado Blanco       |  5 u | S/ 18.00 | intermedio

productos con id/precio/stock que NO cuadran con el catalogo real: 0
recomendaciones que superan el stock disponible (BUG-09): 0
```

Los 7 `id`, precios y stock se cotejaron uno por uno contra `GET /api/productos/catalogo`:
ninguno lo inventó el modelo. Ninguna cantidad supera el stock.

**XSS de las tarjetas (SEC-06)** con payloads adversarios en `nombre`, `descripcion`,
`motivo` y `foto_url`, pasando por el camino real (`resolverContraCatalogo` →
`renderRecommendations`):

```
OK     BUG-09: la cantidad se topa al stock disponible y se marca como ajustada — cantidad=3 sugerida=50
OK     SEC-06: no se inyecta ningun elemento ejecutable en la tarjeta — 23 nodos en el grid, 0 ejecutables inyectados
OK     SEC-06: el texto malicioso se muestra literal (escapado)
OK     SEC-06: una foto_url javascript: cae a la imagen por defecto — src=/assets/img/logo.png
OK     UX-01/BUG-09: la tarjeta avisa de que la cantidad se ajusto al stock
OK     BUG-03: la resolucion contra el catalogo tolera mayusculas y espacios de mas
OK     CAL-09: el cuerpo de /api/ia/chat no lleva usuario_id — mensaje, historico
OK     BUG-10: __texto__ y **texto** dan <strong>, *texto* y _texto_ dan <em>
```

Un detalle que conviene dejar por escrito porque parece un hallazgo y no lo es: mi primer
control automático contó **4 "elementos ejecutables"** en el grid de datos reales. No era
una inyección: la plantilla de `createRecommendationCard` pone
`onerror="this.src='/assets/img/logo.png'"` en **todas** las imágenes como respaldo, y mi
selector marcaba las 4 tarjetas cuya `foto_url` real no era ya el logo. Lo comprobé
re-renderizando esos mismos 7 productos y enumerando todos los atributos `on*` del grid:

```
atributos de evento en el grid: 7 (1 distinto/s)
  <img onerror="this.src='/assets/img/logo.png'">
de plantilla (respaldo de imagen rota, legitimo): 7
ajenos a la plantilla (posible inyeccion): 0
<script> inyectados: 0    <svg> inyectados: 0    <img> con src no http(s)/relativo: 0
```

### 5.4 D2 — los casos que pide la auditoría (12/12)

```
OK    "recomienda menaje para 8 personas"      -> 8    (esperado 8)
OK    "recomienda para cincuenta invitados"    -> 50   (esperado 50)
OK    "sugiere menaje para 50 pax"             -> 50   (esperado 50)
OK    "necesito menaje, somos 120"             -> 120  (esperado 120)
OK    "recomienda menaje para una boda"        -> null (esperado null)
OK    "recomienda para 40 comensales"          -> 40
OK    "recomienda para 30 personas"            -> 30
OK    "invitados: 80"                          -> 80
OK    "seremos unos 45"                        -> 45
OK    "recomienda menaje para dieciséis personas" -> 16
OK    "menaje para 9999 personas"              -> null  (fuera del rango 1-1000)
OK    "menaje para mil invitados"              -> 1000
```

Los cinco primeros son los que enumera UX-02, incluido el que debe devolver `null`. Añadí
los otros siete: los tres restantes de la tabla del hallazgo, la forma invertida
("invitados: 80"), la normalización de tildes ("dieciséis" → 16) y los dos extremos del
rango, porque UX-02 señala que el patrón antiguo aceptaba 9999 pese al `max="1000"` del
formulario.

### 5.5 D3 — ya no se lanza la petición sola (4/4)

```
OK     mensaje valido: ofrece boton, NO lanza la peticion · aviso: "¿Quieres que prepare una propuesta de menaje para tu boda de 80 asiste…"
OK     cifra de un digito (caso nuevo de D2) · aviso: "¿Quieres que prepare una propuesta de menaje para tu evento de 8 asist…"
OK     falso positivo: "no me recomiendes copas"
OK     sin numero: pregunta, no ofrece boton ni lanza
```

Cada caso mide tres cosas: peticiones lanzadas **antes** del clic (0 en todos), si aparece
el botón, y peticiones **tras** pulsarlo (1, y solo entonces).

Sobre «no me recomiendes copas»: **no dispara nada**, como querías. Pero la razón no es la
que da la auditoría. UX-06 dice que ese mensaje *"contiene 'recomiend' y dispara la
generación"*; en realidad la palabra clave de la lista es `'recomienda'`
(`ia-integration.js:127-131`), y `"recomiendes"` no la contiene, así que ese mensaje
concreto nunca activó la detección, ni antes ni ahora. El problema que describe el
hallazgo sí es real para otras negaciones que **sí** casan con la lista —por ejemplo «no
necesito menaje para 50 personas», que contiene `'necesito menaje'` y `'menaje para'`—, y
para esas D3 hace exactamente lo que promete: el falso positivo pasa a costar un botón
ignorado en lugar de una petición desperdiciada. No cambié la lista de palabras clave:
ampliarla o afinarla no es parte del Bloque D, y con D3 ya no tiene consecuencias de cuota.

---

## 6. Pendiente y observaciones

### 6.1 Dos cuentas de prueba que creé en la base de datos — conviene borrarlas

No encontré credenciales de prueba documentadas en los informes anteriores, y necesitaba
**dos** usuarias distintas para demostrar que el rate limit es por usuario y no por IP.
Registré estas dos por la API (`POST /api/auth/registrar`, rol `cliente`):

| id | correo | contraseña |
|---|---|---|
| 15 | `bloqued1@prueba.local` | `PruebaBloqueD1!` |
| 16 | `bloqued2@prueba.local` | `PruebaBloqueD2!` |

Las dejé vivas a propósito, para que puedas repetir las comprobaciones de §5.2 y §5.3 a
mano antes de la presentación. **Bórralas cuando acabes**: son cuentas con contraseña
conocida y escrita en este informe.

```sql
DELETE FROM conversaciones_ia WHERE usuario_id IN (15, 16);
DELETE FROM usuarios WHERE correo IN ('bloqued1@prueba.local', 'bloqued2@prueba.local');
```

(El primer `DELETE` es necesario si `conversaciones_ia` tiene clave ajena a `usuarios`;
esas conversaciones son las 4 peticiones de prueba de §5.2 y §5.3.)

### 6.2 Tres comportamientos nuevos que conviene que conozcas (no son defectos)

Los tres son consecuencia deliberada de D2/D3/D4, pero cambian lo que ve el cliente:

1. **El panel de recomendaciones ya no se rellena solo.** Es el objetivo de D3 y una
   decisión de producto, no un error. Si en la presentación esperabas mostrar que el panel
   se llena al escribir en el chat, ahora hay **un clic intermedio** en el botón
   "🎯 Generar propuesta". El camino del botón "🎯 Recomendaciones" (formulario) sigue
   siendo directo, sin clic extra.
2. **Un mensaje con palabra clave pero sin número ahora recibe una respuesta.** Antes el
   fallo era silencioso; con D2 el asistente pregunta por el número de asistentes. En
   mensajes que casan con la lista de palabras clave por casualidad, eso es una pregunta
   que el cliente no esperaba. Es preferible al silencio, pero es ruido nuevo.
3. **Ni la pregunta de D2 ni el botón de D3 se guardan en `sessionStorage`.** Solo se
   persisten los intercambios reales (pregunta del cliente + respuesta del modelo), que es
   lo que alimenta el contexto. Así que tras una recarga el botón "Generar propuesta"
   desaparece. Es lo correcto —restaurar un botón de una oferta vieja sería peor— pero si
   un cliente recarga justo después de ver la oferta, tendrá que volver a pedirla.

### 6.3 La cancelación durante la carga del catálogo también funciona, por un camino indirecto

`fetchCatalogo()` no recibe el `signal` (la auditoría solo lo pide para el `fetch` de la
IA). Aun así, pulsar "Cancelar" durante esa fase funciona: `abort()` marca el controlador,
y cuando después se crea el `fetch` de la IA con una señal ya abortada, este rechaza de
inmediato con `AbortError`. La petición del catálogo sí se completa (es rápida, va contra
la base de datos local y no gasta cuota de Gemini). Si alguna vez se quiere que también
se corte, basta pasarle el `signal` en `fetchCatalogo`.

### 6.4 Sigue pendiente la versión completa de UX-05 (historial desde la base de datos)

UX-05 describe dos versiones. Apliqué la mínima (`sessionStorage`), que es la del Bloque
D. La completa requiere un endpoint nuevo `GET /api/ia/historial` en Node que lea
`conversaciones_ia` filtrando por el `usuario_id` del JWT. La auditoría la marca como
esfuerzo medio y avisa de que no debe hacerse con prisa, porque expone datos de
conversación y el filtro por usuario tiene que ser inviolable. No entra en este bloque.

Limitación práctica de la versión mínima: `sessionStorage` es **por pestaña**. Abrir el
sitio en una pestaña nueva empieza una conversación en blanco, aunque sea el mismo
usuario en el mismo navegador. Guarda los últimos 20 turnos.

### 6.5 Lo que este bloque no arregla y sigue abierto de informes anteriores

Ninguno de estos es del Bloque D; los repito para que la lista quede completa en el
último informe:

- **SEC-08 — rotación de la clave de Gemini.** Sigue pendiente de una acción manual tuya
  en `https://aistudio.google.com/apikey`. La clave actual está en uso y estuvo duplicada
  en texto plano en `backend/.env`.
- **SEC-08 — contraseña de PostgreSQL** trivial en los dos `.env`.
- **Orden de arranque** (informe C, §7.2): desde C8, PostgreSQL debe estar levantado
  **antes** que el microservicio, o este no arranca. Y el servicio de Windows
  `postgresql-x64-18` sigue levantado con `pg_ctl`, fuera del gestor de servicios: **no se
  reiniciará solo** si reinicias la máquina.
- **Cuota de Gemini** (informe C, §7.3): el plan gratuito da 5 peticiones/minuto y 20 al
  día. En esta sesión consumí **4** (1 chat real, 2 de la prueba del rate limit, 1 de
  recomendaciones reales) y me apoyé en respuestas ya obtenidas para el resto, en lugar de
  repetir llamadas. Tenlo en cuenta al ensayar: dos ensayos completos agotan el día.
- **`@app.on_event("shutdown")` obsoleto** (informe C, §7.4): sigue avisando en cada
  arranque. Es un aviso, no un fallo.
- **El proyecto sigue sin pruebas en el repositorio.** Los arneses de esta sesión viven en
  el directorio temporal y **no** se han añadido al repositorio, ni se ha añadido `jsdom`
  a `backend/package.json`. Si quieres conservarlos como base de una suite, dímelo: son
  cuatro archivos y requieren `jsdom` como dependencia de desarrollo.

### 6.6 Estado en que te dejo las cosas

- PostgreSQL: corriendo en el 5432 (levantado con `pg_ctl` en una sesión anterior).
- Microservicio FastAPI: corriendo en `127.0.0.1:8000`, con el modelo verificado.
- Backend Node: corriendo en el 3000 con la configuración normal del `.env`
  (`RATE_LIMIT_IA=5`). La instancia con `RATE_LIMIT_IA=1` que usé para la prueba del rate
  limit está detenida; ese valor se pasó **como variable de entorno del proceso**, nunca
  se escribió en `backend/.env`.
- `python-ia/.env`: restaurado byte a byte tras la prueba del valor por defecto.
- Archivos modificados en este bloque: `python-ia/main.py`,
  `backend/frontend/assets/js/chatwidget.js`,
  `backend/frontend/assets/js/ia-integration.js`,
  `backend/frontend/assets/js/recommendationcards.js`. **Sin commit**, igual que los
  bloques anteriores.
- No se creó ni se modificó ningún otro archivo del repositorio, salvo este informe.

---

## 7. Fuera de alcance de OPCIÓN 1

Se respetó la restricción sin excepciones: **nada de entrenar modelos, redes neuronales
propias, embeddings ni base de datos vectorial.** Lo que el Bloque D roza y no se
implementó, con lo que se hizo en su lugar:

| Lo que haría falta | Por qué queda fuera | Qué se hizo en su lugar |
|---|---|---|
| **Clasificador de intención** del mensaje, en vez de la lista de palabras clave de `ia-integration.js:127-131`, que tiene falsos positivos con las negaciones | Un clasificador entrenado es OPCIÓN 2 | D3: **ofrecer** la acción en vez de ejecutarla. Un falso positivo cuesta un botón ignorado, no una petición de cuota. La lista de palabras clave se dejó intacta |
| **Extracción de entidades (NER)** para sacar asistentes, tipo de evento, presupuesto y fechas del texto libre de forma general | NER supervisado es OPCIÓN 2 | D2: expresiones regulares en tres pasadas + un mapa de 36 números escritos en palabras, y una **pregunta explícita** cuando no se detecta nada |
| **Caché semántica** de respuestas, para ahorrar cuota reutilizando respuestas a preguntas parecidas | La similitud semántica requiere embeddings | Reducción determinista de peticiones: D3 elimina la petición automática (de 2 a 1 por mensaje), y B2/SEC-07 limita por usuario |
| **Resumen del historial** con el modelo para mantener contexto largo sin gastar tokens | Requeriría llamadas extra al modelo; el resumen incremental con embeddings sería OPCIÓN 2 | D4: los últimos 20 turnos en `sessionStorage`, de los que se envían los últimos 5 como contexto (`chatwidget.js:146`) |
| **Estimación del tiempo restante** de la generación a partir del historial de duraciones | No hace falta un modelo, pero sí telemetría que no existe | D5: un contador de **tiempo transcurrido** más el rango observado ("suele tardar entre 20 y 50 segundos"), que es honesto y no promete lo que no se sabe |

---

## 8. Cierre de los cuatro bloques

| Bloque | Hallazgos | Estado |
|---|---|---|
| A — Antes de la presentación (bloqueantes) | 9 | Aplicado (informe A) |
| B — Siguiente iteración | 6 | Aplicado (informe B) |
| C — Calidad de código | 9 | Aplicado (informe C); C6/CAL-04 cerrado aquí |
| D — Experiencia de usuario | 5 | Aplicado en este informe |

Lo que queda abierto no son hallazgos de la auditoría, sino las acciones manuales de §6.5
(rotar la clave de Gemini, contraseña de PostgreSQL, servicio de Windows de PostgreSQL) y
las dos mejoras que la propia auditoría aparca para después: la versión completa de UX-05
(§6.4) y una suite de pruebas en el repositorio (§6.5).
