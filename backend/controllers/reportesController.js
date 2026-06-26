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

// Ingresos por método de pago
async function reporteMetodosPago(req, res) {
  try {
    const r = await db.query(
      `SELECT metodo, COUNT(*) AS cantidad_pagos, SUM(monto) AS total
       FROM pagos
       GROUP BY metodo
       ORDER BY total DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de métodos de pago' });
  }
}

// Ingresos por categoría de producto
async function reporteCategorias(req, res) {
  try {
    const r = await db.query(
      `SELECT c.nombre AS categoria, SUM(ai.subtotal) AS ingresos
       FROM alquiler_items ai
       JOIN productos p ON p.id = ai.producto_id
       JOIN categorias c ON c.id = p.categoria_id
       GROUP BY c.nombre
       ORDER BY ingresos DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de categorías' });
  }
}

// Top clientes por gasto total
async function reporteClientes(req, res) {
  const limit = parseInt(req.query.limit) || 10;
  try {
    const r = await db.query(
      `SELECT u.id, u.nombre, u.correo,
              COUNT(a.id) AS total_alquileres,
              SUM(a.total) AS gasto_total
       FROM alquileres a
       JOIN usuarios u ON u.id = a.cliente_id
       GROUP BY u.id, u.nombre, u.correo
       ORDER BY gasto_total DESC
       LIMIT $1`,
      [limit]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte de clientes' });
  }
}

// KPIs financieros: ingresos históricos, ticket promedio, salud de garantías
async function resumenFinanciero(req, res) {
  try {
    const [ing, gar] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total),0) AS ingresos_totales,
                       COALESCE(AVG(total),0) AS ticket_promedio,
                       COUNT(*) AS total_alquileres
                FROM alquileres`),
      db.query(`SELECT COALESCE(SUM(garantia_cobrada),0) AS cobrada,
                       COALESCE(SUM(monto_devuelto),0) AS devuelta,
                       COALESCE(SUM(monto_descontado),0) AS descontada,
                       COALESCE(SUM(monto_adicional),0) AS adicional
                FROM cierre_garantia`)
    ]);
    res.json({
      ingresos_totales:  parseFloat(ing.rows[0].ingresos_totales),
      ticket_promedio:   parseFloat(ing.rows[0].ticket_promedio),
      total_alquileres:  parseInt(ing.rows[0].total_alquileres),
      garantia_cobrada:    parseFloat(gar.rows[0].cobrada),
      garantia_devuelta:   parseFloat(gar.rows[0].devuelta),
      garantia_descontada: parseFloat(gar.rows[0].descontada),
      garantia_adicional:  parseFloat(gar.rows[0].adicional)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar resumen financiero' });
  }
}

module.exports = {
  reporteIngresos, reporteProductos, reporteDanos, dashboard,
  reporteMetodosPago, reporteCategorias, reporteClientes, resumenFinanciero
};
