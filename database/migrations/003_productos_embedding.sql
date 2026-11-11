-- ============================================================
-- Migracion 003: busqueda semantica (OPCION 2, Fase 1)
-- Anade productos.embedding (MiniLM multilingue, 384 dimensiones) y un indice
-- HNSW para similitud de coseno. Idempotente y sin tocar datos existentes.
-- La columna queda NULL hasta ejecutar python-ml/cargar_embeddings.py.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE productos ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_productos_embedding_hnsw
  ON productos USING hnsw (embedding vector_cosine_ops);
