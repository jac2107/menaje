"""Genera docs/informe-datos/02_dataset_pronostico.md, 03_arquitectura_red.md y curvas_perdida.png.

NO modifica el codigo del proyecto ni el modelo en produccion: importa las funciones de
python-ml/pronostico/entrenar.py, reconstruye el MISMO conjunto de datos y la MISMA division
(semilla 42) y vuelve a entrenar la red EN MEMORIA con los hiperparametros por defecto para
registrar la perdida de entrenamiento por epoca (entrenar.py solo guarda en MLflow la de
validacion). No escribe en modelos/pronostico/ ni en MLflow. Como comprobacion, la curva de
validacion reproducida se compara epoca a epoca con la que MLflow guardo del entrenamiento real.

  cd python-ml && ./venv/Scripts/python ../docs/informe-datos/scripts/dataset_y_red.py
"""
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
ML = RAIZ / "python-ml"
sys.path.insert(0, str(ML))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import torch
from torch import nn

from pronostico import entrenar as E
from pronostico.generar_dataset import CATEGORIAS, EVENTOS, SALIDA as CSV

DOCS = RAIZ / "docs" / "informe-datos"
meta = json.loads((ML / "modelos" / "pronostico" / "meta.json").read_text(encoding="utf-8"))

# ---------------------------------------------------------------- datos (igual que entrenar.main)
SEMILLA, EPOCAS, LR, OCULTAS, PACIENCIA, LOTE = 42, 300, 0.005, [64, 32], 30, 64
torch.manual_seed(SEMILLA)
rng = np.random.default_rng(SEMILLA)
tipos, meses, asist, y = E.cargar_csv(CSV)
origen = ["sintetico"] * len(tipos)
n_csv = len(tipos)
bd = E.cargar_alquileres_bd()
if bd:
    tipos = tipos + [f[0] for f in bd]
    meses = np.concatenate([meses, np.array([f[1] for f in bd])])
    asist = np.concatenate([asist, np.array([f[2] for f in bd], dtype=np.float64)])
    y = np.vstack([y, np.array([f[3] for f in bd])])
    origen += ["ejemplo" if f[4] else "real" for f in bd]
origen = np.array(origen)
n = len(tipos)
idx = rng.permutation(n)
n_tr, n_va = int(n * 0.70), int(n * 0.15)
i_tr, i_va, i_te = idx[:n_tr], idx[n_tr:n_tr + n_va], idx[n_tr + n_va:]
tipos_a = np.array(tipos)
comp = Counter(origen.tolist())
coincide_meta = (dict(comp) | {"total": n}) == {k: v for k, v in meta["composicion_datos"].items() if v or k == "total"} \
    or all(comp.get(k, 0) == meta["composicion_datos"][k] for k in ("sintetico", "ejemplo", "real"))

# ---------------------------------------------------------------- reentrenamiento en memoria
def sel(ids):
    return ([tipos[i] for i in ids], meses[ids], asist[ids], y[ids])


tr, va, te = sel(i_tr), sel(i_va), sel(i_te)
Xtr, Xva, Xte = (E.codificar(*d[:3]) for d in (tr, va, te))
mu, sd = tr[3].mean(axis=0), tr[3].std(axis=0)
ytr = torch.tensor((tr[3] - mu) / sd, dtype=torch.float32)
yva = torch.tensor((va[3] - mu) / sd, dtype=torch.float32)
red = E.Red(Xtr.shape[1], len(CATEGORIAS), OCULTAS)
opt = torch.optim.Adam(red.parameters(), lr=LR)
perdida = nn.MSELoss()
Xtr_t, Xva_t = torch.tensor(Xtr), torch.tensor(Xva)
n_params = sum(p.numel() for p in red.parameters())

