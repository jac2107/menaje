"""
main.py - Microservicio de IA para Sistema Menaje
Recibe peticiones de chat desde el backend Node.js, arma contexto desde
PostgreSQL y consulta a Google Gemini para generar una respuesta.
"""

import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# En Windows la consola suele usar cp1252, que no soporta emojis en los logs.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import google.generativeai as genai
import psycopg2
import psycopg2.extras
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ============================================================
# CONFIGURACIÓN
# ============================================================

load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
API_GEMINI_KEY = os.getenv("API_GEMINI_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

REQUIRED_DB_VARS = {
    "DB_HOST": DB_HOST,
    "DB_PORT": DB_PORT,
    "DB_NAME": DB_NAME,
    "DB_USER": DB_USER,
    "DB_PASSWORD": DB_PASSWORD,
}
faltantes = [nombre for nombre, valor in REQUIRED_DB_VARS.items() if not valor]
if faltantes:
    raise RuntimeError(
        f"❌ Faltan variables de entorno para la base de datos: {', '.join(faltantes)}"
    )

if not API_GEMINI_KEY:
    raise RuntimeError(
        "❌ API_GEMINI_KEY no está configurada en el archivo .env. "
        "Obtén una clave en https://aistudio.google.com/apikey"
    )

# Configurar cliente de Gemini
genai.configure(api_key=API_GEMINI_KEY)
print(f"✅ Google Gemini configurado con el modelo: {GEMINI_MODEL}")

app = FastAPI(
    title="Menaje IA Service",
    description="Microservicio FastAPI + Gemini para el asistente de alquiler de menaje",
    version="1.0.0",
)

# CORS solo para el frontend en desarrollo (localhost:3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ============================================================
# MODELOS PYDANTIC
# ============================================================

class ChatRequest(BaseModel):
    usuario_id: int
    mensaje: str
    historico: List[Dict[str, Any]] = Field(default_factory=list)


class ChatResponse(BaseModel):
    respuesta: str
    timestamp: str
    tokens_usados: int


# ============================================================
# FUNCIONES AUXILIARES
# ============================================================

def conectar_db() -> psycopg2.extensions.connection:
    """Abre y retorna una conexión a PostgreSQL."""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
    )


def obtener_contexto(usuario_id: int) -> Dict[str, Any]:
    """
    Consulta en PostgreSQL los datos necesarios para darle contexto a Gemini:
    datos del usuario, sus últimos alquileres y los productos disponibles.
    """
    contexto: Dict[str, Any] = {
        "usuario": None,
        "ultimos_alquileres": [],
        "productos_disponibles": [],
    }

    conn = None
    try:
        conn = conectar_db()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Datos del usuario
            cur.execute(
                "SELECT id, nombre, correo, rol FROM usuarios WHERE id = %s",
                (usuario_id,),
            )
            usuario = cur.fetchone()
            if usuario is None:
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            contexto["usuario"] = dict(usuario)

            # Últimos alquileres del usuario
            cur.execute(
                """
                SELECT id, fecha_entrega, fecha_recojo, direccion_evento,
                       total, estado
                FROM alquileres
                WHERE cliente_id = %s
                ORDER BY created_at DESC
                LIMIT 3
                """,
                (usuario_id,),
            )
            contexto["ultimos_alquileres"] = [dict(fila) for fila in cur.fetchall()]

            # Productos disponibles (con stock activo)
            cur.execute(
                """
                SELECT p.nombre, c.nombre AS categoria, p.precio_unidad,
                       (p.stock_total - p.stock_baja) AS stock_disponible
                FROM productos p
                JOIN categorias c ON c.id = p.categoria_id
                WHERE p.activo = TRUE AND (p.stock_total - p.stock_baja) > 0
                ORDER BY p.nombre
                LIMIT 15
                """
            )
            contexto["productos_disponibles"] = [dict(fila) for fila in cur.fetchall()]

    except HTTPException:
        raise
    except Exception as error:
        print(f"⚠️ Error obteniendo contexto de BD: {error}")
    finally:
        if conn is not None:
            conn.close()

    return contexto


