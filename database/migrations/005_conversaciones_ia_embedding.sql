-- ============================================================
-- Migracion 005: memoria semantica del chat (OPCION 2, Fase 2 / RAG)
-- Embedding (e5-small, 384 dims) del mensaje del usuario en cada conversacion,
-- con indice HNSW de coseno para recuperar conversaciones pasadas similares.
-- Idempotente; las filas existentes quedan con embedding NULL (no se usan como memoria).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE conversaciones_ia ADD COLUMN IF NOT EXISTS embedding vector(384);

CREATE INDEX IF NOT EXISTS idx_conversaciones_embedding_hnsw
  ON conversaciones_ia USING hnsw (embedding vector_cosine_ops);
