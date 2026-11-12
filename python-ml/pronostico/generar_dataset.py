"""
Generador del dataset SINTETICO de demanda por categoria (Opcion 2, capa 9).

AVISO: estos datos NO son alquileres reales. La base menaje_db tiene muy pocos
alquileres, asi que los patrones de abajo son supuestos plausibles del negocio
(mas manteles y copas en bodas, mas sillas/platos con mas asistentes, picos en
diciembre y julio). Cualquier metrica obtenida con ellos mide cuanto aprende el
modelo de ESTOS supuestos, no su precision en produccion.

Reproducible: semilla fija. Uso:
  cd python-ml && ./venv/Scripts/python -m pronostico.generar_dataset
"""
import csv
import sys
from pathlib import Path

import numpy as np

SEMILLA = 42
N_EVENTOS = 3600
SALIDA = Path(__file__).resolve().parent.parent / "data" / "eventos_sinteticos.csv"

# Categorias reales de la tabla categorias/productos (database/schema.sql).
CATEGORIAS = ["Copa", "Vaso", "Plato", "Cubierto", "Mantel", "Otro"]

# tipo de evento -> (peso de aparicion, media de asistentes, desviacion)
EVENTOS = {
    "boda":        (0.20, 140, 50),
    "quinceanos":  (0.15, 120, 40),
    "bautizo":     (0.12,  60, 20),
    "cumpleanos":  (0.22,  45, 20),
    "graduacion":  (0.10,  80, 30),
    "corporativo": (0.11,  70, 30),
    "baby_shower": (0.10,  35, 12),
}

# Unidades por asistente de cada categoria segun el evento (Mantel: por mesa de 8).
UNIDADES_POR_ASISTENTE = {
    #               Copa  Vaso  Plato Cubiert Mantel Otro
    "boda":        (2.2,  0.8,  1.6,  3.2,   0.20,  0.30),
    "quinceanos":  (1.8,  1.0,  1.5,  3.0,   0.17,  0.28),
    "bautizo":     (1.0,  1.2,  1.4,  2.8,   0.14,  0.18),
    "cumpleanos":  (0.7,  1.8,  1.3,  2.5,   0.11,  0.22),
    "graduacion":  (1.2,  1.3,  1.4,  2.8,   0.13,  0.20),
    "corporativo": (1.1,  1.0,  1.2,  2.4,   0.15,  0.35),
    "baby_shower": (0.6,  1.6,  1.2,  2.2,   0.12,  0.18),
}

# Estacionalidad mensual (1..12): picos en julio y diciembre.
ESTACIONALIDAD = [0.85, 0.80, 0.90, 0.95, 1.00, 1.05, 1.25, 1.00, 0.95, 1.00, 1.10, 1.40]
PESO_MES = np.array([0.07, 0.06, 0.07, 0.08, 0.08, 0.09, 0.11, 0.08, 0.08, 0.08, 0.09, 0.11])


def generar(n: int = N_EVENTOS, semilla: int = SEMILLA) -> list:
    rng = np.random.default_rng(semilla)
    tipos = list(EVENTOS)
    pesos = np.array([EVENTOS[t][0] for t in tipos])
    filas = []
    for _ in range(n):
        tipo = tipos[rng.choice(len(tipos), p=pesos / pesos.sum())]
        _, media, desv = EVENTOS[tipo]
        mes = int(rng.choice(12, p=PESO_MES / PESO_MES.sum())) + 1
        asistentes = int(np.clip(rng.normal(media, desv), 10, 400))
        estacion = ESTACIONALIDAD[mes - 1]
        cantidades = []
        for factor in UNIDADES_POR_ASISTENTE[tipo]:
            esperado = asistentes * factor * estacion
            ruido = rng.normal(1.0, 0.08)  # variacion del cliente
            cantidades.append(max(0, int(round(esperado * ruido))))
        filas.append([tipo, mes, asistentes] + cantidades)
    return filas


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    filas = generar()
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with open(SALIDA, "w", newline="", encoding="utf-8") as f:
        f.write("# DATOS SINTETICOS generados por pronostico/generar_dataset.py "
                f"(semilla={SEMILLA}, n={len(filas)}). NO son alquileres reales.\n")
        w = csv.writer(f)
        w.writerow(["tipo_evento", "mes", "asistentes"] + [f"cant_{c}" for c in CATEGORIAS])
        w.writerows(filas)
    print(f"{len(filas)} eventos sinteticos -> {SALIDA} ({SALIDA.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