curva_tr, curva_tr_eval, curva_va = [], [], []
mejor, epoca_mejor, sin_mejora, mejor_estado = float("inf"), 0, 0, None
for epoca in range(EPOCAS):
    red.train()
    orden = torch.randperm(len(Xtr_t))
    acum, lotes = 0.0, 0
    for j in range(0, len(orden), LOTE):
        b = orden[j:j + LOTE]
        opt.zero_grad()
        l = perdida(red(Xtr_t[b]), ytr[b])
        l.backward()
        opt.step()
        acum += l.item() * len(b)
        lotes += len(b)
    curva_tr.append(acum / lotes)
    red.eval()
    with torch.no_grad():
        curva_tr_eval.append(perdida(red(Xtr_t), ytr).item())
        l_va = perdida(red(Xva_t), yva).item()
    curva_va.append(l_va)
    if l_va < mejor - 1e-6:
        mejor, epoca_mejor, sin_mejora = l_va, epoca, 0
        mejor_estado = {k: v.clone() for k, v in red.state_dict().items()}
    else:
        sin_mejora += 1
        if sin_mejora >= PACIENCIA:
            break
epocas_corridas = len(curva_va)
red.load_state_dict(mejor_estado)
red.eval()


def pred(X):
    with torch.no_grad():
        return np.clip(red(torch.tensor(X)).numpy() * sd + mu, 0, None)


m_va, m_te = E.metricas(va[3], pred(Xva)), E.metricas(te[3], pred(Xte))

# ---------------------------------------------------------------- comparacion con MLflow
mlflow_ok, dif_max, n_comp, mejor_epoca_mlflow = None, None, 0, None
try:
    con = sqlite3.connect(f"file:{(ML / 'mlflow.db').as_posix()}?mode=ro", uri=True)
    filas = con.execute("select step, value from metrics where run_uuid=? and key='val_mse_norm' order by step",
                        (meta["mlflow_run_id"],)).fetchall()
    me = con.execute("select value from metrics where run_uuid=? and key='mejor_epoca'", (meta["mlflow_run_id"],)).fetchone()
    mejor_epoca_mlflow = int(me[0]) if me else None
    if filas:
        n_comp = min(len(filas), epocas_corridas)
        dif_max = max(abs(filas[i][1] - curva_va[i]) for i in range(n_comp))
        mlflow_ok = len(filas) == epocas_corridas and dif_max < 1e-5
except Exception as error:  # MLflow ausente: se informa, no se inventa
    mlflow_ok = f"no se pudo leer mlflow.db: {error!r}"

# ---------------------------------------------------------------- PNG
plt.rcParams.update({"font.size": 10})
fig, ejes = plt.subplots(1, 2, figsize=(11, 4.2), dpi=150)
ep = np.arange(1, epocas_corridas + 1)
for ax, log in zip(ejes, (False, True)):
    ax.plot(ep, curva_tr, color="#1f77b4", lw=1.6, label="Entrenamiento (media de los lotes de la época)")
    ax.plot(ep, curva_va, color="#d95f02", lw=1.6, label="Validación")
    ax.axvline(epoca_mejor + 1, color="#555", ls="--", lw=1, label=f"Mejor época: {epoca_mejor + 1}")
    ax.set_xlabel("Época")
    ax.set_ylabel("Pérdida MSE (datos normalizados)" + (" · escala log" if log else ""))
    if log:
        ax.set_yscale("log")
    ax.grid(alpha=.25)
axes0 = ejes[0]
axes0.legend(fontsize=8)
ejes[0].set_title("Curvas de pérdida (escala lineal)")
ejes[1].set_title("Curvas de pérdida (escala logarítmica)")
fig.suptitle(f"Red de pronóstico de demanda · {n} filas ({comp['sintetico']} sintéticas + {comp.get('ejemplo', 0)} de ejemplo) · "
             f"parada temprana en la época {epocas_corridas}", fontsize=10)
fig.tight_layout()
fig.savefig(DOCS / "curvas_perdida.png")
plt.close(fig)

# ---------------------------------------------------------------- MARKDOWN 02: dataset
cols_x = tipos_a
conteo_tipo = Counter(tipos)
tot = Counter()
for t in tipos:
    pass
md = []
w = md.append
w("# 2. Caracterización del dataset de pronóstico de demanda\n")
w("*Generado con `docs/informe-datos/scripts/dataset_y_red.py`, que reconstruye el conjunto con las mismas funciones y "
  "semilla (42) que `python-ml/pronostico/entrenar.py`.*\n")
