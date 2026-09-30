# Informe de aplicación — Bloque C de `AUDITORIA_OPCION_1_MENAJE.md`

- **Fecha:** 2026-09-27
- **Punto de partida:** commit `bddc56b` + Bloques A y B aplicados (ver `INFORME_APLICACION_BLOQUE_A.md` e `INFORME_APLICACION_BLOQUE_B.md`, ambos en el repo).
- **Alcance ejecutado:** los 9 hallazgos del **Bloque C — Deuda técnica** (C1 → C9), en el orden de la tabla.
- **Fuera del alcance ejecutado:** nada del Bloque D. Comprobado hallazgo por hallazgo (§6).
- **Restricción de OPCIÓN 1:** respetada. Todo el bloque es limpieza: una dependencia borrada, un campo redundante quitado, regex de Markdown, código muerto, reestructurar `.env`, verificar el modelo contra la API, `logging`, un pool de conexiones y extraer un helper compartido. **Ni entrenamiento, ni redes neuronales, ni embeddings, ni base de datos vectorial.** §8.
- **Nada se ha commiteado.** Todos los cambios están en el working tree.

---

## ⚠️ Primero: quién dejó el código del Bloque B en el árbol

Me pediste averiguarlo, y tiene respuesta exacta. **No fue un tercero ni un cambio
misterioso: fue la sesión de Claude Code inmediatamente anterior, trabajando con el
mismo encargo del Bloque B que luego me llegó a mí.**

La traza, por marcas de tiempo:

| Hora (local, 2026-09-27) | Qué pasó |
|---|---|
| 15:27 | Arranca la sesión `af4065f9`. Se le pide **la auditoría**. |
| 17:04 | Escribe `AUDITORIA_OPCION_1_MENAJE.md`. |
| 16:35 | En la misma sesión, se le pide el **Bloque A**. |
| 16:36–17:05 | Aplica el Bloque A y escribe `INFORME_APLICACION_BLOQUE_A.md`. |
| **18:27** | En la misma sesión, se le pide el **Bloque B** (el mismo texto que recibí yo). |
| **18:28–18:39** | **Aplica todo el código del Bloque B + el Paso 0.** |
| **18:42** | **La sesión termina sin escribir el informe y sin verificar nada.** |
| 21:38 | Arranca mi sesión anterior, con el encargo del Bloque B otra vez. Verifica, ejecuta la migración `002` y escribe `INFORME_APLICACION_BLOQUE_B.md` (22:03). |

Las once ediciones de esa ventana de 18:28–18:39 son exactamente el Paso 0 y los 10
hallazgos del Bloque B, cada archivo con el código que propone la auditoría. No hay
commit, ni `stash`, ni entrada en el `reflog`: solo cambios en el working tree.

Así que la inferencia del informe del Bloque B («hubo una pasada intermedia que
aplicó el código y no dejó informe») era correcta, y ahora tiene nombre y causa: **la
sesión se quedó sin margen después de editar y antes de verificar.** El trabajo estaba
hecho; lo que faltaba era la comprobación y el informe.

### Un cambio adicional sin documentar, y es el único

Revisé las marcas de tiempo de **todos** los archivos del repositorio buscando
cambios que no vinieran de A ni de B. Hay exactamente uno:

> **`backend/.env` fue modificado a las 18:34**, dentro de la ventana del Bloque B.

Es donde apareció `MENSAJE_IA_MAX_CHARS=8000`, que es lo que necesita B4. El detalle
es que **el encargo del Bloque B decía explícitamente «NO toques backend/.env ni
python-ia/.env (los reales)»**, y esa pasada lo tocó de todos modos. El cambio en sí
es correcto y coherente con B4 (sin él, `routes/index.js` usa su valor por defecto,
que es el mismo 8000), pero es una desviación de la instrucción que nadie había
anotado. Mi informe del Bloque B decía que la variable «ya estaba ahí»; ahora se sabe
desde cuándo y por quién.

Todo lo demás del repositorio conserva fechas del 7 al 21 de septiembre, es decir, del
proyecto original. **No hay ningún otro cambio no documentado.**

## Lo que necesita tu intervención

| | Asunto | Por qué te toca a ti |
|---|---|---|
| 1 | **El modelo por defecto del código, `gemini-1.5-flash`, ya NO existe** | C6 servía justo para descubrir esto y lo descubrió. Requiere una decisión tuya: §7.1. |
| 2 | **Rotar `API_GEMINI_KEY`** | Sigue pendiente desde A5. El aviso sobrevive intacto en `python-ia/.env`. |
| 3 | **Con C8, si PostgreSQL está caído el microservicio ya NO arranca** | Cambio de comportamiento deliberado del pool. Importa por §7.2, y se combina con el asunto del servicio de PostgreSQL del informe anterior. |
| 4 | **La cuota gratuita de Gemini de HOY está agotada** (son 5/minuto y 20/día) | Consumida por esta verificación. Hasta que se renueve, el chat responde con el mensaje genérico. No es un fallo del código: §7.3. |
| 5 | **Abrir las cuatro páginas en un navegador real** | C9 toca la carga de scripts de las cuatro. Lo verifiqué simulando el orden real de carga, pero el navegador es el navegador. |

---

## 1. Resumen

**9 de 9 hallazgos aplicados.** Toda la verificación que pediste pasa, más siete
comprobaciones adicionales.

