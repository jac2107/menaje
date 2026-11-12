"""
Entrenamiento del pronostico de demanda por categoria (Opcion 2, capa 9).

Usa el dataset SINTETICO (data/eventos_sinteticos.csv): las metricas miden cuanto
aprende la red de los patrones supuestos, no su precision con alquileres reales.

  cd python-ml
  ./venv/Scripts/python -m pronostico.generar_dataset
  ./venv/Scripts/python -m pronostico.entrenar

Cada ejecucion queda registrada en MLflow (SQLite local mlflow.db + mlruns/, sin
servidor). Ademas exporta el paquete de servicio a modelos/pronostico/ (pesos .npz
+ meta.json + baseline.json) que lee python-ia sin necesitar torch.
"""
import argparse
import csv
import json
import sys
from pathlib import Path

import mlflow
import numpy as np
import torch
from torch import nn

from .generar_dataset import CATEGORIAS, EVENTOS, SALIDA as CSV_DEFECTO

RAIZ = Path(__file__).resolve().parent.parent
DESTINO_DEFECTO = RAIZ / "modelos" / "pronostico"
TIPOS = list(EVENTOS)
ASISTENTES_ESCALA = 400.0


def cargar_csv(ruta: Path):
    with open(ruta, encoding="utf-8") as f:
        lineas = [l for l in f if not l.startswith("#")]
    filas = list(csv.DictReader(lineas))
    tipos = [r["tipo_evento"] for r in filas]
    meses = np.array([int(r["mes"]) for r in filas])
    asist = np.array([int(r["asistentes"]) for r in filas], dtype=np.float64)
    y = np.array([[float(r[f"cant_{c}"]) for c in CATEGORIAS] for r in filas])
    return tipos, meses, asist, y


def codificar(tipos, meses, asist) -> np.ndarray:
    """Entradas: one-hot tipo (7) + one-hot mes (12) + asistentes/400."""
    X = np.zeros((len(tipos), len(TIPOS) + 12 + 1), dtype=np.float32)
    for i, (t, m, a) in enumerate(zip(tipos, meses, asist)):
        X[i, TIPOS.index(t)] = 1.0
        X[i, len(TIPOS) + int(m) - 1] = 1.0
        X[i, -1] = a / ASISTENTES_ESCALA
    return X


def metricas(y_real, y_pred) -> dict:
    err = y_pred - y_real
    return {
        "mae": float(np.abs(err).mean()),
        "rmse": float(np.sqrt((err ** 2).mean())),
        "mae_por_categoria": np.abs(err).mean(axis=0).tolist(),
        "rmse_por_categoria": np.sqrt((err ** 2).mean(axis=0)).tolist(),
    }


def tabla_promedios(y, clave):
    """Promedio por clave; las claves no vistas caen al promedio global."""
    out = {}
    for k in sorted(set(clave)):
        mask = np.array([c == k for c in clave])
        out[k] = y[mask].mean(axis=0)
    return out, y.mean(axis=0)


def predecir_tabla(clave, tabla, global_):
    return np.array([tabla.get(k, global_) for k in clave])


