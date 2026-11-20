"""Verifica MiniLM (384 dims) + pgvector. Crea y borra una tabla de prueba."""
import os

import entorno  # noqa: F401  (carga python-ml/.env)

import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")  # igual que cargar_embeddings.py
PFX_DOC, PFX_Q = ("passage: ", "query: ") if "e5" in MODEL else ("", "")
DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} port={os.getenv('DB_PORT', '5433')} "
    f"dbname={os.getenv('DB_NAME', 'menaje_db')} user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)

textos = ["mantel blanco para boda", "copas de cristal", "silla plegable"]
vecs = SentenceTransformer(MODEL).encode([PFX_DOC + t for t in textos])
assert vecs.shape == (3, 384), vecs.shape
print("dimension:", vecs.shape[1])

with psycopg.connect(DSN, autocommit=True) as conn:
    conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    register_vector(conn)
    conn.execute("CREATE TABLE tmp_vec_test (id serial PRIMARY KEY, txt text, emb vector(384))")
    try:
        for t, v in zip(textos, vecs):
            conn.execute("INSERT INTO tmp_vec_test (txt, emb) VALUES (%s, %s)", (t, v))
        q = SentenceTransformer(MODEL).encode([PFX_Q + "manteles para casamiento"])[0]
        rows = conn.execute(
            "SELECT txt, emb <=> %s AS dist FROM tmp_vec_test ORDER BY dist LIMIT 3", (q,)
        ).fetchall()
        for r in rows:
            print(r)
        assert rows[0][0] == textos[0]
    finally:
        conn.execute("DROP TABLE IF EXISTS tmp_vec_test")
print("OK: tabla de prueba eliminada")