w("## 2.1 Origen y proporción de los datos\n")
w("| Origen | Filas | Proporción | Descripción |\n|---|---:|---:|---|")
w(f"| **Sintético** | {comp['sintetico']} | {100 * comp['sintetico'] / n:.1f} % | `python-ml/data/eventos_sinteticos.csv`, generado por `pronostico/generar_dataset.py` "
  f"(semilla 42) a partir de supuestos del negocio: **no son alquileres reales** |")
w(f"| **De ejemplo** | {comp.get('ejemplo', 0)} | {100 * comp.get('ejemplo', 0) / n:.1f} % | alquileres con `alquileres.es_ejemplo = TRUE` sembrados con `database/seeds/historial_alquileres_ejemplo.sql` (datos ficticios, estado `cerrado`) |")
w(f"| **Reales** | {comp.get('real', 0)} | {100 * comp.get('real', 0) / n:.1f} % | alquileres reales con `tipo_evento` y `num_asistentes` (los anteriores a la migración 006 no los tienen y no entran) |")
w(f"| **Total** | **{n}** | 100 % | `meta.json` declara `datos = \"{meta['datos']}\"`, total {meta['composicion_datos']['total']} |\n")
w(f"> Coincide con la composición registrada en `meta.json` del modelo vigente: **{'sí' if coincide_meta else 'NO (el modelo se entrenó con otros datos)'}**.\n")
w("**Etiqueta de los datos:** mientras no haya alquileres reales, el modelo se declara `SINTETICOS`/`MIXTOS` y el panel lo "
  "muestra así. Las métricas miden cuánto aprende la red de los patrones supuestos, no su precisión en producción.\n")

w("## 2.2 Columnas\n")
w("Cada fila es **un evento**. Entradas (3 columnas) y salidas (6 columnas):\n")
w("| Columna | Rol | Tipo | Rango observado | Significado |\n|---|---|---|---|---|")
w(f"| `tipo_evento` | entrada | categórica (7 valores) | {', '.join(EVENTOS)} | tipo de celebración |")
w(f"| `mes` | entrada | entero | {int(meses.min())} – {int(meses.max())} | mes del evento (1 = enero) |")
w(f"| `asistentes` | entrada | entero | {int(asist.min())} – {int(asist.max())} (media {asist.mean():.1f}, mediana {np.median(asist):.0f}, desv. {asist.std():.1f}) | invitados previstos |")
for k, c in enumerate(CATEGORIAS):
    col = y[:, k]
    w(f"| `cant_{c}` | salida | entero | {int(col.min())} – {int(col.max())} (media {col.mean():.1f}, desv. {col.std():.1f}) | unidades de la categoría **{c}** alquiladas |")
w("")
w("Las categorías coinciden con la tabla `categorias` de `menaje_db`. El generador sintético acota los asistentes a [10, 400] y "
  "aplica ruido gaussiano (σ = 8 %) a las cantidades; el máximo de asistentes efectivamente visto en el entrenamiento es "
  f"**{meta['asistentes_max_entrenado']}** (`asistentes_max_entrenado` en `meta.json`): por encima de eso el servicio avisa de que la estimación es menos fiable.\n")

w("## 2.3 Distribución por tipo de evento\n")
w("| Tipo de evento | Total | % | Sintético | Ejemplo | Real | Asistentes (media) | Unidades totales medias por evento |\n|---|---:|---:|---:|---:|---:|---:|---:|")
for t in EVENTOS:
    m = tipos_a == t
    w(f"| {t} | {int(m.sum())} | {100 * m.sum() / n:.1f} % | {int((m & (origen == 'sintetico')).sum())} | "
      f"{int((m & (origen == 'ejemplo')).sum())} | {int((m & (origen == 'real')).sum())} | {asist[m].mean():.1f} | {y[m].sum(axis=1).mean():.0f} |")
w("")
w("## 2.4 Distribución por categoría (unidades por evento)\n")
w("| Categoría | Unidades totales | % de las unidades | Media por evento | Mín | Máx |\n|---|---:|---:|---:|---:|---:|")
tot_u = y.sum()
for k, c in enumerate(CATEGORIAS):
    w(f"| {c} | {int(y[:, k].sum())} | {100 * y[:, k].sum() / tot_u:.1f} % | {y[:, k].mean():.1f} | {int(y[:, k].min())} | {int(y[:, k].max())} |")
