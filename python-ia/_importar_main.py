"""
Importa `main` para las pruebas. `main` crea el pool de PostgreSQL al importarse, y los modulos de
prueba comparten proceso (unittest discover): si uno lo importara con el pool simulado, test_rag
(que necesita la BD real) heredaria el doble. Por eso se intenta primero el pool REAL y solo si la
BD no responde se usa uno simulado. list_models se sustituye siempre: no se llama a Gemini.
"""
import os
from unittest import mock

os.environ.setdefault("IA_SERVICE_TOKEN", "token-de-prueba-solo-para-tests-0123456789abcdef")
os.environ.setdefault("API_GEMINI_KEY", "clave-falsa")


def importar_main():
    with mock.patch("google.generativeai.list_models", return_value=[]):
        try:
            import main
        except RuntimeError:  # la BD no esta disponible: pool simulado
            with mock.patch("psycopg2.pool.ThreadedConnectionPool"):
                import main
    return main
