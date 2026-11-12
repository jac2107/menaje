"""
Worker simple de la cola de tareas (OPCION 2, Fase 4). Proceso aparte del API:

  cd python-ia && ./venv/Scripts/python worker_tareas.py

Toma una tarea por vez de la cola de Redis (REDIS_URL, por defecto
redis://localhost:6379/0) y la ejecuta. Si Redis cae, reintenta cada 5 s.
"""
import logging
import time

from dotenv import load_dotenv

load_dotenv()  # antes de importar tareas: DB_* para cargar_embeddings, REDIS_URL

import redis  # noqa: E402

import tareas  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [worker] %(message)s")
logger = logging.getLogger("worker")


def procesar_una(r, espera_s: int = 5) -> bool:
    """Espera hasta espera_s una tarea y la ejecuta. True si ejecuto alguna."""
    item = r.blpop("ia:cola", timeout=espera_s)
    if not item:
        return False
    id_tarea = item[1]
    logger.info("Ejecutando tarea %s", id_tarea)
    estado = tareas.ejecutar_tarea(id_tarea, r)
    logger.info("Tarea %s -> %s", id_tarea, estado)
    return True


def main() -> None:
    logger.info("Worker iniciado (%s)", tareas.REDIS_URL)
    while True:
        try:
            procesar_una(tareas.obtener_redis())
        except redis.RedisError as error:
            logger.error("Redis no disponible (%r); reintento en 5 s", error)
            time.sleep(5)
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
