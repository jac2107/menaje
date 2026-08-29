// backend/config/db.js
const { Pool } = require('pg');

// Ponemos tus datos reales aquí adentro de forma fija
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'menajeDB',
  password: '123456789', // Si usaste otra contraseña en pgAdmin, cámbiala aquí
  port: 5432,
});

// Probar la conexión al iniciar
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.stack);
  } else {
    console.log('✅ ¡Conexión exitosa a PostgreSQL establecida!');
  }
});

module.exports = pool;
