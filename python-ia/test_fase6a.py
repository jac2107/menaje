"""
Pruebas de la Fase 6A: deriva, historial de pronosticos, composicion de datos del
entrenamiento, reentrenamiento mensual y cola de embeddings por producto.

Usan fakeredis y dobles de subprocess (no entrenan ni llaman a Gemini). Las pruebas que
tocan la BD usan la real (como test_rag) y se omiten si no responde.

  cd python-ia && ./venv/Scripts/python -m unittest test_fase6a -v
"""
import json
import os
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

import fakeredis

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

import deriva
import pronostico
import tareas
import worker_tareas
from _importar_main import importar_main

main = importar_main()

from fastapi.testclient import TestClient

CABECERA = {"X-IA-Token": main.IA_SERVICE_TOKEN}
CATEGORIAS = ["Copa", "Vaso", "Plato", "Cubierto", "Mantel", "Otro"]


def bd_disponible() -> bool:
    try:
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pronosticos LIMIT 1")
        return True
    except Exception:
        return False


class ModeloFalso:
    """Predice siempre 100 por categoria; error de validacion 10 en todas."""
    categorias = CATEGORIAS
    tipos_evento = ["boda", "cumpleanos"]
    meta = {"error_validacion_mae": {c: 10.0 for c in CATEGORIAS}}

    def predecir(self, tipo, mes, asistentes):
        return {c: 100.0 for c in CATEGORIAS}


def filas(n, real):
    """n alquileres cuya demanda real es `real` en cada categoria."""
    return [("boda", 6, 80, {c: real for c in CATEGORIAS}) for _ in range(n)]


# ---------------------------------------------------------------- 4. deriva
class PruebasDeriva(unittest.TestCase):
    def test_umbrales_documentados(self):
        self.assertEqual(deriva.UMBRAL_ATENCION, 1.5)
        self.assertEqual(deriva.UMBRAL_DERIVA, 2.0)
        for razon, esperado in ((0.8, "normal"), (1.49, "normal"), (1.5, "atencion"),
                                (1.99, "atencion"), (2.0, "deriva"), (5.0, "deriva")):
            with self.subTest(razon=razon):
                self.assertEqual(deriva.clasificar(razon), esperado)

    def test_semaforo_normal_atencion_deriva(self):
        # error = |100 - real|; validacion = 10 -> razon = error / 10
        casos = ((105, "normal"), (114, "normal"), (115, "atencion"), (85, "atencion"), (75, "deriva"), (0, "deriva"))
        for real, esperado in casos:
            with self.subTest(real=real):
                r = deriva.evaluar(ModeloFalso(), filas(30, real))
                self.assertEqual(r["semaforo"], esperado)
                self.assertAlmostEqual(r["razon"], abs(100 - real) / 10, places=1)

    def test_pocos_alquileres_no_alertan(self):
        r = deriva.evaluar(ModeloFalso(), filas(deriva.MIN_ALQUILERES - 1, 0))
        self.assertEqual(r["semaforo"], "sin_datos")
        self.assertIsNone(r["razon"])

    def test_sin_modelo_y_tipos_desconocidos(self):
        self.assertEqual(deriva.evaluar(None, filas(30, 50))["semaforo"], "sin_modelo")
        raros = [("evento_raro", 1, 10, {c: 1.0 for c in CATEGORIAS})] * 30
        self.assertEqual(deriva.evaluar(ModeloFalso(), raros)["semaforo"], "sin_datos")

    def test_consultar_recientes_agrupa_por_alquiler(self):
        cur = mock.MagicMock()
        cur.fetchall.return_value = [
            (1, "boda", 6, 80, "Copa", 100), (1, "boda", 6, 80, "Plato", 90),
            (2, "bautizo", 7, 40, "Copa", 30)]
        conn = mock.MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        resultado = deriva.consultar_recientes(conn)
        self.assertEqual(len(resultado), 2)
        self.assertEqual(resultado[0], ("boda", 6, 80, {"Copa": 100.0, "Plato": 90.0}))

    @unittest.skipUnless(bd_disponible(), "PostgreSQL no responde")
    def test_consulta_real_y_estado_exponen_la_deriva(self):
        with main.obtener_conexion() as conn:
            self.assertIsInstance(deriva.consultar_recientes(conn), list)
        r = TestClient(main.app).get("/estado", headers=CABECERA)
        self.assertEqual(r.status_code, 200)
        cuerpo = r.json()
        self.assertIn(cuerpo["deriva"]["semaforo"],
                      ("normal", "atencion", "deriva", "sin_datos", "sin_modelo"))
        self.assertEqual(cuerpo["deriva"]["umbral_deriva"], 2.0)
        self.assertIn("composicion", cuerpo["entrenamiento"])