class Red(nn.Module):
    def __init__(self, n_in, n_out, ocultas):
        super().__init__()
        capas, previo = [], n_in
        for h in ocultas:
            capas += [nn.Linear(previo, h), nn.ReLU()]
            previo = h
        capas.append(nn.Linear(previo, n_out))
        self.net = nn.Sequential(*capas)

    def forward(self, x):
        return self.net(x)


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser()
    p.add_argument("--csv", type=Path, default=CSV_DEFECTO)
    p.add_argument("--destino", type=Path, default=DESTINO_DEFECTO)
    p.add_argument("--semilla", type=int, default=42)
    p.add_argument("--epocas", type=int, default=300)
    p.add_argument("--lr", type=float, default=0.005)
    p.add_argument("--ocultas", type=int, nargs="+", default=[64, 32])
    p.add_argument("--paciencia", type=int, default=30)
    a = p.parse_args()

    torch.manual_seed(a.semilla)
    rng = np.random.default_rng(a.semilla)

    tipos, meses, asist, y = cargar_csv(a.csv)
    n = len(tipos)
    idx = rng.permutation(n)
    n_tr, n_va = int(n * 0.70), int(n * 0.15)
    i_tr, i_va, i_te = idx[:n_tr], idx[n_tr:n_tr + n_va], idx[n_tr + n_va:]

    def sel(ids):
        return ([tipos[i] for i in ids], meses[ids], asist[ids], y[ids])

    tr, va, te = sel(i_tr), sel(i_va), sel(i_te)

    # --- Linea base: promedio historico por categoria y mes (solo entrenamiento) ---
    tab_mes, glob = tabla_promedios(tr[3], [int(m) for m in tr[1]])
    base = {s: metricas(d[3], predecir_tabla([int(m) for m in d[1]], tab_mes, glob))
            for s, d in (("val", va), ("test", te))}
    # Referencia adicional (informativa): promedio por tipo de evento y mes.
    tab_tm, _ = tabla_promedios(tr[3], list(zip(tr[0], tr[1].tolist())))
    base2_test = metricas(te[3], predecir_tabla(list(zip(te[0], te[1].tolist())), tab_tm, glob))

    # --- Red feedforward ---
    Xtr, Xva, Xte = (codificar(*d[:3]) for d in (tr, va, te))
    mu, sd = tr[3].mean(axis=0), tr[3].std(axis=0)
    ytr = torch.tensor((tr[3] - mu) / sd, dtype=torch.float32)
    yva_n = torch.tensor((va[3] - mu) / sd, dtype=torch.float32)
    red = Red(Xtr.shape[1], len(CATEGORIAS), a.ocultas)
    opt = torch.optim.Adam(red.parameters(), lr=a.lr)
    perdida = nn.MSELoss()
    Xtr_t, Xva_t = torch.tensor(Xtr), torch.tensor(Xva)

    mejor, mejor_estado, sin_mejora, epoca_mejor = float("inf"), None, 0, 0
    mlflow.set_tracking_uri(f"sqlite:///{(RAIZ / 'mlflow.db').as_posix()}")
    mlflow.set_experiment("pronostico_demanda_categoria")
    with mlflow.start_run() as run:
        mlflow.set_tags({"datos": "SINTETICOS (generar_dataset.py)", "capa": "9"})
        mlflow.log_params({
            "semilla": a.semilla, "epocas_max": a.epocas, "lr": a.lr,
            "ocultas": str(a.ocultas), "paciencia": a.paciencia,
            "n_train": len(i_tr), "n_val": len(i_va), "n_test": len(i_te),
            "dataset": a.csv.name,
        })
        for epoca in range(a.epocas):
            red.train()
            orden = torch.randperm(len(Xtr_t))
            for j in range(0, len(orden), 64):
                b = orden[j:j + 64]
                opt.zero_grad()
                perdida(red(Xtr_t[b]), ytr[b]).backward()
                opt.step()
            red.eval()
            with torch.no_grad():
                l_va = perdida(red(Xva_t), yva_n).item()
            mlflow.log_metric("val_mse_norm", l_va, step=epoca)
            if l_va < mejor - 1e-6:
                mejor, epoca_mejor, sin_mejora = l_va, epoca, 0
                mejor_estado = {k: v.clone() for k, v in red.state_dict().items()}
            else:
                sin_mejora += 1
                if sin_mejora >= a.paciencia:
                    break
        red.load_state_dict(mejor_estado)
        red.eval()

        def pred(X):
            with torch.no_grad():
                return np.clip(red(torch.tensor(X)).numpy() * sd + mu, 0, None)

        modelo = {s: metricas(d[3], pred(X)) for s, d, X in (("val", va, Xva), ("test", te, Xte))}

        for s in ("val", "test"):
            mlflow.log_metrics({
                f"{s}_mae": modelo[s]["mae"], f"{s}_rmse": modelo[s]["rmse"],
                f"base_{s}_mae": base[s]["mae"], f"base_{s}_rmse": base[s]["rmse"],
            })
        mlflow.log_metrics({
            "mejor_epoca": epoca_mejor,
            "mejora_mae_test_pct": 100 * (1 - modelo["test"]["mae"] / base["test"]["mae"]),
            "mejora_rmse_test_pct": 100 * (1 - modelo["test"]["rmse"] / base["test"]["rmse"]),
        })
        mlflow.pytorch.log_model(red, name="modelo", input_example=Xtr[:5])

        # --- Paquete de servicio para python-ia (sin torch) ---
        a.destino.mkdir(parents=True, exist_ok=True)
        pesos = {nombre: t.numpy() for nombre, t in red.state_dict().items()}
        np.savez(a.destino / "pesos.npz", **pesos)
        meta = {
            "datos": "SINTETICOS", "mlflow_run_id": run.info.run_id,
            "categorias": CATEGORIAS, "tipos_evento": TIPOS,
            "asistentes_escala": ASISTENTES_ESCALA,
            "asistentes_max_entrenado": int(asist.max()),
            "y_media": mu.tolist(), "y_desv": sd.tolist(),
            "error_validacion_mae": dict(zip(CATEGORIAS, modelo["val"]["mae_por_categoria"])),
            "metricas": {"modelo": modelo, "linea_base": base},
        }
        (a.destino / "meta.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
        baseline = {str(m): dict(zip(CATEGORIAS, map(float, tab_mes.get(m, glob)))) for m in range(1, 13)}
        (a.destino / "baseline.json").write_text(json.dumps(
            {"datos": "SINTETICOS", "promedio_por_mes": baseline},
            indent=2, ensure_ascii=False), encoding="utf-8")
        mlflow.log_artifacts(str(a.destino), artifact_path="paquete_servicio")

    # --- Reporte ---
    print(f"\nRun MLflow: {run.info.run_id} | mejor epoca: {epoca_mejor} | "
          f"train/val/test = {len(i_tr)}/{len(i_va)}/{len(i_te)}  (DATOS SINTETICOS)")
    print(f"{'conjunto':<10}{'modelo':<28}{'MAE':>8}{'RMSE':>8}")
    for s in ("val", "test"):
        print(f"{s:<10}{'linea base (categoria+mes)':<28}{base[s]['mae']:>8.2f}{base[s]['rmse']:>8.2f}")
        print(f"{s:<10}{'red feedforward':<28}{modelo[s]['mae']:>8.2f}{modelo[s]['rmse']:>8.2f}")
    print(f"{'test':<10}{'ref: tipo evento+mes':<28}{base2_test['mae']:>8.2f}{base2_test['rmse']:>8.2f}")
    d_mae = base["test"]["mae"] - modelo["test"]["mae"]
    d_rmse = base["test"]["rmse"] - modelo["test"]["rmse"]
    print(f"\nTest: MAE -{d_mae:.2f} ({100*d_mae/base['test']['mae']:.1f}%), "
          f"RMSE -{d_rmse:.2f} ({100*d_rmse/base['test']['rmse']:.1f}%) frente a la linea base")
    print("MAE test por categoria (modelo vs base):")
    for i, c in enumerate(CATEGORIAS):
        print(f"  {c:<9}{modelo['test']['mae_por_categoria'][i]:>7.2f} vs {base['test']['mae_por_categoria'][i]:>7.2f}")


if __name__ == "__main__":
    main()
