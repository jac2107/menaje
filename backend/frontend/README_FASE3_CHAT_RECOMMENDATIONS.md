# FASE 3: Chat Widget + Recommendation Cards (OPCIÓN 1 - IA Gemini)

## Descripción

FASE 3 integra un chat conversacional con Google Gemini y un sistema de
recomendaciones automáticas de menaje. El usuario obtiene sugerencias de
productos reales del catálogo sin hablar con un vendedor.

## Funcionalidades

### 1. Chat Widget (`assets/js/chatwidget.js`)
Burbuja flotante en la esquina inferior derecha. Envía el mensaje del
usuario a `POST /api/ia/chat` junto con los últimos 5 turnos de la
conversación (`historico`), muestra un indicador de "escribiendo" mientras
espera la respuesta de Gemini y hace `throw`/muestra error si el backend
responde 401, 429 o 500.

Incluido en: `catalogo.html`, `mis-alquileres.html`, `mi-cuenta.html` y
`perfil.html`.

### 2. Recommendation Cards (`assets/js/recommendationcards.js`)
Modal con formulario (tipo de evento, número de asistentes, presupuesto
opcional). Al enviarlo:
1. Pide el catálogo real vía `GET /api/productos/catalogo` (requiere JWT).
2. Construye un prompt que **incluye el catálogo completo** y le pide a
   Gemini que responda solo con un arreglo JSON `[{nombre, cantidad, motivo}]`
   usando exclusivamente nombres de esa lista.
3. Parsea el JSON (tolerando que Gemini lo envuelva en \`\`\`json\`\`\`).
4. Resuelve cada nombre contra el catálogo real para obtener `id`, precio y
   stock verdaderos, descartando cualquier nombre que Gemini haya
   inventado (alucinación).
5. Renderiza las tarjetas con esos datos reales y permite agregarlas al
   carrito existente.

Incluido en: `catalogo.html`, `mis-alquileres.html`, `mi-cuenta.html`.
**No** está incluido en `perfil.html` (esa página solo tiene el chat).

### 3. IA Integration (`assets/js/ia-integration.js`)
Detecta palabras clave en los mensajes del chat ("menaje para", "boda",
número de asistentes, etc.) y ofrece abrir automáticamente el modal de
recomendaciones con esos datos precargados.

## Arquitectura

```
Frontend (chatwidget.js / recommendationcards.js)
    ↓ POST /api/ia/chat  (JWT + rate limit)
Node.js :3000  (backend/routes/index.js)
    ↓ HTTP interno
FastAPI :8000  (python-ia/main.py)
    ↓
Google Gemini API (modelo configurado en python-ia/.env → GEMINI_MODEL)
    ↓
Node.js INSERT en tabla `conversaciones_ia` (PostgreSQL)
```

## Cómo ejecutar

```bash
# Terminal 1: FastAPI
cd python-ia
venv\Scripts\activate
python main.py          # → http://0.0.0.0:8000

# Terminal 2: Node.js
cd backend
node server.js           # → http://localhost:3000
```

Abrir `http://localhost:3000/pages/cliente/catalogo.html` e iniciar sesión
con un usuario `cliente` existente en la base de datos (ver `database/seed_demo.sql`).

## Configuración (variables de entorno)

`backend/.env` y `python-ia/.env` deben tener `API_GEMINI_KEY` con una API
key válida de Google AI Studio, y `GEMINI_MODEL` con un modelo vigente
(ver "Nota sobre el modelo de Gemini" más abajo). `RATE_LIMIT_IA` en
`backend/.env` controla las solicitudes por minuto permitidas a
`/api/ia/chat` (verificado en 5/min, ver sección de Testing).

## Nota sobre el modelo de Gemini

`backend/.env` todavía tiene `GEMINI_MODEL=gemini-1.5-flash`, pero ese
valor no lo usa ningún proceso: el que realmente llama a Gemini es
`python-ia/main.py`, que lee su propio `python-ia/.env`. Ahí el modelo
configurado y verificado como funcional en esta fase es
`gemini-3.6-flash` (confirmado en `GET /health` y en las respuestas reales
de chat). Se recomienda actualizar `backend/.env` para que no quede
desactualizado, aunque hoy no afecta el funcionamiento.

## Testing realizado (FASE 4)

Con ambos servidores corriendo localmente y usando el usuario
`cliente.demo@menaje.com` (password en `seed_demo.sql`):

| Prueba | Resultado |
|---|---|
| `POST /api/auth/login` | ✅ 200, devuelve JWT válido |
| `GET /api/productos/catalogo` sin JWT | ✅ 401 (protegido correctamente) |
| `GET /api/productos/catalogo` con JWT | ✅ 200, 38 productos reales |
| `GET /api/ia/health` | ✅ `{"success":true,"ia_disponible":true}` |
| `POST /api/ia/chat` (mensaje simple) | ✅ 200, respuesta de Gemini en ~18s, usando datos reales del catálogo |
| Rate limiting (6 requests seguidos) | ✅ los primeros pasan, luego 429 al superar 5/min |
| Flujo completo de recomendaciones (prompt con catálogo completo + parseo JSON) | ✅ Gemini devuelve JSON válido con nombres que existen exactamente en el catálogo (sin alucinaciones) |
| Persistencia en `conversaciones_ia` | ✅ cada chat exitoso agrega una fila (`id, usuario_id, mensaje_usuario, respuesta_ia, timestamp, tokens_usados, estado`) |

### Bug encontrado y corregido durante el testing

El formulario de recomendaciones arma un mensaje que incluye **el
catálogo completo** (nombre, categoría, precio y stock de cada producto).
Con los 38 productos actuales ese mensaje mide ~3.4 KB, pero
`backend/routes/index.js` rechazaba cualquier `mensaje` de más de 2000
caracteres con `400 - "El mensaje es muy largo"`. Esto significaba que el
botón "Generar Recomendaciones" **fallaba siempre** con el catálogo real
(aunque el chat simple sí funcionaba, porque esos mensajes son cortos).

Se subió el límite a 6000 caracteres (`backend/routes/index.js`, línea de
la validación de longitud) y se volvió a probar el flujo completo: ahora
Gemini responde correctamente con el JSON esperado. Si el catálogo sigue
creciendo, este límite debería revisarse de nuevo o cambiar el prompt para
enviar solo un subconjunto de productos relevantes en vez del catálogo
completo.

## Troubleshooting

**El chat no conecta:** confirmar que Node (`:3000`) y FastAPI (`:8000`)
están corriendo (`curl http://localhost:3000/api/ia/health`).

**Error 429:** se superaron las 5 solicitudes/minuto configuradas en
`RATE_LIMIT_IA`; esperar y reintentar.

**Error 400 "mensaje muy largo":** si el catálogo crece mucho más, el
límite de 6000 caracteres en `backend/routes/index.js` podría volver a
quedarse corto; subirlo de nuevo o recortar el listado enviado a Gemini.

**Cuota de Gemini agotada:** el nivel gratuito de la API tiene un límite
diario de solicitudes; si `POST /api/ia/chat` empieza a fallar con error
del lado de FastAPI, revisar la cuota en Google AI Studio.

**Las tarjetas no aparecen:** revisar la consola del navegador (F12);
`recommendationcards.js` descarta silenciosamente cualquier producto que
Gemini haya "inventado" y no exista en el catálogo real, así que si Gemini
responde mal formado, la lista puede llegar vacía.
