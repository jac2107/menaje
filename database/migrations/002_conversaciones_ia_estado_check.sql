-- ============================================================
-- Migracion 002: restringir los valores de conversaciones_ia.estado
-- La columna solo debe admitir los estados que el microservicio escribe.
--
-- Contexto (hallazgo BUG-04 de AUDITORIA_OPCION_1_MENAJE.md): hasta la
-- aplicacion del bloque B, el INSERT de python-ia/main.py tenia el literal
-- 'completada' cableado y la rama de error abortaba antes de guardar, asi que la
-- columna 'estado' tenia cardinalidad 1 y era imposible distinguir "no hubo
-- fallos" de "no se median los fallos".
--
-- IMPORTANTE: hacer copia de la base de datos antes de ejecutar esta migracion.
--   pg_dump -h localhost -U postgres -d menajeDB -f backup_pre_002.sql
-- ============================================================

-- Normaliza cualquier valor previo fuera del dominio antes de anadir el CHECK
-- (sin este UPDATE, el ALTER falla si existe alguna fila con otro valor o NULL).
UPDATE conversaciones_ia
   SET estado = 'completada'
 WHERE estado IS NULL OR estado NOT IN ('completada', 'error');

ALTER TABLE conversaciones_ia
  ALTER COLUMN estado SET NOT NULL,
  ADD CONSTRAINT conversaciones_ia_estado_check
    CHECK (estado IN ('completada', 'error'));

-- Consultar el ratio de fallos por dia:
--   SELECT date_trunc('day', timestamp) AS dia, estado, COUNT(*)
--     FROM conversaciones_ia GROUP BY 1, 2 ORDER BY 1 DESC;
CREATE INDEX IF NOT EXISTS idx_conversaciones_estado ON conversaciones_ia(estado);