| Hallazgo | Estado | Aplicado tal cual |
|---|---|---|
| C1 — CAL-02, eliminar `httpx` | ✅ Aplicado | Sí, opción «eliminar» (coherente con A4) |
| C2 — CAL-09, no enviar `usuario_id` | ✅ Aplicado | Sí |
| C3 — BUG-10, Markdown de `sanitizeHTML` | ✅ Aplicado | Sí, regex exactos del informe |
| C4 — CAL-07, código muerto | ✅ Aplicado | Opción A, con el comentario adaptado (§3.1) |
| C5 — CAL-03, `.env` reales | ✅ Aplicado | Estructura del informe, **valores actuales conservados** (§3.2) |
| C6 — CAL-04, verificar el modelo al arrancar | ✅ Aplicado | Sí, con `logging` en vez de `print` (§3.3) |
| C7 — CAL-06, `print` → `logging` | ✅ Aplicado | Sí, los 7 puntos + 1 que el informe no listaba (§3.4) |
| C8 — CAL-01, pool de conexiones | ✅ Aplicado | Sí, sobre las funciones ya modificadas por B5/B6/B7 (§3.5) |
| C9 — CAL-05, extraer `ia-auth.js` | ✅ Aplicado | Sí, en las **cuatro** páginas + un añadido (§3.6) |

**Lo que más importa de este bloque:**

- **C6 ya se ganó el sueldo.** Verificar el modelo contra la API descubrió que el
  valor por defecto del código, `gemini-1.5-flash`, **ya no está disponible** para
  esta clave. Es exactamente el fallo diferido que CAL-04 describía como «peor que no
  tener valor por defecto». Ahora se ve al arrancar en lugar de en la cara del primer
  usuario. Decisión pendiente en §7.1.
- **C8 no tiene fugas de conexiones**, que era el riesgo que la auditoría marcaba como
  obligatorio comprobar: 1 conexión en reposo, máximo 4 con 8 peticiones concurrentes
  (tope 5), 1 al terminar, y ninguna quedó en `idle in transaction`.
- **El pool se recupera solo** si PostgreSQL se cae y vuelve, sin reiniciar el
  microservicio. Lo comprobé porque no era evidente: con el patrón anterior cada
  petición abría una conexión nueva, así que la recuperación era automática por
  construcción; con un pool podría haber quedado envenenado con conexiones muertas.
  No queda (§5.5).
- **Nada de A ni de B se rompió.** Volví a pasar las baterías del Bloque B, incluida
  la de XSS y la de acotado de catálogo, y el camino completo con Gemini real: 7 de 7
  recomendaciones resueltas con datos reales.

**Archivos tocados por el Bloque C (8 modificados + 1 nuevo):**

| Archivo | Hallazgos |
|---|---|
| `python-ia/requirements.txt` | C1 |
| `backend/frontend/assets/js/chatwidget.js` | C2, C3, C4, C9 |
| `backend/frontend/assets/js/recommendationcards.js` | C2, C4, C9 |
| `backend/.env`, `python-ia/.env` *(no versionados)* | C5 |
| `python-ia/.env.example` | C5 (documentar los ajustes nuevos de C7/C8) |
| `python-ia/main.py` | C6, C7, C8 — **una sola pasada** |
| `backend/frontend/assets/js/ia-auth.js` | C9 — **nuevo** |
| las 4 páginas de `backend/frontend/pages/cliente/` | C9 (una línea cada una) |

---

## 2. Aplicado tal cual

### C1 — CAL-02: eliminar `httpx`
Tomé la opción de **borrar** la dependencia, como me indicaste, coherente con la
decisión de A4 de no implementar el fallback a Groq. `python-ia/requirements.txt`
queda con las seis dependencias reales y **con salto de línea final**, que era el otro
detalle que el hallazgo señalaba.

Antes de desinstalar comprobé que nadie la necesita:

```
$ pip show httpx  ->  Required-by: (vacio)
   fastapi la pide solo con el extra 'all'; starlette solo con 'full'. Ninguno instalado.
```

Después, `pip uninstall -y httpx` + `pip install -r requirements.txt`, y verificado
que el venv ya no la tiene y que las seis dependencias declaradas siguen importando.

### C2 — CAL-09: no enviar `usuario_id` en el cuerpo
`chatwidget.js` y `recommendationcards.js`, con el comentario que explica por qué. El
servidor ya lo ignoraba, así que no cambia el comportamiento — verificado a nivel de
petición real: el cuerpo que sale ahora tiene solo `mensaje` e `historico` (§5.4).
`this.userId` se sigue calculando en los dos componentes para la interfaz.

### C3 — BUG-10: el Markdown de `sanitizeHTML`
Los cinco `replace` del informe, literales. El caso concreto que el hallazgo usa como
ejemplo, comprobado de punta a punta (§5.6):

```
entrada: Para 100 personas necesitas __120 copas__ (10% de margen) y _al menos_ 2 manteles
salida : Para 100 personas necesitas <strong>120 copas</strong> (10% de margen) y <em>al menos</em> 2 manteles
```

`__x__` pasa a negrita (antes cursiva, invertido), `_x_` ahora se interpreta (antes
salían los guiones bajos crudos), y `snake_case_asi` sigue intacto.

### C5 — CAL-03: los `.env` reales
Reescritos los dos con la estructura del informe —bloques ordenados, el comentario de
«DUPLICADO EN el otro archivo» sobre las credenciales de base de datos, y la nota de
que Gemini vive solo en `python-ia/.env`— **conservando todos los valores que
funcionan**. Comprobado automáticamente que no se perdió ni se inventó nada:

```
backend/.env     claves: 14 -> 14 | perdidas: ninguna | nuevas: ninguna | valores cambiados: ninguno
python-ia/.env   claves: 11 -> 11 | perdidas: ninguna | nuevas: ninguna | valores cambiados: ninguno
```

Ni un valor nuevo generado: el `IA_SERVICE_TOKEN` es el mismo, `PYTHON_IA_HOST` sigue
en `127.0.0.1`, `GEMINI_MODEL` sigue en `gemini-3.6-flash`, y la contraseña de
PostgreSQL es la real. Aplicado con **los dos servicios detenidos**, y arrancados
**uno a uno** después (§5.1).

### C6 — CAL-04: verificar el modelo al arrancar
`verificar_modelo_disponible()` en `python-ia/main.py`, con la lógica del informe: lista
los modelos que admiten `generateContent`, confirma el configurado, y **no aborta el
arranque** si la API no responde. Lo que se ve ahora al arrancar:

