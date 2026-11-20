"""
Mide, sin llamar a Gemini, el umbral de similitud del RAG del chat.
Para cada consulta coloquial se recuperan los productos con stock (top 5, como
RAG_PRODUCTOS_MAX) y, por umbral, se cuenta si aparece el producto esperado y
cuantos productos irrelevantes se cuelan. Las consultas fuera del catalogo
(esperado=None) deben devolver 0 productos.

  DB_PASSWORD=... python medir_umbral_chat.py
"""
import os

import entorno  # noqa: F401  (carga python-ml/.env)
import re
import sys

import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} port={os.getenv('DB_PORT', '5433')} "
    f"dbname={os.getenv('DB_NAME', 'menaje_db')} user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)
TOP = 5
UMBRALES = [0.78, 0.80, 0.82, 0.85]

# (consulta, regex del nombre de los productos RELEVANTES; None = fuera del catalogo)
CONSULTAS = [
    ("¿Tienen sillas para una fiesta infantil?", r"Silla"),
    ("Necesito manteles para mi boda", r"Mantel"),
    ("Busco copas para brindar", r"Copa"),
    ("¿Tienen mesas redondas?", r"Mesa Redonda"),
    ("Necesito cubiertos para 50 personas", r"Cuchara|Tenedor|Cuchillo|Cubierto"),
    ("Busco platos desechables para un cumpleaños", r"Plato Desechable"),
    ("¿Tienen vasos para tequila?", r"Tequilero"),
    ("Necesito algo para enfriar las bebidas con hielo", r"Cubeta de Hielo"),
    ("¿Tienen jarras para el agua?", r"Jarra"),
    ("Busco centros de mesa con flores", r"Centro de Mesa|Florero"),
    ("¿Tienen servilleteros?", r"Servilletero"),
    ("Necesito vasos para whisky", r"Old Fashioned"),
    ("Busco platos para servir postre", r"Plato Postre"),
    ("¿Tienen camino de mesa rústico?", r"Camino de Mesa"),
    ("Necesito copas de vino tinto", r"Vino Tinto"),
    # fuera del catalogo: deben devolver 0 productos
    ("¿Tienen algo para mantener la comida caliente en un buffet?", None),
    ("Necesito un proyector y una pantalla para la presentación", None),
    ("¿Alquilan carpas o toldos para el jardín?", None),
    ("Algo para mantener la comida caliente en un buffet", None),
    ("Necesito un dj y sonido para la fiesta", None),
]


def main() -> None:
    modelo = SentenceTransformer(MODEL)
    pfx_q = "query: " if "e5" in MODEL else ""
    salida = []
    with psycopg.connect(DSN) as conn:
        register_vector(conn)
        # (consulta, [(nombre, similitud)...]) con los TOP mas cercanos con stock
        datos = []
        for consulta, _ in CONSULTAS:
            v = modelo.encode(pfx_q + consulta, normalize_embeddings=True)
            filas = conn.execute(
                """SELECT nombre, (1 - (embedding <=> %s))::float
                     FROM productos
                    WHERE activo AND stock_total - stock_baja > 0 AND embedding IS NOT NULL
                    ORDER BY embedding <=> %s LIMIT %s""",
                (v, v, TOP),
            ).fetchall()
            datos.append(filas)

    salida.append("== Mejor similitud por consulta (y producto)")
    for (consulta, rel), filas in zip(CONSULTAS, datos):
        marca = "FUERA" if rel is None else "dentro"
        encontrado = next(
            (f"{s:.3f}" for n, s in filas if rel and re.search(rel, n, re.I)), "-"
        )
        salida.append(
            f"[{marca}] {consulta}\n    top1 {filas[0][1]:.3f} {filas[0][0]} | esperado a {encontrado}"
        )

    salida.append("\n== Resumen por umbral (15 consultas dentro del catalogo, 5 fuera)")
    salida.append("umbral | esperado encontrado | irrelevantes colados (dentro) | fuera con resultados | productos totales por consulta (media)")
    for u in UMBRALES:
        encontrados = irrelevantes = fuera_con_res = total = 0
        for (consulta, rel), filas in zip(CONSULTAS, datos):
            pasan = [(n, s) for n, s in filas if s >= u]
            total += len(pasan)
            if rel is None:
                fuera_con_res += 1 if pasan else 0
                continue
            if any(re.search(rel, n, re.I) for n, _ in pasan):
                encontrados += 1
            irrelevantes += sum(1 for n, _ in pasan if not re.search(rel, n, re.I))
        salida.append(
            f"{u:.2f}   | {encontrados}/15 | {irrelevantes} | {fuera_con_res}/5 | {total / len(CONSULTAS):.1f}"
        )
    print("\n".join(salida))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
