"""
main.py - Microservicio de IA para Sistema Menaje
Recibe peticiones de chat desde el backend Node.js, arma contexto desde
PostgreSQL y consulta a Google Gemini para generar una respuesta.
"""

import logging
import os
import secrets
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional

# En Windows la consola suele usar cp1252, que no soporta emojis. Los mensajes de
# diagnostico ya no los llevan (van por logging, sin emoji), pero el banner de
# arranque y los RuntimeError de esta seccion si, asi que el reconfigure sigue
# haciendo falta para que no revienten con UnicodeEncodeError.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

import google.generativeai as genai
import psycopg2
import psycopg2.extras
import psycopg2.pool
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
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
# El valor por defecto debe ser un modelo servible: "gemini-1.5-flash" ya no lo es
# para esta clave (verificado en C6/CAL-04), y un .env incompleto daba un arranque
# limpio que fallaba en TODAS las peticiones. El .env sigue mandando sobre esto.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

# Logging en lugar de print: aporta nivel y marca de tiempo, asi se pueden filtrar
# los fallos y cruzarlos con el log del backend Node, que si registra la hora. El
# contenido del mensaje del usuario se registra solo en DEBUG (apagado por defecto),
# para no volcar lo que escribe el cliente en los logs de produccion.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("menaje.ia")

# La documentacion interactiva (/docs, /redoc, /openapi.json) revela el esquema de
# la API y permite ejecutarla desde el navegador, asi que solo se publica en
# desarrollo. Sin IA_ENV definida el comportamiento por defecto es el seguro.
IA_ENV = os.getenv("IA_ENV", "production").lower()
DOCS_HABILITADOS = IA_ENV in ("dev", "development", "local")

# Secreto compartido con el backend Node: es la unica autenticacion propia de este
# microservicio. Sin el, cualquiera con acceso al puerto 8000 podia llamar a /chat
# con un usuario_id arbitrario, saltandose el JWT y el rate limit de Node.
IA_SERVICE_TOKEN = os.getenv("IA_SERVICE_TOKEN")
# Por defecto solo loopback: este servicio no debe ser alcanzable desde la red.
IA_HOST = os.getenv("PYTHON_IA_HOST", "127.0.0.1")
IA_PORT = int(os.getenv("PYTHON_IA_PORT", "8000"))

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

if not IA_SERVICE_TOKEN or len(IA_SERVICE_TOKEN) < 32:
    raise RuntimeError(
        "❌ IA_SERVICE_TOKEN no está configurada (o es demasiado corta) en el archivo .env. "
        "Debe tener el mismo valor que la de backend/.env. "
        'Genera una con: python -c "import secrets; print(secrets.token_hex(32))"'
    )

# Configurar cliente de Gemini
genai.configure(api_key=API_GEMINI_KEY)


def verificar_modelo_disponible(nombre_modelo: str) -> None:
    """
    Comprueba contra la API que el identificador del modelo existe y admite
    generateContent. Sin esta comprobacion, un identificador mal escrito o retirado
    da un arranque limpio y hace fallar TODAS las peticiones con 502, y el sintoma
    solo aparece cuando lo ve el primer usuario.
    No aborta el arranque: un fallo de red al listar no debe impedir levantar el servicio.
    """
    objetivo = nombre_modelo if nombre_modelo.startswith("models/") else f"models/{nombre_modelo}"
    try:
        disponibles = [
            m.name for m in genai.list_models()
            if "generateContent" in getattr(m, "supported_generation_methods", [])
        ]
    except Exception as error:
        logger.warning("No se pudo verificar el modelo contra la API: %r", error)
        return

    if objetivo in disponibles:
        logger.info("Gemini configurado con el modelo: %s", nombre_modelo)
        return

    logger.error(
        "El modelo '%s' no aparece entre los disponibles para esta clave. TODAS las "
        "peticiones a /chat fallaran con 502 hasta corregir GEMINI_MODEL en python-ia/.env.",
        nombre_modelo,
    )
    logger.error("Modelos disponibles: %s", ", ".join(sorted(disponibles)) or "(ninguno)")


verificar_modelo_disponible(GEMINI_MODEL)

app = FastAPI(
    title="Menaje IA Service",
    description="Microservicio FastAPI + Gemini para el asistente de alquiler de menaje",
    version="1.0.0",
    # La documentacion interactiva solo se publica en desarrollo (IA_ENV=dev).
    # En produccion /docs, /redoc y /openapi.json quedan deshabilitados (404).
    docs_url="/docs" if DOCS_HABILITADOS else None,
    redoc_url="/redoc" if DOCS_HABILITADOS else None,
    openapi_url="/openapi.json" if DOCS_HABILITADOS else None,
)

