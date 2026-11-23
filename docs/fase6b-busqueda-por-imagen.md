# Fase 6B · punto 3 — Búsqueda por imagen: NO implementada (y por qué)

La instrucción era: *«primero comprueba cuántos productos tienen imagen real accesible; si la mayoría la tiene,
implementa; si pocos, no la implementes y explícalo»*. Se comprobó y **no se implementó**.

## Medición (23-11-2026, productos activos de `menaje_db`)

Se pidió cada `foto_url` por HTTP (`curl -L`, 12 s de tiempo máximo, cabecera `User-Agent` de navegador).

| Categoría de producto | Cantidad | % de 38 |
|---|---:|---:|
| Sin `foto_url` (NULL) | 10 | 26 % |
| Con URL a un **marcador de posición** (`placehold.co/400x300?text=...`, un SVG con el nombre escrito) | 20 | 53 % |
| Con **foto real** accesible (HTTP 200, `image/webp` o `image/jpeg`) | 8 | 21 % |
| **Total de productos activos** | **38** | 100 % |

Las 8 fotos reales son los productos de id 1 a 8 (hospedadas en veana.com, falabella.com, mlstatic.com, plattotec.com,
arander.com, gstatic.com y cimaco.com.mx). Ninguna URL falló; la limitación no es de acceso sino de contenido.

## Por qué no se implementa

* Solo el **21 %** del catálogo tiene una imagen real; el criterio pedía «la mayoría».
* El **53 %** son SVG generados por un servicio que dibuja el nombre del producto: «buscar por imagen» sobre ellos
  compararía tipografía, no objetos, y daría resultados que parecen precisos y no lo son.
* Con 8 fotos reales, cualquier consulta por imagen sólo podría devolver esos 8 productos; el resto del catálogo
  quedaría invisible para la función. Para un cliente sería peor que no tenerla.
* Además, las fotos son URL externas de terceros (tiendas), que pueden cambiar o desaparecer: generar y guardar
  embeddings a partir de ellas sería frágil. `foto_url` no es un archivo propio del sistema (no hay subida de imágenes:
  el backend solo valida que empiece por `http(s)://`).

## Qué haría falta para activarla (cuando haya datos)

1. Subir fotos propias de al menos la mayoría de productos (hoy no existe flujo de subida de imágenes).
2. Modelo de imagen que comparta espacio vectorial con el texto: **CLIP multilingüe** de `sentence-transformers`
   (`clip-ViT-B-32` + `sentence-transformers/clip-ViT-B-32-multilingual-v1` para el texto en español). Comparte espacio
   texto-imagen de 512 dimensiones, funciona en CPU y ya está disponible con la dependencia `sentence-transformers`
   que el proyecto usa. (No sirve el modelo actual `multilingual-e5-small`: es solo de texto, 384 dim.)
3. Columna `productos.embedding_imagen vector(512)` con índice HNSW, `POST /busqueda-por-imagen` en FastAPI (con
   `X-IA-Token`), ruta Node con JWT + `multer` (ya es dependencia) limitando tamaño (p. ej. 2 MB) y tipo (JPEG/PNG/WebP),
   y un botón de subida junto a la caja de búsqueda del catálogo.

Para repetir la medición: `docker exec menaje_postgres psql -U postgres -d menaje_db -At -F'|' -c "select id,foto_url from productos where activo and foto_url is not null"` y `curl -sL -o /dev/null -w '%{http_code} %{content_type}' <url>` por cada fila.