# ------------------------------------- 2. composicion de datos del entrenamiento
class PruebasComposicion(unittest.TestCase):
    def test_resumen_con_composicion(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "meta.json").write_text(json.dumps({
                "datos": "MIXTOS", "version_modelo": "202611200603-abc12345",
                "entrenado_en": "2026-11-20T06:03:06+00:00",
                "composicion_datos": {"sintetico": 3600, "ejemplo": 300, "real": 0, "total": 3900}}))
            with mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": d}):
                r = pronostico.resumen_entrenamiento()
        self.assertEqual(r["datos"], "MIXTOS")
        self.assertEqual(r["proporcion"], {"sintetico": 0.9231, "ejemplo": 0.0769, "real": 0.0})
        self.assertAlmostEqual(sum(r["proporcion"].values()), 1.0, places=3)

    def test_meta_antiguo_sin_composicion(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "meta.json").write_text(json.dumps({"datos": "SINTETICOS"}))
            with mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": d}):
                r = pronostico.resumen_entrenamiento()
        self.assertEqual(r["composicion"]["total"], 0)
        self.assertEqual(r["proporcion"], {})

    def test_el_modelo_entregado_declara_su_composicion(self):
        r = pronostico.resumen_entrenamiento()
        self.assertGreater(r["composicion"]["total"], 0)
        self.assertEqual(r["composicion"]["sintetico"] + r["composicion"]["ejemplo"]
                         + r["composicion"]["real"], r["composicion"]["total"])
        self.assertTrue(r["version_modelo"])


# --------------------------------------------------- 3. tabla pronosticos
@unittest.skipUnless(bd_disponible(), "PostgreSQL con la migracion 007 no responde")
class PruebasHistorialPronosticos(unittest.TestCase):
    ASISTENTES = 4321  # valor poco comun para localizar y borrar las filas de la prueba

    def setUp(self):
        main._modelo_pronostico = None
        self.client = TestClient(main.app)
        self._limpiar()

    def tearDown(self):
        self._limpiar()

    def _limpiar(self):
        with main.obtener_conexion(commit=True) as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM pronosticos WHERE asistentes = %s", (self.ASISTENTES,))

    def filas(self):
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute("SELECT tipo_evento, mes, asistentes, modo, version_modelo, salida, created_at "
                        "FROM pronosticos WHERE asistentes = %s", (self.ASISTENTES,))
            return cur.fetchall()

    def test_cada_pronostico_queda_guardado(self):
        cuerpo = {"tipo_evento": "boda", "mes": 12, "asistentes": self.ASISTENTES}
        r = self.client.post("/pronostico-demanda", json=cuerpo, headers=CABECERA)
        self.assertEqual(r.status_code, 200)
        filas = self.filas()
        self.assertEqual(len(filas), 1)
        tipo, mes, asist, modo, version, salida, fecha = filas[0]
        self.assertEqual((tipo, mes, asist, modo), ("boda", 12, self.ASISTENTES, "modelo"))
        self.assertEqual(version, r.json()["version_modelo"])
        self.assertTrue(version and version != "degradado")
        self.assertEqual(set(salida), set(CATEGORIAS))
        self.assertEqual(salida["Copa"], next(d["cantidad_estimada"] for d in r.json()["demanda"]
                                                 if d["categoria"] == "Copa"))
        self.assertLess((datetime.now(timezone.utc) - fecha).total_seconds(), 60)

    def test_modo_degradado_tambien_se_guarda(self):
        with mock.patch.object(main, "obtener_modelo_pronostico", return_value=None):
            r = self.client.post("/pronostico-demanda", headers=CABECERA,
                                 json={"tipo_evento": "boda", "mes": 3, "asistentes": self.ASISTENTES})
        self.assertEqual(r.json()["modo"], "degradado")
        self.assertEqual(self.filas()[0][3:5], ("degradado", "degradado"))


class PruebasFalloAlGuardar(unittest.TestCase):
    def test_si_guardar_falla_el_pronostico_se_responde_igual(self):
        main._modelo_pronostico = None
        with mock.patch.object(main, "obtener_conexion", side_effect=RuntimeError("BD caida")), \
                self.assertLogs("menaje.ia", level="WARNING") as logs:
            r = TestClient(main.app).post("/pronostico-demanda", headers=CABECERA,
                                          json={"tipo_evento": "boda", "mes": 12, "asistentes": 150})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["modo"], "modelo")
        self.assertTrue(any("tabla pronosticos" in l for l in logs.output))


