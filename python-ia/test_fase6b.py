"""
Pruebas de la Fase 6B (python-ia): contexto RAG en JSONB, serie temporal, riesgo de faltante,
metricas de uso y productos similares. NO llaman a Gemini (se sustituye por un doble).
Requieren la BD de desarrollo (docker compose up -d) con las migraciones 001-008 y los
embeddings de productos cargados. Lo que escriben en la BD se borra al terminar o se
descarta con rollback.

  cd python-ia && ./venv/Scripts/python -m unittest test_fase6b -v
"""
import os
import unittest
from datetime import date, datetime, timezone
from unittest import mock

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

from _importar_main import importar_main

main = importar_main()

from fastapi.testclient import TestClient

import analitica
import deriva

CAB = {"X-IA-Token": main.IA_SERVICE_TOKEN}
USUARIO = 2  # cliente de la BD de desarrollo


class GeminiFalso:
    class _R:
        text = "Respuesta de prueba"

        class usage_metadata:
            total_token_count = 7

    def __init__(self, *_a, **_k):
        pass

    def generate_content(self, _prompt):
        return self._R()


def bd_real():
    """True si el pool es el real (no el simulado de importar_main)."""
    try:
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT to_regclass('busquedas_ia') IS NOT NULL")
            return cur.fetchone()[0] is True
    except Exception:
        return False


BD = bd_real()
requiere_bd = unittest.skipUnless(BD, "requiere la BD de desarrollo con la migracion 008")


def borrar_conversaciones_desde(inicio):
    with main.obtener_conexion(commit=True) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM conversaciones_ia WHERE timestamp >= %s", (inicio,))


def ultima_conversacion(usuario_id):
    with main.obtener_conexion() as conn, conn.cursor() as cur:
        cur.execute("SELECT contexto_rag, embedding IS NOT NULL, estado FROM conversaciones_ia "
                    "WHERE usuario_id = %s ORDER BY timestamp DESC LIMIT 1", (usuario_id,))
        return cur.fetchone()


# ============================================================ B1: contexto_rag (JSONB)
@requiere_bd
class PruebasContextoRag(unittest.TestCase):
    def setUp(self):
        self.inicio = datetime.now(timezone.utc)
        self.client = TestClient(main.app)
        p = mock.patch.object(main.genai, "GenerativeModel", GeminiFalso)
        p.start()
        self.addCleanup(p.stop)
        self.addCleanup(borrar_conversaciones_desde, self.inicio)

    def chat(self, mensaje):
        return self.client.post("/chat", headers=CAB, json={"usuario_id": USUARIO, "mensaje": mensaje})

    def test_el_chat_guarda_productos_y_similitud_recuperados(self):
        r = self.chat("manteles para casamiento")
        self.assertEqual(r.status_code, 200)
        ctx, _, estado = ultima_conversacion(USUARIO)
        self.assertEqual(estado, "completada")
        self.assertTrue(ctx["productos"], "el RAG deberia haber hallado manteles")
        for p in ctx["productos"]:
            self.assertEqual(set(p), {"id", "nombre", "similitud"})
            self.assertGreaterEqual(p["similitud"], main.RAG_CHAT_UMBRAL_SIMILITUD)
        self.assertEqual(ctx["umbral_productos"], main.RAG_CHAT_UMBRAL_SIMILITUD)
        # y el chat los devuelve como sugerencias clicables
        self.assertEqual([p["id"] for p in r.json()["productos_relacionados"]], [p["id"] for p in ctx["productos"]])

    def test_guarda_las_conversaciones_de_memoria_usadas(self):
        msg = "necesito manteles para una boda grande"
        main.guardar_conversacion(USUARIO, msg, "Te recomiendo el Mantel Dorado", 5, embedding=main.vector_literal(msg))
        self.assertEqual(self.chat(msg).status_code, 200)
        ctx, _, _ = ultima_conversacion(USUARIO)
        self.assertEqual(len(ctx["memoria"]), 1)
        self.assertEqual(set(ctx["memoria"][0]), {"id", "similitud", "mensaje_usuario"})
        self.assertGreaterEqual(ctx["memoria"][0]["similitud"], main.MEMORIA_UMBRAL_SIMILITUD)
        self.assertTrue(ctx["memoria"][0]["id"])

    def test_mensaje_largo_no_ejecuta_rag_y_deja_contexto_nulo(self):
        self.assertEqual(self.chat("x" * (main.RAG_MENSAJE_MAX_CHARS + 1)).status_code, 200)
        ctx, tiene_emb, _ = ultima_conversacion(USUARIO)
        self.assertIsNone(ctx)
        self.assertFalse(tiene_emb)

    def test_si_falla_armar_el_contexto_el_chat_sigue_y_se_guarda_sin_el(self):
        with mock.patch.object(main, "construir_contexto_rag", side_effect=RuntimeError("boom")):
            r = self.chat("copas para brindar")
        self.assertEqual(r.status_code, 200)
        ctx, tiene_emb, estado = ultima_conversacion(USUARIO)
        self.assertIsNone(ctx)
        self.assertTrue(tiene_emb)
        self.assertEqual(estado, "completada")

    def test_si_el_contexto_no_se_puede_serializar_se_guarda_el_registro_igual(self):
        main.guardar_conversacion(USUARIO, "mensaje X", "ok", 1, embedding=main.vector_literal("mensaje X"),
                                  contexto_rag={"productos": [object()]})
        ctx, tiene_emb, _ = ultima_conversacion(USUARIO)
        self.assertIsNone(ctx)
        self.assertTrue(tiene_emb)

    def test_si_falla_el_insert_con_contexto_cae_al_registro_basico(self):
        # Simula la migracion 008 sin aplicar: cualquier INSERT que nombre contexto_rag falla.
        real = main.obtener_conexion
        sql_vistos = []

        from contextlib import contextmanager

        @contextmanager
        def conexion(commit=False):
            with real(commit=commit) as conn:
                orig = conn.cursor

                class Cur:
                    def __init__(s, c): s.c = c
                    def __enter__(s): return s
                    def __exit__(s, *a): return s.c.__exit__(*a)
                    def execute(s, sql, params=None):
                        sql_vistos.append(sql)
                        if "contexto_rag" in sql:
                            raise main.psycopg2.errors.UndefinedColumn("no existe la columna")
                        return s.c.execute(sql, params)

                conn_proxy = mock.MagicMock(wraps=conn)
                conn_proxy.cursor = lambda *a, **k: Cur(orig(*a, **k))
                yield conn_proxy

        with mock.patch.object(main, "obtener_conexion", conexion):
            main.guardar_conversacion(USUARIO, "mensaje Y", "ok", 1, embedding=main.vector_literal("mensaje Y"),
                                      contexto_rag={"productos": []})
        self.assertTrue(any("contexto_rag" in s for s in sql_vistos))
        ctx, tiene_emb, _ = ultima_conversacion(USUARIO)
        self.assertIsNone(ctx)
        self.assertTrue(tiene_emb)  # cayo al segundo intento (con embedding, sin contexto)


