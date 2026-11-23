"""Genera docs/informe-datos/01_esquema_bd.md leyendo menaje_db (solo lectura).

  cd python-ia && ./venv/Scripts/python ../docs/informe-datos/scripts/generar_esquema.py
Lee las credenciales de python-ia/.env (no las escribe en ningun sitio).
"""
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

RAIZ = Path(__file__).resolve().parents[3]
load_dotenv(RAIZ / "python-ia" / ".env")
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

conn = psycopg2.connect(host=os.environ["DB_HOST"], port=os.environ["DB_PORT"], dbname=os.environ["DB_NAME"],
                        user=os.environ["DB_USER"], password=os.environ["DB_PASSWORD"])
conn.set_session(readonly=True)
cur = conn.cursor()


def q(sql, *p):
    cur.execute(sql, p)
    return cur.fetchall()


version = q("select version()")[0][0].split(",")[0]
extensiones = q("select extname, extversion from pg_extension order by 1")
tablas = [t for (t,) in q("select tablename from pg_tables where schemaname='public' order by 1")]
vistas = [v for (v,) in q("select viewname from pg_views where schemaname='public' order by 1")]

columnas = q("""
select c.table_name, c.ordinal_position, c.column_name,
       case when c.data_type = 'USER-DEFINED' then format_type(a.atttypid, a.atttypmod)
            when c.data_type = 'character varying' then 'varchar(' || c.character_maximum_length || ')'
            when c.data_type = 'numeric' then 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
            else c.data_type end,
       c.is_nullable, c.column_default
  from information_schema.columns c
  join pg_class cl on cl.relname = c.table_name and cl.relnamespace = 'public'::regnamespace
  join pg_attribute a on a.attrelid = cl.oid and a.attname = c.column_name
 where c.table_schema = 'public' order by 1, 2""")

pks = {}
for t, col in q("""select tc.table_name, kcu.column_name from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu using (constraint_name, table_schema)
  where tc.table_schema='public' and tc.constraint_type='PRIMARY KEY' order by tc.table_name, kcu.ordinal_position"""):
    pks.setdefault(t, []).append(col)

fks = q("""select conrelid::regclass::text, a.attname, confrelid::regclass::text, af.attname, conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
 where c.contype='f' and c.connamespace='public'::regnamespace order by 1, 2""")
fk_de = {(t, c): (rt, rc) for t, c, rt, rc, _ in fks}

checks = q("""select conrelid::regclass::text, conname, pg_get_constraintdef(oid) from pg_constraint
  where contype in ('c','u') and connamespace='public'::regnamespace order by 1, 2""")
indices = q("select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1, 2")
filas = {t: q(f'select count(*) from "{t}"')[0][0] for t in tablas}
filas_vista = {v: q(f'select count(*) from "{v}"')[0][0] for v in vistas}
vectores = q("""select c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
       (select count(*) from pg_index i join pg_class ic on ic.oid=i.indexrelid join pg_am am on am.oid=ic.relam
         where i.indrelid=c.oid and am.amname='hnsw' and a.attnum = any(i.indkey))
  from pg_attribute a join pg_class c on c.oid=a.attrelid
 where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped
   and format_type(a.atttypid, a.atttypmod) like 'vector%%' order by 1""")
jsonb = q("""select c.relname, a.attname from pg_attribute a join pg_class c on c.oid=a.attrelid
 where c.relnamespace='public'::regnamespace and c.relkind='r' and a.attnum>0 and not a.attisdropped
   and format_type(a.atttypid, a.atttypmod)='jsonb' order by 1""")
vector_cobertura = {}
for t, c, _, _ in vectores:
    vector_cobertura[(t, c)] = q(f'select count(*) filter (where "{c}" is not null), count(*) from "{t}"')[0]
vista_defs = {v: q("select pg_get_viewdef(%s::regclass, true)", v)[0][0] for v in vistas}
vista_cols = q("""select table_name, column_name, data_type from information_schema.columns
  where table_schema='public' and table_name = any(%s) order by 1, ordinal_position""", vistas)

out = []
w = out.append
w("# 1. Esquema completo de `menaje_db`\n")
w(f"*Generado automáticamente desde la base de datos en ejecución (solo lectura) con "
  f"`docs/informe-datos/scripts/generar_esquema.py`.*\n")
w(f"* Motor: **{version}** (imagen `pgvector/pgvector:pg16`, puerto 5433 del equipo → 5432 del contenedor).")
w("* Extensiones instaladas: " + ", ".join(f"`{n}` {v}" for n, v in extensiones) + ".")
w(f"* **{len(tablas)} tablas** y **{len(vistas)} vista(s)** en el esquema `public`.\n")