# ------------------------------------ 2. el seed de alquileres de ejemplo
@unittest.skipUnless(bd_disponible(), "PostgreSQL no responde")
class PruebasSeedEjemplo(unittest.TestCase):
    def consulta(self, sql):
        with main.obtener_conexion() as conn, conn.cursor() as cur:
            cur.execute(sql)
            return cur.fetchall()

    def setUp(self):
        n = self.consulta("SELECT count(*) FROM alquileres WHERE es_ejemplo")[0][0]
        if n == 0:
            self.skipTest("el seed de ejemplo no esta cargado")

    def test_unos_300_con_variedad(self):
        n, tipos, meses, min_a, max_a = self.consulta(
            "SELECT count(*), count(DISTINCT tipo_evento), count(DISTINCT extract(month FROM fecha_entrega)), "
            "min(num_asistentes), max(num_asistentes) FROM alquileres WHERE es_ejemplo")[0]
        self.assertGreaterEqual(n, 290)
        self.assertEqual(tipos, 7)
        self.assertEqual(meses, 12)
        self.assertGreaterEqual(max_a - min_a, 100)

    def test_no_afectan_al_catalogo_ni_a_clientes_reales(self):
        self.assertEqual(self.consulta(
            "SELECT count(*) FROM alquileres WHERE es_ejemplo AND estado <> 'cerrado'")[0][0], 0)
        self.assertEqual(self.consulta(
            "SELECT count(*) FROM alquileres a JOIN usuarios u ON u.id = a.cliente_id "
            "WHERE a.es_ejemplo AND (u.correo <> 'ejemplo@menaje.invalid' OR u.activo)")[0][0], 0)

    def test_items_coherentes_con_el_catalogo_y_los_asistentes(self):
        # solo productos activos del catalogo, cantidades > 0, nunca mas que el stock total
        self.assertEqual(self.consulta(
            "SELECT count(*) FROM alquiler_items ai JOIN alquileres a ON a.id = ai.alquiler_id "
            "JOIN productos p ON p.id = ai.producto_id WHERE a.es_ejemplo AND "
            "(NOT p.activo OR ai.cantidad > p.stock_total OR ai.cantidad <= 0)")[0][0], 0)
        # los cubiertos por asistente caen en un rango plausible (entre 1.5 y 5 por persona)
        medio = float(self.consulta(
            "SELECT avg(c.cub::numeric / a.num_asistentes) FROM alquileres a JOIN LATERAL ("
            "SELECT sum(ai.cantidad) cub FROM alquiler_items ai JOIN productos p ON p.id = ai.producto_id "
            "JOIN categorias ca ON ca.id = p.categoria_id WHERE ai.alquiler_id = a.id AND ca.nombre = 'Cubierto'"
            ") c ON TRUE WHERE a.es_ejemplo AND c.cub IS NOT NULL")[0][0])
        self.assertTrue(1.5 < medio < 5, medio)
        # una boda pide mas copas por asistente que un cumpleanos
        copas = dict(self.consulta(
            "SELECT a.tipo_evento, avg(c.n::numeric / a.num_asistentes) FROM alquileres a JOIN LATERAL ("
            "SELECT sum(ai.cantidad) n FROM alquiler_items ai JOIN productos p ON p.id = ai.producto_id "
            "JOIN categorias ca ON ca.id = p.categoria_id WHERE ai.alquiler_id = a.id AND ca.nombre = 'Copa'"
            ") c ON TRUE WHERE a.es_ejemplo AND a.tipo_evento IN ('boda','cumpleanos') GROUP BY 1"))
        self.assertGreater(copas["boda"], copas["cumpleanos"])


