# 2. Caracterización del dataset de pronóstico de demanda

*Generado con `docs/informe-datos/scripts/dataset_y_red.py`, que reconstruye el conjunto con las mismas funciones y semilla (42) que `python-ml/pronostico/entrenar.py`.*

## 2.1 Origen y proporción de los datos

| Origen | Filas | Proporción | Descripción |
|---|---:|---:|---|
| **Sintético** | 3600 | 92.3 % | `python-ml/data/eventos_sinteticos.csv`, generado por `pronostico/generar_dataset.py` (semilla 42) a partir de supuestos del negocio: **no son alquileres reales** |
| **De ejemplo** | 300 | 7.7 % | alquileres con `alquileres.es_ejemplo = TRUE` sembrados con `database/seeds/historial_alquileres_ejemplo.sql` (datos ficticios, estado `cerrado`) |
| **Reales** | 0 | 0.0 % | alquileres reales con `tipo_evento` y `num_asistentes` (los anteriores a la migración 006 no los tienen y no entran) |
| **Total** | **3900** | 100 % | `meta.json` declara `datos = "MIXTOS"`, total 3900 |

> Coincide con la composición registrada en `meta.json` del modelo vigente: **sí**.

**Etiqueta de los datos:** mientras no haya alquileres reales, el modelo se declara `SINTETICOS`/`MIXTOS` y el panel lo muestra así. Las métricas miden cuánto aprende la red de los patrones supuestos, no su precisión en producción.

## 2.2 Columnas

Cada fila es **un evento**. Entradas (3 columnas) y salidas (6 columnas):

| Columna | Rol | Tipo | Rango observado | Significado |
|---|---|---|---|---|
| `tipo_evento` | entrada | categórica (7 valores) | boda, quinceanos, bautizo, cumpleanos, graduacion, corporativo, baby_shower | tipo de celebración |
| `mes` | entrada | entero | 1 – 12 | mes del evento (1 = enero) |
| `asistentes` | entrada | entero | 10 – 281 (media 81.7, mediana 69, desv. 49.5) | invitados previstos |
| `cant_Copa` | salida | entero | 5 – 923 (media 131.9, desv. 130.7) | unidades de la categoría **Copa** alquiladas |
| `cant_Vaso` | salida | entero | 8 – 317 (media 94.6, desv. 45.7) | unidades de la categoría **Vaso** alquiladas |
| `cant_Plato` | salida | entero | 9 – 580 (media 124.4, desv. 89.8) | unidades de la categoría **Plato** alquiladas |
| `cant_Cubierto` | salida | entero | 20 – 1316 (media 244.3, desv. 178.4) | unidades de la categoría **Cubierto** alquiladas |
| `cant_Mantel` | salida | entero | 1 – 77 (media 14.0, desv. 11.4) | unidades de la categoría **Mantel** alquiladas |
| `cant_Otro` | salida | entero | 2 – 119 (media 22.7, desv. 17.4) | unidades de la categoría **Otro** alquiladas |

Las categorías coinciden con la tabla `categorias` de `menaje_db`. El generador sintético acota los asistentes a [10, 400] y aplica ruido gaussiano (σ = 8 %) a las cantidades; el máximo de asistentes efectivamente visto en el entrenamiento es **281** (`asistentes_max_entrenado` en `meta.json`): por encima de eso el servicio avisa de que la estimación es menos fiable.

## 2.3 Distribución por tipo de evento

| Tipo de evento | Total | % | Sintético | Ejemplo | Real | Asistentes (media) | Unidades totales medias por evento |
|---|---:|---:|---:|---:|---:|---:|---:|
| boda | 768 | 19.7 % | 717 | 51 | 0 | 138.9 | 1204 |
| quinceanos | 590 | 15.1 % | 542 | 48 | 0 | 118.0 | 947 |
| bautizo | 444 | 11.4 % | 410 | 34 | 0 | 59.9 | 420 |
| cumpleanos | 865 | 22.2 % | 796 | 69 | 0 | 45.5 | 315 |
| graduacion | 415 | 10.6 % | 382 | 33 | 0 | 79.6 | 589 |
| corporativo | 429 | 11.0 % | 399 | 30 | 0 | 70.4 | 456 |
| baby_shower | 389 | 10.0 % | 354 | 35 | 0 | 34.3 | 213 |

## 2.4 Distribución por categoría (unidades por evento)

| Categoría | Unidades totales | % de las unidades | Media por evento | Mín | Máx |
|---|---:|---:|---:|---:|---:|
| Copa | 514473 | 20.9 % | 131.9 | 5 | 923 |
| Vaso | 368816 | 15.0 % | 94.6 | 8 | 317 |
| Plato | 485274 | 19.7 % | 124.4 | 9 | 580 |
| Cubierto | 952681 | 38.7 % | 244.3 | 20 | 1316 |
| Mantel | 54452 | 2.2 % | 14.0 | 1 | 77 |
| Otro | 88682 | 3.6 % | 22.7 | 2 | 119 |

Media de unidades por categoría y tipo de evento:

