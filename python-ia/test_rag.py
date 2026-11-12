"""
Pruebas locales del RAG del chat (OPCION 2, Fase 2). NO llaman a Gemini: se
sustituye genai.GenerativeModel por un doble que captura el prompt.
Requieren la BD de desarrollo (docker compose up -d) con las migraciones 003-005 y
los embeddings de productos cargados (python-ml/cargar_embeddings.py).

  cd python-ia && ./venv/Scripts/python -m unittest test_rag -v
"""
import unittest
from datetime import datetime, timezone
from unittest import mock

import psycopg2

import main

USUARIO = 2  # cliente de la BD de desarrollo
OTRO_USUARIO = 3


class RespuestaFalsa:
    text = "Respuesta de prueba"

    class usage_metadata:
        total_token_count = 7


class GeminiFalso:
    """Doble de genai.GenerativeModel: guarda el ultimo prompt recibido."""

    ultimo_prompt = None

    def __init__(self, *_args, **_kwargs):
        pass

    def generate_content(self, prompt):
        GeminiFalso.ultimo_prompt = prompt
        return RespuestaFalsa()


def borrar_conversaciones_desde(inicio):
    with main.obtener_conexion(commit=True) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM conversaciones_ia WHERE timestamp >= %s", (inicio,))


def fila_mas_reciente(usuario_id):
    with main.obtener_conexion() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT mensaje_usuario, embedding IS NOT NULL FROM conversaciones_ia "
            "WHERE usuario_id = %s ORDER BY timestamp DESC LIMIT 1",
            (usuario_id,),
        )
        return cur.fetchone()