# ------------------------------------------- 4. reentrenamiento mensual
class PruebasReentrenamientoMensual(unittest.TestCase):
    def setUp(self):
        self.r = fakeredis.FakeRedis(decode_responses=True)

    def test_se_encola_una_sola_vez_por_mes(self):
        dia = datetime(2026, 12, 1, 3, 0, tzinfo=timezone.utc)
        primero = tareas.programar_reentrenamiento_mensual(self.r, dia)
        self.assertIsNotNone(primero)
        self.assertEqual(tareas.obtener_tarea(primero, self.r)["tipo"], "reentrenar_pronostico")
        self.assertIsNone(tareas.programar_reentrenamiento_mensual(self.r, dia.replace(day=15)))
        self.assertEqual(self.r.llen("ia:cola"), 1)

    def test_al_mes_siguiente_vuelve_a_programarse(self):
        tareas.programar_reentrenamiento_mensual(self.r, datetime(2026, 12, 1, tzinfo=timezone.utc))
        self.r.delete("ia:activa:reentrenar_pronostico")  # el worker termino la anterior
        self.assertIsNotNone(
            tareas.programar_reentrenamiento_mensual(self.r, datetime(2027, 1, 1, tzinfo=timezone.utc)))

    def test_respeta_el_dia_configurado_y_se_recupera_si_el_worker_estaba_apagado(self):
        with mock.patch.object(tareas, "REENTRENAR_DIA_MES", 5):
            self.assertIsNone(tareas.programar_reentrenamiento_mensual(
                self.r, datetime(2026, 12, 4, tzinfo=timezone.utc)))
            self.assertIsNotNone(tareas.programar_reentrenamiento_mensual(
                self.r, datetime(2026, 12, 20, tzinfo=timezone.utc)))

    def test_se_puede_desactivar(self):
        with mock.patch.object(tareas, "REENTRENAR_MENSUAL", False):
            self.assertIsNone(tareas.programar_reentrenamiento_mensual(
                self.r, datetime(2026, 12, 10, tzinfo=timezone.utc)))
        self.assertEqual(self.r.llen("ia:cola"), 0)

    def test_si_ya_hay_uno_en_curso_no_falla(self):
        tareas.encolar("reentrenar_pronostico", self.r)  # lanzado a mano
        self.assertIsNone(tareas.programar_reentrenamiento_mensual(
            self.r, datetime(2026, 12, 2, tzinfo=timezone.utc)))
        self.assertEqual(self.r.llen("ia:cola"), 1)

    def test_el_worker_lo_programa_en_cada_vuelta_y_lo_ejecuta(self):
        with mock.patch.object(tareas, "obtener_redis", return_value=self.r), \
                mock.patch("tareas.subprocess.run",
                           return_value=subprocess.CompletedProcess([], 0, "ok", "")) as run, \
                mock.patch("worker_tareas.time.sleep", side_effect=KeyboardInterrupt):
            id_ = tareas.programar_reentrenamiento_mensual(self.r, datetime(2026, 12, 1, tzinfo=timezone.utc))
            self.assertTrue(worker_tareas.procesar_una(self.r, espera_s=1))
        self.assertEqual(tareas.obtener_tarea(id_, self.r)["estado"], "completada")
        self.assertIn("pronostico.entrenar", run.call_args[0][0])

    def test_lanzamiento_manual_desde_la_linea_de_comandos(self):
        with mock.patch.object(tareas, "obtener_redis", return_value=self.r), \
                mock.patch("sys.argv", ["worker_tareas.py", "--reentrenar-ahora"]):
            worker_tareas.main()
            worker_tareas.main()  # la segunda ve que ya hay una pendiente y no duplica
        self.assertEqual(self.r.llen("ia:cola"), 1)


# --------------------------------------- 5. embeddings por producto (worker)
class PruebasEmbeddingsPorProducto(unittest.TestCase):
    def setUp(self):
        self.r = fakeredis.FakeRedis(decode_responses=True)

    def test_encolar_es_un_set_sin_duplicados(self):
        for i in (3, 3, 7):
            tareas.encolar_embedding_producto(i, self.r)
        self.assertEqual(self.r.smembers(tareas.CLAVE_EMBEDDINGS_PENDIENTES), {"3", "7"})

    def test_el_worker_regenera_solo_esos_productos_y_vacia_la_cola(self):
        tareas.encolar_embedding_producto(3, self.r)
        tareas.encolar_embedding_producto(7, self.r)
        with mock.patch("tareas.subprocess.run",
                        return_value=subprocess.CompletedProcess([], 0, "ok", "")) as run:
            self.assertEqual(tareas.procesar_embeddings_pendientes(self.r), "completada")
        orden = run.call_args[0][0]
        self.assertEqual(orden[orden.index("--ids") + 1], "3,7")
        self.assertEqual(self.r.scard(tareas.CLAVE_EMBEDDINGS_PENDIENTES), 0)

    def test_sin_pendientes_no_lanza_nada(self):
        with mock.patch("tareas.subprocess.run") as run:
            self.assertIsNone(tareas.procesar_embeddings_pendientes(self.r))
        run.assert_not_called()

    def test_si_falla_los_ids_vuelven_a_la_cola(self):
        tareas.encolar_embedding_producto(9, self.r)
        with mock.patch("tareas.subprocess.run",
                        return_value=subprocess.CompletedProcess([], 1, "", "boom")):
            self.assertEqual(tareas.procesar_embeddings_pendientes(self.r), "error")
        self.assertEqual(self.r.smembers(tareas.CLAVE_EMBEDDINGS_PENDIENTES), {"9"})

    def test_la_clave_coincide_con_la_que_escribe_node(self):
        fuente = (Path(__file__).resolve().parent.parent / "backend" / "services" / "colaEmbeddings.js").read_text(
            encoding="utf-8")
        self.assertIn(f"'{tareas.CLAVE_EMBEDDINGS_PENDIENTES}'", fuente)


if __name__ == "__main__":
    unittest.main()
