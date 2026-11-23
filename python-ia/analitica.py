"""
Analitica del panel de IA (Fase 6B): serie temporal de la demanda real, metricas de uso de
la IA y riesgo de faltante. Las funciones que tocan la BD reciben la conexion (`conn`) para
poder probarlas dentro de una transaccion con rollback; la logica de decision es pura.
"""
import os
from datetime import date
from typing import Any, Dict, List, Optional

# --- Serie temporal ------------------------------------------------------------------
# Cambio (en fraccion) del ultimo mes completo frente al promedio de los meses anteriores
# por encima del cual se avisa. 0.5 = +-50 %.
SERIE_UMBRAL_CAMBIO = float(os.getenv("SERIE_UMBRAL_CAMBIO", "0.5"))
SERIE_MESES_PREVIOS = int(os.getenv("SERIE_MESES_PREVIOS", "6"))
# Categorias con menos unidades que esto de promedio previo se ignoran (ruido).
SERIE_MIN_UNIDADES = int(os.getenv("SERIE_MIN_UNIDADES", "20"))


def serie_demanda(conn, meses: int = 12) -> List[Dict[str, Any]]:
    """Demanda real por categoria y mes (vista demanda_categoria_mes), ultimos `meses`
    meses CON datos contando desde el mas reciente. Orden: mes, categoria."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT mes, categoria, unidades, alquileres, unidades_ejemplo
                 FROM demanda_categoria_mes
                WHERE mes > (SELECT max(mes) FROM demanda_categoria_mes) - make_interval(months => %s)
                ORDER BY mes, categoria""",
            (int(meses),),
        )
        return [
            {"mes": m.isoformat(), "categoria": c, "unidades": int(u),
             "alquileres": int(a), "unidades_ejemplo": int(e)}
            for m, c, u, a, e in cur.fetchall()
        ]


def analizar_tendencia(filas: List[Dict[str, Any]], hoy: Optional[date] = None) -> Dict[str, Any]:
    """Compara, por categoria, el ULTIMO MES COMPLETO con el promedio de los meses previos.

    El mes en curso se ignora (esta incompleto). Devuelve
    {ultimo_mes, cambios: [{categoria, ultimo, promedio_previo, variacion}], alerta, mensaje}.
    `variacion` es fraccion (0.6 = +60 %). `alerta` es True si alguna categoria con volumen
    suficiente cambia mas de SERIE_UMBRAL_CAMBIO."""
    hoy = hoy or date.today()
    mes_actual = hoy.replace(day=1).isoformat()
    completas = [f for f in filas if f["mes"] < mes_actual]
    if not completas:
        return {"ultimo_mes": None, "cambios": [], "alerta": False,
                "mensaje": "Aun no hay meses completos de historial."}
    ultimo_mes = max(f["mes"] for f in completas)
    previos = sorted({f["mes"] for f in completas if f["mes"] < ultimo_mes})[-SERIE_MESES_PREVIOS:]
    if not previos:
        return {"ultimo_mes": ultimo_mes, "cambios": [], "alerta": False,
                "mensaje": "Solo hay un mes de historial: no se puede comparar."}

    por_cat: Dict[str, Dict[str, int]] = {}
    for f in completas:
        por_cat.setdefault(f["categoria"], {})[f["mes"]] = f["unidades"]
    cambios = []
    for cat, meses in sorted(por_cat.items()):
        promedio = sum(meses.get(m, 0) for m in previos) / len(previos)
        if promedio < SERIE_MIN_UNIDADES:
            continue
        ultimo = meses.get(ultimo_mes, 0)
        cambios.append({"categoria": cat, "ultimo": ultimo,
                        "promedio_previo": round(promedio, 1),
                        "variacion": round(ultimo / promedio - 1, 3)})
    en_cambio = [c for c in cambios if abs(c["variacion"]) >= SERIE_UMBRAL_CAMBIO]
    if en_cambio:
        det = ", ".join(f"{c['categoria']} {c['variacion']:+.0%}" for c in en_cambio)
        mensaje = (f"En {ultimo_mes[:7]} la demanda real cambio de forma marcada frente al promedio "
                   f"de los {len(previos)} meses previos: {det}.")
    else:
        mensaje = f"La demanda real de {ultimo_mes[:7]} se mantiene cerca del promedio de los meses previos."
    return {"ultimo_mes": ultimo_mes, "cambios": cambios, "alerta": bool(en_cambio), "mensaje": mensaje}


# --- Metricas de uso de la IA ----------------------------------------------------------

