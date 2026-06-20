-- ============================================================
-- DATOS DE MUESTRA (DEMO)
-- Ejecutar DESPUÉS de schema.sql (o menaje_db.sql), una sola vez.
-- No modifica la estructura de tablas, solo inserta datos.
--
--   psql -U postgres -d menaje_db -f database/seed_demo.sql
-- ============================================================
\encoding UTF8


-- ============================================================
-- PRODUCTOS ADICIONALES (más variedad por categoría)
-- ============================================================
INSERT INTO productos (nombre, categoria_id, descripcion, precio_unidad, stock_total, foto_url) VALUES
('Copa Margarita Cristal', (SELECT id FROM categorias WHERE nombre='Copa'), 'Copa ancha de cristal para cócteles tipo margarita, 300ml.', 1.40, 150, 'https://placehold.co/400x300?text=Copa+Margarita'),

('Vaso Old Fashioned Whisky', (SELECT id FROM categorias WHERE nombre='Vaso'), 'Vaso bajo y robusto de vidrio grueso, ideal para tragos cortos.', 1.10, 220, 'https://placehold.co/400x300?text=Vaso+Whisky'),

('Vaso Shot Tequilero', (SELECT id FROM categorias WHERE nombre='Vaso'), 'Vaso pequeño de 60ml para shots, vidrio resistente.', 0.70, 300, 'https://placehold.co/400x300?text=Vaso+Shot'),

('Plato Postre Cuadrado Moderno', (SELECT id FROM categorias WHERE nombre='Plato'), 'Plato cuadrado de loza blanca para postres o aperitivos, 18cm.', 1.30, 180, 'https://placehold.co/400x300?text=Plato+Postre'),

('Cuchara Sopera Clásica', (SELECT id FROM categorias WHERE nombre='Cubierto'), 'Cuchara de acero inoxidable pulido, modelo catering estándar.', 0.80, 450, 'https://placehold.co/400x300?text=Cuchara+Sopera'),

('Camino de Mesa Yute Rústico', (SELECT id FROM categorias WHERE nombre='Mantel'), 'Camino de mesa de 3m, estilo rústico/boho para eventos campestres.', 8.00, 40, 'https://placehold.co/400x300?text=Camino+Mesa'),

('Mantel Redondo Satinado Blanco', (SELECT id FROM categorias WHERE nombre='Mantel'), 'Mantel circular satinado de 2.7m de diámetro, acabado elegante.', 18.00, 30, 'https://placehold.co/400x300?text=Mantel+Redondo'),

('Cubeta de Hielo Acero Inoxidable', (SELECT id FROM categorias WHERE nombre='Otro'), 'Cubeta para hielo con asas, capacidad 4L, acero pulido.', 12.00, 25, 'https://placehold.co/400x300?text=Cubeta+Hielo'),

('Centro de Mesa Florero Cristal', (SELECT id FROM categorias WHERE nombre='Otro'), 'Florero cilíndrico de cristal para centros de mesa decorativos.', 10.00, 35, 'https://placehold.co/400x300?text=Florero'),

('Servilletero de Metal', (SELECT id FROM categorias WHERE nombre='Otro'), 'Servilletero de aro metálico dorado, acabado fino para mesa decorada.', 3.50, 200, 'https://placehold.co/400x300?text=Servilletero');

-- ============================================================
-- USUARIOS DE PRUEBA  (password para los 3: Demo1234!)
-- ============================================================
INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol) VALUES
('Cliente Demo',     '11111111', '911111111', 'cliente.demo@menaje.com',     '$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6', 'cliente'),
('Maria Torres',     '22222222', '922222222', 'maria.torres@menaje.com',     '$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6', 'cliente'),
('Trabajador Demo',  '33333333', '933333333', 'trabajador.demo@menaje.com',  '$2b$10$DIyDc8oTjqBMSGDwhlFXb.S2JVFtImUsQF/GOeFPEIR.j04sEC7V6', 'trabajador');

-- ============================================================
-- ALQUILERES DE EJEMPLO (uno por cada estado del flujo)
-- ============================================================

-- 1) CONFIRMADO — evento próximo, recién pagado
INSERT INTO alquileres (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng, subtotal, descuento_pct, descuento_monto, garantia, total, estado, created_at)
VALUES (
  (SELECT id FROM usuarios WHERE correo='cliente.demo@menaje.com'),
  CURRENT_DATE + 5, CURRENT_DATE + 6,
  'Jr. Las Magnolias 245, Huánuco', -9.9280, -76.2400,
  180.00, 0, 0, 500.00, 680.00, 'confirmado', NOW()
);
INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit) VALUES
((SELECT id FROM alquileres WHERE direccion_evento='Jr. Las Magnolias 245, Huánuco'), (SELECT id FROM productos WHERE nombre='Copa de Vino Tinto Tradicional'), 50, 1.60),
((SELECT id FROM alquileres WHERE direccion_evento='Jr. Las Magnolias 245, Huánuco'), (SELECT id FROM productos WHERE nombre='Plato Fondo Redondo Cúpula 27cm'), 50, 2.00);

