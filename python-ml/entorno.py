"""
Carga python-ml/.env (si existe) en os.environ sin pisar variables ya definidas.

Los scripts de python-ml leian DB_* solo del entorno del proceso. Con este modulo
basta `import entorno` antes de leer las variables. No depende de python-dotenv.
Cuando el worker de python-ia lanza un script, las variables ya vienen en el entorno
(python-ia/.env) y este modulo no las sobrescribe.
"""
import os
from pathlib import Path

RUTA_ENV = Path(__file__).resolve().parent / ".env"


def cargar(ruta: Path = RUTA_ENV) -> None:
    if not ruta.is_file():
        return
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        os.environ.setdefault(clave.strip(), valor.strip().strip("'\""))


cargar()
