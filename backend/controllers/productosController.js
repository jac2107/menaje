const db = require('../config/db');

// CU-03: Ver catálogo (cliente) — solo productos activos con stock disponible
async function getCatalogo(req, res) {
  const { q, categoria_id } = req.query;
  try {
    let sql = `
      SELECT p.id, p.nombre, c.nombre AS categoria, p.descripcion,
             p.precio_unidad, p.foto_url,
             (p.stock_total - p.stock_baja
               - COALESCE((
                   SELECT SUM(ai.cantidad)
                   FROM alquiler_items ai
                   JOIN alquileres a ON a.id = ai.alquiler_id
                   WHERE ai.producto_id = p.id
                     AND a.estado <> 'cerrado'
               ), 0)
             ) AS stock_disponible
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = true
    `;
    const params = [];
    if (q) { params.push(`%${q}%`); sql += ` AND p.nombre ILIKE $${params.length}`; }
    if (categoria_id) { params.push(categoria_id); sql += ` AND p.categoria_id = $${params.length}`; }
    sql += ' ORDER BY p.nombre';

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener catálogo' });
  }
}

// CU-12: Agregar producto al inventario
async function crearProducto(req, res) {
  const { nombre, categoria_id, descripcion, precio_unidad, stock_inicial, foto_url } = req.body;
  if (!nombre || !categoria_id || !precio_unidad)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  try {
    const r = await db.query(
      `INSERT INTO productos (nombre, categoria_id, descripcion, precio_unidad, stock_total, foto_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre, categoria_id, descripcion || null, precio_unidad, stock_inicial || 0, foto_url || null]
    );
    // Registrar movimiento inicial
    if ((stock_inicial || 0) > 0) {
      await db.query(
        `INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, usuario_id)
         VALUES ($1,'entrada',$2,'Stock inicial al crear producto',$3)`,
        [r.rows[0].id, stock_inicial, req.usuario.id]
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
}

// CU-13: Ver estado del inventario (trabajador/dueño)
async function getInventario(req, res) {
  const { q, categoria_id } = req.query;
  try {
    let sql = `
      SELECT p.id, p.nombre, c.nombre AS categoria, p.precio_unidad,
             p.stock_total, p.stock_baja, p.foto_url, p.descripcion,
             COALESCE((
               SELECT SUM(ai.cantidad)
               FROM alquiler_items ai
               JOIN alquileres a ON a.id = ai.alquiler_id
               WHERE ai.producto_id = p.id
                 AND a.estado <> 'cerrado'
             ), 0) AS en_eventos,
             (p.stock_total - p.stock_baja
               - COALESCE((
                   SELECT SUM(ai.cantidad)
                   FROM alquiler_items ai
                   JOIN alquileres a ON a.id = ai.alquiler_id
                   WHERE ai.producto_id = p.id
                     AND a.estado <> 'cerrado'
               ), 0)
             ) AS disponible
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = true
    `;
    const params = [];
    if (q) { params.push(`%${q}%`); sql += ` AND p.nombre ILIKE $${params.length}`; }
    if (categoria_id) { params.push(categoria_id); sql += ` AND p.categoria_id = $${params.length}`; }
    sql += ' ORDER BY c.nombre, p.nombre';

    const result = await db.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener inventario' });
  }
}

// CU-14: Ajustar stock manualmente (dueño)
async function ajustarStock(req, res) {
  const { id } = req.params;
  const { tipo, cantidad, motivo } = req.body;
  if (!tipo || !cantidad) return res.status(400).json({ error: 'Faltan datos' });
  if (!['entrada','baja','correccion'].includes(tipo))
    return res.status(400).json({ error: 'Tipo de ajuste inválido' });

  try {
    const prod = await db.query('SELECT * FROM productos WHERE id=$1', [id]);
    if (!prod.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });

    let nuevoTotal = prod.rows[0].stock_total;
    let nuevaBaja  = prod.rows[0].stock_baja;

    if (tipo === 'entrada')    nuevoTotal += parseInt(cantidad);
    else if (tipo === 'baja')  nuevaBaja  += parseInt(cantidad);
    else if (tipo === 'correccion') nuevoTotal = parseInt(cantidad); // reemplazo directo

    await db.query(
      'UPDATE productos SET stock_total=$1, stock_baja=$2 WHERE id=$3',
      [nuevoTotal, nuevaBaja, id]
    );
    await db.query(
      `INSERT INTO stock_movimientos (producto_id, tipo, cantidad, motivo, usuario_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, tipo, cantidad, motivo || null, req.usuario.id]
    );
    res.json({ mensaje: 'Stock actualizado', stock_total: nuevoTotal, stock_baja: nuevaBaja });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al ajustar stock' });
  }
}

// GET categorías
async function getCategorias(req, res) {
  try {
    const r = await db.query('SELECT * FROM categorias ORDER BY nombre');
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
}

module.exports = { getCatalogo, crearProducto, getInventario, ajustarStock, getCategorias };
