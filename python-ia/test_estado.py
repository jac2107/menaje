"""
Pruebas de /estado, /tareas (HTTP) y del modo degradado (OPCION 2, Fase 4).
Sin PostgreSQL, Redis ni Gemini reales: pool, Redis (fakeredis), Gemini y BD se
sustituyen por dobles. Verifican tambien que el chat sigue respondiendo cuando
el modelo de pronostico o la busqueda vectorial fallan.

  cd python-ia && ./venv/Scripts/python -m unittest test_estado -v
"""
import os
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

import fakeredis

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

with mock.patch("psycopg2.pool.ThreadedConnectionPool"), \
        mock.patch("google.generativeai.GenerativeModel"), \
        mock.patch("google.generativeai.list_models", return_value=[]):
    import main

from fastapi.testclient import TestClient

import tareas

CAB = {"X-IA-Token": main.IA_SERVICE_TOKEN}


class ModeloGemini:
    class _R:
        text = "Hola, tenemos copas y platos."

        class usage_metadata:
            total_token_count = 5

    def __init__(self, *_a, **_k):
        pass

    def generate_content(self, _prompt):
        return self._R()


def conexion_falsa(fila=(10, 10), falla=False):
    @contextmanager
    def _conn(commit=False):
        if falla:
            raise RuntimeError("BD caida")
        cur = mock.MagicMock()
        cur.fetchone.return_value = fila
        conn = mock.MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        yield conn
    return _conn


def modelo_gemini_en_lista(nombre=None):
    m = mock.Mock()
    m.name = nombre or f"models/{main.GEMINI_MODEL}"
    return [m]


class Base(unittest.TestCase):
    def setUp(self):
        self.r = fakeredis.FakeRedis(decode_responses=True)
        p = mock.patch.object(tareas, "_cliente", self.r)
        p.start()
        self.addCleanup(p.stop)
        main._modelo_pronostico = None
        main._modelo_pronostico_mtime = None
        main._gemini_cache.update(hasta=0.0, valor=None)
        self.client = TestClient(main.app)


class PruebasTareasHTTP(Base):
    def test_sin_token_401(self):
        self.assertEqual(self.client.post("/tareas", json={"tipo": "reentrenar_pronostico"}).status_code, 401)
        self.assertEqual(self.client.get("/tareas").status_code, 401)
        self.assertEqual(self.client.get("/tareas/abc").status_code, 401)
        self.assertEqual(self.client.get("/estado").status_code, 401)

    def test_crear_consultar_y_listar(self):
        r = self.client.post("/tareas", json={"tipo": "regenerar_embeddings"}, headers=CAB)
        self.assertEqual(r.status_code, 202)
        t = r.json()
        self.assertEqual(t["estado"], "pendiente")
        g = self.client.get(f"/tareas/{t['id']}", headers=CAB)
        self.assertEqual(g.json()["tipo"], "regenerar_embeddings")
        self.assertEqual([x["id"] for x in self.client.get("/tareas", headers=CAB).json()], [t["id"]])

    def test_duplicada_409_tipo_invalido_422_inexistente_404(self):
        cuerpo = {"tipo": "reentrenar_pronostico"}
        self.assertEqual(self.client.post("/tareas", json=cuerpo, headers=CAB).status_code, 202)
        self.assertEqual(self.client.post("/tareas", json=cuerpo, headers=CAB).status_code, 409)
        self.assertEqual(self.client.post("/tareas", json={"tipo": "rm -rf"}, headers=CAB).status_code, 422)
        self.assertEqual(self.client.get("/tareas/no-existe", headers=CAB).status_code, 404)

    def test_503_si_redis_no_responde(self):
        roto = mock.Mock()
        roto.ping.side_effect = ConnectionError("redis caido")
        with mock.patch.object(tareas, "_cliente", roto):
            self.assertEqual(
                self.client.post("/tareas", json={"tipo": "reentrenar_pronostico"}, headers=CAB).status_code, 503)


