-- Migracion 006 (Fase 6A): marca de datos de ejemplo y datos del evento en alquileres.
-- Aditiva: solo columnas nuevas con valor por defecto/NULL; la logica de la Opcion 1
-- no las lee ni las escribe.
--   es_ejemplo      TRUE = alquiler de ejemplo (database/seeds/historial_alquileres_ejemplo.sql).
--   tipo_evento     tipo de evento (mismos valores que usa el pronostico). NULL si no se conoce.
--   num_asistentes  asistentes previstos. NULL si no se conoce.
-- Los alquileres reales existentes quedan con es_ejemplo = FALSE y sin evento: el
-- pronostico solo aprende de los que tienen tipo_evento y num_asistentes.
BEGIN;

ALTER TABLE alquileres
  ADD COLUMN IF NOT EXISTS es_ejemplo     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_evento    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS num_asistentes INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alquileres_tipo_evento_check') THEN
    ALTER TABLE alquileres ADD CONSTRAINT alquileres_tipo_evento_check CHECK (
      tipo_evento IS NULL OR tipo_evento IN
      ('boda','quinceanos','bautizo','cumpleanos','graduacion','corporativo','baby_shower'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alquileres_num_asistentes_check') THEN
    ALTER TABLE alquileres ADD CONSTRAINT alquileres_num_asistentes_check CHECK (
      num_asistentes IS NULL OR num_asistentes > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_alquileres_es_ejemplo ON alquileres (es_ejemplo) WHERE es_ejemplo;

COMMIT;