# ============================================================ B2: serie temporal
def fila(mes, cat, unidades):
    return {"mes": mes, "categoria": cat, "unidades": unidades, "alquileres": 1, "unidades_ejemplo": 0}


def serie(cat, valores, inicio=(2026, 1)):
    out, (a, m) = [], inicio
    for v in valores:
        out.append(fila(date(a, m, 1).isoformat(), cat, v))
        m += 1
        if m == 13:
            a, m = a + 1, 1
    return out


class PruebasTendencia(unittest.TestCase):
    HOY = date(2026, 11, 23)

    def test_alerta_si_el_ultimo_mes_completo_se_desvia_mas_del_umbral(self):
        t = analitica.analizar_tendencia(serie("Copa", [100, 100, 100, 100, 100, 250]), self.HOY)
        self.assertTrue(t["alerta"])
        self.assertEqual(t["ultimo_mes"], "2026-06-01")
        self.assertAlmostEqual(t["cambios"][0]["variacion"], 1.5)
        self.assertIn("Copa +150%", t["mensaje"])

    def test_sin_alerta_si_el_cambio_es_pequeno(self):
        t = analitica.analizar_tendencia(serie("Copa", [100, 100, 100, 100, 100, 120]), self.HOY)
        self.assertFalse(t["alerta"])

    def test_la_caida_tambien_alerta(self):
        self.assertTrue(analitica.analizar_tendencia(serie("Copa", [100] * 5 + [30]), self.HOY)["alerta"])

    def test_el_mes_en_curso_se_ignora(self):
        filas = serie("Copa", [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 5], inicio=(2026, 1))  # nov = en curso
        t = analitica.analizar_tendencia(filas, self.HOY)
        self.assertEqual(t["ultimo_mes"], "2026-10-01")
        self.assertFalse(t["alerta"])

    def test_categorias_de_poco_volumen_se_ignoran(self):
        t = analitica.analizar_tendencia(serie("Otro", [2, 2, 2, 2, 2, 40]), self.HOY)
        self.assertEqual(t["cambios"], [])
        self.assertFalse(t["alerta"])

    def test_sin_historial_suficiente(self):
        self.assertFalse(analitica.analizar_tendencia([], self.HOY)["alerta"])
        self.assertFalse(analitica.analizar_tendencia(serie("Copa", [100]), self.HOY)["alerta"])


