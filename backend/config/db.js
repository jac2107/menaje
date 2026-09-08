// backend/config/db.js
const { Pool } = require('pg');

const requeridas = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const faltantes = requeridas.filter(v => !process.env[v]);
if (faltantes.length) {
  throw new Error(`Faltan variables de entorno para la base de datos: ${faltantes.join(', ')}`);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000,
});

// Probar la conexión al iniciar
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.stack);
  } else {
    console.log('✅ Conectado a PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en cliente PostgreSQL inactivo:', err);
});

module.exports = pool;