w("")
w("Media de unidades por categoría y tipo de evento:\n")
w("| Tipo de evento | " + " | ".join(CATEGORIAS) + " |\n|---|" + "---:|" * len(CATEGORIAS))
for t in EVENTOS:
    m = tipos_a == t
    w(f"| {t} | " + " | ".join(f"{y[m][:, k].mean():.1f}" for k in range(len(CATEGORIAS))) + " |")
w("")
w("Distribución mensual de eventos (estacionalidad: picos en julio y diciembre):\n")
w("| " + " | ".join(str(m) for m in range(1, 13)) + " |\n|" + "---:|" * 12)
w("| " + " | ".join(str(int((meses == m).sum())) for m in range(1, 13)) + " |\n")

w("## 2.5 División en entrenamiento, validación y prueba\n")
w("Aleatoria (`numpy.random.default_rng(42).permutation`), **70 % / 15 % / 15 %**, sin estratificar. La validación se usa "
  "para la parada temprana y para el error por categoría que muestra el panel; la prueba solo se usa para informar.\n")
w("| Conjunto | Filas | % | Sintético | Ejemplo | Real |\n|---|---:|---:|---:|---:|---:|")
for nombre, ids in (("Entrenamiento", i_tr), ("Validación", i_va), ("Prueba", i_te)):
    o = Counter(origen[ids].tolist())
    w(f"| {nombre} | {len(ids)} | {100 * len(ids) / n:.1f} % | {o.get('sintetico', 0)} | {o.get('ejemplo', 0)} | {o.get('real', 0)} |")
w("")
w("Tipos de evento por conjunto:\n")
w("| Conjunto | " + " | ".join(EVENTOS) + " |\n|---|" + "---:|" * len(EVENTOS))
for nombre, ids in (("Entrenamiento", i_tr), ("Validación", i_va), ("Prueba", i_te)):
    c = Counter(tipos_a[ids].tolist())
    w(f"| {nombre} | " + " | ".join(str(c.get(t, 0)) for t in EVENTOS) + " |")
w("")

w("## 2.6 Preprocesamiento\n")
w("1. **Entradas (20 valores por evento):** one-hot del tipo de evento (7) + one-hot del mes (12) + `asistentes / 400` (1, escala fija `asistentes_escala = 400`).")
w("2. **Salidas (6 valores):** se **estandarizan** con la media y desviación **del conjunto de entrenamiento** "
  "(`y_norm = (y − media) / desv`); al predecir se invierte y se recorta en 0 (no hay demanda negativa) y se redondea a entero.")
w("3. Los parámetros de estandarización (`y_media`, `y_desv`) y la escala de asistentes se guardan en `meta.json` para que "
  "`python-ia/pronostico.py` (que evalúa la red solo con NumPy, sin torch) aplique exactamente el mismo preprocesamiento.")
w("4. No hay valores faltantes que imputar (los datos sintéticos son completos; de la BD solo entran alquileres con "
  "`tipo_evento` y `num_asistentes` no nulos). No se eliminan atípicos.")
w("5. **Línea base** para comparar: promedio histórico por categoría y mes (solo con el conjunto de entrenamiento); es también el "
  "respaldo del *modo degradado*.\n")

w("## 2.7 Datos de ejemplo\n")
w("**Primeras 8 filas del CSV sintético** (`python-ml/data/eventos_sinteticos.csv`):\n")
w("| tipo_evento | mes | asistentes | " + " | ".join(f"cant_{c}" for c in CATEGORIAS) + " |\n|---|---:|---:|" + "---:|" * 6)
for i in range(8):
    w(f"| {tipos[i]} | {int(meses[i])} | {int(asist[i])} | " + " | ".join(str(int(v)) for v in y[i]) + " |")
