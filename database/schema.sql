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
  fecha_recojo        DATE NOT NULL,
  direccion_evento    TEXT NOT NULL,
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  descuento_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
  descuento_monto     NUMERIC(10,2) NOT NULL DEFAULT 0,
  garantia            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  estado              VARCHAR(30) NOT NULL DEFAULT 'pendiente_pago'
                      CHECK (estado IN (
                        'pendiente_pago','confirmado','entregado',
                        'recogido','en_revision','cerrado'
                      )),
  qr_token            UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
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

-- ============================================================
-- USUARIO DUEÑO POR DEFECTO  (password: Admin1234!)
-- ============================================================
INSERT INTO usuarios (nombre, dni, telefono, correo, password, rol)
VALUES (
  'Administrador',
  '00000000',
  '999000000',
  'admin@menaje.com',
  '$2b$10$Y5.5G5I7nLzW7FIlYGQ6g.T9M5x3eZMt7iEh2V8hBQO5dZ4xmLbSC',
  'dueno'
); 

-- ============================================================
-- PRODUCTOS INICIALES (Con imagen, descripción y precio)
-- ============================================================
INSERT INTO productos (nombre, categoria_id, descripcion, precio_unidad, stock_total, foto_url) VALUES
('Plato Entrada Tendencia Blanco 23cm', 3, 'Plato de loza blanca brillante para entradas o postres. Resiste lavados industriales.', 1.50, 200, '/assets/img/plato-entrada.jpg'),
('Plato Fondo Redondo Cúpula 27cm', 3, 'Plato llano principal de porcelana reforzada de alta durabilidad.', 2.00, 250, '/assets/img/plato-fondo.jpg'),
('Copa Flauta Premium para Champagne', 1, 'Copa de cristal fino transparente, capacidad de 180ml, ideal para brindis elegantes.', 1.80, 180, '/assets/img/copa-champagne.jpg'),
('Copa de Vino Tinto Tradicional', 1, 'Copa de vidrio grueso de 350ml, excelente balance y peso.', 1.60, 300, '/assets/img/copa-vino.jpg'),
('Vaso Alto Validus 12oz', 2, 'Vaso largo para gaseosas, cocteles o agua. Vidrio templado anticaídas leves.', 1.00, 400, '/assets/img/vaso-alto.jpg'),
('Tenedor de Mesa Acero Inoxidable', 4, 'Cubierto de acero quirúrgico pulido espejo. Modelo clásico de catering.', 0.80, 500, '/assets/img/tenedor.jpg'),
('Cuchillo de Carne Sierra Fina', 4, 'Cuchillo con filo duradero para cortes precisos de carnes rojas.', 0.90, 500, '/assets/img/cuchillo.jpg'),
('Mantel Rectangular Blanco Jacquard', 5, 'Mantel de tela elegante de 3 metros por 1.5 metros, antimanchas y fácil planchado.', 15.00, 50, '/assets/img/mantel-blanco.jpg');