# Sin CORS: este microservicio solo se consume desde el backend Node.js
# (backend/services/iaService.js), nunca desde el navegador. CORS ademas solo
# restringe navegadores, no clientes como curl/Postman: el control de acceso real
# es la cabecera X-IA-Token (verificar_token_servicio) + escuchar en 127.0.0.1.
#
# Si en algun momento hiciera falta depurar desde el navegador en desarrollo,
# reactivarlo condicionado a IA_ENV y sin credenciales:
#     if DOCS_HABILITADOS:
#         app.add_middleware(
#             CORSMiddleware,
#             allow_origins=[os.getenv("CORS_ORIGIN_IA", "http://localhost:3000")],
#             allow_credentials=False,
#             allow_methods=["GET", "POST"],
#             allow_headers=["Content-Type", "X-IA-Token"],
#         )


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

# Pool de conexiones: antes se abria y cerraba una conexion TCP + autenticacion en
# cada operacion (dos por peticion de chat). Con el pool se reutilizan, y ademas se
# acota cuantas conexiones puede consumir este servicio del presupuesto de
# max_connections de PostgreSQL, que comparte con el backend Node.
DB_POOL_MIN = int(os.getenv("DB_POOL_MIN", "1"))
DB_POOL_MAX = int(os.getenv("DB_POOL_MAX", "5"))

try:
    db_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=DB_POOL_MIN,
        maxconn=DB_POOL_MAX,
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=10,
    )
    logger.info("Pool de PostgreSQL creado (%d-%d conexiones)", DB_POOL_MIN, DB_POOL_MAX)
except psycopg2.Error as error:
    raise RuntimeError(f"No se pudo crear el pool de PostgreSQL: {error}") from error


@contextmanager
def obtener_conexion(commit: bool = False) -> Iterator[Any]:
    """
    Toma una conexion del pool y la devuelve siempre, tambien si hay excepcion.
    Con commit=True confirma la transaccion al salir sin error, y hace rollback si
    lo hay, para que la conexion no vuelva al pool con una transaccion abierta.
    """
    conn = db_pool.getconn()
    try:
        yield conn
        if commit:
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        db_pool.putconn(conn)


