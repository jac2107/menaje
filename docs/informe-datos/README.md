# Datos para el informe y los diagramas (Fase 6 final, Parte C)

Material de solo lectura: se generó sin modificar el código de la aplicación. Los scripts de `scripts/` consultan la BD y los
archivos del modelo; **no escriben** en la BD, en `modelos/pronostico/` ni en MLflow.

| Archivo | Contenido |
|---|---|
| [`01_esquema_bd.md`](01_esquema_bd.md) | Tablas, columnas, tipos, PK/FK, `CHECK`, índices, columnas vectoriales y JSONB, vista y **diagrama ER en Mermaid** |
| [`02_dataset_pronostico.md`](02_dataset_pronostico.md) | Columnas, rangos, distribución por evento y categoría, división 70/15/15, preprocesamiento, ejemplos y proporción sintético/ejemplo/real |
| [`03_arquitectura_red.md`](03_arquitectura_red.md) | Capas, activaciones, pérdida, optimizador, tasa, épocas, lote, 3 622 parámetros y las curvas |
| [`curvas_perdida.png`](curvas_perdida.png) | Pérdida de entrenamiento y de validación por época (escala lineal y logarítmica) |
| [`04_tecnologias.md`](04_tecnologias.md) | Tecnologías y versiones por capa (declaradas e instaladas) |
| [`05_flujos_por_rfi.md`](05_flujos_por_rfi.md) | Flujo real de llamadas (archivo › función, en orden) y modo degradado de los 5 RFI |
| [`06_almacenamiento_multimodal.md`](06_almacenamiento_multimodal.md) | Relacional, vectorial, JSONB, Redis y artefactos MLflow + diagrama |

Regenerar (con `docker compose up -d` y las dependencias de cada `venv`):

```
cd python-ia && ./venv/Scripts/python ../docs/informe-datos/scripts/generar_esquema.py      # 01
cd python-ml && ./venv/Scripts/python ../docs/informe-datos/scripts/dataset_y_red.py        # 02, 03 y el PNG
```

Los documentos 04, 05 y 06 se redactaron a partir del código y de consultas puntuales (`pip list`, `npm ls`, `docker exec`,
`redis-cli`, SQLite de MLflow); sus cifras son las del 23-11-2026.

**Nota sobre las curvas de pérdida.** `entrenar.py` solo guarda en MLflow la pérdida de *validación*. La de *entrenamiento* se obtuvo
volviendo a entrenar en memoria con los mismos datos, división, semilla e hiperparámetros; la curva de validación reproducida coincide
con la de MLflow época a época (diferencia máxima 0), por lo que la de entrenamiento es fiel.

Mermaid se renderiza en GitHub, en VS Code (extensión *Markdown Preview Mermaid Support*) o pegando cada bloque en <https://mermaid.live>.
