"""
Genera el embedding de cada producto activo (nombre + descripcion + categoria)
y lo guarda en productos.embedding. Se puede ejecutar las veces que se quiera:
cada ejecucion sobrescribe el vector de la misma fila (UPDATE), sin duplicar.

Uso:
  python cargar_embeddings.py            # recalcula todos los productos activos
  python cargar_embeddings.py --faltantes  # solo los que aun no tienen embedding
Conexion por variables de entorno DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
(por defecto: localhost:5433/menaje_db, el docker-compose del repo).
"""
import argparse
import os

import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} port={os.getenv('DB_PORT', '5433')} "
    f"dbname={os.getenv('DB_NAME', 'menaje_db')} user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)


def texto_producto(nombre: str, descripcion: str | None, categoria: str) -> str:
    partes = [nombre, categoria, descripcion or ""]
    return ". ".join(p.strip() for p in partes if p and p.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--faltantes", action="store_true", help="solo productos sin embedding")
    args = ap.parse_args()

    filtro = "AND p.embedding IS NULL" if args.faltantes else ""
    with psycopg.connect(DSN) as conn:
        register_vector(conn)
        filas = conn.execute(
            f"""SELECT p.id, p.nombre, p.descripcion, c.nombre
                  FROM productos p JOIN categorias c ON c.id = p.categoria_id
                 WHERE p.activo = TRUE {filtro} ORDER BY p.id"""
        ).fetchall()
        if not filas:
            print("Nada que procesar.")
            return
        vecs = SentenceTransformer(MODEL).encode(
            [texto_producto(n, d, c) for _, n, d, c in filas], normalize_embeddings=True
        )
        with conn.cursor() as cur:
            cur.executemany(
                "UPDATE productos SET embedding = %s WHERE id = %s",
                [(v, fila[0]) for v, fila in zip(vecs, filas)],
            )
        conn.commit()
    print(f"Embeddings guardados: {len(filas)} productos")


if __name__ == "__main__":
    main()