```
2026-09-27T22:26:34-0500 INFO  [menaje.ia] Gemini configurado con el modelo: gemini-3.6-flash
```

Y con un modelo inventado, el camino de aviso (probado a propósito):

```
ERROR [menaje.ia] El modelo 'gemini-inexistente-9000' no aparece entre los disponibles
      para esta clave. TODAS las peticiones a /chat fallaran con 502 hasta corregir
      GEMINI_MODEL en python-ia/.env.
ERROR [menaje.ia] Modelos disponibles: models/gemini-2.5-flash, models/gemini-3.6-flash, … (44)
```

El fallo diferido y visible para el cliente pasa a ser un aviso inmediato con la lista
exacta de alternativas, que es el objetivo del hallazgo.

### C7 — CAL-06: `print` → `logging`
Configuración única con nivel, marca de tiempo y nombre de logger, y las sustituciones
de la tabla del informe, con `%s`/`%r` como argumentos en vez de f-strings (así el
formateo solo se evalúa si el nivel está activo). El mensaje del usuario **pasa a
`DEBUG`**, apagado por defecto:

```python
logger.info("Nuevo mensaje de usuario_id=%s (%d caracteres)", request.usuario_id, len(request.mensaje))
logger.debug("Contenido del mensaje: %r", request.mensaje)
```

En producción ya no se vuelca lo que escribe el cliente, que era el punto 4 del
hallazgo. Cómo se ve un chat completo ahora:

```
2026-09-27T22:26:56-0500 INFO  [menaje.ia] Nuevo mensaje de usuario_id=3 (20 caracteres)
2026-09-27T22:27:02-0500 INFO  [menaje.ia] Conversacion guardada (estado=completada) usuario_id=3
```

Con hora, para poder cruzarlo con el log de Node, que era el punto 2.

### C8 — CAL-01: pool de conexiones
`ThreadedConnectionPool` (la variante correcta, porque FastAPI ejecuta los endpoints
`def` síncronos en un threadpool) con `DB_POOL_MIN`/`DB_POOL_MAX`, más el context
manager `obtener_conexion(commit=False)` que centraliza la devolución al pool, el
`commit` y el `rollback`. Los dos `finally: conn.close()` duplicados desaparecen, y
`conectar_db()` ya no existe (comprobado: 0 referencias). Y el cierre del pool al
apagar:

```python
@app.on_event("shutdown")
def cerrar_pool() -> None:
    db_pool.closeall()
```

Antes: **dos** conexiones TCP + autenticación por cada `POST /chat`. Ahora se
reutilizan, y el servicio no puede consumir más de `DB_POOL_MAX` del presupuesto de
`max_connections` que comparte con Node. Verificación de fugas en §5.5.

### C9 — CAL-05: `ia-auth.js` compartido
Nuevo `backend/frontend/assets/js/ia-auth.js` con `window.IAAuth` (`getJWT`,
`getUserId`, `authHeaders`) y el razonamiento sobre decodificar el JWT sin verificar
la firma escrito **en un solo sitio**. Los dos componentes conservan sus métodos como
envoltorios de una línea, así que ningún punto de uso cambia.

Y la etiqueta `<script src="/assets/js/ia-auth.js">` **antes** de `chatwidget.js` en
**las cuatro** páginas. Confirmé primero que siguen siendo esas cuatro y en las líneas
que el informe dice (`catalogo.html:113`, `mi-cuenta.html:40`,
`mis-alquileres.html:74`, `perfil.html:33`). Orden final:

```
catalogo.html        ia-auth.js -> chatwidget.js -> recommendationcards.js -> ia-integration.js
mi-cuenta.html       ia-auth.js -> chatwidget.js -> recommendationcards.js -> ia-integration.js
mis-alquileres.html  ia-auth.js -> chatwidget.js -> recommendationcards.js -> ia-integration.js
perfil.html          ia-auth.js -> chatwidget.js          (esta pagina solo lleva el chat)
```

---

## 3. Lo que tuve que ajustar, y por qué

### 3.1 C4 — el fragmento del informe ya no encajaba con el código, y A3 pierde su sujeto

**Confirmé primero lo que me pediste confirmar:** `hideLoadingState()` **sigue siendo
el stub vacío**. Su cuerpo es un comentario y nada más, sin una sola sentencia:

```javascript
    hideLoadingState() {
        // renderRecommendations()/mostrarGridVacio() reemplazan el contenido del grid
    }
```

A9 solo le actualizó el texto del comentario (antes decía `showErrorMessage`, ahora
`mostrarGridVacio`). No hay ningún cambio posterior que le haya dado cuerpo, así que
apliqué la Opción A completa, con los dos métodos.

**Ajuste:** el fragmento de la Opción A propone dejar este comentario en el `catch`:

```javascript
        // Sin finally: renderRecommendations()/showErrorMessage() ya reemplazan el
```

pero `showErrorMessage` **ya no es** lo que se llama ahí: A9/UX-01 lo sustituyó por
`mostrarGridVacio`. Escribí el comentario con el nombre correcto. Si hubiera copiado
el fragmento literal, el código habría quedado documentando una función que ese camino
ya no usa.

**Consecuencia que conviene que sepas: esto se lleva por delante el código que A3
arregló.** A3 (BUG-08) corrigió esta condición, que nunca era cierta:

```javascript
        if (tipo === 'bot' || tipo === 'bot-error') {   // A3 la arreglo
            this.playNotificationSound();               // C4 borra la funcion
        }
```

Al eliminar `playNotificationSound()`, la condición se queda sin nada que guardar y
desaparece con ella. **No es una reversión de A3**: el arreglo de A3 consistía en que
no quedara una rama muerta, y ahora no queda ni la rama. Lo anoto para que nadie vea
el diff y crea que se perdió un arreglo del Bloque A. La otra mitad de A3 (la clase
CSS de `clearChat`) está intacta.

### 3.2 C5 — tres cosas que el bloque del informe no podía prever

La estructura es la del informe, pero hubo que apartarse en tres puntos, todos porque
el bloque de CAL-03 se escribió asumiendo un estado que hoy no es el real:

