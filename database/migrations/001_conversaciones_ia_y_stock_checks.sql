-- ============================================================
-- Migración 001: tabla conversaciones_ia (preparación OPCIÓN 1)
-- y CHECK constraints para evitar stock negativo/inconsistente
-- Aplicar sobre una base de datos existente sin perder datos.
-- ============================================================

ALTER TABLE productos
  ADD CONSTRAINT productos_stock_total_check CHECK (stock_total >= 0),
  ADD CONSTRAINT productos_stock_baja_check  CHECK (stock_baja >= 0 AND stock_baja <= stock_total);

CREATE TABLE IF NOT EXISTS conversaciones_ia (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       INTEGER NOT NULL REFERENCES usuarios(id),
  mensaje_usuario  TEXT NOT NULL,
  respuesta_ia     TEXT NOT NULL,
  timestamp        TIMESTAMPTZ DEFAULT NOW(),
  tokens_usados    INTEGER,
  estado           VARCHAR(20) DEFAULT 'completada'
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_usuario   ON conversaciones_ia(usuario_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_timestamp ON conversaciones_ia(timestamp);
