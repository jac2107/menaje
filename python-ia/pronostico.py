"""
Pronostico de demanda por categoria (Opcion 2, capa 9) - inferencia.

Lee el paquete que deja python-ml/pronostico/entrenar.py (pesos.npz, meta.json,
baseline.json) y evalua la red feedforward solo con numpy, sin importar torch.
El modelo se entreno con datos SINTETICOS; el paquete lo declara en meta.json.

Si los pesos o meta.json no cargan, se sirve el promedio historico por categoria
y mes (baseline.json) en modo degradado. Si tampoco existe, no hay pronostico.
"""
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

logger = logging.getLogger("menaje.ia")

DIR_DEFECTO = Path(__file__).resolve().parent.parent / "python-ml" / "modelos" / "pronostico"


def directorio_modelo() -> Path:
    return Path(os.getenv("PRONOSTICO_MODELO_DIR") or DIR_DEFECTO)


class ModeloPronostico:
    def __init__(self, meta: Dict[str, Any], capas: List[tuple]):
        self.meta = meta
        self.capas = capas
        self.categorias: List[str] = meta["categorias"]
        self.tipos_evento: List[str] = meta["tipos_evento"]

    @classmethod
    def cargar(cls, directorio: Path) -> "ModeloPronostico":
        meta = json.loads((directorio / "meta.json").read_text(encoding="utf-8"))
        pesos = np.load(directorio / "pesos.npz")
        capas = []
        i = 0
        while f"net.{i}.weight" in pesos.files:
            capas.append((pesos[f"net.{i}.weight"], pesos[f"net.{i}.bias"]))
            i += 2  # los indices impares son las ReLU
        if not capas:
            raise ValueError("pesos.npz no contiene capas net.N.weight")
        return cls(meta, capas)

    def predecir(self, tipo_evento: str, mes: int, asistentes: int) -> Dict[str, float]:
        x = np.zeros(len(self.tipos_evento) + 12 + 1, dtype=np.float32)
        x[self.tipos_evento.index(tipo_evento)] = 1.0
        x[len(self.tipos_evento) + mes - 1] = 1.0
        x[-1] = asistentes / self.meta["asistentes_escala"]
        for n, (w, b) in enumerate(self.capas):
            x = x @ w.T + b
            if n < len(self.capas) - 1:
                x = np.maximum(x, 0.0)
        y = x * np.array(self.meta["y_desv"]) + np.array(self.meta["y_media"])
        return {c: float(max(0.0, v)) for c, v in zip(self.categorias, y)}


def cargar_modelo() -> Optional[ModeloPronostico]:
    try:
        return ModeloPronostico.cargar(directorio_modelo())
    except Exception as error:  # archivo ausente, corrupto, formato inesperado
        logger.warning("Pronostico: el modelo no carga (%r); se usara el modo degradado", error)
        return None


def cargar_baseline() -> Optional[Dict[str, Dict[str, float]]]:
    try:
        datos = json.loads((directorio_modelo() / "baseline.json").read_text(encoding="utf-8"))
        return datos["promedio_por_mes"]
    except Exception as error:
        logger.error("Pronostico: tampoco hay promedio historico (%r)", error)
        return None


def cargar_error_baseline() -> Dict[str, float]:
    """MAE de validacion de la linea base por categoria (vacio si no esta)."""
    try:
        datos = json.loads((directorio_modelo() / "baseline.json").read_text(encoding="utf-8"))
        return datos.get("error_validacion_mae", {})
    except Exception:
        return {}


def mtime_modelo() -> Optional[tuple]:
    """Huella del paquete del modelo: (mtime de meta.json, mtime de pesos.npz) en ns.

    Cambia cuando se reentrena. Incluye pesos.npz (no solo meta.json) para que una
    copia a medio escribir no deje en memoria un modelo mezclado con la meta vieja."""
    d = directorio_modelo()
    try:
        return ((d / "meta.json").stat().st_mtime_ns, (d / "pesos.npz").stat().st_mtime_ns)
    except OSError:
        return None


def version_modelo(meta: Optional[Dict[str, Any]]) -> str:
    """Identificador del modelo que respondio (se guarda en la tabla pronosticos)."""
    if not meta:
        return "degradado"
    return str(meta.get("version_modelo") or str(meta.get("mlflow_run_id", ""))[:8] or "sin-version")


def leer_meta() -> Dict[str, Any]:
    """meta.json tal cual (vacio si no esta)."""
    try:
        return json.loads((directorio_modelo() / "meta.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def resumen_entrenamiento() -> Dict[str, Any]:
    """Datos del ultimo entrenamiento para el panel: version, fecha y proporcion de cada tipo de dato."""
    meta = leer_meta()
    comp = meta.get("composicion_datos") or {}
    total = comp.get("total") or 0
    return {
        "datos": meta.get("datos", "SINTETICOS"),
        "version_modelo": version_modelo(meta) if meta else None,
        "entrenado_en": meta.get("entrenado_en"),
        "composicion": {k: comp.get(k, 0) for k in ("sintetico", "ejemplo", "real")} | {"total": total},
        "proporcion": {k: round(comp.get(k, 0) / total, 4) for k in ("sintetico", "ejemplo", "real")} if total else {},
    }