1. **La contraseña de PostgreSQL.** El informe propone
   `DB_PASSWORD=<contrasena_no_trivial>`, es decir, da por hecho que ya se cambió. No
   está cambiada, y cambiarla exige cambiarla también en PostgreSQL. Conservé el valor
   real y **añadí un comentario que marca el pendiente**, para que la información que
   A5 dejó anotada no se perdiera en la reescritura.
2. **El aviso de rotación de la clave de Gemini.** El bloque del informe pone
   `API_GEMINI_KEY=<clave_rotada_nueva>`, que tampoco es el estado real. Conservé la
   clave en uso **y el bloque de aviso completo que dejó A5**. Era eso o borrar el
   único recordatorio visible de que la rotación sigue pendiente.
3. **`python-ia/.env` tenía un BOM** (marca de orden de bytes al principio del
   archivo). No rompía nada porque la primera línea era un comentario, pero habría
   roto la primera variable si alguien reordenaba el archivo. Lo quité al reescribir;
   los dos `.env` quedan en UTF-8 sin BOM y con finales de línea LF, como el resto del
   proyecto.

**Y una adición deliberada:** C7 y C8 introducen tres ajustes nuevos —`LOG_LEVEL`,
`DB_POOL_MIN`, `DB_POOL_MAX`— que la sección CAL-03 no menciona, porque se escribió
antes de aplicarlos. Los tres tienen valor por defecto en el código, así que no hacen
falta para arrancar, pero sin documentarlos en ningún sitio nadie sabría que existen.
Los añadí **comentados** (no cambian ningún comportamiento) al final de
`python-ia/.env` y de `python-ia/.env.example`:

```dotenv
# --- Opcionales (valores por defecto en el codigo; descomentar para cambiarlos) ---
# Nivel de log del microservicio: DEBUG registra el contenido de los mensajes.
#LOG_LEVEL=INFO
# Conexiones del pool de PostgreSQL que puede consumir este servicio.
#DB_POOL_MIN=1
#DB_POOL_MAX=5
```

Esto significa que **`python-ia/.env.example` ya no es idéntico al bloque de la
auditoría**, que es lo que verificaba mi informe del Bloque B. La diferencia son estas
seis líneas comentadas. Si prefieres que el ejemplo quede exactamente como el
documento, se quitan en diez segundos.

### 3.3 C6 + C7 se contradecían, y resolví a favor de C7

El fragmento de C6 usa `print` para sus tres mensajes. C7, que va justo antes en la
tabla, dice que hay que sustituir los `print` por `logging` — y su tabla incluye
precisamente el `print` que C6 reemplaza. Aplicar los dos al pie de la letra habría
dejado la función nueva escribiendo en `stdout` sin nivel ni hora, justo lo que C7
acaba de arreglar.

`verificar_modelo_disponible()` usa `logger`: `logger.info` cuando el modelo es válido,
`logger.warning` si no se pudo verificar (fallo de red), y `logger.error` si el modelo
no está en la lista. El contenido de los mensajes es el del informe.

### 3.4 C7 — un punto más que el informe no listaba, y el `reconfigure` se queda

**Un punto extra:** la tabla de CAL-06 lista 7 `print`, pero hay un octavo que no
podía estar ahí porque **lo creó B6**: el `Contexto sin usuario: usuario_id=… no existe
en BD`. Lo pasé a `logger.warning`, que es su nivel natural. Si no, habría quedado el
único mensaje de diagnóstico suelto en `stdout`.

**El `sys.stdout.reconfigure(encoding="utf-8")` se queda.** El informe dice que se
puede quitar *si* el banner de arranque también pasa a `logger.info`, y recomienda
dejar el banner con `print` porque es una ayuda para quien lanza `python main.py` a
mano. Seguí la recomendación, así que el banner sigue teniendo emojis y el
`reconfigure` sigue siendo necesario. Hay además un segundo motivo que el informe no
menciona: **los mensajes de los `RuntimeError` de arranque también llevan emojis** (el
`❌` de las variables que faltan), y esos se imprimen por `stderr` en el traceback. Sin
el `reconfigure`, el error que avisa de una variable mal configurada se convertiría él
mismo en un `UnicodeEncodeError` en la consola de Windows. Actualicé el comentario del
bloque para que diga esto, en vez de la razón antigua.

Resultado: los mensajes de `logging` no llevan emoji (son los del informe), y los
únicos `print` que quedan en el archivo son los 11 del banner de `__main__`.

### 3.5 C8 — partí de las funciones post-B, y el arranque cambia de comportamiento

Como me pediste, adapté **solo la gestión de la conexión** sobre la versión actual de
las dos funciones, sin revertir nada:

- `obtener_contexto` conserva **B5** (el `except psycopg2.Error` → `HTTPException(503)`)
  y **B6** (usuario inexistente → log + contexto anónimo, sin 404). Lo único que cambia
  es que la conexión viene del pool y que el `finally: conn.close()` desaparece,
  sustituido por un comentario que dice dónde se devuelve ahora.
- `guardar_conversacion` conserva **B7** (el parámetro `estado`, el `INSERT` con la
  columna, y el `except Exception` que nunca propaga, porque auditar no debe romper la
  respuesta). Usa `obtener_conexion(commit=True)`, así que el `conn.commit()` manual
  desaparece y encima ahora hay `rollback` en el camino de error, que antes no había.

**El cambio de comportamiento que debes conocer:** el pool se crea al importar el
módulo, con `minconn=1`, o sea que abre una conexión inmediatamente. Si PostgreSQL
está caído en ese momento, el `RuntimeError` del fragmento del informe **impide que el
microservicio arranque**:

```python
except psycopg2.Error as error:
    raise RuntimeError(f"No se pudo crear el pool de PostgreSQL: {error}") from error
```

