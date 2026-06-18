const bcrypt = require('bcrypt');
const db = require('../config/db');

// CU-15: Gestionar usuarios (dueño crea trabajadores)
async function crearUsuario(req, res) {
  const { nombre, dni, telefono, correo, password, rol } = req.body;
  if (!nombre || !dni || !correo || !password || !rol)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!['trabajador', 'cliente'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });

  try {
    const existe = await db.query('SELECT id FROM usuarios WHERE correo=$1 OR dni=$2', [correo, dni]);
    if (existe.rows.length > 0)
      return res.status(409).json({ error: 'El correo o DNI ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    const r = await db.query(
      `INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nombre, correo, rol, activo`,
      [nombre, dni, telefono || null, correo, hash, rol]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
}

async function getUsuarios(req, res) {
  const { rol, q } = req.query;
  try {
    let sql = `SELECT id, nombre, dni, telefono, correo, rol, activo, created_at FROM usuarios WHERE 1=1`;
    const params = [];
    if (rol) { params.push(rol); sql += ` AND rol = $${params.length}`; }
    if (q)   { params.push(`%${q}%`); sql += ` AND nombre ILIKE $${params.length}`; }
    sql += ' ORDER BY nombre';
    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
}

async function toggleUsuario(req, res) {
  const { id } = req.params;
  try {
    const r = await db.query(
      'UPDATE usuarios SET activo = NOT activo WHERE id=$1 RETURNING id, nombre, activo', [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
}

// CU-16: Asignar descuento a cliente frecuente
async function asignarDescuento(req, res) {
  const { usuario_id, porcentaje } = req.body;
  if (!usuario_id || porcentaje === undefined)
    return res.status(400).json({ error: 'Faltan datos' });

  try {
    const user = await db.query('SELECT id, rol FROM usuarios WHERE id=$1', [usuario_id]);
    if (!user.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.rows[0].rol !== 'cliente')
      return res.status(400).json({ error: 'Solo se puede asignar descuento a clientes' });

    const r = await db.query(
      `INSERT INTO descuentos_cliente (usuario_id, porcentaje, asignado_por)
       VALUES ($1,$2,$3)
       ON CONFLICT (usuario_id)
       DO UPDATE SET porcentaje=$2, asignado_por=$3, updated_at=NOW()
       RETURNING *`,
      [usuario_id, porcentaje, req.usuario.id]
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar descuento' });
  }
}

async function getDescuentos(req, res) {
  try {
    const r = await db.query(
      `SELECT dc.*, u.nombre AS cliente_nombre, u.correo AS cliente_correo
       FROM descuentos_cliente dc
       JOIN usuarios u ON u.id = dc.usuario_id
       ORDER BY u.nombre`
    );
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener descuentos' });
  }
}

// Perfil propio
async function getMiPerfil(req, res) {
  try {
    const r = await db.query(
      `SELECT id, nombre, dni, telefono, correo, rol, created_at FROM usuarios WHERE id=$1`,
      [req.usuario.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const descuento = await db.query(
      'SELECT porcentaje FROM descuentos_cliente WHERE usuario_id=$1', [req.usuario.id]
    );
    res.json({ ...r.rows[0], descuento_pct: descuento.rows[0]?.porcentaje || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
}

// Configuración garantía
async function getConfiguracion(req, res) {
  try {
    const r = await db.query('SELECT * FROM configuracion');
    const cfg = {};
    r.rows.forEach(row => cfg[row.clave] = row.valor);
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
}

async function updateConfiguracion(req, res) {
  const { clave, valor } = req.body;
  try {
    await db.query(
      'INSERT INTO configuracion (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor=$2',
      [clave, valor]
    );
    res.json({ clave, valor });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
}

module.exports = {
  crearUsuario, getUsuarios, toggleUsuario,
  asignarDescuento, getDescuentos,
  getMiPerfil, getConfiguracion, updateConfiguracion
};