w("")
if comp.get("ejemplo", 0):
    w("**8 filas de alquileres de ejemplo** (ficticios, `es_ejemplo = TRUE`; salen de la BD):\n")
    w("| tipo_evento | mes | asistentes | " + " | ".join(f"cant_{c}" for c in CATEGORIAS) + " |\n|---|---:|---:|" + "---:|" * 6)
    for i in range(n_csv, n_csv + 8):
        w(f"| {tipos[i]} | {int(meses[i])} | {int(asist[i])} | " + " | ".join(str(int(v)) for v in y[i]) + " |")
    ej = origen == "ejemplo"
    w(f"\nLos {int(ej.sum())} alquileres de ejemplo cubren {len(set(tipos_a[ej]))} tipos de evento, asistentes de {int(asist[ej].min())} a {int(asist[ej].max())} "
      f"y meses {int(meses[ej].min())}–{int(meses[ej].max())}; son el **{100 * ej.sum() / n:.1f} %** del total. Se sembraron para poder probar la "
      "alerta de deriva y el reentrenamiento con datos mezclados; **no representan clientes reales**.\n")
(DOCS / "02_dataset_pronostico.md").write_text("\n".join(md), encoding="utf-8")

# ---------------------------------------------------------------- MARKDOWN 03: arquitectura
shapes = [(f"net.{i}", tuple(p.shape)) for i, p in ((i, m.weight) for i, m in enumerate(red.net) if isinstance(m, nn.Linear))]
a = []
w = a.append
w("# 3. Arquitectura exacta de la red de pronóstico\n")
w("*Generado con `docs/informe-datos/scripts/dataset_y_red.py` (las capas se leen del modelo real instanciado con `pronostico.entrenar.Red`).*\n")
w("Red **feedforward** (perceptrón multicapa) que predice a la vez las 6 categorías (regresión multisalida). "
  "Entrenada con PyTorch; el servicio la evalúa solo con NumPy (`python-ia/pronostico.py`).\n")
w("## 3.1 Capas\n")
w("| # | Capa | Entrada → salida | Activación | Parámetros |\n|---|---|---|---|---:|")
entradas = [Xtr.shape[1]] + OCULTAS
salidas = OCULTAS + [len(CATEGORIAS)]
total = 0
for k, (ent, sal) in enumerate(zip(entradas, salidas)):
    p = ent * sal + sal
    total += p
    act = "ReLU" if k < len(OCULTAS) else "ninguna (salida lineal)"
    w(f"| {k + 1} | `Linear` (`net.{2 * k}`) | {ent} → {sal} | {act} | {p:,} ({ent}×{sal} pesos + {sal} sesgos) |")
w(f"| | **Total** | | | **{total:,}** (todos entrenables; `sum(p.numel())` = {n_params:,}) |\n")
w("```mermaid\nflowchart LR\n  E[\"Entrada 20<br/>7 tipo + 12 mes + 1 asistentes\"] --> L1[\"Linear 20→64<br/>ReLU\"] --> L2[\"Linear 64→32<br/>ReLU\"] --> L3[\"Linear 32→6\"] --> S[\"Salida 6<br/>Copa, Vaso, Plato,<br/>Cubierto, Mantel, Otro\"]\n```\n")
w("## 3.2 Hiperparámetros de entrenamiento\n")
w("| Concepto | Valor |\n|---|---|")
w("| Función de pérdida | **MSE** (`nn.MSELoss`) sobre las salidas **estandarizadas** |")
w(f"| Optimizador | **Adam** (`torch.optim.Adam`), sin decaimiento de pesos |")
w(f"| Tasa de aprendizaje | **{LR}** (constante, sin *scheduler*) |")
w(f"| Épocas | máximo **{EPOCAS}**, con **parada temprana** (paciencia {PACIENCIA} épocas sin mejorar la validación en más de 1e-6) |")
w(f"| Tamaño de lote | **{LOTE}** (se barajan los índices en cada época) |")
w(f"| Semilla | {SEMILLA} (`torch.manual_seed` y `numpy.random.default_rng`) |")
w("| Inicialización | la de PyTorch por defecto (Kaiming uniforme en `nn.Linear`) |")
w("| Regularización | ninguna explícita (sin dropout ni L2); la parada temprana hace de regularizador y se conserva el estado de la mejor época |")
w("| Dispositivo | CPU (`torch 2.15`) |")
w(f"| Seguimiento | MLflow (SQLite local `python-ml/mlflow.db`); experimento `pronostico_demanda_categoria` |\n")
w("## 3.3 Resultado del modelo vigente (`meta.json`)\n")
mm = meta["metricas"]
w(f"Versión **{meta['version_modelo']}**, entrenado el {meta['entrenado_en']}, `datos = {meta['datos']}`.\n")
w("| Conjunto | Modelo MAE | Modelo RMSE | Línea base MAE | Línea base RMSE |\n|---|---:|---:|---:|---:|")
for s, nombre in (("val", "Validación"), ("test", "Prueba")):
    w(f"| {nombre} | {mm['modelo'][s]['mae']:.2f} | {mm['modelo'][s]['rmse']:.2f} | {mm['linea_base'][s]['mae']:.2f} | {mm['linea_base'][s]['rmse']:.2f} |")