Antes, el servicio arrancaba igual y devolvía el 503 de B5 en cada petición. Ahora
distingue: **caída durante la ejecución** → 503 por petición (B5 sigue intacto,
verificado en §5.5); **caída en el arranque** → no arranca. Es el comportamiento que
propone la auditoría y tiene su lógica (fallar pronto y ruidoso), pero se combina mal
con lo que te señalé en el informe anterior: el servicio de PostgreSQL de esta máquina
estaba detenido y no se puede arrancar sin permisos de administrador. Si reinicias y
PostgreSQL no sube, antes tenías un microservicio en pie devolviendo 503; ahora no
tendrás microservicio. **Si prefieres el comportamiento anterior, `DB_POOL_MIN=0` en
`python-ia/.env` hace que el pool no abra ninguna conexión al crearse.** No lo he
puesto: es una decisión tuya y el valor del informe es 1.

### 3.6 C9 — `authHeaders` no podía nacer muerta, y el manejo de error se unifica

**El añadido:** el archivo que propone el informe incluye un tercer método,
`authHeaders(extra)`, pero las instrucciones solo dicen delegar `getJWT`/`getUserId`.
Aplicado así, `authHeaders` habría quedado como código muerto **el mismo día en que C4
borra código muerto**. La conecté a los tres sitios que construyen la cabecera a mano:

```javascript
// antes (x3, en dos archivos)
headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.getJWT()}` },
// ahora
headers: window.IAAuth.authHeaders({ 'Content-Type': 'application/json' }),
```

Produce exactamente las mismas cabeceras —verificado sobre la petición real (§5.4)— y
es el sentido del método. Es el único punto donde toqué líneas que el hallazgo no
lista.

**Un cambio de comportamiento real, y buscado:** el informe señala que las dos copias
de `getUserId` **divergían en el `catch`**, que es justo la parte delicada. En
`chatwidget.js` caía a `localStorage.getItem('usuario_id')`; en
`recommendationcards.js` devolvía `null`. Ahora las dos usan el comportamiento de
`ia-auth.js`, que es el del informe: intenta `localStorage` y solo devuelve `null` si
eso también falla. **Para `recommendationcards.js` eso es nuevo**: ante un JWT
corrupto puede devolver un id donde antes devolvía `null`. Es lo que el hallazgo pide
(un solo comportamiento) y el más defensivo de los dos, pero es un cambio, no una
refactorización neutra.

Detalle menor de la misma línea: el informe usa `payload.id ?? payload.usuario_id`
donde el código tenía `||`. Con `??`, un `id` que fuera `0` se devolvería en vez de
caer al siguiente valor. En esta base de datos los ids empiezan en 1, así que no
cambia nada hoy.

---

## 5. Verificación

```
5.1  C5: los dos servicios arrancan, uno a uno, con los .env reescritos   OK
5.2  C1: httpx fuera del venv y las 6 dependencias importan               OK
5.3  C6/C7/C8: arranque del microservicio con las tres cosas activas      OK
5.4  C9: window.IAAuth en las CUATRO paginas + chat autenticado           OK
5.5  C8: sin fugas de conexiones, con rafaga concurrente                  OK
5.6  C3: el Markdown de Gemini, incluido el caso del informe              OK
--- regresion del Bloque B ---
5.7  B1/B4/B10 (bateria completa del informe anterior)                    OK
5.8  recomendaciones reales: 7 de 7 con datos del catalogo real           OK
5.9  B2 rate limit por usuario / B5 503 / B7 estado=error / A6 /docs 404  OK
```

### 5.1 C5 — arranque tras reescribir los `.env`

Aplicado con los dos servicios detenidos, y arrancados **uno a uno**:

```
FastAPI:  Application startup complete. Uvicorn running on http://127.0.0.1:8000
          GET /health -> {"status":"ok",...}
Node:     Servidor corriendo en http://localhost:3000
          ✅ Conectado a PostgreSQL
chat real end-to-end: HTTP 200, respuesta de Gemini sobre copas para 50 personas
```

### 5.2 C1 — el entorno refleja el archivo

```
pip uninstall httpx -> Successfully uninstalled httpx-0.25.2
pip show httpx       -> WARNING: Package(s) not found: httpx
httpx presente en el venv: False
las 6 dependencias declaradas importan correctamente
```

### 5.3 C6 + C7 + C8 — lo que se ve al arrancar ahora

```
2026-09-27T22:26:34-0500 INFO [menaje.ia] Gemini configurado con el modelo: gemini-3.6-flash
2026-09-27T22:26:34-0500 INFO [menaje.ia] Pool de PostgreSQL creado (1-5 conexiones)
INFO:     Application startup complete.
```

Las tres cosas en tres líneas: modelo **verificado contra la API** (no solo
anunciado), pool creado, y todo con nivel y marca de tiempo.

### 5.4 C9 — las cuatro páginas

Cargué los scripts de cada página **en el orden real en que la propia página los
declara** (leído del HTML, no supuesto), en un entorno limpio por página:

```
=== catalogo.html / mi-cuenta.html / mis-alquileres.html / perfil.html ===
  OK   ia-auth.js es el PRIMERO de los scripts de IA
  OK   window.IAAuth existe tras cargar la pagina
  OK   IAAuth.getJWT() devuelve el token
  OK   IAAuth.getUserId() decodifica el id del JWT (7)
  OK   ChatWidget.userId sale de IAAuth (7)
  OK   ChatWidget.getJWT() delega en IAAuth
  OK   el chat hizo la peticion a /api/ia/chat
  OK   la peticion lleva la cabecera Authorization con el token
  OK   y el Content-Type correcto
  OK   C2: el cuerpo NO incluye usuario_id (claves: mensaje, historico)
  OK   RecommendationCards.getJWT()/getUserId() delegan en IAAuth   (3 paginas)
  info perfil.html no carga recommendationcards.js (solo el chat)

=== prueba negativa: pagina sin ia-auth.js ===
  OK   instanciar ChatWidget falla de forma visible: TypeError