w("## 1.1 Resumen de tablas\n")
w("| Tabla | Filas | Clave primaria | Claves foráneas |")
w("|---|---:|---|---|")
for t in tablas:
    refs = ", ".join(f"{c}→{rt}" for (tt, c), (rt, rc) in fk_de.items() if tt == t) or "—"
    w(f"| `{t}` | {filas[t]} | {', '.join(pks.get(t, ['—']))} | {refs} |")
for v in vistas:
    w(f"| `{v}` *(vista)* | {filas_vista[v]} | — | — |")
w("")

w("## 1.2 Detalle por tabla\n")
por_tabla = {}
for t, pos, nombre, tipo, nulo, defecto in columnas:
    por_tabla.setdefault(t, []).append((nombre, tipo, nulo, defecto))
for t in tablas:
    w(f"### `{t}` ({filas[t]} filas)\n")
    w("| Columna | Tipo | ¿Nulo? | Valor por defecto | Clave |")
    w("|---|---|---|---|---|")
    for nombre, tipo, nulo, defecto in por_tabla[t]:
        claves = []
        if nombre in pks.get(t, []):
            claves.append("PK")
        if (t, nombre) in fk_de:
            rt, rc = fk_de[(t, nombre)]
            claves.append(f"FK → {rt}.{rc}")
        w(f"| `{nombre}` | `{tipo}` | {'sí' if nulo == 'YES' else 'no'} | {('`' + defecto + '`') if defecto else ''} | {', '.join(claves)} |")
    cks = [(n, d) for tt, n, d in checks if tt == t]
    if cks:
        w("\nRestricciones `CHECK` / `UNIQUE`:\n")
        for n, d in cks:
            w(f"* `{n}`: `{d}`")
    idx = [(n, d) for tt, n, d in indices if tt == t]
    if idx:
        w("\nÍndices:\n")
        for n, d in idx:
            w(f"* `{n}`: `{d}`")
    w("")

w("## 1.3 Vistas\n")
for v in vistas:
    w(f"### `{v}` ({filas_vista[v]} filas)\n")
    w("| Columna | Tipo |\n|---|---|")
    for vt, c, tipo in vista_cols:
        if vt == v:
            w(f"| `{c}` | `{tipo}` |")
    w("\n```sql\n" + vista_defs[v].strip() + "\n```\n")

w("## 1.4 Columnas vectoriales (pgvector)\n")
w("| Tabla.columna | Tipo | Índice HNSW | Filas con vector / total | Modelo que lo genera |")
w("|---|---|---|---|---|")
for t, c, tipo, n_hnsw in vectores:
    con, total = vector_cobertura[(t, c)]
    w(f"| `{t}.{c}` | `{tipo}` | {'sí (`vector_cosine_ops`)' if n_hnsw else 'no'} | {con} / {total} | "
      f"`intfloat/multilingual-e5-small` (normalizado; consulta con prefijo `query: `, documento con `passage: `) |")
w("\nLa similitud usada en todo el sistema es `1 - (a <=> b)`, es decir, **1 − distancia de coseno** (`<=>` de pgvector).\n")

w("## 1.5 Columnas documentales (JSONB)\n")
w("| Tabla.columna | Contenido |\n|---|---|")
contenido = {
    ("pronosticos", "salida"): "`{\"Copa\": 459, \"Vaso\": 120, ...}` demanda estimada por categoría de cada pronóstico calculado.",
    ("conversaciones_ia", "contexto_rag"): "`{\"productos\": [{id, nombre, similitud}], \"memoria\": [{id, similitud, mensaje_usuario}], "
                                           "\"umbral_productos\", \"umbral_memoria\"}` lo que recuperó el RAG para esa respuesta (NULL si el RAG no corrió).",
}
for t, c in jsonb:
    w(f"| `{t}.{c}` | {contenido.get((t, c), '')} |")
w("")

# --- Mermaid ---
w("## 1.6 Diagrama entidad-relación (Mermaid)\n")
w("```mermaid\nerDiagram")
for t, c, rt, rc, _ in fks:
    # hijo }o--|| padre : "columna"
    w(f'    {rt} ||--o{{ {t} : "{c}"')
for t in tablas:
    w(f"    {t} {{")
    for nombre, tipo, nulo, defecto in por_tabla[t]:
        t_m = tipo.replace(" ", "_").replace("(", "_").replace(")", "").replace(",", "_")
        marca = []
        if nombre in pks.get(t, []):
            marca.append("PK")
        if (t, nombre) in fk_de:
            marca.append("FK")
        w(f"        {t_m} {nombre}" + (f" {','.join(marca)}" if marca else ""))
    w("    }")
w("```\n")
w("> Para renderizar: pegar el bloque en <https://mermaid.live> o abrir este archivo en un visor Markdown con soporte Mermaid "
  "(GitHub, VS Code con la extensión *Markdown Preview Mermaid Support*).\n")

destino = RAIZ / "docs" / "informe-datos" / "01_esquema_bd.md"
destino.write_text("\n".join(out), encoding="utf-8")
print("escrito", destino, len(out), "bloques")
