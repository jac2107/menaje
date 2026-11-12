"""
Pruebas del endpoint POST /pronostico-demanda (OPCION 2, capa 9). No necesitan
PostgreSQL ni Gemini: se sustituye el pool de conexiones antes de importar main.
Requieren el paquete del modelo (python-ml/modelos/pronostico, generado con
python-ml/pronostico/entrenar.py).

  cd python-ia && ./venv/Scripts/python -m unittest test_pronostico -v
"""
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

from _importar_main import importar_main

main = importar_main()

from fastapi.testclient import TestClient

TOKEN = main.IA_SERVICE_TOKEN
CABECERA = {"X-IA-Token": TOKEN}
CUERPO = {"tipo_evento": "boda", "mes": 12, "asistentes": 150}
CATEGORIAS = ["Copa", "Vaso", "Plato", "Cubierto", "Mantel", "Otro"]


class PruebasPronostico(unittest.TestCase):
    def setUp(self):
        main._modelo_pronostico = None
        self.client = TestClient(main.app)

    def post(self, cuerpo=CUERPO, headers=CABECERA):
        return self.client.post("/pronostico-demanda", json=cuerpo, headers=headers)

    # --- autenticacion ---
    def test_sin_token_401(self):
        self.assertEqual(self.post(headers={}).status_code, 401)

    def test_token_incorrecto_401(self):
        self.assertEqual(self.post(headers={"X-IA-Token": "otro"}).status_code, 401)

    # --- validacion ---
    def test_entradas_invalidas_422(self):
        for malo in (
            {**CUERPO, "tipo_evento": "fiesta_inexistente"},
            {**CUERPO, "mes": 13},
            {**CUERPO, "mes": 0},
            {**CUERPO, "asistentes": 0},
            {**CUERPO, "asistentes": "muchos"},
            {"tipo_evento": "boda"},
        ):
            with self.subTest(malo=malo):
                self.assertEqual(self.post(malo).status_code, 422)

    # --- modo normal ---
    def test_modo_modelo(self):
        r = self.post()
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["modo"], "modelo")
        self.assertEqual(d["datos_entrenamiento"], "SINTETICOS")
        self.assertEqual([x["categoria"] for x in d["demanda"]], CATEGORIAS)
        for x in d["demanda"]:
            self.assertGreaterEqual(x["cantidad_estimada"], 0)
            self.assertGreater(x["error_validacion_mae"], 0)

    def test_mas_asistentes_mas_demanda(self):
        chico = self.post({**CUERPO, "asistentes": 40}).json()["demanda"]
        grande = self.post({**CUERPO, "asistentes": 250}).json()["demanda"]
        for a, b in zip(chico, grande):
            self.assertLess(a["cantidad_estimada"], b["cantidad_estimada"], a["categoria"])

    def test_boda_mas_copas_y_manteles_que_cumpleanos(self):
        def por_cat(tipo):
            d = self.post({**CUERPO, "tipo_evento": tipo, "mes": 5}).json()["demanda"]
            return {x["categoria"]: x["cantidad_estimada"] for x in d}
        boda, cumple = por_cat("boda"), por_cat("cumpleanos")
        self.assertGreater(boda["Copa"], cumple["Copa"])
        self.assertGreater(boda["Mantel"], cumple["Mantel"])

    def test_diciembre_mas_que_febrero(self):
        dic = self.post({**CUERPO, "mes": 12}).json()["demanda"]
        feb = self.post({**CUERPO, "mes": 2}).json()["demanda"]
        self.assertGreater(sum(x["cantidad_estimada"] for x in dic),
                           sum(x["cantidad_estimada"] for x in feb))

    def test_aviso_si_supera_asistentes_entrenados(self):
        d = self.post({**CUERPO, "asistentes": 3000}).json()
        self.assertEqual(d["modo"], "modelo")
        self.assertIn("supera", d["aviso"])

    # --- modo degradado ---
    def test_degradado_si_el_modelo_no_carga(self):
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=None):
            r = self.post()
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["modo"], "degradado")
        self.assertIn("degradado", d["aviso"].lower())
        self.assertEqual([x["categoria"] for x in d["demanda"]], CATEGORIAS)

    def test_degradado_devuelve_promedio_del_mes_sin_importar_evento_ni_asistentes(self):
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=None):
            a = self.post({"tipo_evento": "boda", "mes": 7, "asistentes": 300}).json()
            b = self.post({"tipo_evento": "baby_shower", "mes": 7, "asistentes": 20}).json()
        self.assertEqual(a["demanda"], b["demanda"])

    def test_degradado_con_pesos_corruptos(self):
        origen = main.pronostico.directorio_modelo()
        with tempfile.TemporaryDirectory() as tmp:
            for f in ("meta.json", "baseline.json"):
                (Path(tmp) / f).write_bytes((origen / f).read_bytes())
            (Path(tmp) / "pesos.npz").write_bytes(b"no es un npz")
            with mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": tmp}):
                d = self.post().json()
        self.assertEqual(d["modo"], "degradado")

    def test_degradado_si_falla_la_inferencia(self):
        modelo = mock.Mock()
        modelo.predecir.side_effect = RuntimeError("boom")
        with mock.patch.object(main.pronostico, "cargar_modelo", return_value=modelo):
            d = self.post().json()
        self.assertEqual(d["modo"], "degradado")

    def test_503_si_no_hay_ni_modelo_ni_promedio(self):
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": tmp}):
            r = self.post()
        self.assertEqual(r.status_code, 503)


if __name__ == "__main__":
    unittest.main()
