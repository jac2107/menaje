-- ============================================================================
-- Historial de alquileres de EJEMPLO (Fase 6A). 300 alquileres cerrados entre
-- enero de 2025 y octubre de 2026, con tipo de evento, mes y asistentes variados
-- e items coherentes con las categorias del catalogo (Copa, Vaso, Plato, Cubierto,
-- Mantel, Otro): las cantidades escalan con los asistentes y la estacionalidad.
--
-- NO SON ALQUILERES REALES. Como se distinguen:
--   * alquileres.es_ejemplo = TRUE  (columna de la migracion 006)
--   * cliente dueno de todos ellos: usuario inactivo ejemplo@menaje.invalid
--     (no puede iniciar sesion y no aparece en "Mis alquileres" de nadie real)
--   * estado 'cerrado': no resta disponibilidad al catalogo ni sale en "activos"
-- Aviso: los reportes del dueno (reportes.html) suman TODOS los alquileres, de
-- ejemplo incluidos; para volver a cifras reales ejecutar el script de retirada:
--   database/seeds/historial_alquileres_ejemplo_quitar.sql
--
-- Reproducible: setseed fijo; se puede ejecutar varias veces (borra los de ejemplo
-- y los vuelve a crear con los mismos valores si el catalogo no cambio).
--   docker exec -i menaje_postgres psql -U postgres -d menaje_db -v ON_ERROR_STOP=1 -q \
--     < database/seeds/historial_alquileres_ejemplo.sql
-- Requiere la migracion 006.
-- ============================================================================
BEGIN;

SELECT setseed(0.42);

INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol, activo)
VALUES ('Cliente de ejemplo (datos ficticios)', '99999990', NULL, 'ejemplo@menaje.invalid',
        '!sin-acceso', 'cliente', FALSE)
ON CONFLICT (correo) DO NOTHING;

DELETE FROM alquileres WHERE es_ejemplo;   -- los items caen por ON DELETE CASCADE

DO $$
DECLARE
  tipos   text[]    := ARRAY['boda','quinceanos','bautizo','cumpleanos','graduacion','corporativo','baby_shower'];
  p_tipo  numeric[] := ARRAY[0.20,0.15,0.12,0.22,0.10,0.11,0.10];
  media   numeric[] := ARRAY[130,110,55,45,75,65,32];
  desv    numeric[] := ARRAY[45,38,18,18,28,28,11];
  p_mes   numeric[] := ARRAY[0.07,0.06,0.07,0.08,0.08,0.09,0.11,0.08,0.08,0.08,0.09,0.11];
  estac   numeric[] := ARRAY[0.85,0.80,0.90,0.95,1.00,1.05,1.25,1.00,0.95,1.00,1.10,1.40];
  cats    text[]    := ARRAY['Copa','Vaso','Plato','Cubierto','Mantel','Otro'];
  -- unidades por asistente de cada categoria (Mantel: por mesa); levemente distintas
  -- de las del generador sintetico para que la mezcla de datos no sea identica
  factores jsonb := '{
    "boda":        [2.0, 0.9, 1.7, 3.0, 0.22, 0.32],
    "quinceanos":  [1.7, 1.1, 1.6, 2.9, 0.18, 0.30],
    "bautizo":     [1.1, 1.1, 1.5, 2.7, 0.15, 0.20],
    "cumpleanos":  [0.8, 1.7, 1.3, 2.4, 0.12, 0.24],
    "graduacion":  [1.3, 1.2, 1.4, 2.7, 0.14, 0.22],
    "corporativo": [1.0, 1.1, 1.2, 2.3, 0.16, 0.38],
    "baby_shower": [0.7, 1.5, 1.2, 2.1, 0.13, 0.20]}'::jsonb;
  v_cliente int;
  garantia_pct numeric;
  i int; k int; c int; n int;
  acum numeric; u numeric; t int; mes int; anio int; asist int;
  fecha date; ruido numeric; objetivo int; restante int; cant int;
  alq_id int; subtotal numeric; garantia numeric;
  prod record;
  items jsonb;
