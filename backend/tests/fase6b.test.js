// Pruebas de la Fase 6B (Node): rutas de productos similares, riesgo de faltante, serie temporal y
// metricas de uso. Sin FastAPI ni PostgreSQL: axios se sustituye por un doble. Ejecutar: npm test
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.IA_SERVICE_TOKEN = 't'.repeat(40);
process.env.PYTHON_IA_URL = 'http://ia.invalida.test';
process.env.CORS_ORIGIN = 'http://panel.test';
process.env.REDIS_URL = 'redis://127.0.0.1:1';
for (const k of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) process.env[k] = process.env[k] || 'x';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const cola = require('../services/colaEmbeddings');
const app = require('../server');

let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await cola.cerrar(); server.close(); });

let seq = 9000;
const tokenDe = (rol, id = ++seq) => jwt.sign({ id, rol }, process.env.JWT_SECRET);

async function llamar(metodo, ruta, { token, cuerpo } = {}) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: res.status, json, headers: res.headers };
}

let llamadas;
function falsearFastAPI(fn) {
  llamadas = [];
  axios.request = async (cfg) => { llamadas.push(cfg); return fn(cfg); };
}
const ok = (data, status = 200) => ({ status, data });
const falla = (status, detail) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail } } });

// ── Productos similares (cliente) ────────────────────────────────────────────────
test('productos similares: exige JWT', async () => {
  falsearFastAPI(() => ok({ resultados: [] }));
  assert.equal((await llamar('GET', '/api/ia/productos-similares/3')).status, 401);
  assert.equal(llamadas.length, 0);
});

test('productos similares: reenvia a FastAPI con X-IA-Token y limite por defecto 4', async () => {
  falsearFastAPI(() => ok({ resultados: [{ id: 4, nombre: 'Copa', similitud: 0.9 }] }));
  const r = await llamar('GET', '/api/ia/productos-similares/3', { token: tokenDe('cliente') });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.resultados[0].id, 4);
  assert.equal(llamadas[0].url, 'http://ia.invalida.test/productos-similares/3?limite=4');
  assert.equal(llamadas[0].headers['X-IA-Token'], process.env.IA_SERVICE_TOKEN);
});

test('productos similares: valida id y limite antes de llamar a FastAPI', async () => {
  falsearFastAPI(() => ok({ resultados: [] }));
  const t = tokenDe('cliente');
  for (const ruta of ['/api/ia/productos-similares/abc', '/api/ia/productos-similares/0',
    '/api/ia/productos-similares/-1', '/api/ia/productos-similares/3?limite=0',
    '/api/ia/productos-similares/3?limite=13', '/api/ia/productos-similares/3?limite=x']) {
    assert.equal((await llamar('GET', ruta, { token: t })).status, 400, ruta);
  }
  assert.equal(llamadas.length, 0);
});

test('productos similares: 404 del producto se conserva y FastAPI caido da 503', async () => {
  const t = tokenDe('cliente');
  falsearFastAPI(() => { throw falla(404, 'Producto no encontrado'); });
  const r404 = await llamar('GET', '/api/ia/productos-similares/999', { token: t });
  assert.equal(r404.status, 404);
  assert.equal(r404.json.error, 'Producto no encontrado');
  falsearFastAPI(() => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); });
  assert.equal((await llamar('GET', '/api/ia/productos-similares/3', { token: t })).status, 503);
});

// ── Rutas del panel (solo dueño) ─────────────────────────────────────────────────
const CUERPO = { tipo_evento: 'boda', mes: 12, asistentes: 150 };
const RUTAS_PANEL = [
  ['POST', '/api/ia/riesgo-faltante', CUERPO],
  ['GET', '/api/ia/serie-demanda'],
  ['GET', '/api/ia/metricas-uso']
];

test('rutas del panel: 401 sin token y 403 para cliente y trabajador', async () => {
  falsearFastAPI(() => ok({}));
  for (const [m, ruta, cuerpo] of RUTAS_PANEL) {
    assert.equal((await llamar(m, ruta, { cuerpo })).status, 401, `${m} ${ruta}`);
    for (const rol of ['cliente', 'trabajador']) {
      assert.equal((await llamar(m, ruta, { token: tokenDe(rol), cuerpo })).status, 403, `${rol} ${ruta}`);
    }
  }
  assert.equal(llamadas.length, 0, 'ninguna llegó a FastAPI');
});

test('riesgo de faltante: valida el cuerpo y reenvia', async () => {
  const t = tokenDe('dueno');
  falsearFastAPI(() => ok({ categorias: [{ categoria: 'Copa', semaforo: 'justo' }] }));
  const r = await llamar('POST', '/api/ia/riesgo-faltante', { token: t, cuerpo: CUERPO });
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas[0].data, CUERPO);
  assert.equal(llamadas[0].url, 'http://ia.invalida.test/riesgo-faltante');
  for (const malo of [{ ...CUERPO, tipo_evento: 'fiesta' }, { ...CUERPO, mes: 13 },
    { ...CUERPO, asistentes: 0 }, { ...CUERPO, asistentes: '5' }]) {
    assert.equal((await llamar('POST', '/api/ia/riesgo-faltante', { token: t, cuerpo: malo })).status, 400);
  }
  assert.equal(llamadas.length, 1);
});

test('serie de demanda: valida "meses", reenvia y no se cachea', async () => {
  const t = tokenDe('dueno');
  falsearFastAPI(() => ok({ filas: [], tendencia: { alerta: false } }));
  const r = await llamar('GET', '/api/ia/serie-demanda?meses=6', { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(llamadas[0].url, 'http://ia.invalida.test/serie-demanda?meses=6');
  assert.equal((await llamar('GET', '/api/ia/serie-demanda', { token: t })).status, 200);
  assert.match(llamadas[1].url, /meses=12$/);
  for (const m of ['0', '37', 'x']) {
    assert.equal((await llamar('GET', `/api/ia/serie-demanda?meses=${m}`, { token: t })).status, 400, m);
  }
});

test('metricas de uso: valida "dias" y reenvia', async () => {
  const t = tokenDe('dueno');
  falsearFastAPI(() => ok({ por_dia: [], totales: {} }));
  assert.equal((await llamar('GET', '/api/ia/metricas-uso?dias=30', { token: t })).status, 200);
  assert.equal(llamadas[0].url, 'http://ia.invalida.test/metricas-uso?dias=30');
  for (const d of ['0', '91', 'abc']) {
    assert.equal((await llamar('GET', `/api/ia/metricas-uso?dias=${d}`, { token: t })).status, 400, d);
  }
});

test('rutas del panel: con FastAPI caido responden 503 controlado, sin filtrar detalles', async () => {
  const t = tokenDe('dueno');
  falsearFastAPI(() => { throw falla(500, 'Traceback secreto en /srv/app'); });
  for (const [m, ruta, cuerpo] of RUTAS_PANEL) {
    const r = await llamar(m, ruta, { token: t, cuerpo });
    assert.equal(r.status, 503, ruta);
    assert.ok(!JSON.stringify(r.json).includes('Traceback'), 'no se filtra el detalle interno');
  }
});
