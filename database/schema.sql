-- ============================================================
-- SISTEMA DE GESTIÓN DE ALQUILER DE MENAJE PARA EVENTOS
-- Schema PostgreSQL - Unificado con Productos Iniciales
-- ============================================================

-- LIMPIEZA ABSOLUTA DE DATOS PREVIOS (Evita el error SQL state: 42P07)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- USUARIOS
CREATE TABLE usuarios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  dni         VARCHAR(8)   UNIQUE NOT NULL,
  telefono    VARCHAR(15),
  correo      VARCHAR(150) UNIQUE NOT NULL,
  password    TEXT NOT NULL,           -- bcrypt hash
  rol         VARCHAR(20) NOT NULL CHECK (rol IN ('cliente','trabajador','dueno')),
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- CATEGORÍAS DE PRODUCTO
CREATE TABLE categorias (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL   -- Copa, Vaso, Plato, Cubierto, Mantel, Otro
);

INSERT INTO categorias (nombre) VALUES
  ('Copa'),('Vaso'),('Plato'),('Cubierto'),('Mantel'),('Otro');

-- PRODUCTOS (inventario)
CREATE TABLE productos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  categoria_id    INTEGER NOT NULL REFERENCES categorias(id),
  descripcion     TEXT,
  precio_unidad   NUMERIC(10,2) NOT NULL,
  stock_total     INTEGER NOT NULL DEFAULT 0,
  stock_baja      INTEGER NOT NULL DEFAULT 0,   -- piezas dadas de baja
  foto_url        TEXT,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PAQUETES (combos de productos, ej. Paquete Boda, Quinceañera)
