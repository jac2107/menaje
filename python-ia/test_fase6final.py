"""
Pruebas de la Fase 6 final (Parte A): refresco del panel tras reentrenar, el pronostico
con menos asistentes y el modo degradado. Sin PostgreSQL, Redis ni Gemini reales.

Para no tocar el paquete real del modelo (python-ml/modelos/pronostico), cada prueba trabaja
sobre una COPIA en un directorio temporal apuntado por PRONOSTICO_MODELO_DIR; "falta el modelo"
se simula borrando pesos.npz de la copia. El original no se mueve ni se modifica
(test_el_paquete_original_sigue_en_su_sitio lo comprueba).

  cd python-ia && ./venv/Scripts/python -m unittest test_fase6final -v
"""
import json
import os
import shutil
import tempfile
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

import fakeredis

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

from _importar_main import importar_main

main = importar_main()

from fastapi.testclient import TestClient

import pronostico
import tareas

CAB = {"X-IA-Token": main.IA_SERVICE_TOKEN}
ORIGINAL = Path(__file__).resolve().parent.parent / "python-ml" / "modelos" / "pronostico"
ARCHIVOS = ("pesos.npz", "meta.json", "baseline.json")


@contextmanager
def _conn_falsa(commit=False):
    cur = mock.MagicMock()
    cur.fetchone.return_value = (10, 10)
    cur.fetchall.return_value = []
    conn = mock.MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    yield conn