def construir_system_prompt(contexto: Dict[str, Any]) -> str:
    """Arma el prompt de sistema: un especialista en menaje con el contexto del usuario."""
    usuario = contexto.get("usuario") or {}
    alquileres = contexto.get("ultimos_alquileres") or []
    productos = contexto.get("productos_disponibles") or []

    alquileres_txt = "\n".join(
        f"  - Alquiler #{a['id']}: {a['fecha_entrega']} a {a['fecha_recojo']}, "
        f"total S/ {a['total']}, estado: {a['estado']}"
        for a in alquileres
    ) or "  (Sin alquileres previos)"

    productos_txt = "\n".join(
        f"  - {p['nombre']} ({p['categoria']}): S/ {p['precio_unidad']} "
        f"por unidad, {p['stock_disponible']} disponibles"
        for p in productos
    ) or "  (No hay productos disponibles en este momento)"

    return f"""Eres un asistente especializado en alquiler de menaje para eventos
(vajilla, copas, cubiertos, manteles) de la empresa Menaje. Ayudas a los clientes
a elegir productos según su evento, calcular cantidades, resolver dudas sobre
garantías y políticas de alquiler, y a consultar disponibilidad de stock.

Datos del cliente actual:
  - Nombre: {usuario.get('nombre', 'Desconocido')}
  - Rol: {usuario.get('rol', 'cliente')}

Últimos alquileres del cliente:
{alquileres_txt}

Productos disponibles actualmente:
{productos_txt}

Responde siempre en español, de forma breve, cordial y útil. Si el cliente
pregunta por productos que no están en la lista de disponibles, indícalo con
claridad en vez de inventar información."""


def guardar_conversacion(
    usuario_id: int, mensaje: str, respuesta: str, tokens: int
) -> None:
    """Guarda el intercambio de mensaje/respuesta en la tabla conversaciones_ia."""
    conn = None
    try:
        conn = conectar_db()
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversaciones_ia
                    (usuario_id, mensaje_usuario, respuesta_ia, tokens_usados, estado)
                VALUES (%s, %s, %s, %s, 'completada')
                """,
                (usuario_id, mensaje, respuesta, tokens),
            )
        conn.commit()
        print(f"💾 Conversación guardada para usuario_id={usuario_id}")
    except Exception as error:
        print(f"⚠️ Error guardando conversación en BD: {error}")
    finally:
        if conn is not None:
            conn.close()


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> Dict[str, str]:
    """Health check del servicio."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": GEMINI_MODEL,
    }


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    """Recibe un mensaje del usuario, lo procesa con Gemini y guarda la conversación."""
    if not request.mensaje or not request.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    if request.usuario_id <= 0:
        raise HTTPException(status_code=400, detail="usuario_id inválido")

    print(f"💬 Nuevo mensaje de usuario_id={request.usuario_id}: {request.mensaje!r}")

    # 1. Obtener contexto del usuario desde la BD
    contexto = obtener_contexto(request.usuario_id)

    # 2. Construir el prompt de sistema
    system_prompt = construir_system_prompt(contexto)

    # 3. Formatear el histórico reciente (si viene del frontend)
    historico_txt = ""
    for turno in request.historico[-5:]:
        usuario_txt = turno.get("usuario") or turno.get("mensaje", "")
        ia_txt = turno.get("ia") or turno.get("respuesta", "")
        if usuario_txt or ia_txt:
            historico_txt += f"Usuario: {usuario_txt}\nAsistente: {ia_txt}\n"

    prompt_completo = (
        f"{system_prompt}\n\n"
        f"Historial reciente de la conversación:\n{historico_txt or '(sin historial previo)'}\n\n"
        f"Usuario: {request.mensaje}\nAsistente:"
    )

    # 4. Llamar a Gemini
    try:
        modelo = genai.GenerativeModel(GEMINI_MODEL)
        resultado = modelo.generate_content(prompt_completo)
        respuesta_texto = (resultado.text or "").strip()

        tokens_usados = 0
        try:
            tokens_usados = int(resultado.usage_metadata.total_token_count)
        except Exception:
            tokens_usados = 0

    except Exception as error:
        print(f"❌ Error llamando a Gemini API: {error}")
        raise HTTPException(status_code=502, detail=f"Error consultando Gemini: {error}")

    # 5. Guardar conversación en la BD (no debe romper la respuesta si falla)
    guardar_conversacion(
        request.usuario_id, request.mensaje, respuesta_texto, tokens_usados
    )

    return ChatResponse(
        respuesta=respuesta_texto,
        timestamp=datetime.now(timezone.utc).isoformat(),
        tokens_usados=tokens_usados,
    )


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 INICIANDO SERVIDOR FASTAPI - Menaje IA Service")
    print("=" * 60)
    print(f"📦 Modelo Gemini: {GEMINI_MODEL}")
    print(f"🗄️  Base de datos: {DB_NAME}@{DB_HOST}:{DB_PORT}")
    print("🌐 URL local: http://localhost:8000")
    print("📚 Documentación (Swagger): http://localhost:8000/docs")
    print("❤️  Health check: http://localhost:8000/health")
    print("=" * 60)
    uvicorn.run(app, host="0.0.0.0", port=8000)