CREATE TABLE paquetes (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT,
  foto_url    TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- PRODUCTOS INCLUIDOS POR CADA PAQUETE (cantidad por unidad de paquete)
CREATE TABLE paquete_items (
  id          SERIAL PRIMARY KEY,
  paquete_id  INTEGER NOT NULL REFERENCES paquetes(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad    INTEGER NOT NULL CHECK (cantidad > 0)
);

-- CLIENTES FRECUENTES (descuento)
CREATE TABLE descuentos_cliente (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER UNIQUE NOT NULL REFERENCES usuarios(id),
  porcentaje   NUMERIC(5,2) NOT NULL CHECK (porcentaje BETWEEN 0 AND 100),
  asignado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- CONFIGURACIÓN GLOBAL (garantía fija, etc.)
CREATE TABLE configuracion (
  clave  VARCHAR(80) PRIMARY KEY,
  valor  TEXT NOT NULL
);
INSERT INTO configuracion VALUES ('garantia_monto','500.00');

-- ALQUILERES
CREATE TABLE alquileres (
  id                  SERIAL PRIMARY KEY,
  cliente_id          INTEGER NOT NULL REFERENCES usuarios(id),
  fecha_entrega       DATE NOT NULL,
  hora_entrega        TIME,
  fecha_recojo        DATE NOT NULL,
  hora_recojo         TIME,
  direccion_evento    TEXT NOT NULL,
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  descuento_monto     NUMERIC(10,2) NOT NULL DEFAULT 0,
  garantia            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado              VARCHAR(30) NOT NULL DEFAULT 'confirmado'
                      CHECK (estado IN (
                        'confirmado','entregado',
                        'recogido','en_revision','cerrado'
                      )),
  qr_token            UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  lat                 NUMERIC(10,7),
  lng                 NUMERIC(10,7)
);

-- DETALLE DE ALQUILER (productos incluidos)
CREATE TABLE alquiler_items (
  id           SERIAL PRIMARY KEY,
  alquiler_id  INTEGER NOT NULL REFERENCES alquileres(id) ON DELETE CASCADE,
  producto_id  INTEGER NOT NULL REFERENCES productos(id),
  cantidad     INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unit  NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unit) STORED
);

-- PAGOS
CREATE TABLE pagos (
  id           SERIAL PRIMARY KEY,
  alquiler_id  INTEGER NOT NULL REFERENCES alquileres(id),
  monto        NUMERIC(10,2) NOT NULL,
  metodo       VARCHAR(50) NOT NULL,  -- efectivo, transferencia, yape, plin, otro
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- CAMBIOS DE ESTADO (trazabilidad QR y manual)
CREATE TABLE alquiler_eventos (
  id           SERIAL PRIMARY KEY,
  alquiler_id  INTEGER NOT NULL REFERENCES alquileres(id),
  estado_antes VARCHAR(30),
  estado_nuevo VARCHAR(30) NOT NULL,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  metodo       VARCHAR(20) DEFAULT 'manual' CHECK (metodo IN ('qr','manual')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- REVISIÓN POST-RECOJO (por ítem)
CREATE TABLE revision_items (
  id                SERIAL PRIMARY KEY,
  alquiler_id       INTEGER NOT NULL REFERENCES alquileres(id),
  alquiler_item_id  INTEGER NOT NULL REFERENCES alquiler_items(id),
  cantidad_ok       INTEGER NOT NULL DEFAULT 0,
  cantidad_rota     INTEGER NOT NULL DEFAULT 0,
  cantidad_faltante INTEGER NOT NULL DEFAULT 0,
  descripcion_dano  TEXT,
  todo_conforme     BOOLEAN DEFAULT FALSE
);

-- CIERRE DE GARANTÍA
CREATE TABLE cierre_garantia (
  id                  SERIAL PRIMARY KEY,
  alquiler_id         INTEGER UNIQUE NOT NULL REFERENCES alquileres(id),
  garantia_cobrada    NUMERIC(10,2) NOT NULL,
  monto_descontado    NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_devuelto      NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_adicional     NUMERIC(10,2) NOT NULL DEFAULT 0,  -- si daños > garantía
  observaciones       TEXT,
  cerrado_por         INTEGER NOT NULL REFERENCES usuarios(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- MOVIMIENTOS DE STOCK (trazabilidad de ajustes manuales)
CREATE TABLE stock_movimientos (
  id           SERIAL PRIMARY KEY,
  producto_id  INTEGER NOT NULL REFERENCES productos(id),
  tipo         VARCHAR(30) NOT NULL CHECK (tipo IN ('entrada','baja','correccion')),
  cantidad     INTEGER NOT NULL,
  motivo       TEXT,
  usuario_id   INTEGER NOT NULL REFERENCES usuarios(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX idx_alquileres_cliente     ON alquileres(cliente_id);
CREATE INDEX idx_alquileres_estado      ON alquileres(estado);
CREATE INDEX idx_alquileres_qr          ON alquileres(qr_token);
CREATE INDEX idx_alquiler_items_alq     ON alquiler_items(alquiler_id);
CREATE INDEX idx_revision_alquiler      ON revision_items(alquiler_id);
CREATE INDEX idx_paquete_items_paquete  ON paquete_items(paquete_id);

-- ============================================================
-- USUARIO DUEÑO POR DEFECTO  (password: Admin1234!)
-- ============================================================
INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol)
VALUES (
  'Administrador',
  '00000000',
  '999000000',
  'admin@menaje.com',
  '$2b$10$FjsoVNIyI1hxT1Zrk3ZCQ.4VyoJP/i8lDokJkm8brSCE6My3vX5wm',
  'dueno'
); 

-- ============================================================
-- PRODUCTOS INICIALES (Con tus enlaces de imágenes web reales)
-- ============================================================
INSERT INTO productos (nombre, categoria_id, descripcion, precio_unidad, stock_total, foto_url) VALUES
('Plato Entrada Tendencia Blanco 23cm', 3, 'Plato de loza blanca brillante para entradas o postres. Resiste lavados industriales.', 1.50, 200, 'https://veana.com/wp-content/uploads/2026/04/152K124-D-2.webp'),

('Plato Fondo Redondo Cúpula 27cm', 3, 'Plato llano principal de porcelana reforzada de alta durabilidad.', 2.00, 250, 'https://media.falabella.com/falabellaPE/881333163_2/w=1500,h=1500,fit=cover'),

('Copa Flauta Premium para Champagne', 1, 'Copa de cristal fino transparente, capacidad de 180ml, ideal para brindis elegantes.', 1.80, 180, 'https://http2.mlstatic.com/D_Q_NP_877139-MLU74075250158_012024-O.webp'),

('Copa de Vino Tinto Tradicional', 1, 'Copa de vidrio grueso de 350ml, excelente balance y peso.', 1.60, 300, 'https://www.plattotec.com/wp-content/uploads/2020/11/alquiler-copavinotinto-vidrio2-plattotec.jpg'),

('Vaso Alto Validus 12oz', 2, 'Vaso largo para gaseosas, cocteles o agua. Vidrio templado anticaídas leves.', 1.00, 400, 'https://www.arander.com/cdn/shop/products/6621-vaso-high-ball-sin-centricoat-350-ml-118-oz_800x.jpg?v=1589569849'),

('Tenedor de Mesa Acero Inoxidable', 4, 'Cubierto de acero quirúrgico pulido espejo. Modelo clásico de catering.', 0.80, 500, 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEWBBxu75JrjTKZeDDGmXmBlJu5f8TzPl9Bg&s'),

('Cuchillo de Carne Sierra Fina', 4, 'Cuchillo con filo duradero para cortes precisos de carnes rojas.', 0.90, 500, 'https://www.cimaco.com.mx/ccstore/v1/images/?source=/file/v1123931467100434678/products/5324554.1.jpg&height=475&width=475'),

('Mantel Rectangular Blanco Jacquard', 5, 'Mantel de tela elegante de 3 metros por 1.5 metros, antimanchas y fácil planchado.', 15.00, 50, 'https://encrypted-tbn1.gstatic.com/shopping?q=tbn:ANd9GcRiM8GH-sLPohUUaChKnA0XzyatIPc58gbFvbOCXvIbN4FJjI59QzK1sVTI4xT8bYe0lIAKAkdQ2FNP0IZLOeR8jzPLD8TmAy11hqVN8hph9qaPZMJ6nMLvUS2C9m8q1sJlD3T6rg');

-- ============================================================
-- PRODUCTOS TEMÁTICOS (dorado, madera, verde) para paquetes premium
-- (ids 9-18, sin foto_url: agregar fotos reales luego desde Inventario)
-- ============================================================
INSERT INTO productos (nombre, categoria_id, descripcion, precio_unidad, stock_total) VALUES
('Tenedor Dorado Premium', 4, 'Tenedor de acero inoxidable bañado en oro, acabado espejo para eventos de gala.', 1.40, 200),
('Cuchillo Dorado Premium', 4, 'Cuchillo de mesa bañado en oro, juego con el tenedor dorado premium.', 1.50, 200),
('Cuchara Dorada Premium', 4, 'Cuchara de mesa bañada en oro, acabado espejo para eventos de gala.', 1.40, 200),
('Plato de Sitio Vidrio Bordes Dorados', 3, 'Plato base de vidrio templado transparente con borde pintado a mano en dorado, 33cm.', 5.50, 120),
('Plato de Sitio de Madera Natural', 3, 'Plato base circular de madera natural barnizada, ideal para decoración rústica.', 4.80, 120),
('Copa de Vino Verde Bohemia', 1, 'Copa de cristal coloreado en verde esmeralda, 350ml, estilo bohemio.', 2.40, 150),
('Copa Flauta Dorada Premium', 1, 'Copa flauta de cristal con base y borde dorado, 180ml, para brindis de gala.', 2.60, 150),
('Vaso Rústico de Madera', 2, 'Vaso con acabado exterior símil madera, interior de vidrio templado, 350ml.', 2.00, 150),
('Mantel Dorado Satinado', 5, 'Mantel satinado color dorado de 3x1.5m, brillo sutil para eventos de gala.', 20.00, 40),
('Mantel Rústico de Yute', 5, 'Mantel de yute natural de 3x1.5m, textura rústica para decoración campestre.', 14.00, 40);

-- ============================================================
-- PAQUETES INICIALES (10 combos por temática, pensados para 10 personas)
-- ============================================================
INSERT INTO paquetes (nombre, descripcion, foto_url) VALUES
('Paquete Boda', 'Vajilla elegante para 10 personas: plato de fondo, copa de vino, copa de champagne, cubiertos y mantel.', 'https://media.falabella.com/falabellaPE/881333163_2/w=1500,h=1500,fit=cover'),
('Paquete Quinceañera', 'Set festivo para 10 personas: plato de entrada, plato de fondo, copa de champagne, cubiertos y mantel.', 'https://http2.mlstatic.com/D_Q_NP_877139-MLU74075250158_012024-O.webp'),
('Paquete Cumpleaños', 'Set casual para 10 personas: plato de entrada, vaso alto, cubiertos y mantel.', 'https://www.arander.com/cdn/shop/products/6621-vaso-high-ball-sin-centricoat-350-ml-118-oz_800x.jpg?v=1589569849'),
('Paquete Almuerzo', 'Set práctico para 10 personas: plato de fondo, vaso alto y cubiertos.', 'https://veana.com/wp-content/uploads/2026/04/152K124-D-2.webp'),
('Paquete Boda Premium Dorado', 'Línea dorada para 10 personas: plato de sitio de vidrio con bordes dorados, cubiertos dorados, copa flauta dorada, copa de vino y vaso.', NULL),
('Paquete Boda Premium Madera', 'Línea madera para 10 personas: plato de sitio de madera, cubiertos dorados, copa de vino verde y vaso rústico de madera.', NULL),
('Paquete Quinceañera Glam Dorado', 'Línea dorada festiva para 10 personas: plato de sitio dorado, plato de entrada, cubiertos dorados y copa flauta dorada.', NULL),
('Paquete Aniversario Elegante', 'Set íntimo y elegante para 10 personas: plato de sitio dorado, cubiertos dorados completos, copa de vino verde y vaso.', NULL),
('Paquete Rústico Campestre', 'Set campestre para 10 personas: plato y vaso de madera, cubiertos clásicos y mantel de yute.', NULL),
('Paquete Gala Dorada', 'La línea dorada completa para 10 personas: plato de sitio, cubiertos completos, copa flauta y copa de vino, todo dorado/verde, con mantel dorado.', NULL);

-- Paquete Boda (id 1)
INSERT INTO paquete_items (paquete_id, producto_id, cantidad) VALUES
(1,2,10),(1,4,10),(1,3,10),(1,6,10),(1,7,10),(1,8,1),
-- Paquete Quinceañera (id 2)
(2,1,10),(2,2,10),(2,3,10),(2,6,10),(2,7,10),(2,8,1),
-- Paquete Cumpleaños (id 3)
(3,1,10),(3,5,10),(3,6,10),(3,8,1),
-- Paquete Almuerzo (id 4)
(4,2,10),(4,5,10),(4,6,10),(4,7,10),
-- Paquete Boda Premium Dorado (id 5): plato vidrio dorado(12), tenedor dorado(9), cuchillo dorado(10), cuchara dorada(11), copa flauta dorada(15), copa vino(4), vaso alto(5), mantel dorado(17)
(5,12,10),(5,9,10),(5,10,10),(5,11,10),(5,15,10),(5,4,10),(5,5,10),(5,17,1),
-- Paquete Boda Premium Madera (id 6): plato madera(13), tenedor dorado(9), cuchillo dorado(10), copa verde(14), vaso madera(16), mantel yute(18)
(6,13,10),(6,9,10),(6,10,10),(6,14,10),(6,16,10),(6,18,1),
-- Paquete Quinceañera Glam Dorado (id 7): plato vidrio dorado(12), plato entrada(1), tenedor dorado(9), cuchillo dorado(10), copa flauta dorada(15), mantel dorado(17)
(7,12,10),(7,1,10),(7,9,10),(7,10,10),(7,15,10),(7,17,1),
-- Paquete Aniversario Elegante (id 8): plato vidrio dorado(12), cuchara dorada(11), tenedor dorado(9), cuchillo dorado(10), copa verde(14), vaso alto(5)
(8,12,10),(8,11,10),(8,9,10),(8,10,10),(8,14,10),(8,5,10),
-- Paquete Rústico Campestre (id 9): plato madera(13), vaso madera(16), tenedor acero(6), cuchillo acero(7), mantel yute(18)
(9,13,10),(9,16,10),(9,6,10),(9,7,10),(9,18,1),
-- Paquete Gala Dorada (id 10): plato vidrio dorado(12), tenedor dorado(9), cuchillo dorado(10), cuchara dorada(11), copa flauta dorada(15), copa verde(14), mantel dorado(17)
(10,12,10),(10,9,10),(10,10,10),(10,11,10),(10,15,10),(10,14,10),(10,17,1);
