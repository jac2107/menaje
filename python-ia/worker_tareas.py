"""
Worker simple de la cola de tareas (OPCION 2, Fase 4). Proceso aparte del API:

  cd python-ia && ./venv/Scripts/python worker_tareas.py

Toma una tarea por vez de la cola de Redis (REDIS_URL, por defecto
redis://localhost:6379/0) y la ejecuta. Si Redis cae, reintenta cada 5 s.

Ademas:
  * regenera los embeddings de los productos que el backend marco como pendientes;
  * encola el reentrenamiento del pronostico una vez al mes (REENTRENAR_MENSUAL=0 lo
    desactiva; REENTRENAR_DIA_MES elige el dia, por defecto el 1).

Lanzar el reentrenamiento a mano (sin esperar al mes): boton del Panel IA,
POST /api/ia/tareas {"tipo":"reentrenar_pronostico"}, o
  ./venv/Scripts/python worker_tareas.py --reentrenar-ahora
(encola la tarea y termina; un worker en marcha la ejecuta).
"""
import argparse
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


ESPERA_TRAS_ERROR_EMBEDDINGS_S = 60


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reentrenar-ahora", action="store_true",
                    help="encola un reentrenamiento del pronostico y termina")
    if ap.parse_args().reentrenar_ahora:
        try:
            print("Tarea encolada:", tareas.encolar("reentrenar_pronostico"))
        except tareas.TareaActiva as activa:
            print("Ya hay un reentrenamiento pendiente o en curso:", activa.id_existente)
        return

    logger.info("Worker iniciado (reentrenamiento mensual: %s)", "si" if tareas.REENTRENAR_MENSUAL else "no")
    sin_embeddings_hasta = 0.0
    while True:
        try:
            r = tareas.obtener_redis()
            tareas.programar_reentrenamiento_mensual(r)
            if time.monotonic() >= sin_embeddings_hasta:
                if tareas.procesar_embeddings_pendientes(r) == "error":
                    sin_embeddings_hasta = time.monotonic() + ESPERA_TRAS_ERROR_EMBEDDINGS_S
            procesar_una(r)
        except redis.RedisError as error:
            logger.error("Redis no disponible (%r); reintento en 5 s", error)
            time.sleep(5)
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    main()