def obtener_contexto(usuario_id: int) -> Dict[str, Any]:
    """
    Consulta en PostgreSQL los datos necesarios para darle contexto a Gemini:
    datos del usuario, sus últimos alquileres y los productos disponibles.

    Si la base de datos no esta accesible se lanza 503 en lugar de devolver un
    contexto vacio: con el catalogo vacio el prompt le indica al modelo que no hay
    stock, y el modelo se lo afirma al cliente como si fuera cierto.
    """
    contexto: Dict[str, Any] = {
        "usuario": None,
        "ultimos_alquileres": [],
        "productos_disponibles": [],
    }

    try:
        with obtener_conexion() as conn, conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cur:
            # Datos del usuario
            cur.execute(
                "SELECT id, nombre, correo, rol FROM usuarios WHERE id = %s",
                (usuario_id,),
            )
            usuario = cur.fetchone()
            if usuario is None:
                # No se devuelve 404: distinguir "existe / no existe" permite enumerar
                # cuentas. Se registra en el log y se continua con contexto anonimo.
                logger.warning("Contexto sin usuario: usuario_id=%s no existe en BD", usuario_id)
            else:
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

    except psycopg2.Error as error:
        # Fallo de infraestructura: mejor un error explicito que una respuesta
        # segura de si misma y equivocada. Antes se tragaba la excepcion y el prompt
        # le decia al modelo que no habia stock, que se lo repetia al cliente.
        logger.error("Error obteniendo contexto de BD (usuario_id=%s): %r", usuario_id, error)
        raise HTTPException(
            status_code=503,
            detail="El asistente no puede consultar el catalogo en este momento",
        )
    # Sin finally: obtener_conexion() devuelve la conexion al pool en su propio
    # finally, tanto si la consulta acaba bien como si lanza.

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
    usuario_id: int,
    mensaje: str,
    respuesta: str,
    tokens: int,
    estado: str = "completada",
) -> None:
    """
    Guarda el intercambio en conversaciones_ia.

    'estado' distingue las conversaciones completadas de las fallidas: sin el
    parametro, la columna solo contendria 'completada' y seria imposible saber si
    no hubo fallos o si simplemente no se estaban registrando.
    Nunca propaga excepciones: un fallo al auditar no debe romper la respuesta.
    """
    try:
        # commit=True: el context manager confirma al salir sin error y hace rollback
        # si lo hay, para que la conexion no vuelva al pool con una transaccion abierta.
        with obtener_conexion(commit=True) as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO conversaciones_ia
                    (usuario_id, mensaje_usuario, respuesta_ia, tokens_usados, estado)
                VALUES (%s, %s, %s, %s, %s)
                """,
                # respuesta_ia es NOT NULL: en caso de error se guarda la referencia
                # del incidente en lugar de la respuesta que nunca llego.
                (usuario_id, mensaje, respuesta or "", tokens, estado),
            )
        logger.info("Conversacion guardada (estado=%s) usuario_id=%s", estado, usuario_id)
    except Exception as error:
        logger.error("Error guardando conversacion en BD: %r", error)


# ============================================================
# AUTENTICACIÓN SERVICIO-A-SERVICIO
# ============================================================

def verificar_token_servicio(
    x_ia_token: Optional[str] = Header(default=None, alias="X-IA-Token"),
) -> None:
    """
    Autenticacion servicio-a-servicio: solo el backend Node.js conoce IA_SERVICE_TOKEN.
    Se compara con compare_digest para no filtrar informacion por tiempo de respuesta.
    """
    if not x_ia_token or not secrets.compare_digest(x_ia_token, IA_SERVICE_TOKEN):
        raise HTTPException(status_code=401, detail="No autorizado")


# ============================================================
# CICLO DE VIDA
# ============================================================

@app.on_event("shutdown")
def cerrar_pool() -> None:
    """
    Cierra todas las conexiones del pool al detener el servicio.
    Nota: @app.on_event esta obsoleto en FastAPI moderno, pero es la API correcta
    para la version pinada en requirements.txt (fastapi==0.104.1). Si se actualiza
    FastAPI, migrar a un lifespan.
    """
    db_pool.closeall()
    logger.info("Pool de PostgreSQL cerrado")


# ============================================================
# ENDPOINTS
# ============================================================

@app.get("/health")
def health() -> Dict[str, str]:
    """Health check del servicio. No expone el modelo: eso es informacion interna."""
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(verificar_token_servicio)])
def chat(request: ChatRequest) -> ChatResponse:
    """Recibe un mensaje del usuario, lo procesa con Gemini y guarda la conversación."""
    if not request.mensaje or not request.mensaje.strip():
        raise HTTPException(status_code=400, detail="El mensaje no puede estar vacío")
    if request.usuario_id <= 0:
        raise HTTPException(status_code=400, detail="usuario_id inválido")

    logger.info(
        "Nuevo mensaje de usuario_id=%s (%d caracteres)",
        request.usuario_id,
        len(request.mensaje),
    )
    # El contenido va en DEBUG: en produccion no se vuelca lo que escribe el cliente.
    logger.debug("Contenido del mensaje: %r", request.mensaje)

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
        # El detalle tecnico se queda en el log del servidor; al cliente solo le llega
        # un mensaje generico + un id de correlacion para poder rastrear el incidente.
        # Antes se interpolaba la excepcion en el detail y acababa mostrandose en el
        # chat del usuario, revelando proveedor, modelo, endpoint y estado de la clave.
        error_id = uuid.uuid4().hex[:12]
        logger.error(
            "[%s] Error llamando a Gemini API (usuario_id=%s, modelo=%s): %r",
            error_id,
            request.usuario_id,
            GEMINI_MODEL,
            error,
        )
        # Se registra el fallo en conversaciones_ia con estado='error': antes esta
        # rama abortaba antes del paso 5 y el incidente no dejaba ningun rastro en BD.
        guardar_conversacion(
            request.usuario_id, request.mensaje, f"[error {error_id}]", 0, estado="error"
        )
        raise HTTPException(
            status_code=502,
            detail=f"El asistente no esta disponible en este momento (ref: {error_id})",
        )

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
    print(f"🌐 URL local: http://{IA_HOST}:{IA_PORT}")
    if DOCS_HABILITADOS:
        print(f"📚 Documentación (Swagger): http://{IA_HOST}:{IA_PORT}/docs")
    else:
        print("📚 Documentación (Swagger): deshabilitada (IA_ENV != dev)")
    print(f"❤️  Health check: http://{IA_HOST}:{IA_PORT}/health")
    print("🔒 POST /chat requiere la cabecera X-IA-Token")
    print("=" * 60)
    uvicorn.run(app, host=IA_HOST, port=IA_PORT)
