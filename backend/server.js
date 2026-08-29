// ── Variables de Entorno y Rutas Obligatorias ──────────────────────────────
const path    = require('path'); // Cargado en línea 1 para evitar errores de inicialización
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');

const routes  = require('./routes/index');
// Conexión a la Base de Datos PostgreSQL
const pool    = require('./config/db'); 

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────────────────────
app.use(cors({
  origin: '*',   // En producción limita a tu dominio
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'frontend')));

// ── API ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── SPA fallback (Sintaxis corregida para path-to-regexp v8) ──────────────
app.get('{/*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ── Arranque ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
