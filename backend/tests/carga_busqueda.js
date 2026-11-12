// Prueba de carga de la busqueda semantica: N peticiones SEGUIDAS (una tras otra) y latencia
// media / p50 / p95 / maxima. No forma parte de `npm test` (necesita servidores levantados).
//
//   node tests/carga_busqueda.js <url_base> <ruta> <n> [token_jwt | token_ia]
//   Via Node:    node tests/carga_busqueda.js http://localhost:3918 /api/ia/busqueda-semantica 50 <JWT>
//   FastAPI:     node tests/carga_busqueda.js http://127.0.0.1:8000 /busqueda-semantica 50 <X-IA-Token> ia
const [base, ruta, nStr, credencial, modo] = process.argv.slice(2);
const N = Number(nStr) || 50;

const CONSULTAS = [
  'copas para brindar con champagne en un matrimonio', 'copa para servir vino tinto',
  'cubiertos dorados para una cena de gala', 'tenedor de acero inoxidable para la mesa',
  'platos desechables para una fiesta grande', 'vasos pequeños para servir tequila',
  'vaso ancho para tomar whisky con hielo', 'mantel dorado brillante', 'mantel de yute estilo campestre',
  'mantel blanco elegante para mesa redonda', 'plato pequeño para servir el postre',
  'mesa redonda para ocho personas', 'recipiente para enfriar bebidas con hielo',
  'jarra grande de cristal para servir agua', 'porta servilletas de metal'
];

const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];

(async () => {
  const headers = { 'Content-Type': 'application/json' };
  if (modo === 'ia') headers['X-IA-Token'] = credencial;
  else headers.Authorization = `Bearer ${credencial}`;

  const lat = [];
  const estados = {};
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const res = await fetch(base + ruta, {
      method: 'POST', headers,
      body: JSON.stringify({ descripcion: CONSULTAS[i % CONSULTAS.length], limite: 5 })
    });
    await res.arrayBuffer();
    lat.push(performance.now() - t0);
    estados[res.status] = (estados[res.status] || 0) + 1;
  }
  const primera = lat[0];
  const resto = lat.slice(1).sort((a, b) => a - b); // la 1.ª incluye cargar el modelo de embeddings
  const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const f = (x) => x.toFixed(1);
  console.log(`Destino: ${base}${ruta} | peticiones seguidas: ${N} | codigos HTTP: ${JSON.stringify(estados)}`);
  console.log(`Primera peticion (incluye carga en frio): ${f(primera)} ms`);
  console.log(`Las ${resto.length} restantes -> media ${f(media(resto))} ms | p50 ${f(pct(resto, 50))} ms | p95 ${f(pct(resto, 95))} ms | max ${f(resto[resto.length - 1])} ms`);
  const todas = [...lat].sort((a, b) => a - b);
  console.log(`Las ${N} (con la primera) -> media ${f(media(todas))} ms | p95 ${f(pct(todas, 95))} ms`);
})();