class BasePaquete(unittest.TestCase):
    """Copia del paquete en un directorio temporal, seleccionado con PRONOSTICO_MODELO_DIR."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="modelo_prueba_"))
        self.addCleanup(shutil.rmtree, self.dir, True)
        for nombre in ARCHIVOS:
            shutil.copy(ORIGINAL / nombre, self.dir / nombre)
        p = mock.patch.dict(os.environ, {"PRONOSTICO_MODELO_DIR": str(self.dir)})
        p.start()
        self.addCleanup(p.stop)
        for parche in (
            mock.patch.object(tareas, "_cliente", fakeredis.FakeRedis(decode_responses=True)),
            mock.patch.object(main, "obtener_conexion", _conn_falsa),
            mock.patch.object(main.deriva, "consultar_recientes", return_value=[]),
            mock.patch.object(main, "guardar_pronostico"),
            mock.patch.object(main, "_estado_gemini", lambda: main.ComponenteEstado(estado="ok")),
        ):
            parche.start()
            self.addCleanup(parche.stop)
        main._modelo_pronostico = None
        main._modelo_pronostico_mtime = None
        self.client = TestClient(main.app)

    def estado(self):
        r = self.client.get("/estado", headers=CAB)
        self.assertEqual(r.status_code, 200)
        return r.json()

    def pronostico(self, asistentes, tipo="boda", mes=12):
        r = self.client.post("/pronostico-demanda", headers=CAB,
                             json={"tipo_evento": tipo, "mes": mes, "asistentes": asistentes})
        self.assertEqual(r.status_code, 200, r.text)
        return r.json()


class PruebasRefrescoTrasReentrenar(BasePaquete):
    """A.1: /estado debe leer SIEMPRE el paquete vigente, sin reiniciar el servicio."""

    def reentrenar_simulado(self, version, factor_error):
        """Lo que hace pronostico.entrenar: reescribe pesos.npz y meta.json."""
        meta = json.loads((self.dir / "meta.json").read_text(encoding="utf-8"))
        meta["version_modelo"] = version
        meta["entrenado_en"] = "2030-01-01T00:00:00+00:00"
        meta["composicion_datos"] = {"sintetico": 100, "ejemplo": 50, "real": 10, "total": 160}
        meta["datos"] = "MIXTOS"
        meta["error_validacion_mae"] = {k: v * factor_error for k, v in meta["error_validacion_mae"].items()}
        time.sleep(0.02)  # mtime distinto aun en sistemas de archivos de baja resolucion
        (self.dir / "pesos.npz").write_bytes((self.dir / "pesos.npz").read_bytes())  # "reescrito"
        (self.dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")

    def test_entrenamiento_y_deriva_muestran_la_version_nueva_sin_reiniciar(self):
        antes = self.estado()
        self.assertNotEqual(antes["entrenamiento"]["version_modelo"], "v-nueva")
        mae_antes = antes["deriva"]["mae_validacion"]

        self.reentrenar_simulado("v-nueva", factor_error=3)

        despues = self.estado()
        self.assertEqual(despues["entrenamiento"]["version_modelo"], "v-nueva")
        self.assertEqual(despues["entrenamiento"]["composicion"]["real"], 10)
        self.assertEqual(despues["entrenamiento"]["datos"], "MIXTOS")
        # el semaforo de deriva se calcula con el modelo NUEVO (su error de validacion triplicado)
        self.assertAlmostEqual(despues["deriva"]["mae_validacion"], mae_antes * 3, delta=0.1)

    def test_el_pronostico_usa_el_modelo_nuevo_sin_reiniciar(self):
        self.assertNotEqual(self.pronostico(100)["version_modelo"], "v-nueva")
        self.reentrenar_simulado("v-nueva", factor_error=1)
        self.assertEqual(self.pronostico(100)["version_modelo"], "v-nueva")

    def test_la_huella_cambia_si_solo_cambian_los_pesos(self):
        h1 = pronostico.mtime_modelo()
        time.sleep(0.02)
        (self.dir / "pesos.npz").write_bytes((self.dir / "pesos.npz").read_bytes())
        self.assertNotEqual(h1, pronostico.mtime_modelo())


class PruebasPronostico(BasePaquete):
    """A.2a: menos asistentes => menos demanda."""

    def test_baja_al_pasar_de_100_a_50_asistentes(self):
        p100 = {d["categoria"]: d["cantidad_estimada"] for d in self.pronostico(100)["demanda"]}
        p50 = {d["categoria"]: d["cantidad_estimada"] for d in self.pronostico(50)["demanda"]}
        self.assertEqual(self.pronostico(50)["modo"], "modelo")
        self.assertLess(sum(p50.values()), sum(p100.values()))
        # y ninguna categoria sube
        for cat, v100 in p100.items():
            self.assertLessEqual(p50[cat], v100, f"{cat}: {p50[cat]} > {v100}")

    def test_baja_en_todos_los_tipos_de_evento(self):
        for tipo in ("boda", "quinceanos", "cumpleanos", "corporativo"):
            with self.subTest(tipo=tipo):
                t100 = sum(d["cantidad_estimada"] for d in self.pronostico(100, tipo)["demanda"])
                t50 = sum(d["cantidad_estimada"] for d in self.pronostico(50, tipo)["demanda"])
                self.assertLess(t50, t100)


class PruebasModoDegradado(BasePaquete):
    """A.2b: sin el archivo del modelo, responde el promedio historico en modo degradado."""

    def quitar_modelo(self):
        (self.dir / "pesos.npz").unlink()

    def test_sin_pesos_responde_promedio_historico_en_modo_degradado(self):
        self.quitar_modelo()
        r = self.pronostico(100)
        self.assertEqual(r["modo"], "degradado")
        self.assertIn("degradado", r["aviso"].lower())
        base = json.loads((self.dir / "baseline.json").read_text(encoding="utf-8"))["promedio_por_mes"]["12"]
        self.assertEqual({d["categoria"]: d["cantidad_estimada"] for d in r["demanda"]},
                         {c: round(v) for c, v in base.items()})

    def test_degradado_no_depende_de_asistentes_ni_del_tipo_de_evento(self):
        self.quitar_modelo()
        self.assertEqual(self.pronostico(50, "boda")["demanda"], self.pronostico(400, "bautizo")["demanda"])

    def test_el_estado_lo_marca_para_el_panel(self):
        self.quitar_modelo()
        e = self.estado()
        self.assertTrue(e["modo_degradado"])
        self.assertEqual(e["componentes"]["pronostico"]["estado"], "degradado")
        self.assertEqual(e["estado_general"], "degradado")
        self.assertEqual(e["deriva"]["semaforo"], "sin_modelo")

    def test_sin_modelo_ni_promedio_da_503(self):
        self.quitar_modelo()
        (self.dir / "baseline.json").unlink()
        r = self.client.post("/pronostico-demanda", headers=CAB,
                             json={"tipo_evento": "boda", "mes": 12, "asistentes": 100})
        self.assertEqual(r.status_code, 503)

    def test_se_recupera_al_volver_el_modelo(self):
        self.quitar_modelo()
        self.assertEqual(self.pronostico(100)["modo"], "degradado")
        shutil.copy(ORIGINAL / "pesos.npz", self.dir / "pesos.npz")
        self.assertEqual(self.pronostico(100)["modo"], "modelo")


class PruebaIntegridad(unittest.TestCase):
    def test_el_paquete_original_sigue_en_su_sitio(self):
        for nombre in ARCHIVOS:
            self.assertTrue((ORIGINAL / nombre).is_file(), f"falta {nombre} en {ORIGINAL}")


if __name__ == "__main__":
    unittest.main()