class PruebasAlertaDerivaConSerie(unittest.TestCase):
    TEND_ALERTA = {"ultimo_mes": "2026-10-01", "cambios": [], "alerta": True, "mensaje": "Copa +150%."}
    TEND_OK = {"ultimo_mes": "2026-10-01", "cambios": [], "alerta": False, "mensaje": "estable"}

    def test_normal_con_alerta_de_serie_sube_a_atencion(self):
        r = deriva.combinar_con_serie({"semaforo": "normal", "mensaje": "ok."}, self.TEND_ALERTA)
        self.assertEqual(r["semaforo"], "atencion")
        self.assertIn("serie temporal", r["mensaje"])
        self.assertEqual(r["serie"], self.TEND_ALERTA)

    def test_nunca_sube_a_deriva_ni_baja_un_semaforo_peor(self):
        for s in ("atencion", "deriva", "sin_datos", "sin_modelo"):
            self.assertEqual(deriva.combinar_con_serie({"semaforo": s, "mensaje": ""}, self.TEND_ALERTA)["semaforo"], s)

    def test_sin_alerta_o_sin_serie_no_cambia_el_semaforo(self):
        self.assertEqual(deriva.combinar_con_serie({"semaforo": "normal", "mensaje": "x"}, self.TEND_OK)["semaforo"], "normal")
        original = {"semaforo": "normal", "mensaje": "x"}
        self.assertEqual(deriva.combinar_con_serie(original, None), original)


@requiere_bd
class PruebasSerieBD(unittest.TestCase):
    def test_la_vista_coincide_con_los_items_de_alquiler(self):
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT COALESCE(SUM(unidades),0) FROM demanda_categoria_mes")
            en_vista = cur.fetchone()[0]
            cur.execute("SELECT COALESCE(SUM(cantidad),0) FROM alquiler_items")
            en_items = cur.fetchone()[0]
        self.assertEqual(en_vista, en_items)

    def test_serie_demanda_devuelve_filas_ordenadas_y_acotadas(self):
        with main.obtener_conexion() as conn:
            filas = analitica.serie_demanda(conn, 6)
        self.assertTrue(filas)
        self.assertEqual({"mes", "categoria", "unidades", "alquileres", "unidades_ejemplo"}, set(filas[0]))
        self.assertEqual(filas, sorted(filas, key=lambda f: (f["mes"], f["categoria"])))
        self.assertLessEqual(len({f["mes"] for f in filas}), 6)

    def test_endpoint_serie_demanda(self):
        c = TestClient(main.app)
        self.assertEqual(c.get("/serie-demanda").status_code, 401)
        r = c.get("/serie-demanda?meses=3", headers=CAB)
        self.assertEqual(r.status_code, 200)
        self.assertIn("tendencia", r.json())
        self.assertLessEqual(len({f["mes"] for f in r.json()["filas"]}), 3)

    def test_estado_incluye_la_serie_en_la_deriva(self):
        with mock.patch.object(main, "_estado_gemini", lambda: main.ComponenteEstado(estado="ok")), \
                mock.patch.object(main.tareas, "obtener_redis") as rd:
            rd.return_value.ping.return_value = True
            d = TestClient(main.app).get("/estado", headers=CAB).json()["deriva"]
        self.assertIn("serie", d)
        self.assertIn("alerta", d["serie"])


