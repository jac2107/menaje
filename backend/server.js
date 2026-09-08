// ── Variables de Entorno y Rutas Obligatorias ──────────────────────────────
const path    = require('path'); // Cargado en línea 1 para evitar errores de inicialización
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');

const routes  = require('./routes/index');
// Conexión a la Base de Datos PostgreSQL
const pool    = require('./config/db'); 

if (!process.env.JWT_SECRET) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}`,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de requests
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// Archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// ── API ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── Rutas /api no encontradas → JSON 404 (no HTML) ─────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ── SPA fallback (Sintaxis corregida para path-to-regexp v8) ──────────────
app.get('{/*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ── Manejo de errores global ───────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ── Arranque ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
