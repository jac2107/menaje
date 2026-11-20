"""
Precision@3 y precision@5 de la busqueda semantica sobre el catalogo real (sin Gemini).

Para cada consulta (redactada como la escribiria alguien en la caja de busqueda, sin copiar
el nombre exacto del producto) se ordenan TODOS los productos activos con stock por
similitud de coseno, igual que POST /busqueda-semantica pero sin umbral, y se mide:

  precision@k  = relevantes en el top k / k
  techo@k      = min(k, n_relevantes) / k   (lo maximo posible: una consulta con un unico
                                             producto relevante nunca puede pasar de 1/k)
  normalizada  = precision@k / techo@k

Los productos relevantes los fijo yo a mano (ids de abajo, segun el catalogo de
menaje_db); es un juicio humano y pequeno (15 consultas), no un benchmark.

  DB_PASSWORD=... python medir_precision_busqueda.py     (escribe resultados_precision_busqueda.txt)
"""
import os

import entorno  # noqa: F401  (carga python-ml/.env)
import sys
from pathlib import Path

import psycopg
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
DSN = (
    f"host={os.getenv('DB_HOST', 'localhost')} port={os.getenv('DB_PORT', '5433')} "
    f"dbname={os.getenv('DB_NAME', 'menaje_db')} user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', 'postgres')}"
)
SALIDA = Path(__file__).resolve().parent / "resultados_precision_busqueda.txt"
UMBRAL_PRODUCCION = float(os.getenv("BUSQUEDA_UMBRAL_SIMILITUD", "0.85"))

# (consulta, {ids relevantes})
CONSULTAS = [
    ("copas para brindar con champagne en un matrimonio", {3, 15}),
    ("copa para servir vino tinto", {4, 14}),
    ("cubiertos dorados para una cena de gala", {9, 10, 11, 33}),
    ("tenedor de acero inoxidable para la mesa", {6}),
    ("platos desechables para una fiesta grande", {29, 30}),
    ("vasos pequeños para servir tequila", {21}),
    ("vaso ancho para tomar whisky con hielo", {20}),
    ("mantel dorado brillante", {17, 34}),
    ("mantel de yute estilo campestre", {18, 24}),
    ("mantel blanco elegante para mesa redonda", {8, 25}),
    ("plato pequeño para servir el postre", {22}),
    ("mesa redonda para ocho personas", {38}),
    ("recipiente para enfriar bebidas con hielo", {26}),
    ("jarra grande de cristal para servir agua", {36}),
    ("porta servilletas de metal", {28}),
]
KS = (3, 5)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    modelo = SentenceTransformer(MODEL)
    pfx = "query: " if "e5" in MODEL else ""
    lineas, acum = [], {k: {"p": 0.0, "techo": 0.0} for k in KS}
    lineas.append(f"Modelo: {MODEL} | consultas: {len(CONSULTAS)} | umbral de produccion: {UMBRAL_PRODUCCION}")
    lineas.append("Ranking sobre productos activos con stock, sin umbral. Relevantes fijados a mano.\n")
    with psycopg.connect(DSN) as conn:
        register_vector(conn)
        nombres = dict(conn.execute("SELECT id, nombre FROM productos").fetchall())
        for consulta, relevantes in CONSULTAS:
            vec = modelo.encode(pfx + consulta, normalize_embeddings=True)
            filas = conn.execute(
                """SELECT id, 1 - (embedding <=> %s::vector) AS sim FROM productos
                    WHERE activo AND (stock_total - stock_baja) > 0 AND embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector LIMIT 5""", (vec, vec)).fetchall()
            ids = [f[0] for f in filas]
            partes = []
            for k in KS:
                aciertos = len(set(ids[:k]) & relevantes)
                p, techo = aciertos / k, min(k, len(relevantes)) / k
                acum[k]["p"] += p
                acum[k]["techo"] += techo
                partes.append(f"P@{k}={p:.2f} (techo {techo:.2f})")
            lineas.append(f"{consulta!r}  relevantes={sorted(relevantes)}")
            lineas.append("   " + "  ".join(partes))
            for i, (pid, sim) in enumerate(filas, 1):
                marca = "OK " if pid in relevantes else "   "
                umbral = "" if sim >= UMBRAL_PRODUCCION else "  (bajo el umbral de produccion)"
                lineas.append(f"   {i}. {marca}[{pid:>2}] {nombres[pid]}  sim={sim:.3f}{umbral}")
    n = len(CONSULTAS)
    lineas.append("\n=== RESUMEN ===")
    for k in KS:
        p, techo = acum[k]["p"] / n, acum[k]["techo"] / n
        lineas.append(f"precision@{k} = {p:.3f}   techo posible = {techo:.3f}   normalizada = {p / techo:.3f}")
    texto = "\n".join(lineas)
    SALIDA.write_text(texto + "\n", encoding="utf-8")
    print(texto)


if __name__ == "__main__":
    main()