# ============================================================ B4: riesgo de faltante
class PruebasRiesgoFaltante(unittest.TestCase):
    def test_limites_del_semaforo(self):
        c = analitica.clasificar_riesgo
        self.assertEqual(c(100, 99), "faltara")
        self.assertEqual(c(100, 100), "justo")
        self.assertEqual(c(100, 119), "justo")
        self.assertEqual(c(100, 120), "alcanza")
        self.assertEqual(c(100, 5000), "alcanza")
        self.assertEqual(c(0, 0), "alcanza")

    def test_cruzar_calcula_faltante_y_trata_categoria_sin_stock_como_cero(self):
        r = analitica.cruzar_riesgo(
            [{"categoria": "Copa", "cantidad_estimada": 200}, {"categoria": "Plato", "cantidad_estimada": 50},
             {"categoria": "Otro", "cantidad_estimada": 10}],
            {"Copa": 150, "Plato": 500})
        self.assertEqual([(x["categoria"], x["semaforo"], x["faltante"]) for x in r],
                         [("Copa", "faltara", 50), ("Plato", "alcanza", 0), ("Otro", "faltara", 10)])

    def post(self, stock, cuerpo=None):
        c = TestClient(main.app)
        with mock.patch.object(analitica, "stock_por_categoria", return_value=stock), \
                mock.patch.object(main, "obtener_conexion", mock.MagicMock()):
            return c.post("/riesgo-faltante", headers=CAB,
                          json=cuerpo or {"tipo_evento": "boda", "mes": 12, "asistentes": 150})

    def test_endpoint_con_stock_enorme_todo_alcanza(self):
        r = self.post({c: 10 ** 6 for c in ["Copa", "Vaso", "Plato", "Cubierto", "Mantel", "Otro"]})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json()["categorias"])
        self.assertEqual({c["semaforo"] for c in r.json()["categorias"]}, {"alcanza"})

    def test_endpoint_sin_stock_todo_faltara(self):
        r = self.post({})
        self.assertEqual({c["semaforo"] for c in r.json()["categorias"] if c["demanda_estimada"] > 0}, {"faltara"})

    def test_mas_asistentes_empeora_el_semaforo(self):
        stock = {"Copa": 400, "Vaso": 400, "Plato": 400, "Cubierto": 400, "Mantel": 400, "Otro": 400}
        peso = {"alcanza": 0, "justo": 1, "faltara": 2}
        def total(asist):
            return sum(peso[c["semaforo"]] for c in self.post(stock, {"tipo_evento": "boda", "mes": 12, "asistentes": asist}).json()["categorias"])
        self.assertLessEqual(total(30), total(300))

    def test_sin_token_401_y_validacion_422(self):
        c = TestClient(main.app)
        self.assertEqual(c.post("/riesgo-faltante", json={"tipo_evento": "boda", "mes": 1, "asistentes": 5}).status_code, 401)
        self.assertEqual(c.post("/riesgo-faltante", headers=CAB, json={"tipo_evento": "x", "mes": 1, "asistentes": 5}).status_code, 422)

    def test_con_la_bd_caida_responde_503(self):
        c = TestClient(main.app)
        with mock.patch.object(analitica, "stock_por_categoria", side_effect=main.psycopg2.OperationalError("x")), \
                mock.patch.object(main, "obtener_conexion", mock.MagicMock()):
            r = c.post("/riesgo-faltante", headers=CAB, json={"tipo_evento": "boda", "mes": 12, "asistentes": 150})
        self.assertEqual(r.status_code, 503)

    @requiere_bd
    def test_stock_real_por_categoria(self):
        with main.obtener_conexion() as conn:
            stock = analitica.stock_por_categoria(conn)
        self.assertGreater(sum(stock.values()), 0)


