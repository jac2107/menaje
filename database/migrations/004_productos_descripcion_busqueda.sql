-- ============================================================
-- Migracion 004: productos.descripcion_busqueda (OPCION 2, Fase 1.2)
-- Frase corta sobre el uso del producto en eventos, SOLO para generar el
-- embedding de busqueda semantica. No se muestra al usuario ni sustituye a
-- productos.descripcion. Se rellena con database/seeds/descripcion_busqueda.sql.
-- ============================================================

ALTER TABLE productos ADD COLUMN IF NOT EXISTS descripcion_busqueda TEXT;
