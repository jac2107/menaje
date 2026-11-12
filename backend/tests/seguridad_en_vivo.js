// Comprobaciones de seguridad contra servidores REALES levantados (no forma parte de `npm test`).
//   node tests/seguridad_en_vivo.js <url_node> <url_fastapi> <jwt_dueno> <jwt_cliente> <x_ia_token>
// Imprime un informe; no escribe secretos.
const [nodeUrl, iaUrl, jwtDueno, jwtCliente, iaToken] = process.argv.slice(2);
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const ORIGEN_OK = process.env.CORS_ORIGIN;
const ORIGEN_MALO = 'http://sitio-malicioso.example';

const filas = [];
const reg = (nombre, esperado, obtenido, ok) => {
  filas.push(`${ok ? 'PASA ' : 'FALLA'}  ${nombre}\n        esperado: ${esperado} | obtenido: ${obtenido}`);
};
const post = (url, headers, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

(async () => {
  // --- autenticacion y rol ---
  const rutas = [['GET', '/api/ia/estado'], ['GET', '/api/ia/tareas'], ['POST', '/api/ia/tareas'],
    ['POST', '/api/ia/pronostico-demanda']];
  for (const [m, r] of rutas) {
    const sin = await fetch(nodeUrl + r, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined });
    reg(`${m} ${r} sin token`, 401, sin.status, sin.status === 401);
    const cli = await fetch(nodeUrl + r, { method: m, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwtCliente}` }, body: m === 'POST' ? '{}' : undefined });
    reg(`${m} ${r} con rol cliente`, 403, cli.status, cli.status === 403);
  }
  const ia401 = await post(iaUrl + '/busqueda-semantica', {}, { descripcion: 'copas' });
  reg('FastAPI POST /busqueda-semantica sin X-IA-Token', 401, ia401.status, ia401.status === 401);
  const ia401b = await post(iaUrl + '/busqueda-semantica', { 'X-IA-Token': 'x'.repeat(40) }, { descripcion: 'copas' });
  reg('FastAPI con X-IA-Token incorrecto', 401, ia401b.status, ia401b.status === 401);

  // --- CORS ---
  const pre = (origen) => fetch(nodeUrl + '/api/ia/estado', { method: 'OPTIONS', headers: { Origin: origen, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
  const ok = await pre(ORIGEN_OK);
  reg(`CORS Node: origen permitido (${ORIGEN_OK})`, `Allow-Origin = ${ORIGEN_OK}`, ok.headers.get('access-control-allow-origin'), ok.headers.get('access-control-allow-origin') === ORIGEN_OK);
  const mal = await pre(ORIGEN_MALO);
  const acao = mal.headers.get('access-control-allow-origin');
  reg('CORS Node: origen ajeno no se refleja ni se permite con *', `distinto de ${ORIGEN_MALO} y de *`, acao ?? 'ausente', acao !== ORIGEN_MALO && acao !== '*');
  reg('CORS Node: X-IA-Token no permitido desde navegador', 'no aparece en Allow-Headers', ok.headers.get('access-control-allow-headers'), !(ok.headers.get('access-control-allow-headers') || '').toLowerCase().includes('x-ia-token'));
  const iaPre = await fetch(iaUrl + '/estado', { method: 'OPTIONS', headers: { Origin: ORIGEN_MALO, 'Access-Control-Request-Method': 'GET' } });
  reg('CORS FastAPI: sin CORS (solo lo consume Node)', 'sin Allow-Origin', iaPre.headers.get('access-control-allow-origin') ?? 'ausente', iaPre.headers.get('access-control-allow-origin') === null);

  // --- rate limiting (proceso de Node con RATE_LIMIT_IA=5, el valor por defecto del codigo) ---
  const codigos = [];
  for (let i = 0; i < 8; i++) {
    const r = await post(nodeUrl + '/api/ia/busqueda-semantica', { Authorization: `Bearer ${jwtDueno}` }, { descripcion: 'copas para brindar' });
    codigos.push(r.status);
  }
  const bloqueadas = codigos.filter((c) => c === 429).length;
  reg('Rate limit /api/ia/busqueda-semantica (limite 5/min por usuario)', '5x200 y luego 429', codigos.join(','), codigos.slice(0, 5).every((c) => c === 200) && bloqueadas === 3);
  const otro = await post(nodeUrl + '/api/ia/busqueda-semantica', { Authorization: `Bearer ${jwtCliente}` }, { descripcion: 'copas para brindar' });
  reg('Rate limit es por usuario (otro usuario sigue entrando)', 200, otro.status, otro.status === 200);

  console.log(filas.join('\n'));
  const fallas = filas.filter((f) => f.startsWith('FALLA')).length;
  console.log(`\nResumen: ${filas.length - fallas}/${filas.length} comprobaciones pasan`);
  process.exit(fallas ? 1 : 0);
})();
