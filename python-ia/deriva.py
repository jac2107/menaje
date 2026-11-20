"""
Alerta de concept drift del pronostico de demanda (Fase 6A).

Compara el error del modelo sobre los alquileres RECIENTES con el error que tuvo en
validacion al entrenarse. Si el negocio cambia (otros eventos, otras cantidades) el
error reciente crece frente al de validacion y el modelo deja de ser fiable.

Definicion (documentada tambien en README_OPCION_2.md):
  * Alquileres evaluados: los de los ultimos DERIVA_VENTANA_DIAS dias (90) que tienen
    tipo_evento y num_asistentes (los de ejemplo incluidos; los reales antiguos sin esos
    datos no cuentan). Se necesitan al menos DERIVA_MIN_ALQUILERES (20); con menos, el
    semaforo es "sin_datos" y no se alerta.
  * mae_reciente   = error absoluto medio (unidades) del modelo sobre esos alquileres,
                     promediado sobre las 6 categorias.
  * mae_validacion = media de error_validacion_mae de las 6 categorias en meta.json.
  * razon          = mae_reciente / mae_validacion.
  * Semaforo:  razon < DERIVA_UMBRAL_ATENCION (1.5)             -> normal
               1.5 <= razon < DERIVA_UMBRAL_DERIVA (2.0)         -> atencion
               razon >= 2.0                                      -> deriva (reentrenar)
    Un error 1.5 veces mayor ya es llamativo; el doble indica que el modelo aprendio algo
    que dejo de cumplirse.
Aviso: tras reentrenar, los alquileres recientes ya forman parte del entrenamiento, asi
que la razon tiende a normalizarse; es una medida de "el modelo vigente aun describe lo
reciente", no una prueba fuera de muestra.
"""
import os
from typing import Any, Dict, List, Optional, Tuple

VENTANA_DIAS = int(os.getenv("DERIVA_VENTANA_DIAS", "90"))
MIN_ALQUILERES = int(os.getenv("DERIVA_MIN_ALQUILERES", "20"))
UMBRAL_ATENCION = float(os.getenv("DERIVA_UMBRAL_ATENCION", "1.5"))
UMBRAL_DERIVA = float(os.getenv("DERIVA_UMBRAL_DERIVA", "2.0"))

Fila = Tuple[str, int, int, Dict[str, float]]  # tipo_evento, mes, asistentes, {categoria: cantidad real}


def clasificar(razon: float) -> str:
    if razon >= UMBRAL_DERIVA:
        return "deriva"
    if razon >= UMBRAL_ATENCION:
        return "atencion"
    return "normal"


def consultar_recientes(conn, dias: int = VENTANA_DIAS) -> List[Fila]:
    """Alquileres de los ultimos `dias` con su demanda real por categoria."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT a.id, a.tipo_evento, EXTRACT(MONTH FROM a.fecha_entrega)::int, a.num_asistentes,
                      c.nombre, SUM(ai.cantidad)
                 FROM alquileres a
                 JOIN alquiler_items ai ON ai.alquiler_id = a.id
                 JOIN productos p ON p.id = ai.producto_id
                 JOIN categorias c ON c.id = p.categoria_id
                WHERE a.tipo_evento IS NOT NULL AND a.num_asistentes IS NOT NULL
                  AND a.fecha_entrega >= CURRENT_DATE - %s AND a.fecha_entrega <= CURRENT_DATE
                GROUP BY a.id, a.tipo_evento, a.fecha_entrega, a.num_asistentes, c.nombre""",
            (dias,),
        )
        filas: Dict[int, Fila] = {}
        for id_alq, tipo, mes, asist, cat, cant in cur.fetchall():
            if id_alq not in filas:
                filas[id_alq] = (tipo, int(mes), int(asist), {})
            filas[id_alq][3][cat] = float(cant)
    return list(filas.values())


def evaluar(modelo, filas: List[Fila]) -> Dict[str, Any]:
    """Semaforo de deriva del `modelo` (ModeloPronostico) sobre `filas`. Nunca lanza por datos."""
    base: Dict[str, Any] = {
        "ventana_dias": VENTANA_DIAS, "umbral_atencion": UMBRAL_ATENCION,
        "umbral_deriva": UMBRAL_DERIVA, "min_alquileres": MIN_ALQUILERES,
        "n_alquileres": 0, "mae_reciente": None, "mae_validacion": None, "razon": None,
    }
    if modelo is None:
        return {**base, "semaforo": "sin_modelo",
                "mensaje": "No hay modelo cargado: no se puede medir la deriva."}
    errores_val = modelo.meta.get("error_validacion_mae", {})
    if not errores_val:
        return {**base, "semaforo": "sin_datos",
                "mensaje": "El modelo no declara su error de validacion (reentrenar)."}
    mae_val = sum(errores_val.values()) / len(errores_val)

    errores: List[float] = []
    n = 0
    for tipo, mes, asist, reales in filas:
        if tipo not in modelo.tipos_evento:
            continue
        est = modelo.predecir(tipo, mes, asist)
        n += 1
        errores.extend(abs(est[c] - reales.get(c, 0.0)) for c in modelo.categorias)
    base.update(n_alquileres=n, mae_validacion=round(mae_val, 2))
    if n < MIN_ALQUILERES:
        return {**base, "semaforo": "sin_datos",
                "mensaje": f"Solo hay {n} alquileres con evento en los ultimos {VENTANA_DIAS} dias "
                           f"(minimo {MIN_ALQUILERES}); no se alerta."}
    mae = sum(errores) / len(errores)
    razon = mae / mae_val if mae_val > 0 else float("inf")
    semaforo = clasificar(razon)
    texto = {
        "normal": "El error reciente es comparable al de validacion.",
        "atencion": "El error reciente supera claramente al de validacion: vigilar.",
        "deriva": "El error reciente duplica o mas al de validacion: reentrenar el modelo.",
    }[semaforo]
    return {**base, "semaforo": semaforo, "mae_reciente": round(mae, 2),
            "razon": round(razon, 2), "mensaje": texto}
