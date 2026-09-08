# 🍽 Sistema de Gestión de Alquiler de Menaje

Sistema web completo para gestión de alquiler de menaje para eventos. Stack: **Node.js + Express** · **HTML/CSS/JS puro** · **PostgreSQL**.

---

## 📁 Estructura del Proyecto

```
menaje/
├── backend/
│   ├── config/db.js                # Conexión PostgreSQL
│   ├── controllers/
│   │   ├── authController.js       # Login y registro
│   │   ├── alquileresController.js
│   │   ├── paquetesController.js
│   │   ├── productosController.js
│   │   ├── usuariosController.js
│   │   └── reportesController.js
│   ├── middleware/auth.js          # JWT + roles
│   ├── routes/index.js             # Todas las rutas API
│   ├── frontend/                   # Frontend estático servido por Express
│   │   ├── index.html              # Login / Registro
│   │   ├── assets/
│   │   │   ├── css/main.css
│   │   │   ├── img/
│   │   │   └── js/app.js
│   │   └── pages/
│   │       ├── cliente/
│   │       │   ├── catalogo.html
│   │       │   ├── mis-alquileres.html
│   │       │   ├── mi-cuenta.html
│   │       │   ├── pago.html
│   │       │   └── perfil.html
│   │       ├── trabajador/
│   │       │   ├── dashboard.html
│   │       │   ├── inventario.html
│   │       │   ├── mi-cuenta.html
│   │       │   ├── qr-scan.html
│   │       │   └── revision.html
│   │       └── dueno/
│   │           ├── dashboard.html
│   │           ├── alquileres.html
│   │           ├── inventario.html
│   │           ├── usuarios.html
│   │           ├── descuentos.html
│   │           ├── reportes.html
│   │           ├── mi-cuenta.html
│   │           └── configuracion.html
│   ├── python-ia/                  # Reservado para el servicio FastAPI de OPCIÓN 1
│   ├── server.js                   # Punto de entrada
│   ├── .env.example
│   └── package.json
├── database/
│   ├── schema.sql                  # Esquema de la base de datos (fuente única)
│   ├── seed_demo.sql                # Datos de muestra opcionales
│   ├── migrations/                  # Cambios incrementales sobre una BD ya existente
│   └── backups/                     # Dumps locales (ignorado por git)
└── OPCION_1_INTEGRATION_PLAN.md    # Roadmap de integración de IA (Gemini)
```

> El frontend vive dentro de `backend/frontend/` porque `server.js` lo sirve como estático desde ahí (`express.static`); no es una carpeta separada en la raíz.

---

## 🚀 Instalación y Configuración

### 1. Requisitos
- Node.js v18+
- PostgreSQL 14+

### 2. Base de Datos

```bash
# Crear la base de datos
psql -U postgres
CREATE DATABASE menaje_db;
\q

# Ejecutar el schema
psql -U postgres -d menaje_db -f database/schema.sql

# (Opcional) Cargar datos de muestra: más productos, usuarios de
# prueba (cliente.demo@menaje.com / maria.torres@menaje.com /
# trabajador.demo@menaje.com, contraseña Demo1234! para los 3) y
# alquileres de ejemplo en cada estado del flujo.
# En Windows, fijar PGCLIENTENCODING=UTF8 evita que las tildes se
# guarden mal por un problema de codificación de psql al leer el archivo.
PGCLIENTENCODING=UTF8 psql -U postgres -d menaje_db -f database/seed_demo.sql
```

Si ya tienes una base de datos creada con una versión anterior del
esquema (sin la tabla `conversaciones_ia` ni las validaciones de stock),
aplica la migración incremental en vez de recrear todo:

```bash
psql -U postgres -d menaje_db -f database/migrations/001_conversaciones_ia_y_stock_checks.sql
```

### 3. Backend

```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL
nano .env

npm install
npm start
# Desarrollo con auto-reload:
npm run dev
```