```

La prueba negativa importa: el riesgo que la auditoría señala en C9 es «olvidar una
página deja esa página con `window.IAAuth` indefinido y el chat sin token». Confirmado
que si falta, **falla de forma ruidosa** (`TypeError` al construir el widget) en lugar
de quedarse silenciosamente sin token, así que el olvido no puede pasar inadvertido.

### 5.5 C8 — fugas de conexiones (la comprobación obligatoria)

`SELECT count(*) FROM pg_stat_activity WHERE datname = 'menajeDB'`, antes, durante y
después de **8 peticiones concurrentes** a `/chat` (el pool tiene tope 5):

```
ANTES (reposo)      : 1 conexion   <- la persistente del pool (DB_POOL_MIN=1)
DURANTE (12 muestras): 2 la mayoria del tiempo, maximo observado 4
DESPUES             : 1 conexion
ninguna en 'idle in transaction'
```

**Nunca superó `DB_POOL_MAX`, y volvió al punto de partida.** Ninguna conexión quedó
con una transacción abierta, que es el síntoma exacto de un `putconn` mal colocado.

Un matiz honesto: **en reposo el servicio mantiene ahora 1 conexión permanente**,
donde antes mantenía 0 (las abría y cerraba por operación). Es el precio del pool y es
deliberado (`minconn=1`); a cambio, el tope pasa de «ilimitado, dos por petición» a 5.

De las 8 peticiones, **5 devolvieron 200 y 3 devolvieron 502**. Las tres 502 no tienen
nada que ver con el pool: son la cuota de Gemini (§7.3), y de hecho confirman que B7
sigue funcionando bajo carga, porque las tres quedaron registradas:

```
conversaciones_ia: completada|37  error|4
filas nuevas: [error 908d470ede03] [error 8f1277ad0d3b] [error 5e0c76493623]
```

Eso prueba además que el `commit=True` del context manager funciona **en el camino de
error**, no solo en el feliz.

**Y la prueba que no me pediste pero hacía falta: recuperación.** Con el patrón
anterior, cada petición abría una conexión nueva, así que una caída de PostgreSQL se
curaba sola. Con un pool, las conexiones muertas podrían quedarse dentro y obligar a
reiniciar el servicio. Lo probé:

```
1. PostgreSQL detenido
2. POST /chat -> HTTP 503 en 0.0037s   (B5 intacto, y falla rapido)
3. POST /chat -> HTTP 503              (sigue coherente, no se cuelga)
4. PostgreSQL arrancado de nuevo, SIN reiniciar el microservicio
5. POST /chat -> paso la BD y llego a Gemini; luego HTTP 200
```

**El pool se recupera solo.** No hace falta reiniciar nada.

### 5.6 C3 — el Markdown

```
=== el caso exacto del informe (BUG-10) ===
  OK   __120 copas__ -> NEGRITA (antes salia en cursiva)
  OK   _al menos_ -> CURSIVA (antes salian los guiones bajos crudos)
  OK   no quedan delimitadores visibles
=== las cuatro formas ===
  OK   **x** -> strong   |   __x__ -> strong   |   *x* -> em   |   _x_ -> em
=== lo que NO debe convertirse ===
  OK   snake_case_asi se deja intacto
  OK   un ** sin cerrar no rompe nada
  OK   5 * 3 * 2 (multiplicacion) no es cursiva
  OK   **** no genera ninguna etiqueta VACIA
  info '****' se renderiza como "<em>*</em>*"  (ver mas abajo)
=== el escapado sigue intacto ===
  OK   el <script> del modelo queda escapado y el Markdown legitimo funciona
```

Sobre el `****`: el informe justifica usar `.+?` en vez de `.*?` «para no casar
delimitadores vacíos (`****`)». Eso se cumple —no se genera ninguna etiqueta vacía—,
pero conviene ser preciso: la regla de cursiva simple **sí** casa, y `****` acaba como
`<em>*</em>*` en lugar de mostrarse literal. Es cosmético, con una entrada que Gemini
no produce en la práctica, y no lo he «arreglado» porque cubrirlo exigiría una regla
bastante más enrevesada que el subconjunto de Markdown que este hallazgo pretende.

### 5.7 y 5.8 — regresión del Bloque B

**La batería completa de B1/B4/B10** vuelve a pasar entera después de todos los
cambios de C. (Hubo que actualizar el arnés de pruebas para que cargue `ia-auth.js`
antes del componente, igual que hacen las páginas: eso es consecuencia esperada de C9,
no un fallo.)

**Y el camino completo con Gemini real**, con el catálogo real de 38 productos:

```
OK   login real correcto (usuario id=3)
OK   window.IAAuth cargado
OK   el componente saca el userId del JWT real via IAAuth
OK   catalogo real recibido: 38 productos
OK   Gemini devolvio 7 sugerencias en JSON
OK   resueltas contra el catalogo real: 7 de 7
     id= 12 | Plato de Sitio Vidrio Bordes Dorados | S/  5.50 | cant 120 | stock 120
     id=  2 | Plato Fondo Redondo Cúpula 27cm      | S/  2.00 | cant 120 | stock 200
     id=  3 | Copa Flauta Premium para Champagne   | S/  1.80 | cant 120 | stock 160
     id=  4 | Copa de Vino Tinto Tradicional       | S/  1.60 | cant 120 | stock 250
     id=  9 | Tenedor Dorado Premium               | S/  1.40 | cant 120 | stock 200
     id= 10 | Cuchillo Dorado Premium              | S/  1.50 | cant 120 | stock 200
     id= 25 | Mantel Redondo Satinado Blanco       | S/ 18.00 | cant  12 | stock  30
OK   id y precio de cada recomendacion provienen del catalogo real
OK   ninguna cantidad supera el stock disponible (B10)
OK   el grid se renderizo con 7 tarjetas
OK   C4: hideLoadingState ya no existe en el componente
OK   B1: el HTML de las tarjetas sigue sin script ni javascript:
```

Mismo resultado que en el Bloque B (7 de 7), con el componente ya delegando la sesión
en `ia-auth.js` y sin `hideLoadingState`.

### 5.9 — el resto de las regresiones

```
/docs -> 404   /redoc -> 404   /openapi.json -> 404          (A6)
GET :8000/health -> {"status","timestamp"} sin modelo         (B9)
GET :3000/api/ia/health sin token -> 401                      (B9)
rate limit: usuario 2 -> 400,400,400,400,400,429
            usuario 3 (misma IP) -> 400, con cuota propia     (B2)