w("\nError medio absoluto de validación por categoría (lo que muestra el panel como «confianza»): " +
  ", ".join(f"{c} {v:.2f}" for c, v in meta["error_validacion_mae"].items()) + ".\n")
w("## 3.4 Curvas de pérdida\n")
w("![Curvas de pérdida de entrenamiento y validación](curvas_perdida.png)\n")
w(f"* Se corrieron **{epocas_corridas} épocas** antes de la parada temprana; la **mejor época fue la {epoca_mejor + 1}** "
  f"(pérdida de validación {mejor:.4f}; entrenamiento en esa época {curva_tr[epoca_mejor]:.4f}).")
w(f"* Pérdida final: entrenamiento {curva_tr[-1]:.4f}, validación {curva_va[-1]:.4f}.")
w("* La pérdida de entrenamiento mostrada es la **media de las pérdidas de los lotes durante la época** (la red cambia mientras se "
  "mide); la de validación se mide al final de la época sobre todo el conjunto de validación.")
w(f"* En esta reconstrucción: MAE de validación {m_va['mae']:.2f} y de prueba {m_te['mae']:.2f} (modelo vigente: {mm['modelo']['val']['mae']:.2f} y {mm['modelo']['test']['mae']:.2f}).\n")
w("### Cómo se obtuvieron (honestidad sobre el método)\n")
w("`entrenar.py` solo registra en MLflow la pérdida de **validación** por época (`val_mse_norm`); la de entrenamiento no se guardaba. "
  "Por eso estas curvas salen de **volver a entrenar en memoria** con los mismos datos, división, semilla e hiperparámetros "
  "(sin tocar el modelo en producción ni MLflow). Para comprobar que es fiel al entrenamiento real se comparó la curva de validación reproducida "
  f"con la guardada en MLflow para la ejecución `{meta['mlflow_run_id']}`:\n")
if mlflow_ok is True:
    w(f"* **Coinciden**: {n_comp} épocas comparadas, diferencia máxima absoluta {dif_max:.2e}; mejor época en MLflow: {mejor_epoca_mlflow + 1 if mejor_epoca_mlflow is not None else '—'}.")
elif isinstance(mlflow_ok, str):
    w(f"* No se pudo comprobar: {mlflow_ok}")
else:
    w(f"* **No coinciden exactamente** ({n_comp} épocas comparadas; diferencia máxima {dif_max if dif_max is not None else 'n/d'}; "
      f"épocas reproducidas {epocas_corridas}). Las curvas son una reproducción aproximada (p. ej. por diferencias de versión o de datos entre ejecuciones).")
(DOCS / "03_arquitectura_red.md").write_text("\n".join(a), encoding="utf-8")
print("n=", n, "composicion=", dict(comp), "coincide_meta=", coincide_meta)
print("params=", n_params, "epocas=", epocas_corridas, "mejor=", epoca_mejor + 1)
print("mlflow:", mlflow_ok, "dif_max=", dif_max, "n_comp=", n_comp, "mejor_mlflow=", mejor_epoca_mlflow)
print("val mae", round(m_va["mae"], 3), "meta", round(mm["modelo"]["val"]["mae"], 3))