-- 2) ENTREGADO — el evento ya empezó
INSERT INTO alquileres (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng, subtotal, descuento_pct, descuento_monto, garantia, total, estado, created_at)
VALUES (
  (SELECT id FROM usuarios WHERE correo='maria.torres@menaje.com'),
  CURRENT_DATE - 1, CURRENT_DATE + 1,
  'Av. Circunvalación 880, Huánuco', -9.9355, -76.2455,
  54.00, 0, 0, 500.00, 554.00, 'entregado', NOW() - INTERVAL '2 days'
);
INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit) VALUES
((SELECT id FROM alquileres WHERE direccion_evento='Av. Circunvalación 880, Huánuco'), (SELECT id FROM productos WHERE nombre='Vaso Alto Validus 12oz'), 30, 1.00),
((SELECT id FROM alquileres WHERE direccion_evento='Av. Circunvalación 880, Huánuco'), (SELECT id FROM productos WHERE nombre='Tenedor de Mesa Acero Inoxidable'), 30, 0.80);

-- 3) RECOGIDO — esperando revisión
INSERT INTO alquileres (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng, subtotal, descuento_pct, descuento_monto, garantia, total, estado, created_at)
VALUES (
  (SELECT id FROM usuarios WHERE correo='cliente.demo@menaje.com'),
  CURRENT_DATE - 5, CURRENT_DATE - 3,
  'Psje. Los Pinos 112, Pillco Marca, Huánuco', -9.9610, -76.2480,
  51.00, 0, 0, 500.00, 551.00, 'recogido', NOW() - INTERVAL '6 days'
);
INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit) VALUES
((SELECT id FROM alquileres WHERE direccion_evento='Psje. Los Pinos 112, Pillco Marca, Huánuco'), (SELECT id FROM productos WHERE nombre='Copa Flauta Premium para Champagne'), 20, 1.80),
((SELECT id FROM alquileres WHERE direccion_evento='Psje. Los Pinos 112, Pillco Marca, Huánuco'), (SELECT id FROM productos WHERE nombre='Mantel Rectangular Blanco Jacquard'), 1, 15.00);

-- 4) EN REVISIÓN — el trabajador ya registró la revisión post-recojo
INSERT INTO alquileres (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng, subtotal, descuento_pct, descuento_monto, garantia, total, estado, created_at)
VALUES (
  (SELECT id FROM usuarios WHERE correo='maria.torres@menaje.com'),
  CURRENT_DATE - 10, CURRENT_DATE - 8,
  'Jr. San Martín 530, Huánuco', -9.9300, -76.2390,
  96.00, 0, 0, 500.00, 596.00, 'en_revision', NOW() - INTERVAL '11 days'
);
INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit) VALUES
((SELECT id FROM alquileres WHERE direccion_evento='Jr. San Martín 530, Huánuco'), (SELECT id FROM productos WHERE nombre='Plato Entrada Tendencia Blanco 23cm'), 40, 1.50),
((SELECT id FROM alquileres WHERE direccion_evento='Jr. San Martín 530, Huánuco'), (SELECT id FROM productos WHERE nombre='Cuchillo de Carne Sierra Fina'), 40, 0.90);

-- 5) CERRADO — ciclo completo, con cierre de garantía registrado
INSERT INTO alquileres (cliente_id, fecha_entrega, fecha_recojo, direccion_evento, lat, lng, subtotal, descuento_pct, descuento_monto, garantia, total, estado, created_at)
VALUES (
  (SELECT id FROM usuarios WHERE correo='cliente.demo@menaje.com'),
  CURRENT_DATE - 20, CURRENT_DATE - 18,
  'Av. Alameda Perú 410, Huánuco', -9.9265, -76.2410,
  90.00, 0, 0, 500.00, 590.00, 'cerrado', NOW() - INTERVAL '25 days'
);
INSERT INTO alquiler_items (alquiler_id, producto_id, cantidad, precio_unit) VALUES
((SELECT id FROM alquileres WHERE direccion_evento='Av. Alameda Perú 410, Huánuco'), (SELECT id FROM productos WHERE nombre='Vaso Alto Validus 12oz'), 60, 1.00),
((SELECT id FROM alquileres WHERE direccion_evento='Av. Alameda Perú 410, Huánuco'), (SELECT id FROM productos WHERE nombre='Mantel Rectangular Blanco Jacquard'), 2, 15.00);

INSERT INTO cierre_garantia (alquiler_id, garantia_cobrada, monto_descontado, monto_devuelto, monto_adicional, observaciones, cerrado_por)
VALUES (
  (SELECT id FROM alquileres WHERE direccion_evento='Av. Alameda Perú 410, Huánuco'),
  500.00, 50.00, 450.00, 0,
  '2 copas rotas durante el evento, descontado de la garantía.',
  (SELECT id FROM usuarios WHERE rol='dueno' LIMIT 1)
);
