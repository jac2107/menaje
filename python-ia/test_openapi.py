"""
Comprueba que el esquema OpenAPI (lo que muestra /docs con IA_ENV=dev) documenta los
endpoints de la Opcion 2: descripcion en espanol, ejemplos y codigos de error.

  cd python-ia && ./venv/Scripts/python -m unittest test_openapi -v
"""
import os
import unittest
from unittest import mock

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")

from _importar_main import importar_main

main = importar_main()

ESQUEMA = main.app.openapi()

# (ruta, metodo) -> codigos de error que debe documentar
ESPERADOS = {
    ("/busqueda-semantica", "post"): {"401", "403", "422", "503"},
    ("/pronostico-demanda", "post"): {"401", "403", "422", "503"},
    ("/tareas", "post"): {"401", "403", "409", "422", "503"},
    ("/tareas", "get"): {"401", "403", "503"},
    ("/tareas/{id_tarea}", "get"): {"401", "403", "404", "503"},
    ("/estado", "get"): {"401", "403"},
}


class PruebasOpenAPI(unittest.TestCase):
    def test_codigos_de_error_documentados(self):
        for (ruta, metodo), codigos in ESPERADOS.items():
            with self.subTest(ruta=ruta, metodo=metodo):
                op = ESQUEMA["paths"][ruta][metodo]
                self.assertTrue(codigos <= set(op["responses"]), set(op["responses"]))

    def test_descripcion_en_espanol_y_resumen(self):
        for (ruta, metodo) in ESPERADOS:
            with self.subTest(ruta=ruta):
                op = ESQUEMA["paths"][ruta][metodo]
                self.assertTrue(op["summary"])
                self.assertIn("X-IA-Token", op["description"])

    def test_cada_error_tiene_ejemplo(self):
        for (ruta, metodo) in ESPERADOS:
            op = ESQUEMA["paths"][ruta][metodo]
            for codigo in ("401", "403"):
                with self.subTest(ruta=ruta, codigo=codigo):
                    self.assertIn("example", op["responses"][codigo]["content"]["application/json"])

    def test_ejemplos_de_peticion_y_respuesta(self):
        esquemas = ESQUEMA["components"]["schemas"]
        for nombre in ("BusquedaSemanticaRequest", "BusquedaSemanticaResponse", "PronosticoRequest",
                       "PronosticoResponse", "TareaRequest", "TareaResponse", "EstadoResponse"):
            with self.subTest(esquema=nombre):
                self.assertTrue(esquemas[nombre].get("examples"))

    def test_la_cabecera_x_ia_token_figura_como_parametro(self):
        op = ESQUEMA["paths"]["/estado"]["get"]
        self.assertIn("X-IA-Token", [p["name"] for p in op["parameters"]])

    def test_ejemplos_validos_contra_los_modelos(self):
        """Un ejemplo desactualizado en /docs confunde: debe validar con su propio modelo."""
        for modelo in (main.BusquedaSemanticaRequest, main.BusquedaSemanticaResponse, main.PronosticoRequest,
                       main.PronosticoResponse, main.TareaRequest, main.TareaResponse, main.EstadoResponse):
            for ejemplo in modelo.model_config["json_schema_extra"]["examples"]:
                with self.subTest(modelo=modelo.__name__):
                    modelo.model_validate(ejemplo)


if __name__ == "__main__":
    unittest.main()
