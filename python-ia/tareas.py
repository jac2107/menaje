"""
Cola de tareas en segundo plano sobre Redis (OPCION 2, Fase 4).

Estados: pendiente -> en_curso -> completada | error.
Estructura en Redis:
  ia:cola              lista (RPUSH al encolar, BLPOP en el worker)
  ia:tarea:<id>        hash con tipo, estado, creada, inicio, fin, detalle
  ia:tareas            lista de ids recientes (la mas nueva primero, max 50)
  ia:activa:<tipo>     candado (SET NX) mientras haya una tarea de ese tipo
                       pendiente o en curso: evita lanzar dos reentrenamientos a la vez

El worker (worker_tareas.py) ejecuta los scripts de python-ml como subprocesos.
"""
import logging
import os
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import redis

logger = logging.getLogger("menaje.ia")

RAIZ_ML = Path(__file__).resolve().parent.parent / "python-ml"
TIMEOUT_TAREA_S = int(os.getenv("TAREA_TIMEOUT_S", "1800"))
# Un candado huerfano (worker caido a mitad) caduca solo pasado este tiempo.
TTL_CANDADO_S = TIMEOUT_TAREA_S + 300
TTL_TAREA_S = 7 * 24 * 3600

ESTADOS = ("pendiente", "en_curso", "completada", "error")

# tipo -> argumentos tras el interprete de python-ml (se ejecutan con cwd=python-ml)
TAREAS: Dict[str, List[str]] = {
    "reentrenar_pronostico": ["-m", "pronostico.entrenar"],
    "regenerar_embeddings": ["cargar_embeddings.py"],
}


class TareaActiva(Exception):
    """Ya hay una tarea de ese tipo pendiente o en curso (id en .id_existente)."""

    def __init__(self, id_existente: Optional[str]):
        super().__init__("Ya hay una tarea de este tipo en curso")
        self.id_existente = id_existente


_cliente: Optional["redis.Redis"] = None


def obtener_redis() -> "redis.Redis":
    global _cliente
    if _cliente is None:
        _cliente = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True,
            socket_connect_timeout=2, socket_timeout=5,
        )
    return _cliente


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def encolar(tipo: str, r: Optional["redis.Redis"] = None) -> str:
    r = r or obtener_redis()
    if tipo not in TAREAS:
        raise ValueError(f"Tipo de tarea desconocido: {tipo}")
    id_tarea = uuid.uuid4().hex
    if not r.set(f"ia:activa:{tipo}", id_tarea, nx=True, ex=TTL_CANDADO_S):
        raise TareaActiva(r.get(f"ia:activa:{tipo}"))
    pipe = r.pipeline()
    pipe.hset(f"ia:tarea:{id_tarea}", mapping={
        "id": id_tarea, "tipo": tipo, "estado": "pendiente",
        "creada": _ahora(), "inicio": "", "fin": "", "detalle": "",
    })
    pipe.expire(f"ia:tarea:{id_tarea}", TTL_TAREA_S)
    pipe.lpush("ia:tareas", id_tarea)
    pipe.ltrim("ia:tareas", 0, 49)
    pipe.rpush("ia:cola", id_tarea)
    pipe.execute()
    return id_tarea


def obtener_tarea(id_tarea: str, r: Optional["redis.Redis"] = None) -> Optional[Dict[str, Any]]:
    r = r or obtener_redis()
    datos = r.hgetall(f"ia:tarea:{id_tarea}")
    return datos or None


def listar_tareas(limite: int = 10, r: Optional["redis.Redis"] = None) -> List[Dict[str, Any]]:
    r = r or obtener_redis()
    ids = r.lrange("ia:tareas", 0, max(0, limite - 1))
    return [t for t in (obtener_tarea(i, r) for i in ids) if t]


def _cola_python_ml() -> str:
    explicito = os.getenv("ML_PYTHON")
    if explicito:
        return explicito
    for rel in ("venv/Scripts/python.exe", "venv/bin/python"):
        if (RAIZ_ML / rel).exists():
            return str(RAIZ_ML / rel)
    return sys.executable


def ejecutar_tarea(id_tarea: str, r: Optional["redis.Redis"] = None) -> str:
    """Corre una tarea ya encolada y actualiza su estado. Devuelve el estado final."""
    r = r or obtener_redis()
    clave = f"ia:tarea:{id_tarea}"
    tarea = r.hgetall(clave)
    if not tarea:
        logger.warning("Tarea %s no existe (expirada?)", id_tarea)
        return "error"
    tipo = tarea["tipo"]
    r.hset(clave, mapping={"estado": "en_curso", "inicio": _ahora()})
    estado, detalle = "error", ""
    try:
        res = subprocess.run(
            [_cola_python_ml(), *TAREAS[tipo]], cwd=RAIZ_ML, capture_output=True,
            text=True, encoding="utf-8", errors="replace", timeout=TIMEOUT_TAREA_S,
            env={**os.environ, "PYTHONIOENCODING": "utf-8", "MLFLOW_DISABLE_AGENT_HINT": "1"},
        )
        salida = ((res.stdout or "") + (res.stderr or "")).strip()
        detalle = salida[-1500:]
        estado = "completada" if res.returncode == 0 else "error"
        if res.returncode != 0:
            detalle = f"codigo de salida {res.returncode}\n{detalle}"
    except subprocess.TimeoutExpired:
        detalle = f"Tiempo agotado ({TIMEOUT_TAREA_S} s)"
    except Exception as error:  # no se pudo ni lanzar el proceso
        detalle = f"No se pudo ejecutar: {error!r}"
    r.hset(clave, mapping={"estado": estado, "fin": _ahora(), "detalle": detalle})
    r.delete(f"ia:activa:{tipo}")
    return estado