BEGIN
  SELECT id INTO v_cliente FROM usuarios WHERE correo = 'ejemplo@menaje.invalid';
  SELECT COALESCE((SELECT valor::numeric FROM configuracion WHERE clave = 'garantia_porcentaje'), 10)
    INTO garantia_pct;

  FOR i IN 1..300 LOOP
    -- tipo de evento (muestreo ponderado)
    u := random(); acum := 0; t := 1;
    FOR k IN 1..7 LOOP acum := acum + p_tipo[k]; IF u <= acum THEN t := k; EXIT; END IF; END LOOP;
    -- mes (ponderado); noviembre y diciembre solo de 2025 (hoy es 2026-11)
    u := random(); acum := 0; mes := 12;
    FOR k IN 1..12 LOOP acum := acum + p_mes[k]; IF u <= acum THEN mes := k; EXIT; END IF; END LOOP;
    anio := CASE WHEN mes >= 11 THEN 2025 WHEN random() < 0.5 THEN 2025 ELSE 2026 END;
    fecha := make_date(anio, mes, 1 + floor(random() * 28)::int);
    -- asistentes ~ Normal(media, desv) (Box-Muller), acotado a 10..250
    asist := GREATEST(10, LEAST(250, round(
      media[t] + desv[t] * sqrt(-2 * ln(GREATEST(random(), 1e-9))) * cos(2 * pi() * random()))::int));

    items := '[]'::jsonb; subtotal := 0;
    FOR c IN 1..6 LOOP
      ruido := 1 + 0.12 * sqrt(-2 * ln(GREATEST(random(), 1e-9))) * cos(2 * pi() * random());
      objetivo := GREATEST(0, round(asist * (factores -> tipos[t] ->> (c - 1))::numeric * estac[mes] * ruido)::int);
      CONTINUE WHEN objetivo = 0;
      n := 1 + floor(random() * 3)::int;                 -- entre 1 y 3 productos de la categoria
      restante := objetivo;
      FOR prod IN
        SELECT p.id, p.precio_unidad, p.stock_total
          FROM productos p JOIN categorias ca ON ca.id = p.categoria_id
         WHERE p.activo AND ca.nombre = cats[c]
         ORDER BY random() LIMIT n
      LOOP
        cant := LEAST(prod.stock_total, CEIL(restante::numeric / n)::int);
        n := n - 1;
        CONTINUE WHEN cant <= 0;
        restante := restante - cant;
        items := items || jsonb_build_object('p', prod.id, 'q', cant, 'pr', prod.precio_unidad);
        subtotal := subtotal + cant * prod.precio_unidad;
      END LOOP;
    END LOOP;
    CONTINUE WHEN jsonb_array_length(items) = 0;

    garantia := round(subtotal * garantia_pct / 100, 2);
    INSERT INTO alquileres (cliente_id, fecha_entrega, hora_entrega, fecha_recojo, hora_recojo,
                            direccion_evento, subtotal, descuento_pct, descuento_monto, garantia, total,
                            estado, created_at, updated_at, es_ejemplo, tipo_evento, num_asistentes)
    VALUES (v_cliente, fecha, '10:00', fecha + 1, '18:00',
            'Direccion de ejemplo (dato ficticio)', subtotal, 0, 0, garantia, subtotal + garantia,
            'cerrado', (fecha - 7)::timestamptz, (fecha + 1)::timestamptz, TRUE, tipos[t], asist)
    RETURNING id INTO alq_id;

    INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit)
    SELECT alq_id, (e ->> 'p')::int, (e ->> 'q')::int, (e ->> 'pr')::numeric
      FROM jsonb_array_elements(items) e;
  END LOOP;
END $$;

COMMIT;

SELECT count(*) AS alquileres_ejemplo, count(DISTINCT tipo_evento) AS tipos_evento,
       min(fecha_entrega) AS desde, max(fecha_entrega) AS hasta
  FROM alquileres WHERE es_ejemplo;
