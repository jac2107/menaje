#!/bin/sh
# Uso: TOKEN=<jwt> BASE=http://localhost:3000 sh probar_busqueda.sh > resultados_busqueda_semantica.json
BASE=${BASE:-http://localhost:3000}
for q in "manteles para casamiento" "copas para brindar con champagne" "sillas para una fiesta infantil" "vajilla elegante para cena" "algo para mantener la comida caliente en un buffet"; do
  printf '%s\n' "### $q"
  curl -s -X POST "$BASE/api/ia/busqueda-semantica" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' -d "{\"descripcion\":\"$q\",\"limite\":5}"
  printf '\n'
done
