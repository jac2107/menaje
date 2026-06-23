const db = require('../config/db');

// Catálogo de paquetes (combos) con sus productos incluidos y precio calculado
async function getCatalogo(req, res) {
  try {
    const paquetes = await db.query(
      `SELECT id, nombre, descripcion, foto_url FROM paquetes WHERE activo = true ORDER BY nombre`
    );
    const items = await db.query(
      `SELECT pi.paquete_id, pi.producto_id, pi.cantidad,
              p.nombre, p.precio_unidad
       FROM paquete_items pi
       JOIN productos p ON p.id = pi.producto_id
       ORDER BY pi.paquete_id, p.nombre`
    );

    const result = paquetes.rows.map(pq => {
      const propios = items.rows.filter(it => it.paquete_id === pq.id);
      const precio_unidad = propios.reduce((s, it) => s + parseFloat(it.precio_unidad) * it.cantidad, 0);
      return { ...pq, items: propios, precio_unidad };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener paquetes' });
  }
}

module.exports = { getCatalogo };