class PruebasEstado(Base):
    def estado(self, conexion=None, gemini=None):
        with mock.patch.object(main, "obtener_conexion", conexion or conexion_falsa()), \
                mock.patch.object(main.genai, "list_models",
                                  side_effect=gemini) if isinstance(gemini, Exception) else \
                mock.patch.object(main.genai, "list_models",
                                  return_value=gemini if gemini is not None else modelo_gemini_en_lista()):
            return self.client.get("/estado", headers=CAB)

    def test_todo_ok(self):
        r = self.estado()
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["estado_general"], "ok")
        self.assertFalse(d["modo_degradado"])
        self.assertEqual(set(d["componentes"]), {"pronostico", "busqueda_vectorial", "redis", "gemini"})
        self.assertTrue(all(c["estado"] == "ok" for c in d["componentes"].values()))

    def test_modelo_no_carga_es_degradado(self):
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=None):
            d = self.estado().json()
        self.assertTrue(d["modo_degradado"])
        self.assertEqual(d["estado_general"], "degradado")
        self.assertEqual(d["componentes"]["pronostico"]["estado"], "degradado")
        self.assertEqual(d["componentes"]["redis"]["estado"], "ok")

    def test_sin_modelo_ni_promedio_es_caido(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": tmp}):
            d = self.estado().json()
        self.assertEqual(d["componentes"]["pronostico"]["estado"], "caido")
        self.assertTrue(d["modo_degradado"])

    def test_busqueda_vectorial_caida_o_sin_embeddings(self):
        d = self.estado(conexion=conexion_falsa(falla=True)).json()
        self.assertEqual(d["componentes"]["busqueda_vectorial"]["estado"], "caido")
        self.assertTrue(d["modo_degradado"])
        d = self.estado(conexion=conexion_falsa(fila=(0, 10))).json()
        self.assertEqual(d["componentes"]["busqueda_vectorial"]["estado"], "degradado")
        d = self.estado(conexion=conexion_falsa(fila=(7, 10))).json()
        self.assertIn("3 de 10", d["componentes"]["busqueda_vectorial"]["detalle"])

    def test_redis_caido_no_rompe_el_estado(self):
        roto = mock.Mock()
        roto.ping.side_effect = ConnectionError("redis caido")
        with mock.patch.object(tareas, "_cliente", roto):
            r = self.estado()
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["componentes"]["redis"]["estado"], "caido")
        self.assertEqual(d["estado_general"], "degradado")
        self.assertFalse(d["modo_degradado"])  # el modelo y la busqueda siguen bien

    def test_gemini_caido_o_modelo_ausente(self):
        d = self.estado(gemini=TimeoutError("sin red")).json()
        self.assertEqual(d["componentes"]["gemini"]["estado"], "caido")
        main._gemini_cache.update(hasta=0.0, valor=None)
        d = self.estado(gemini=modelo_gemini_en_lista("models/otro")).json()
        self.assertEqual(d["componentes"]["gemini"]["estado"], "caido")

    def test_gemini_se_cachea(self):
        with mock.patch.object(main, "obtener_conexion", conexion_falsa()), \
                mock.patch.object(main.genai, "list_models", return_value=modelo_gemini_en_lista()) as lm:
            self.client.get("/estado", headers=CAB)
            self.client.get("/estado", headers=CAB)
        self.assertEqual(lm.call_count, 1)

    def test_no_se_llama_a_generate_content(self):
        with mock.patch.object(main.genai, "GenerativeModel") as gm:
            self.estado()
        gm.assert_not_called()


class PruebasModoDegradadoChat(Base):
    """Con el modelo de pronostico o la busqueda vectorial caidos, el chat responde."""

    def chat(self):
        with mock.patch.object(main.genai, "GenerativeModel", ModeloGemini), \
                mock.patch.object(main, "obtener_contexto", return_value={}), \
                mock.patch.object(main, "construir_system_prompt", return_value="sys"), \
                mock.patch.object(main, "guardar_conversacion"):
            return self.client.post(
                "/chat", json={"usuario_id": 2, "mensaje": "tienen copas?"}, headers=CAB)

    def test_chat_sin_modelo_de_pronostico(self):
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=None), \
                mock.patch.object(main, "vector_literal", return_value="[0]"), \
                mock.patch.object(main, "consultar_productos_similares", return_value=[]), \
                mock.patch.object(main, "consultar_memoria", return_value=[]):
            r = self.chat()
        self.assertEqual(r.status_code, 200)
        self.assertIn("copas", r.json()["respuesta"])

    def test_chat_con_busqueda_vectorial_caida(self):
        with mock.patch.object(main, "vector_literal", side_effect=RuntimeError("sin modelo de embeddings")):
            r = self.chat()
        self.assertEqual(r.status_code, 200)
        with mock.patch.object(main, "vector_literal", return_value="[0]"), \
                mock.patch.object(main, "consultar_productos_similares", side_effect=RuntimeError("BD")), \
                mock.patch.object(main, "consultar_memoria", side_effect=RuntimeError("BD")):
            r = self.chat()
        self.assertEqual(r.status_code, 200)

    def test_pronostico_degradado_no_afecta_al_chat_ni_viceversa(self):
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=None):
            p = self.client.post(
                "/pronostico-demanda", json={"tipo_evento": "boda", "mes": 7, "asistentes": 100}, headers=CAB)
        self.assertEqual(p.json()["modo"], "degradado")


class PruebasRecargaDelModelo(Base):
    def test_se_recarga_si_cambia_meta_json(self):
        origen = main.pronostico.directorio_modelo()
        with tempfile.TemporaryDirectory() as tmp:
            for f in ("meta.json", "baseline.json", "pesos.npz"):
                (Path(tmp) / f).write_bytes((origen / f).read_bytes())
            with mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": tmp}):
                primero = main.obtener_modelo_pronostico()
                self.assertIs(primero, main.obtener_modelo_pronostico())  # cacheado
                meta = Path(tmp) / "meta.json"
                os.utime(meta, (meta.stat().st_atime, meta.stat().st_mtime + 10))  # "reentrenado"
                self.assertIsNot(primero, main.obtener_modelo_pronostico())


if __name__ == "__main__":
    unittest.main()
