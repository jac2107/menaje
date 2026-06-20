const db = require('../config/db');

// Reporte de ingresos por período
async function reporteIngresos(req, res) {
  const { desde, hasta } = req.query;
  try {
    const r = await db.query(
      `SELECT 
         DATE_TRUNC('month', a.fecha_entrega) AS mes,
         COUNT(a.id) AS total_alquileres,
         SUM(a.subtotal) AS ingresos_brutos,
         SUM(a.descuento_monto) AS descuentos,
         SUM(a.garantia) AS garantias_cobradas,
         SUM(a.total) AS total_facturado
       FROM alquileres a
       WHERE 1=1
         ${desde ? `AND a.fecha_entrega >= '${desde}'` : ''}
         ${hasta ? `AND a.fecha_entrega <= '${hasta}'` : ''}
       GROUP BY mes
       ORDER BY mes DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de ingresos' });
  }
}

// Productos más alquilados
async function reporteProductos(req, res) {
  const { desde, hasta, limit = 10 } = req.query;
  try {
    const r = await db.query(
      `SELECT p.nombre, c.nombre AS categoria,
              SUM(ai.cantidad) AS veces_alquilado,
              SUM(ai.subtotal) AS ingresos_generados
       FROM alquiler_items ai
       JOIN productos p ON p.id = ai.producto_id
       JOIN categorias c ON c.id = p.categoria_id
       JOIN alquileres a ON a.id = ai.alquiler_id
       WHERE 1=1
         ${desde ? `AND a.fecha_entrega >= '${desde}'` : ''}
         ${hasta ? `AND a.fecha_entrega <= '${hasta}'` : ''}
       GROUP BY p.nombre, c.nombre
       ORDER BY veces_alquilado DESC
       LIMIT $1`,
      [limit]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de productos' });
  }
}

// Resumen de daños / garantías
async function reporteDanos(req, res) {
  try {
    const r = await db.query(
      `SELECT cg.created_at, a.id AS alquiler_id,
              u.nombre AS cliente, cg.garantia_cobrada,
              cg.monto_descontado, cg.monto_devuelto,
              cg.monto_adicional, cg.observaciones
       FROM cierre_garantia cg
       JOIN alquileres a ON a.id = cg.alquiler_id
       JOIN usuarios u ON u.id = a.cliente_id
       ORDER BY cg.created_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de daños' });
  }
}

// Dashboard – KPIs rápidos
async function dashboard(req, res) {
  try {
    const [alqActivos, ingresosMes, stockBajo, clientesFrecuentes] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM alquileres WHERE estado IN ('confirmado','entregado','recogido','en_revision')`),
      db.query(`SELECT COALESCE(SUM(total),0) AS total FROM alquileres
                WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      db.query(`SELECT COUNT(*) FROM productos
                WHERE (stock_total - stock_baja) <= 5 AND activo = true`),
      db.query(`SELECT COUNT(*) FROM descuentos_cliente`)
    ]);
    res.json({
      alquileres_activos:   parseInt(alqActivos.rows[0].count),
      ingresos_mes:         parseFloat(ingresosMes.rows[0].total),
      productos_stock_bajo: parseInt(stockBajo.rows[0].count),
      clientes_frecuentes:  parseInt(clientesFrecuentes.rows[0].count)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener dashboard' });
  }
}

module.exports = { reporteIngresos, reporteProductos, reporteDanos, dashboard };