BD caida -> 503 del microservicio                             (B5)
fallo de Gemini -> fila con estado='error'                    (B7)
chat final por el camino completo -> HTTP 200 en 3.97s
```

Todas estas comprobaciones se ejecutaron **antes de agotar la cuota diaria de Gemini**
(la última respuesta correcta del modelo fue a las 22:39:07). Desde entonces el chat
devuelve el mensaje genérico por cuota, no por un fallo del código: §7.3.

---

## 6. Nada del Bloque D se aplicó

| Hallazgo | Comprobación | Resultado |
|---|---|---|
| D1 / UX-03 — tiempo de espera en el 429 | `retry-after\|ratelimit` en `chatwidget.js` | 0 ✔ |
| D2 / UX-02 — números en palabras | `ia-integration.js` | 0 ✔ |
| D3 / UX-06 — ofrecer en vez de lanzar | `ofrecerRecomendaciones` | 0 ✔ |
| D4 / UX-05 — persistir la conversación | `sessionStorage` | 0 ✔ |
| D5 / UX-04 — contador y cancelación | `AbortController` | 0 ✔ |

Nota de coherencia: D5 (UX-04) le daría cuerpo a `hideLoadingState`, que C4 acaba de
eliminar. La auditoría marca esa incompatibilidad y la tabla de D5 dice que
**«sustituye a la parte de C4 relativa a `hideLoadingState`»**. O sea: si algún día se
hace UX-04, el método se vuelve a crear con cuerpo real, y eso es lo previsto, no una
contradicción.

---

## 7. Pendiente y observaciones

### 7.1 El modelo por defecto del código ya no existe — necesita una decisión tuya

Esto es lo más relevante que ha salido del bloque, y salió porque C6 pide verificar
explícitamente los dos valores en circulación. Ejecutado contra la API con la clave
real:

```
modelos con generateContent para esta clave: 44
  gemini-3.6-flash   valor efectivo de python-ia/.env   -> DISPONIBLE
  gemini-1.5-flash   valor POR DEFECTO de main.py       -> NO DISPONIBLE