class PruebasRAG(unittest.TestCase):
    def setUp(self):
        self.inicio = datetime.now(timezone.utc)
        GeminiFalso.ultimo_prompt = None

    def tearDown(self):
        borrar_conversaciones_desde(self.inicio)

    # --- recuperacion ---------------------------------------------------
    def test_recupera_productos_relevantes(self):
        rag = main.recuperar_rag(USUARIO, "manteles para casamiento")
        self.assertTrue(rag["productos"])
        self.assertTrue(all("Mantel" in p["nombre"] for p in rag["productos"]))
        self.assertTrue(all(p["similitud"] >= main.UMBRAL_SIMILITUD for p in rag["productos"]))
        self.assertTrue(all(p["stock_disponible"] > 0 for p in rag["productos"]))
        self.assertIsNotNone(rag["embedding"])

    def test_sin_productos_bajo_el_umbral(self):
        rag = main.recuperar_rag(USUARIO, "algo para mantener la comida caliente en un buffet")
        self.assertEqual(rag["productos"], [])

    def test_mensaje_largo_omite_rag(self):
        rag = main.recuperar_rag(USUARIO, "x" * (main.RAG_MENSAJE_MAX_CHARS + 1))
        self.assertEqual(rag, {"productos": [], "memoria": [], "embedding": None})

    def test_memoria_solo_del_mismo_usuario(self):
        msg = "manteles para casamiento"
        main.guardar_conversacion(USUARIO, msg, "Te recomiendo el Mantel Dorado Satinado", 5,
                                  embedding=main.vector_literal(msg))
        propio = main.recuperar_rag(USUARIO, "manteles para una boda")
        ajeno = main.recuperar_rag(OTRO_USUARIO, "manteles para una boda")
        self.assertEqual(len(propio["memoria"]), 1)
        self.assertIn("Mantel Dorado", propio["memoria"][0]["respuesta_ia"])
        self.assertEqual(ajeno["memoria"], [])

    def test_memoria_ignora_conversaciones_con_error(self):
        msg = "manteles para casamiento"
        main.guardar_conversacion(USUARIO, msg, "[error abc]", 0, estado="error",
                                  embedding=main.vector_literal(msg))
        self.assertEqual(main.recuperar_rag(USUARIO, msg)["memoria"], [])

    def test_memoria_maximo_tres(self):
        msg = "manteles para casamiento"
        lit = main.vector_literal(msg)
        for i in range(5):
            main.guardar_conversacion(USUARIO, msg, f"respuesta {i}", 1, embedding=lit)
        self.assertEqual(len(main.recuperar_rag(USUARIO, msg)["memoria"]), 3)

    # --- prompt ---------------------------------------------------------
    def test_prompt_sin_rag_es_identico_a_opcion_1(self):
        ctx = {"usuario": {"nombre": "X", "rol": "cliente"}, "ultimos_alquileres": [],
               "productos_disponibles": []}
        self.assertEqual(main.construir_system_prompt(ctx),
                         main.construir_system_prompt(ctx, [], []))

    # --- chat completo con Gemini simulado ------------------------------
    def _chat(self, mensaje):
        req = main.ChatRequest(usuario_id=USUARIO, mensaje=mensaje)
        with mock.patch.object(main.genai, "GenerativeModel", GeminiFalso):
            return main.chat(req)

    def test_chat_incluye_contexto_y_guarda_embedding(self):
        resp = self._chat("manteles para casamiento")
        self.assertEqual(resp.respuesta, "Respuesta de prueba")
        self.assertIn("Productos del catálogo más relacionados", GeminiFalso.ultimo_prompt)
        self.assertIn("Mantel", GeminiFalso.ultimo_prompt)
        self.assertEqual(fila_mas_reciente(USUARIO), ("manteles para casamiento", True))

    def test_chat_incluye_memoria_en_segunda_consulta(self):
        self._chat("manteles para casamiento")
        self._chat("manteles para una boda")
        self.assertIn("Conversaciones pasadas similares", GeminiFalso.ultimo_prompt)

    # --- modo degradado -------------------------------------------------
    def test_degradado_falla_modelo_de_embeddings(self):
        with mock.patch.object(main, "obtener_modelo_embeddings", side_effect=RuntimeError("sin modelo")), \
                self.assertLogs("menaje.ia", level="ERROR") as logs:
            resp = self._chat("manteles para casamiento")
        self.assertEqual(resp.respuesta, "Respuesta de prueba")
        self.assertTrue(any("RAG degradado" in l for l in logs.output))
        self.assertNotIn("más relacionados", GeminiFalso.ultimo_prompt)
        # La conversacion se guarda igual, sin embedding
        self.assertEqual(fila_mas_reciente(USUARIO), ("manteles para casamiento", False))

    def test_degradado_falla_busqueda_vectorial(self):
        with mock.patch.object(main, "consultar_productos_similares", side_effect=psycopg2.Error("indice roto")), \
                mock.patch.object(main, "consultar_memoria", side_effect=psycopg2.Error("indice roto")), \
                self.assertLogs("menaje.ia", level="ERROR") as logs:
            resp = self._chat("manteles para casamiento")
        self.assertEqual(resp.respuesta, "Respuesta de prueba")
        self.assertEqual(sum("RAG degradado" in l for l in logs.output), 2)
        self.assertNotIn("más relacionados", GeminiFalso.ultimo_prompt)
        self.assertNotIn("Conversaciones pasadas", GeminiFalso.ultimo_prompt)

    def test_degradado_prompt_igual_al_de_opcion_1(self):
        with mock.patch.object(main, "obtener_modelo_embeddings", side_effect=RuntimeError("x")):
            self._chat("hola")
        ctx = main.obtener_contexto(USUARIO)
        esperado = main.construir_system_prompt(ctx)
        self.assertIn(esperado, GeminiFalso.ultimo_prompt)

    def test_guardado_cae_a_insert_sin_embedding_si_este_falla(self):
        # Vector de dimension equivocada: el INSERT con embedding falla y se reintenta sin el.
        with self.assertLogs("menaje.ia", level="ERROR"):
            main.guardar_conversacion(USUARIO, "mensaje de prueba", "ok", 1, embedding="[1,2,3]")
        self.assertEqual(fila_mas_reciente(USUARIO), ("mensaje de prueba", False))


if __name__ == "__main__":
    unittest.main()
