# Fase 3 — Pronóstico de demanda por categoría (Opción 2, capa 9)

## ⚠ Los datos de entrenamiento son SINTÉTICOS
`menaje_db` tiene muy pocos alquileres reales, así que el modelo se entrenó con 3 600 eventos
generados por `python-ml/pronostico/generar_dataset.py` (semilla 42). Los patrones (más copas y
manteles en bodas, más unidades con más asistentes, picos en diciembre ×1.40 y julio ×1.25) son
**supuestos míos**, y el ruido es gaussiano con σ = 8 %. Por eso las métricas miden cuánto aprende
la red de esos supuestos, **no su precisión sobre alquileres reales**; el error real será mayor.
La API marca cada respuesta con `datos_entrenamiento: "SINTETICOS"`.

Categorías: las de la tabla `categorias` (Copa, Vaso, Plato, Cubierto, Mantel, Otro), tomadas de
`database/schema.sql` y del volcado `menajedb_filled.sql` (la BD de desarrollo estaba apagada).

## Resultados (conjunto de prueba, 540 eventos; train/val/test = 2520/540/540)
| Modelo | MAE | RMSE |
|---|---:|---:|
| Línea base: promedio por categoría y mes | 59.46 | 94.87 |
| Red feedforward (19→64→32→6) | **7.56** | **14.23** |
| Diferencia | −51.90 (−87.3 %) | −80.64 (−85.0 %) |

Validación: base 63.24 / 102.31; red 7.78 / 14.43. Referencia adicional (no pedida): promedio por
tipo de evento y mes → MAE 30.90, RMSE 54.64.
Aviso de lectura: la línea base ignora tipo de evento y asistentes por definición, y en los datos
sintéticos la cantidad es casi lineal en los asistentes, así que la ventaja es amplia por construcción.

## Qué se hizo
- `python-ml/pronostico/entrenar.py`: entrenamiento, parada temprana (mejor época 36), registro en
  MLflow (SQLite local `python-ml/mlflow.db` + `mlruns/`, sin servidor): parámetros, métricas,
  modelo PyTorch y paquete de servicio. Exporta `python-ml/modelos/pronostico/` (24 KB).
- `python-ia/pronostico.py` + `POST /pronostico-demanda` (`X-IA-Token`): inferencia con numpy
  (sin torch). Confianza = MAE de validación de cada categoría. Si el modelo no carga, devuelve el
  promedio histórico por categoría y mes con `modo: "degradado"` y un aviso; si tampoco existe ese
  archivo, 503. Si `asistentes` supera el máximo entrenado (400) añade un aviso.
- `POST /api/ia/pronostico-demanda` en Node: JWT + `autorizar('dueno')` (el esquema solo tiene
  cliente / trabajador / dueno; "administrador" = dueno). La lógica de la Opción 1 no se tocó.

## Git
No se versionan `mlflow.db`, `mlruns/` ni `__pycache__` (.gitignore). El CSV (125 KB) y el paquete
del modelo (24 KB) sí, por ser muy inferiores a 5 MB. Se regeneran con los comandos de abajo.

## Verificación
```
cd python-ml
./venv/Scripts/python -m pronostico.generar_dataset
./venv/Scripts/python -m pronostico.entrenar
cd ../python-ia && ./venv/Scripts/python -m unittest test_pronostico -v   # 13 pruebas, sin BD ni Gemini
```
Comprobación de extremo a extremo hecha: Node → FastAPI real; sin JWT 401, cliente 403,
trabajador 403, dueño con mes inválido 400, dueño válido 200 con modo `modelo`.

## Pendiente / límites
- Reentrenar con alquileres reales cuando haya volumen y sustituir el CSV sintético.
- Las pruebas de Node no existen en el repo; la ruta se verificó con un script manual (no versionado).
- `httpx==0.27.2` se instaló en el venv de python-ia solo para el TestClient.
