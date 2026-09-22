# OPCIÓN 1: IA Ligera con Google Gemini API — Resumen Ejecutivo

**Proyecto:** Menaje — Sistema de Alquiler para Eventos
**Opción implementada:** OPCIÓN 1 (IA con Gemini API vía microservicio FastAPI)
**Repositorio:** https://github.com/jac2107/menaje
**Fecha de este cierre (FASE 4):** 22 de septiembre de 2026

## Resumen

El sistema integra un chat conversacional y recomendaciones automáticas de
menaje usando Google Gemini, sin exponer la API key al frontend: el
navegador solo habla con Node.js, y Node.js reenvía al microservicio
FastAPI (`python-ia/`), que es el único proceso con la API key de Gemini.

Funcionalidades entregadas:
1. **Chat bidireccional** (`POST /api/ia/chat`) con historial de los
   últimos 5 turnos.
2. **Recomendaciones de productos** basadas en tipo de evento, número de
   asistentes y presupuesto opcional, validadas contra el catálogo real
   de PostgreSQL para descartar alucinaciones de Gemini.
3. **Auditoría de conversaciones** en la tabla `conversaciones_ia`.
4. **Rate limiting** (5 solicitudes/minuto por defecto, vía
   `RATE_LIMIT_IA`).

## Arquitectura

```
Frontend (chatwidget.js, recommendationcards.js, ia-integration.js)
    ↓ JWT + fetch
Node.js :3000 (backend/routes/index.js, middlewares/rateLimitIA.js, services/iaService.js)
    ↓ HTTP interno
FastAPI :8000 (python-ia/main.py)
    ↓
Google Gemini API
    ↓
PostgreSQL: conversaciones_ia (auditoría) · productos (catálogo real) · usuarios (contexto)
```

## Verificación realizada (FASE 4)

Se levantaron ambos servidores localmente y se probó cada endpoint con
`curl`, usando el usuario real `cliente.demo@menaje.com` (credenciales en
`database/seed_demo.sql`, password `Demo1234!`):

| Verificación | Resultado |
|---|---|
| Login (`POST /api/auth/login`) | ✅ Devuelve JWT válido |
| Catálogo protegido (`GET /api/productos/catalogo`) | ✅ 401 sin JWT, 200 con JWT (38 productos reales) |
| `GET /api/ia/health` | ✅ FastAPI disponible |
| Chat con Gemini (`POST /api/ia/chat`) | ✅ Responde en ~18s usando datos reales del catálogo (modelo `gemini-3.6-flash`) |
| Rate limiting | ✅ Confirmado: a partir de la 5ª solicitud en el minuto, devuelve 429 |
| Recomendaciones con catálogo completo → JSON de Gemini | ✅ Devuelve JSON válido, cada nombre existe exactamente en el catálogo (0 alucinaciones en la prueba) |
| Persistencia (`conversaciones_ia`) | ✅ Cada chat exitoso agrega una fila (`usuario_id`, `mensaje_usuario`, `respuesta_ia`, `tokens_usados`, `timestamp`, `estado`) |
| Páginas cliente incluyen los scripts de IA | ✅ `catalogo.html`, `mis-alquileres.html`, `mi-cuenta.html` (recomendaciones); `perfil.html` solo incluye el chat, no las tarjetas de recomendación |

### Bug encontrado y corregido durante esta fase

El prompt de recomendaciones incluye el catálogo completo de productos
(~3.4 KB con los 38 productos actuales), pero el backend rechazaba
cualquier mensaje de más de 2000 caracteres. Esto rompía **siempre** el
botón de recomendaciones, aunque el chat simple funcionaba bien. Se subió
el límite a 6000 caracteres en `backend/routes/index.js` y se re-verificó
el flujo completo end-to-end: ahora funciona. Detalle técnico en
`backend/frontend/README_FASE3_CHAT_RECOMMENDATIONS.md`.

### Detalle real de la tabla `conversaciones_ia`

Columnas reales verificadas en la base de datos:
`id (uuid), usuario_id (int), mensaje_usuario (text), respuesta_ia (text),
timestamp (timestamptz), tokens_usados (int), estado (varchar)`.
No incluye columnas de `modelo` ni `tiempo_respuesta_ms`.

### Pendiente (no verificable sin navegador en esta sesión)

- Interacción manual click-a-click del modal de recomendaciones y del
  chat widget en un navegador real.
- Verificación visual del responsive (`@media max-width: 480px`) del CSS.
- Confirmar que `agregarItemAlCarrito()` refleja correctamente el producto
  recomendado en el carrito visible de `catalogo.html`.

## Configuración relevante

- `backend/.env`: `RATE_LIMIT_IA`, `PYTHON_IA_URL`, `API_GEMINI_KEY`
  (compartida con `python-ia/.env`). El valor de `GEMINI_MODEL` en
  `backend/.env` está desactualizado (`gemini-1.5-flash`, ya no
  disponible) pero no se usa: el modelo real lo define
  `python-ia/.env` (`gemini-3.6-flash`, verificado funcional).
- Usuarios de prueba con password conocida (`Demo1234!`, ver
  `database/seed_demo.sql`): `cliente.demo@menaje.com`,
  `maria.torres@menaje.com` (cliente), `trabajador.demo@menaje.com`
  (trabajador). La base de datos también tiene otros usuarios
  (`admin@menaje.com`, `admin1@gmail.com`, `cliente1@gmail.com`, etc.)
  de cargas de datos anteriores cuya password no se verificó en esta
  sesión.

## Cómo ejecutar localmente

```bash
# Terminal 1
cd python-ia && venv\Scripts\activate && python main.py     # :8000

# Terminal 2
cd backend && node server.js                                  # :3000

# Navegador
http://localhost:3000/pages/cliente/catalogo.html
# Login: cliente.demo@menaje.com / Demo1234!
```

## Estado

Código y endpoints verificados por API con datos reales de la base de
datos. La verificación visual en navegador (interacción manual) queda
pendiente para quien tenga acceso a un navegador en esta máquina.
