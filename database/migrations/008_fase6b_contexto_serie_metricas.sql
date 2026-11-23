-- ============================================================
-- Migracion 008 (Fase 6B): modelo documental, serie temporal y metricas de uso de la IA.
-- Aditiva e idempotente: no altera columnas ni filas existentes.
--
--  1. conversaciones_ia.contexto_rag (JSONB): lo que recupero el RAG para esa respuesta
--     (productos con su similitud y conversaciones de memoria usadas). NULL en las
--     conversaciones anteriores o si el RAG no devolvio nada / fallo.
--  2. VIEW demanda_categoria_mes: demanda REAL (unidades alquiladas) por categoria y mes.
--     Alimenta el grafico del panel y la alerta de deriva por serie temporal.
--  3. busquedas_ia: registro de cada busqueda (semantica o de similares) con su numero de
--     resultados, para medir las "busquedas sin resultado" en el panel.
-- ============================================================
BEGIN;

-- 1. Modelo documental ------------------------------------------------------------------
ALTER TABLE conversaciones_ia ADD COLUMN IF NOT EXISTS contexto_rag JSONB;

-- 2. Serie temporal ---------------------------------------------------------------------
CREATE OR REPLACE VIEW demanda_categoria_mes AS
SELECT date_trunc('month', a.fecha_entrega)::date                AS mes,
       c.nombre                                                  AS categoria,
       SUM(ai.cantidad)::int                                     AS unidades,
       COUNT(DISTINCT a.id)::int                                 AS alquileres,
       COALESCE(SUM(ai.cantidad) FILTER (WHERE a.es_ejemplo), 0)::int AS unidades_ejemplo
  FROM alquileres a
  JOIN alquiler_items ai ON ai.alquiler_id = a.id
  JOIN productos p       ON p.id = ai.producto_id
  JOIN categorias c      ON c.id = p.categoria_id
 GROUP BY 1, 2;

-- 3. Registro de busquedas --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS busquedas_ia (
  id             BIGSERIAL PRIMARY KEY,
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('semantica', 'similares')),
  consulta       TEXT        NOT NULL,          -- texto buscado (o "producto:<id>" en similares)
  n_resultados   INTEGER     NOT NULL CHECK (n_resultados >= 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_busquedas_ia_fecha ON busquedas_ia (created_at DESC);

COMMIT;