# ============================================================ B5: metricas de uso
@requiere_bd
class PruebasMetricasUso(unittest.TestCase):
    def test_cuenta_consultas_tokens_errores_y_busquedas_sin_resultado(self):
        # Todo dentro de una transaccion que NO se confirma: el pool hace rollback al devolver la conexion.
        with main.obtener_conexion() as conn:
            antes = analitica.metricas_uso(conn, 1)["totales"]
            with conn.cursor() as cur:
                for estado, tokens in (("completada", 100), ("completada", 50), ("error", 0)):
                    cur.execute("INSERT INTO conversaciones_ia (usuario_id, mensaje_usuario, respuesta_ia, tokens_usados, estado) "
                                "VALUES (%s, 'm', 'r', %s, %s)", (USUARIO, tokens, estado))
                cur.execute("INSERT INTO busquedas_ia (tipo, consulta, n_resultados) VALUES "
                            "('semantica','zzz sin nada',0),('semantica','zzz sin nada',0),('semantica','copas',3),('similares','producto:3',0)")
            despues = analitica.metricas_uso(conn, 1)
        t = despues["totales"]
        self.assertEqual(t["consultas"] - antes["consultas"], 3)
        self.assertEqual(t["tokens"] - antes["tokens"], 150)
        self.assertEqual(t["errores"] - antes["errores"], 1)
        self.assertEqual(t["busquedas"] - antes["busquedas"], 4)
        self.assertEqual(t["busquedas_sin_resultado"] - antes["busquedas_sin_resultado"], 3)
        # el listado de "sin resultado" solo trae busquedas semanticas, agrupadas
        top = {c["consulta"]: c["veces"] for c in despues["consultas_sin_resultado"]}
        self.assertGreaterEqual(top["zzz sin nada"], 2)
        self.assertNotIn("producto:3", top)

    def test_incluye_los_dias_sin_actividad(self):
        with main.obtener_conexion() as conn:
            r = analitica.metricas_uso(conn, 7)
        self.assertEqual(len(r["por_dia"]), 7)
        self.assertEqual([d["dia"] for d in r["por_dia"]], sorted(d["dia"] for d in r["por_dia"]))

    def test_endpoint_acota_los_dias_y_exige_token(self):
        c = TestClient(main.app)
        self.assertEqual(c.get("/metricas-uso").status_code, 401)
        self.assertEqual(c.get("/metricas-uso?dias=9999", headers=CAB).json()["dias"], 90)
        self.assertEqual(c.get("/metricas-uso?dias=0", headers=CAB).json()["dias"], 1)

    def test_la_busqueda_semantica_registra_el_numero_de_resultados(self):
        c = TestClient(main.app)
        with mock.patch.object(main, "vector_literal", return_value="[0]"), \
                mock.patch.object(main, "consultar_productos_similares", return_value=[]), \
                mock.patch.object(main, "registrar_busqueda") as reg:
            self.assertEqual(c.post("/busqueda-semantica", headers=CAB, json={"descripcion": "algo inexistente"}).status_code, 200)
        reg.assert_called_once_with("semantica", "algo inexistente", 0)

    def test_registrar_busqueda_escribe_en_la_tabla_y_no_propaga_errores(self):
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM busquedas_ia WHERE consulta = 'consulta-de-prueba-6b'")
            antes = cur.fetchone()[0]
        try:
            main.registrar_busqueda("semantica", "consulta-de-prueba-6b", 0)
            with main.obtener_conexion() as conn, conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM busquedas_ia WHERE consulta = 'consulta-de-prueba-6b'")
                self.assertEqual(cur.fetchone()[0], antes + 1)
        finally:
            with main.obtener_conexion(commit=True) as conn, conn.cursor() as cur:
                cur.execute("DELETE FROM busquedas_ia WHERE consulta = 'consulta-de-prueba-6b'")
        with mock.patch.object(main, "obtener_conexion", side_effect=RuntimeError("BD caida")), \
                self.assertLogs("menaje.ia", level="WARNING"):
            main.registrar_busqueda("semantica", "x", 0)  # no debe lanzar


# ============================================================ B6: productos similares (pgvector)
@requiere_bd
class PruebasProductosSimilares(unittest.TestCase):
    def setUp(self):
        self.c = TestClient(main.app)
        p = mock.patch.object(main, "registrar_busqueda")
        self.reg = p.start()
        self.addCleanup(p.stop)
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT id FROM productos WHERE activo AND embedding IS NOT NULL ORDER BY id LIMIT 1")
            self.pid = cur.fetchone()[0]

    def test_sin_token_401(self):
        self.assertEqual(self.c.get(f"/productos-similares/{self.pid}").status_code, 401)

    def test_devuelve_otros_productos_con_stock_por_similitud_descendente(self):
        r = self.c.get(f"/productos-similares/{self.pid}?limite=4", headers=CAB)
        self.assertEqual(r.status_code, 200)
        res = r.json()["resultados"]
        self.assertTrue(0 < len(res) <= 4)
        self.assertNotIn(self.pid, [p["id"] for p in res])
        self.assertTrue(all(p["stock_disponible"] > 0 for p in res))
        sims = [p["similitud"] for p in res]
        self.assertEqual(sims, sorted(sims, reverse=True))
        self.reg.assert_called_once_with("similares", f"producto:{self.pid}", len(res))

    def test_el_limite_se_acota(self):
        self.assertLessEqual(len(self.c.get(f"/productos-similares/{self.pid}?limite=1", headers=CAB).json()["resultados"]), 1)
        self.assertLessEqual(len(self.c.get(f"/productos-similares/{self.pid}?limite=500", headers=CAB).json()["resultados"]), 12)

    def test_producto_inexistente_404(self):
        self.assertEqual(self.c.get("/productos-similares/99999999", headers=CAB).status_code, 404)

    def test_los_mas_cercanos_son_de_la_misma_familia(self):
        # una copa deberia tener otras copas/vasos entre sus 3 vecinos mas cercanos
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT p.id FROM productos p JOIN categorias c ON c.id=p.categoria_id "
                        "WHERE c.nombre='Copa' AND p.embedding IS NOT NULL AND p.activo ORDER BY p.id LIMIT 1")
            copa = cur.fetchone()[0]
        cats = {p["categoria"] for p in self.c.get(f"/productos-similares/{copa}?limite=3", headers=CAB).json()["resultados"]}
        self.assertTrue(cats & {"Copa", "Vaso"}, cats)


if __name__ == "__main__":
    unittest.main()
