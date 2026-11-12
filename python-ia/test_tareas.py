"""
Pruebas de la cola de tareas (OPCION 2, Fase 4). Usan fakeredis (sin Redis real) y
sustituyen subprocess.run: no ejecutan entrenamientos ni llaman a Gemini.

  cd python-ia && ./venv/Scripts/python -m unittest test_tareas -v
"""
import subprocess
import unittest
from unittest import mock

import fakeredis

import tareas
import worker_tareas


def proceso(codigo=0, salida="listo"):
    return subprocess.CompletedProcess(args=[], returncode=codigo, stdout=salida, stderr="")


class PruebasCola(unittest.TestCase):
    def setUp(self):
        self.r = fakeredis.FakeRedis(decode_responses=True)

    def test_encolar_deja_la_tarea_pendiente(self):
        id_ = tareas.encolar("reentrenar_pronostico", self.r)
        t = tareas.obtener_tarea(id_, self.r)
        self.assertEqual(t["estado"], "pendiente")
        self.assertEqual(t["tipo"], "reentrenar_pronostico")
        self.assertEqual(self.r.lrange("ia:cola", 0, -1), [id_])

    def test_tipo_desconocido(self):
        with self.assertRaises(ValueError):
            tareas.encolar("borrar_todo", self.r)

    def test_no_se_duplica_una_tarea_activa_del_mismo_tipo(self):
        primero = tareas.encolar("regenerar_embeddings", self.r)
        with self.assertRaises(tareas.TareaActiva) as ctx:
            tareas.encolar("regenerar_embeddings", self.r)
        self.assertEqual(ctx.exception.id_existente, primero)
        self.assertEqual(self.r.llen("ia:cola"), 1)
        # un tipo distinto si se puede encolar en paralelo
        tareas.encolar("reentrenar_pronostico", self.r)
        self.assertEqual(self.r.llen("ia:cola"), 2)

    def test_ciclo_completo_completada(self):
        id_ = tareas.encolar("reentrenar_pronostico", self.r)
        with mock.patch("tareas.subprocess.run", return_value=proceso(0, "MAE test 7.56")) as run:
            self.assertTrue(worker_tareas.procesar_una(self.r, espera_s=1))
        t = tareas.obtener_tarea(id_, self.r)
        self.assertEqual(t["estado"], "completada")
        self.assertIn("MAE test", t["detalle"])
        self.assertTrue(t["inicio"] and t["fin"])
        self.assertEqual(run.call_args.args[0][1:], ["-m", "pronostico.entrenar"])
        # libera el candado: se puede volver a lanzar
        tareas.encolar("reentrenar_pronostico", self.r)

    def test_estado_en_curso_mientras_corre(self):
        id_ = tareas.encolar("regenerar_embeddings", self.r)
        vistos = []

        def espiar(*_a, **_k):
            vistos.append(tareas.obtener_tarea(id_, self.r)["estado"])
            return proceso()

        with mock.patch("tareas.subprocess.run", side_effect=espiar):
            tareas.ejecutar_tarea(id_, self.r)
        self.assertEqual(vistos, ["en_curso"])

    def test_error_si_el_script_falla(self):
        id_ = tareas.encolar("regenerar_embeddings", self.r)
        with mock.patch("tareas.subprocess.run", return_value=proceso(1, "Traceback: boom")):
            self.assertEqual(tareas.ejecutar_tarea(id_, self.r), "error")
        t = tareas.obtener_tarea(id_, self.r)
        self.assertEqual(t["estado"], "error")
        self.assertIn("boom", t["detalle"])
        tareas.encolar("regenerar_embeddings", self.r)  # el candado se libera tambien en error

    def test_error_por_timeout_o_no_poder_lanzar(self):
        for fallo in (subprocess.TimeoutExpired(cmd="x", timeout=1), FileNotFoundError("sin python")):
            with self.subTest(fallo=type(fallo).__name__):
                r = fakeredis.FakeRedis(decode_responses=True)
                id_ = tareas.encolar("reentrenar_pronostico", r)
                with mock.patch("tareas.subprocess.run", side_effect=fallo):
                    self.assertEqual(tareas.ejecutar_tarea(id_, r), "error")
                self.assertTrue(tareas.obtener_tarea(id_, r)["detalle"])

    def test_cola_vacia_no_ejecuta_nada(self):
        with mock.patch("tareas.subprocess.run") as run:
            self.assertFalse(worker_tareas.procesar_una(self.r, espera_s=1))
        run.assert_not_called()

    def test_tarea_inexistente(self):
        self.assertIsNone(tareas.obtener_tarea("nope", self.r))

    def test_listar_mas_reciente_primero(self):
        a = tareas.encolar("reentrenar_pronostico", self.r)
        b = tareas.encolar("regenerar_embeddings", self.r)
        self.assertEqual([t["id"] for t in tareas.listar_tareas(10, self.r)], [b, a])


if __name__ == "__main__":
    unittest.main()
