-- Migracion 007 (Fase 6A): historial de pronosticos calculados.
-- Cada llamada a /pronostico-demanda guarda su entrada, su salida y la version del
-- modelo (python-ia). Si guardar falla, el pronostico se responde igual.
BEGIN;

CREATE TABLE IF NOT EXISTS pronosticos (
  id              BIGSERIAL PRIMARY KEY,
  tipo_evento     VARCHAR(30) NOT NULL,
  mes             SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  asistentes      INTEGER     NOT NULL CHECK (asistentes > 0),
  modo            VARCHAR(12) NOT NULL CHECK (modo IN ('modelo','degradado')),
  version_modelo  VARCHAR(80) NOT NULL,
  salida          JSONB       NOT NULL,   -- {"Copa": 459, "Vaso": 120, ...}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pronosticos_fecha ON pronosticos (created_at DESC);

COMMIT;
