const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const db     = require('../config/db');

async function registrar(req, res) {
  const { nombre, dni, telefono, correo, password } = req.body;
  if (!nombre || !dni || !correo || !password)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const existe = await db.query(
      'SELECT id FROM usuarios WHERE correo=$1 OR dni=$2', [correo, dni]
    );
    if (existe.rows.length > 0)
      return res.status(409).json({ error: 'El correo o DNI ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol)
       VALUES ($1,$2,$3,$4,$5,'cliente') RETURNING id, nombre, correo, rol`,
      [nombre, dni, telefono || null, correo, hash]
    );
    res.status(201).json({ mensaje: 'Cuenta creada exitosamente', usuario: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function login(req, res) {
  const { correo, password } = req.body;
  if (!correo || !password)
    return res.status(400).json({ error: 'Correo y contraseña son requeridos' });

  try {
    const result = await db.query(
      'SELECT * FROM usuarios WHERE correo=$1 AND activo=true', [correo]
    );
    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Credenciales incorrectas' });

    const user = result.rows[0];
    const ok   = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });

    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      usuario: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { registrar, login };