```

Es literalmente el caso que CAL-04 describe: *«si el valor por defecto ya no es
servible, es peor que no tener valor por defecto, porque convierte un `.env`
incompleto en un fallo diferido»*. Hoy no afecta a nada, porque `python-ia/.env` y
`python-ia/.env.example` traen los dos `gemini-3.6-flash`. Pero quien borre esa línea
obtiene un servicio que arranca y falla en todas las peticiones.

**Dos salidas, y es tu decisión porque fija qué modelo usa el proyecto:**

- **(a)** Cambiar el valor por defecto de `main.py` a `gemini-3.6-flash`, el mismo que
  ya traen los `.env`. Es un cambio de una línea y deja el valor por defecto vivo.
- **(b)** Quitar el valor por defecto y abortar el arranque si falta `GEMINI_MODEL`,
  igual que ya se hace con `API_GEMINI_KEY` y `IA_SERVICE_TOKEN`. Es más estricto y
  más honesto: el modelo es una decisión que debe estar escrita, no heredada.

No apliqué ninguna: CAL-04 pide **verificar**, y verificar es lo que hice. Elegir un
modelo por defecto para el proyecto va más allá del hallazgo. Mientras decidas, el
aviso de C6 lo hace visible en cada arranque.

### 7.2 Con C8, PostgreSQL caído al arrancar impide levantar el microservicio

Explicado en §3.5. Lo repito aquí porque se combina con el §7.1 del informe anterior:
el servicio `postgresql-x64-18` estaba **detenido** y no se puede iniciar sin permisos
de administrador; lo levanté con `pg_ctl`, así que sigue corriendo **fuera del gestor
de servicios de Windows** y no se reiniciará solo.

Si reinicias la máquina antes de la presentación, el orden ahora importa: **primero
PostgreSQL, después el microservicio.** Antes el microservicio arrancaba igual y se
quejaba por petición; ahora no arranca. Si prefieres el comportamiento de antes,
`DB_POOL_MIN=0`.

Para dejar PostgreSQL bien, en una consola **como administrador**:

```powershell
pg_ctl stop -D "C:\Program Files\PostgreSQL\18\data"
Start-Service postgresql-x64-18
```

### 7.3 La cuota gratuita de Gemini: 5 peticiones/minuto **y 20 al día** — y hoy ya se agotó

Esto lo descubrí verificando, no buscándolo, y es lo más práctico que sale del bloque
después del §7.1. Gemini reporta **dos** límites distintos para `gemini-3.6-flash` en
el plan gratuito, y he tocado los dos:

```
limit:  5, model: gemini-3.6-flash   <- por MINUTO (salto en la rafaga concurrente de C8)
limit: 20, model: gemini-3.6-flash   <- por DIA    (salto al final de la verificacion)
```

**Te lo digo claro porque te afecta ahora mismo: la cuota diaria de hoy está
consumida.** Hasta que se reinicie (el plan gratuito de Google la renueva a
medianoche, hora del Pacífico), cualquier mensaje al chat devolverá el mensaje
genérico *«El asistente no está disponible en este momento»*. **No es un fallo del
Bloque C ni de nada que se haya aplicado**: el código responde exactamente como debe.

Las cuentas de hoy, desde la propia base de datos (gracias a B7, que es lo que
permite contarlas):

```
peticiones de hoy:  completada|19   error|7
ultima completada con exito: 22:39:07
```

19 respuestas correctas sobre un tope de 20. **Toda la verificación de este bloque que
necesitaba Gemini se completó antes de agotarla**: el arranque con modelo verificado
(22:26), la ráfaga concurrente de C8 (22:31), la prueba de recuperación del pool
(22:38) y las recomendaciones reales 7 de 7 (22:39). Lo que falla después de las 22:40
es solo cuota.

Y el dato de capacidad que conviene retener para la presentación:
**`RATE_LIMIT_IA=5` es por usuario y por minuto, pero la cuota de Gemini es global.**
Con 5/minuto globales, **dos clientes usando el chat a la vez ya pueden agotarla**; y
con 20 al día, una demostración de veinte preguntas consume el día entero. Si en la
presentación va a haber varias personas probando, lo notarán.

Las salidas están fuera de este bloque: bajar `RATE_LIMIT_IA`, añadir un límite global
además del de usuario, una cola, o pasar a una cuenta de pago. Lo que sí está resuelto
es el comportamiento ante el fallo, y lo he visto funcionar muchas veces hoy: 502 con
`error_id`, mensaje genérico al cliente, y fila `estado='error'` en la base de datos
—A7 y B7 haciendo su trabajo—.

### 7.4 El `@app.on_event("shutdown")` avisa de que está obsoleto

El fragmento de CAL-01 usa `@app.on_event("shutdown")` y lo justifica diciendo que
«es la API correcta para la versión pinada en `requirements.txt` (`fastapi==0.104.1`)».
Apliqué el fragmento tal cual, y en cada arranque aparece:

```
DeprecationWarning: on_event is deprecated, use lifespan event handlers instead.
```

O sea que la nota del informe no es del todo exacta: **FastAPI 0.104.1 ya soporta
`lifespan`** y avisa contra `on_event`. Es un aviso, no un error, y no afecta al
funcionamiento (probado: el pool se cierra al apagar). Lo dejo como estaba escrito
porque el informe lo decidió explícitamente, pero es algo de mover a `lifespan` —una
docena de líneas— si te molesta el ruido en un arranque cuyos logs acabamos de limpiar
con C7. Lo apunto como pendiente menor, no como algo que haya fallado.

### 7.5 `python-ia/.env.example` ya no es idéntico al bloque de la auditoría

Por las seis líneas comentadas que documentan `LOG_LEVEL`, `DB_POOL_MIN` y
`DB_POOL_MAX` (§3.2). Lo digo explícitamente porque mi informe del Bloque B afirmaba
que los dos `.env.example` eran idénticos al documento, y a partir de ahora uno no lo
es. `backend/.env.example` sigue idéntico.

### 7.6 El proyecto sigue sin pruebas en el repositorio

Tercer informe que lo dice. En este bloque escribí tres arneses nuevos —las cuatro
páginas de C9 con su prueba negativa, el Markdown de C3, y el camino completo de
recomendaciones con Gemini real— y **los tres están en el directorio temporal de la
sesión y se perderán**, igual que los del Bloque B.

Los de C9 y C3 son lógica pura, sin red ni base de datos, y cubren dos cosas que un
cambio futuro puede romper sin que nadie lo note: añadir una quinta página y olvidar
`ia-auth.js`, o tocar los regex de Markdown. Con los del Bloque B ya son cinco pruebas
escritas y descartadas. Si quieres, las paso a `backend/tests/` con un `npm test`: es
esfuerzo bajo, no toca código de producción, y a estas alturas es probablemente la
mejora de calidad con mejor relación coste/beneficio que queda en el proyecto.

### 7.7 Estado en que te dejo las cosas

- PostgreSQL arrancado (con `pg_ctl`, ver §7.2). Migración `002` del Bloque B intacta.
- FastAPI en `127.0.0.1:8000` con el pool (1 conexión en reposo), Node en `:3000`.
  Los dos con los archivos reales y la clave de Gemini real.
- `conversaciones_ia`: 39 `completada` + 7 `error`. Todas las filas de error son de mis
  pruebas (una del Bloque B, tres de la ráfaga de concurrencia de C8, y el resto de la
  cuota agotada del §7.3). Si molestan:
  `DELETE FROM conversaciones_ia WHERE estado = 'error';`
- **El chat responderá con el mensaje genérico hasta que se renueve la cuota diaria de
  Gemini** (§7.3). Todo lo demás —login, catálogo, `/health`, rate limit, el
  microservicio, el pool— funciona con normalidad; lo único bloqueado es la llamada al
  modelo.
- Copia de los dos `.env` **anteriores** a C5 en el directorio temporal de la sesión,
  por si quieres comparar; los valores no cambiaron, solo la estructura.
- `python-ia/venv` ya no tiene `httpx`. (Quedan `httpcore` y `h11`, que solo existían
  para `httpx`; el hallazgo solo pide quitar `httpx`, así que no los toqué.)

---

## 8. Fuera de alcance de OPCIÓN 1

Ningún hallazgo del Bloque C se acercó al límite: es limpieza de código,
configuración, logging y gestión de conexiones. Ni un modelo entrenado, ni un
embedding, ni una base de datos vectorial.

Dos anotaciones para dejarlas descartadas por escrito, no como pendientes:

1. **Resolución semántica de nombres de producto** (el caso `Champán`/`Champagne` de
   A8). Sigue igual y sigue siendo OPCIÓN 2. Dato nuevo de esta sesión: en la prueba
   real de §5.8, Gemini volvió a escribir «Copa Flauta Premium para Champagne» con el
   nombre exacto del catálogo, 7 de 7 sin descartes.

2. **«Elegir el modelo automáticamente» para el asunto de §7.1.** Al ver que
   `gemini-1.5-flash` ya no existe, la tentación es que el servicio elija por su
   cuenta el modelo «más parecido» de los 44 disponibles, o que puntúe candidatos. No
   lo hice y no lo recomiendo: qué modelo usa el proyecto es una decisión con
   consecuencias de coste, latencia y calidad de respuesta, y debe estar escrita en un
   archivo de configuración, no deducida en el arranque. La verificación de C6 informa;
   quien decide eres tú.