| Tipo de evento | Copa | Vaso | Plato | Cubierto | Mantel | Otro |
|---|---:|---:|---:|---:|---:|---:|
| boda | 316.3 | 118.1 | 234.5 | 461.5 | 29.4 | 43.8 |
| quinceanos | 218.8 | 123.8 | 184.4 | 364.4 | 21.0 | 34.5 |
| bautizo | 62.9 | 73.9 | 88.2 | 174.4 | 8.8 | 11.3 |
| cumpleanos | 33.5 | 85.1 | 61.9 | 118.2 | 5.3 | 10.5 |
| graduacion | 102.1 | 108.2 | 117.2 | 234.1 | 11.0 | 16.8 |
| corporativo | 80.7 | 73.4 | 88.8 | 176.3 | 11.1 | 25.8 |
| baby_shower | 22.1 | 57.4 | 43.5 | 79.0 | 4.4 | 6.6 |

Distribución mensual de eventos (estacionalidad: picos en julio y diciembre):

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 266 | 239 | 280 | 322 | 317 | 356 | 455 | 307 | 284 | 312 | 350 | 412 |

## 2.5 División en entrenamiento, validación y prueba

Aleatoria (`numpy.random.default_rng(42).permutation`), **70 % / 15 % / 15 %**, sin estratificar. La validación se usa para la parada temprana y para el error por categoría que muestra el panel; la prueba solo se usa para informar.

| Conjunto | Filas | % | Sintético | Ejemplo | Real |
|---|---:|---:|---:|---:|---:|
| Entrenamiento | 2730 | 70.0 % | 2520 | 210 | 0 |
| Validación | 585 | 15.0 % | 539 | 46 | 0 |
| Prueba | 585 | 15.0 % | 541 | 44 | 0 |

Tipos de evento por conjunto:

| Conjunto | boda | quinceanos | bautizo | cumpleanos | graduacion | corporativo | baby_shower |
|---|---:|---:|---:|---:|---:|---:|---:|
| Entrenamiento | 543 | 404 | 315 | 622 | 273 | 299 | 274 |
| Validación | 112 | 93 | 57 | 126 | 67 | 71 | 59 |
| Prueba | 113 | 93 | 72 | 117 | 75 | 59 | 56 |

## 2.6 Preprocesamiento

1. **Entradas (20 valores por evento):** one-hot del tipo de evento (7) + one-hot del mes (12) + `asistentes / 400` (1, escala fija `asistentes_escala = 400`).
2. **Salidas (6 valores):** se **estandarizan** con la media y desviación **del conjunto de entrenamiento** (`y_norm = (y − media) / desv`); al predecir se invierte y se recorta en 0 (no hay demanda negativa) y se redondea a entero.
3. Los parámetros de estandarización (`y_media`, `y_desv`) y la escala de asistentes se guardan en `meta.json` para que `python-ia/pronostico.py` (que evalúa la red solo con NumPy, sin torch) aplique exactamente el mismo preprocesamiento.
4. No hay valores faltantes que imputar (los datos sintéticos son completos; de la BD solo entran alquileres con `tipo_evento` y `num_asistentes` no nulos). No se eliminan atípicos.
5. **Línea base** para comparar: promedio histórico por categoría y mes (solo con el conjunto de entrenamiento); es también el respaldo del *modo degradado*.

## 2.7 Datos de ejemplo

**Primeras 8 filas del CSV sintético** (`python-ml/data/eventos_sinteticos.csv`):

| tipo_evento | mes | asistentes | cant_Copa | cant_Vaso | cant_Plato | cant_Cubierto | cant_Mantel | cant_Otro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| graduacion | 6 | 102 | 138 | 117 | 134 | 303 | 14 | 21 |
| bautizo | 6 | 75 | 79 | 103 | 114 | 205 | 11 | 13 |
| corporativo | 8 | 64 | 67 | 70 | 76 | 148 | 9 | 23 |
| boda | 3 | 161 | 373 | 112 | 222 | 433 | 30 | 47 |
| boda | 7 | 98 | 284 | 104 | 205 | 371 | 25 | 37 |
| quinceanos | 9 | 128 | 231 | 122 | 187 | 383 | 18 | 33 |
| bautizo | 8 | 54 | 60 | 60 | 81 | 131 | 7 | 10 |
| cumpleanos | 7 | 60 | 51 | 130 | 104 | 185 | 7 | 15 |

**8 filas de alquileres de ejemplo** (ficticios, `es_ejemplo = TRUE`; salen de la BD):

| tipo_evento | mes | asistentes | cant_Copa | cant_Vaso | cant_Plato | cant_Cubierto | cant_Mantel | cant_Otro |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| graduacion | 6 | 89 | 108 | 103 | 150 | 246 | 14 | 18 |
| boda | 12 | 123 | 180 | 171 | 337 | 459 | 34 | 64 |
| cumpleanos | 7 | 56 | 56 | 144 | 96 | 164 | 7 | 18 |
| quinceanos | 7 | 178 | 300 | 230 | 375 | 767 | 43 | 74 |
| corporativo | 9 | 144 | 128 | 127 | 180 | 277 | 25 | 38 |
| bautizo | 3 | 69 | 81 | 73 | 104 | 161 | 9 | 12 |
| cumpleanos | 7 | 58 | 58 | 117 | 67 | 124 | 9 | 15 |
| graduacion | 7 | 72 | 130 | 96 | 116 | 265 | 12 | 20 |

Los 300 alquileres de ejemplo cubren 7 tipos de evento, asistentes de 10 a 220 y meses 1–12; son el **7.7 %** del total. Se sembraron para poder probar la alerta de deriva y el reentrenamiento con datos mezclados; **no representan clientes reales**.