def metricas_uso(conn, dias: int = 14) -> Dict[str, Any]:
    """Consultas al chat, tokens, errores y busquedas (con y sin resultado) por dia.

    Fuente: conversaciones_ia (una fila por consulta al chat; estado 'error' = fallo de
    Gemini) y busquedas_ia (cada busqueda semantica o de similares). Incluye los dias sin
    actividad (con ceros) para que el grafico no tenga huecos."""
    dias = max(1, min(int(dias), 90))
    with conn.cursor() as cur:
        cur.execute(
            """WITH dias AS (
                 SELECT d::date AS dia FROM generate_series(CURRENT_DATE - (%s - 1), CURRENT_DATE, '1 day') d),
               chat AS (
                 SELECT "timestamp"::date AS dia, count(*) AS consultas,
                        COALESCE(SUM(tokens_usados), 0) AS tokens,
                        count(*) FILTER (WHERE estado = 'error') AS errores
                   FROM conversaciones_ia GROUP BY 1),
               bus AS (
                 SELECT created_at::date AS dia, count(*) AS busquedas,
                        count(*) FILTER (WHERE n_resultados = 0) AS sin_resultado
                   FROM busquedas_ia GROUP BY 1)
               SELECT dias.dia, COALESCE(chat.consultas, 0), COALESCE(chat.tokens, 0),
                      COALESCE(chat.errores, 0), COALESCE(bus.busquedas, 0), COALESCE(bus.sin_resultado, 0)
                 FROM dias LEFT JOIN chat USING (dia) LEFT JOIN bus USING (dia)
                ORDER BY dias.dia""",
            (dias,),
        )
        filas = [
            {"dia": d.isoformat(), "consultas": int(c), "tokens": int(t), "errores": int(e),
             "busquedas": int(b), "busquedas_sin_resultado": int(s)}
            for d, c, t, e, b, s in cur.fetchall()
        ]
        cur.execute(
            """SELECT consulta, count(*), max(created_at)
                 FROM busquedas_ia
                WHERE n_resultados = 0 AND tipo = 'semantica'
                  AND created_at >= CURRENT_DATE - (%s - 1)
                GROUP BY consulta ORDER BY count(*) DESC, max(created_at) DESC LIMIT 5""",
            (dias,),
        )
        sin_resultado = [{"consulta": c[:120], "veces": int(n)} for c, n, _ in cur.fetchall()]
    totales = {k: sum(f[k] for f in filas)
               for k in ("consultas", "tokens", "errores", "busquedas", "busquedas_sin_resultado")}
    return {"dias": dias, "por_dia": filas, "totales": totales, "consultas_sin_resultado": sin_resultado}


# --- Riesgo de faltante ----------------------------------------------------------------
# Margen de seguridad: con stock >= demanda * RIESGO_MARGEN_JUSTO se considera que "alcanza";
# entre la demanda y esa cifra, "justo"; por debajo de la demanda, "faltara".
RIESGO_MARGEN_JUSTO = float(os.getenv("RIESGO_MARGEN_JUSTO", "1.2"))


def clasificar_riesgo(demanda: float, stock: float, margen: float = RIESGO_MARGEN_JUSTO) -> str:
    if stock < demanda:
        return "faltara"
    if stock < demanda * margen:
        return "justo"
    return "alcanza"


def stock_por_categoria(conn) -> Dict[str, int]:
    """Stock disponible = stock_total - stock_baja de los productos activos (misma
    definicion que el chat y el catalogo). No descuenta alquileres ya reservados."""
    with conn.cursor() as cur:
        cur.execute(
            """SELECT c.nombre, COALESCE(SUM(p.stock_total - p.stock_baja) FILTER (WHERE p.activo), 0)
                 FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id
                GROUP BY c.nombre"""
        )
        return {n: int(s) for n, s in cur.fetchall()}


def cruzar_riesgo(demanda: List[Dict[str, Any]], stock: Dict[str, int],
                  margen: float = RIESGO_MARGEN_JUSTO) -> List[Dict[str, Any]]:
    """Une el pronostico (lista de {categoria, cantidad_estimada}) con el stock por categoria."""
    out = []
    for d in demanda:
        est, disp = d["cantidad_estimada"], stock.get(d["categoria"], 0)
        out.append({
            "categoria": d["categoria"], "demanda_estimada": est, "stock_disponible": disp,
            "semaforo": clasificar_riesgo(est, disp, margen),
            "faltante": max(0, est - disp),
        })
    return out
