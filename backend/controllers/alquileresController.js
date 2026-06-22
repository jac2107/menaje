const db = require('../config/db');

// ─── Helpers ───────────────────────────────────────────────────────────────

async function stockDisponible(productoId, cantidad, fechaEntrega, fechaRecojo, excluirAlquilerId = null) {
  const prod = await db.query('SELECT stock_total, stock_baja FROM productos WHERE id=$1', [productoId]);
  if (!prod.rows.length) return false;

  const base = prod.rows[0].stock_total - prod.rows[0].stock_baja;

  let sql = `
    SELECT COALESCE(SUM(ai.cantidad), 0) AS ocupado
    FROM alquiler_items ai
    JOIN alquileres a ON a.id = ai.alquiler_id
    WHERE ai.producto_id = $1
      AND a.estado <> 'cerrado'
      AND NOT (a.fecha_recojo < $2 OR a.fecha_entrega > $3)
  `;
  const params = [productoId, fechaEntrega, fechaRecojo];
  if (excluirAlquilerId) { params.push(excluirAlquilerId); sql += ` AND a.id <> $${params.length}`; }

  const r = await db.query(sql, params);
  return (base - parseInt(r.rows[0].ocupado)) >= cantidad;
}

// ─── CU-04: Crear solicitud de alquiler ────────────────────────────────────
async function crearAlquiler(req, res) {
  const { items, fecha_entrega, fecha_recojo, direccion_evento, lat, lng } = req.body;
  if (!items?.length || !fecha_entrega || !fecha_recojo || !direccion_evento)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Verificar stock para cada producto
    for (const item of items) {
      const ok = await stockDisponible(item.producto_id, item.cantidad, fecha_entrega, fecha_recojo);
      if (!ok) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Stock insuficiente para producto ID ${item.producto_id}` });
      }
    }

    // CU-05: calcular montos
    let subtotal = 0;
    const itemsConPrecio = [];
    for (const item of items) {
      const p = await client.query('SELECT precio_unidad FROM productos WHERE id=$1', [item.producto_id]);
      const precio = parseFloat(p.rows[0].precio_unidad);
      subtotal += precio * item.cantidad;
      itemsConPrecio.push({ ...item, precio_unidad: precio });
    }

    // Descuento cliente frecuente
    const desc = await client.query(
      'SELECT porcentaje FROM descuentos_cliente WHERE usuario_id=$1', [req.usuario.id]
    );
    const descPct   = desc.rows.length ? parseFloat(desc.rows[0].porcentaje) : 0;
    const descMonto = parseFloat(((subtotal * descPct) / 100).toFixed(2));

    // Garantía dinámica = % configurable del subtotal (antes de descuento)
    const cfg = await client.query("SELECT valor FROM configuracion WHERE clave='garantia_porcentaje'");
    const porcentaje = parseFloat(cfg.rows[0]?.valor || 20);
    const garantia = parseFloat((subtotal * (porcentaje / 100)).toFixed(2));

    // ✅ Total = subtotal - descuento + garantía
    const total = parseFloat((subtotal - descMonto + garantia).toFixed(2));

    // Insertar alquiler
    const alq = await client.query(
      `INSERT INTO alquileres
         (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng,
          subtotal, descuento_pct, descuento_monto, garantia, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [req.usuario.id, fecha_entrega, fecha_recojo, direccion_evento, lat ?? null, lng ?? null,
       subtotal, descPct, descMonto, garantia, total]
    );
    const alquiler = alq.rows[0];

    // Insertar ítems
    for (const item of itemsConPrecio) {
      await client.query(
        `INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit)
         VALUES ($1,$2,$3,$4)`,
        [alquiler.id, item.producto_id, item.cantidad, item.precio_unidad]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(alquiler);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al crear alquiler' });
  } finally {
    client.release();
  }
}

// ─── CU-07: Ver mis alquileres (cliente) ───────────────────────────────────
const RANGOS_FECHA = {
  hoy:     "a.created_at >= CURRENT_DATE",
  ayer:    "a.created_at >= CURRENT_DATE - INTERVAL '1 day' AND a.created_at < CURRENT_DATE",
  semana:  "a.created_at >= CURRENT_DATE - INTERVAL '7 days'",
  mes:     "a.created_at >= CURRENT_DATE - INTERVAL '1 month'"
};

async function getMisAlquileres(req, res) {
  try {
    const { rango } = req.query;
    const filtroFecha = RANGOS_FECHA[rango] ? `AND ${RANGOS_FECHA[rango]}` : '';
    const r = await db.query(
      `SELECT a.*,
              json_agg(json_build_object(
                'producto_id', ai.producto_id,
                'nombre', p.nombre,
                'cantidad', ai.cantidad,
                'precio_unit', ai.precio_unit,
                'subtotal', ai.subtotal
              )) AS items
       FROM alquileres a
       JOIN alquiler_items ai ON ai.alquiler_id = a.id
       JOIN productos p ON p.id = ai.producto_id
       WHERE a.cliente_id = $1
       ${filtroFecha}
       GROUP BY a.id
       ORDER BY a.id ASC`,
      [req.usuario.id]
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alquileres' });
  }
}

// ─── CU-08: Ver lista alquileres activos (trabajador/dueño) ────────────────
async function getAlquileresActivos(req, res) {
  const { estado, q, desde, hasta } = req.query;
  try {
    let sql = `
      SELECT a.*, u.nombre AS cliente_nombre, u.telefono AS cliente_telefono,
             json_agg(json_build_object(
               'producto_id', ai.producto_id,
               'nombre', p.nombre,
               'cantidad', ai.cantidad,
               'precio_unit', ai.precio_unit
             )) AS items
      FROM alquileres a
      JOIN usuarios u ON u.id = a.cliente_id
      JOIN alquiler_items ai ON ai.alquiler_id = a.id
      JOIN productos p ON p.id = ai.producto_id
      WHERE 1=1
    `;
    const params = [];
    if (estado) { params.push(estado); sql += ` AND a.estado = $${params.length}`; }
    if (q)      { params.push(`%${q}%`); sql += ` AND u.nombre ILIKE $${params.length}`; }
    if (desde)  { params.push(desde); sql += ` AND a.fecha_entrega >= $${params.length}`; }
    if (hasta)  { params.push(hasta); sql += ` AND a.fecha_entrega <= $${params.length}`; }
    sql += ' GROUP BY a.id, u.nombre, u.telefono ORDER BY a.fecha_entrega ASC';

    const r = await db.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alquileres activos' });
  }
}

// ─── CU-09: Escanear QR → cambiar estado ───────────────────────────────────
async function escanearQR(req, res) {
  const { qr_token } = req.params;
  try {
    const r = await db.query(
      `SELECT a.*, u.nombre AS cliente_nombre
       FROM alquileres a JOIN usuarios u ON u.id = a.cliente_id
       WHERE a.qr_token = $1`, [qr_token]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'QR no encontrado' });

    const alq = r.rows[0];
    const transiciones = {
      confirmado:     'entregado',
      entregado:      'recogido',
      recogido:       'en_revision',
    };
    const siguiente = transiciones[alq.estado] || null;

    res.json({ alquiler: alq, siguiente_estado: siguiente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al procesar QR' });
  }
}

async function avanzarEstadoQR(req, res) {
  const { qr_token } = req.params;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const r = await client.query('SELECT * FROM alquileres WHERE qr_token=$1 FOR UPDATE', [qr_token]);
    if (!r.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'QR no encontrado' });
    }

    const alq = r.rows[0];
    const transiciones = {
      confirmado:     'entregado',
      entregado:      'recogido',
      recogido:       'en_revision',
    };
    const siguiente = transiciones[alq.estado];
    if (!siguiente) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No hay transición disponible para este estado' });
    }

    await client.query(
      'UPDATE alquileres SET estado=$1, updated_at=NOW() WHERE id=$2', [siguiente, alq.id]
    );
    await client.query(
      `INSERT INTO alquiler_eventos (alquiler_id, estado_antes, estado_nuevo, usuario_id, metodo)
       VALUES ($1,$2,$3,$4,'qr')`,
      [alq.id, alq.estado, siguiente, req.usuario.id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: `Estado cambiado a "${siguiente}"`, estado: siguiente });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar estado' });
  } finally {
    client.release();
  }
}