### 4. Variables de entorno (`.env`)

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=menaje_db
DB_USER=postgres
DB_PASSWORD=tu_password
JWT_SECRET=cadena_larga_y_aleatoria_aqui
JWT_EXPIRES_IN=8h
UPLOAD_DIR=uploads
CORS_ORIGIN=http://localhost:3000
API_GEMINI_KEY=          # se completa al integrar OPCIÓN 1, vacío por ahora
```

`JWT_SECRET` debe ser una cadena aleatoria larga real, no el valor de
ejemplo de arriba. Generar una con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

El servidor falla al arrancar si `JWT_SECRET` o cualquier variable
`DB_*` no está definida, para evitar quedarse silenciosamente con un
secreto débil por defecto.

### 5. Acceder al sistema

Abre en tu navegador: **http://localhost:3000**

---

## 👥 Roles y Credenciales por Defecto

| Rol        | Correo              | Contraseña  |
|------------|---------------------|-------------|
| Dueño      | admin@menaje.com    | Admin1234!  |

> ⚠️ **Cambia la contraseña del admin** desde la base de datos en producción.

---

## 🔑 Flujo por Rol

### Cliente
1. Se registra en `/index.html`
2. Explora el catálogo y arma un carrito
3. Confirma el alquiler → recibe QR
4. Muestra el QR al trabajador en la entrega y el recojo

### Trabajador
1. Escanea / ingresa el token QR del cliente
2. Avanza el estado: `confirmado → entregado → recogido`
3. Registra la revisión de ítems post-recojo
4. Puede ver el inventario (solo lectura)

### Dueño
- Todo lo del trabajador +
- Crear/desactivar usuarios y trabajadores
- Gestionar inventario (agregar productos, ajustar stock)
- Asignar descuentos a clientes frecuentes
- Cerrar alquileres y gestionar garantías
- Ver reportes de ingresos, productos y daños
- Configurar monto de garantía global

---

## 🔄 Ciclo de Vida de un Alquiler

```
pendiente_pago → confirmado → entregado → recogido → en_revision → cerrado
```

| Estado           | Quién lo cambia | Método |
|-----------------|-----------------|--------|
| pendiente_pago  | Sistema (al crear) | — |
| confirmado      | Trabajador/Dueño | Pago registrado |
| entregado       | Trabajador/Dueño | QR |
| recogido        | Trabajador/Dueño | QR |
| en_revision     | Trabajador/Dueño | QR o Revisión |
| cerrado         | Dueño | Cierre de garantía |

---

## 📱 Sistema QR

El QR de cada alquiler contiene la URL:
```
http://tu-dominio/pages/trabajador/qr-scan.html?token=<UUID>
```

Al escanearlo con cualquier lector de QR (celular), se abre automáticamente la página de escaneo con el token prellenado. El trabajador confirma el avance de estado con un click.

---

## 🛡 Seguridad

- Contraseñas hasheadas con **bcrypt** (10 rounds)
- Autenticación con **JWT** (8h de expiración), `JWT_SECRET` obligatorio
  desde `.env` (el servidor no arranca sin él)
- Middleware de roles en cada endpoint sensible
- Queries SQL siempre parametrizadas (sin concatenación de strings)
- CORS restringido a `CORS_ORIGIN` (por defecto el propio origen local)
- Rate limiting en `/api/auth/login`, `/api/auth/registrar` y
  `POST /api/alquileres` (10-30 solicitudes / 15 min por IP)
- Rutas `/api/*` no encontradas devuelven JSON 404, nunca HTML
- Manejador de errores global en `server.js` como red de seguridad

### Pendiente conocido

- `express@4.x` arrastra una dependencia (`qs`) con una vulnerabilidad
  moderada sin parche disponible en la rama 4.x. Corregirla requiere
  migrar a `express@5`, un cambio con breaking changes que se evaluará
  aparte (`npm audit` para detalles).

---

## 🌐 Despliegue en Producción

### Opción A — VPS (Ubuntu)
```bash
npm install -g pm2
cd backend
pm2 start server.js --name menaje
pm2 save && pm2 startup
```

### Opción B — Railway / Render
1. Sube el proyecto a GitHub
2. Conecta el repo en Railway o Render
3. Configura las variables de entorno en el panel
4. Agrega una base de datos PostgreSQL (Railway la provee)

### Opción C — Docker (próximamente)
Se puede dockerizar fácilmente con un `Dockerfile` estándar de Node + postgres service.

---

## 🩹 Errores comunes y soluciones

| Error | Causa probable | Solución |
|-------|-----------------|----------|
| `Cannot find module '...'` | Faltan dependencias | `cd backend && npm install` |
| `Token inválido o expirado` en todas las rutas | `JWT_SECRET` no definido o distinto entre login y validación | Revisar `backend/.env`, confirmar que `middleware/auth.js` y `authController.js` usan el mismo `process.env.JWT_SECRET` |
| `ECONNREFUSED` / `PostgreSQL connection refused` | PostgreSQL no está corriendo, o credenciales/puerto incorrectos en `.env` | Verificar que el servicio de PostgreSQL esté activo y que `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` en `.env` coincidan con tu instalación |
| Bloqueo CORS en el navegador | El frontend se sirve desde un origen distinto al configurado en `CORS_ORIGIN` | Ajustar `CORS_ORIGIN` en `.env` al origen real desde el que se accede |
| Una ruta `/api/algo` inexistente devuelve HTML en vez de JSON | — (ya corregido) | `server.js` responde JSON 404 para cualquier `/api/*` no definida antes de caer al SPA fallback |
| `Demasiados intentos, intenta de nuevo más tarde` | Rate limiting activado tras varios intentos fallidos de login en 15 min | Esperar la ventana de 15 minutos o reiniciar el servidor en desarrollo |
| Falta la tabla `conversaciones_ia` en una BD ya creada | La base se creó antes de la auditoría de OPCIÓN 1 | Ejecutar `database/migrations/001_conversaciones_ia_y_stock_checks.sql` contra tu BD existente |

## 📞 Soporte

Para bugs o mejoras, revisa los logs con:
```bash
pm2 logs menaje
# o en desarrollo:
npm run dev
```
