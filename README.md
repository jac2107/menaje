# 🍽 Sistema de Gestión de Alquiler de Menaje

Sistema web completo para gestión de alquiler de menaje para eventos. Stack: **Node.js + Express** · **HTML/CSS/JS puro** · **PostgreSQL**.

---

## 📁 Estructura del Proyecto

```
menaje/
├── backend/
│   ├── config/db.js              # Conexión PostgreSQL
│   ├── controllers/
│   │   ├── authController.js     # Login y registro
│   │   ├── alquileresController.js
│   │   ├── productosController.js
│   │   ├── usuariosController.js
│   │   └── reportesController.js
│   ├── middleware/auth.js         # JWT + roles
│   ├── routes/index.js            # Todas las rutas API
│   ├── server.js                  # Punto de entrada
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── index.html                 # Login / Registro
│   ├── assets/
│   │   ├── css/main.css
│   │   └── js/app.js
│   └── pages/
│       ├── cliente/
│       │   ├── catalogo.html
│       │   ├── mis-alquileres.html
│       │   └── perfil.html
│       ├── trabajador/
│       │   ├── dashboard.html
│       │   ├── inventario.html
│       │   ├── qr-scan.html
│       │   └── revision.html
│       └── dueno/
│           ├── dashboard.html
│           ├── alquileres.html
│           ├── inventario.html
│           ├── usuarios.html
│           ├── descuentos.html
│           ├── reportes.html
│           └── configuracion.html
└── database/
    ├── schema.sql
    └── seed_demo.sql

```

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
```

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
- Autenticación con **JWT** (8h de expiración)
- Middleware de roles en cada endpoint sensible
- CORS configurable en `server.js`

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

## 📞 Soporte

Para bugs o mejoras, revisa los logs con:
```bash
pm2 logs menaje
# o en desarrollo:
npm run dev
```