// ─── CU-10: Registrar revisión post-recojo ─────────────────────────────────
async function registrarRevision(req, res) {
  const { id } = req.params;
  const { items, todo_conforme } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const alq = await client.query('SELECT * FROM alquileres WHERE id=$1', [id]);
    if (!alq.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Alquiler no encontrado' });
    }
    if (alq.rows[0].estado !== 'recogido') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'El alquiler debe estar en estado "recogido"' });
    }

    const alqItems = await client.query('SELECT * FROM alquiler_items WHERE alquiler_id=$1', [id]);

    for (const ai of alqItems.rows) {
      if (todo_conforme) {
        await client.query(
          `INSERT INTO revision_items (alquiler_id, alquiler_item_id, cantidad_ok, todo_conforme)
           VALUES ($1,$2,$3,true)`,
          [id, ai.id, ai.cantidad]
        );
      } else {
        const detalle = items?.find(x => x.alquiler_item_id === ai.id) || {};
        await client.query(
          `INSERT INTO revision_items
             (alquiler_id, alquiler_item_id, cantidad_ok, cantidad_rota, cantidad_faltante, descripcion_dano)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, ai.id,
           detalle.cantidad_ok       || 0,
           detalle.cantidad_rota     || 0,
           detalle.cantidad_faltante || 0,
           detalle.descripcion_dano  || null]
        );
      }
    }

    await client.query('UPDATE alquileres SET estado=\'en_revision\', updated_at=NOW() WHERE id=$1', [id]);
    await client.query(
      `INSERT INTO alquiler_eventos (alquiler_id, estado_antes, estado_nuevo, usuario_id)
       VALUES ($1,'recogido','en_revision',$2)`, [id, req.usuario.id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Revisión registrada. Alquiler en estado "en_revision".' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al registrar revisión' });
  } finally {
    client.release();
  }
}

// ─── CU-11: Cerrar alquiler y gestionar garantía ───────────────────────────
async function cerrarAlquiler(req, res) {
  const { id } = req.params;
  const { monto_descontado, monto_adicional, observaciones } = req.body;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const alq = await client.query('SELECT * FROM alquileres WHERE id=$1', [id]);
    if (!alq.rows.length) return res.status(404).json({ error: 'Alquiler no encontrado' });
    if (alq.rows[0].estado !== 'en_revision')
      return res.status(400).json({ error: 'El alquiler debe estar en estado "en_revision"' });

    const garantia      = parseFloat(alq.rows[0].garantia);
    const descuento     = parseFloat(monto_descontado || 0);
    const adicional     = parseFloat(monto_adicional  || 0);
    const devuelto      = Math.max(0, garantia - descuento);

    await client.query(
      `INSERT INTO cierre_garantia
         (alquiler_id, garantia_cobrada, monto_descontado, monto_devuelto, monto_adicional, observaciones, cerrado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, garantia, descuento, devuelto, adicional, observaciones || null, req.usuario.id]
    );

    // Actualizar stock: piezas OK vuelven, rotas/faltantes van a baja
    const revision = await client.query(
      `SELECT ri.*, ai.producto_id
       FROM revision_items ri
       JOIN alquiler_items ai ON ai.id = ri.alquiler_item_id
       WHERE ri.alquiler_id = $1`, [id]
    );

    for (const r of revision.rows) {
      const deBaja = r.cantidad_rota + r.cantidad_faltante;
      if (deBaja > 0) {
        await client.query(
          'UPDATE productos SET stock_baja = stock_baja + $1 WHERE id = $2',
          [deBaja, r.producto_id]
        );
      }
    }

    await client.query('UPDATE alquileres SET estado=\'cerrado\', updated_at=NOW() WHERE id=$1', [id]);
    await client.query(
      `INSERT INTO alquiler_eventos (alquiler_id, estado_antes, estado_nuevo, usuario_id)
       VALUES ($1,'en_revision','cerrado',$2)`, [id, req.usuario.id]
    );

    await client.query('COMMIT');
    res.json({ mensaje: 'Alquiler cerrado', garantia_devuelta: devuelto, monto_adicional: adicional });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error al cerrar alquiler' });
  } finally {
    client.release();
  }
}

// Detalle de un alquiler por ID
async function getAlquilerDetalle(req, res) {
  try {
    const { id } = req.params;
    const r = await db.query(
      `SELECT a.*, u.nombre AS cliente_nombre, u.correo AS cliente_correo, u.telefono AS cliente_telefono,
              a.qr_token::text AS qr_token,
              json_agg(DISTINCT jsonb_build_object(
                'id', ai.id,
                'producto_id', ai.producto_id,
                'nombre', p.nombre,
                'cantidad', ai.cantidad,
                'precio_unit', ai.precio_unit,
                'subtotal', ai.subtotal
              )) AS items
       FROM alquileres a
       JOIN usuarios u ON u.id = a.cliente_id
       JOIN alquiler_items ai ON ai.alquiler_id = a.id
       JOIN productos p ON p.id = ai.producto_id
       WHERE a.id = $1
       GROUP BY a.id, u.nombre, u.correo, u.telefono`, [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'No encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener detalle' });
  }
}

module.exports = {
  crearAlquiler,
  getMisAlquileres, getAlquileresActivos,
  escanearQR, avanzarEstadoQR,
  registrarRevision, cerrarAlquiler,
  getAlquilerDetalle
};
