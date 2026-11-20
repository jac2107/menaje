// Pruebas de la Fase 6A (Node): limite propio de la busqueda semantica y cola de embeddings
// al crear/editar productos. Sin FastAPI ni PostgreSQL: axios y db.query se sustituyen.
// La prueba de la cola contra Redis real se omite si Redis no responde. Ejecutar: npm test
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.IA_SERVICE_TOKEN = 't'.repeat(40);
process.env.PYTHON_IA_URL = 'http://ia.invalida.test';
process.env.CORS_ORIGIN = 'http://panel.test';
process.env.RATE_LIMIT_IA = '3';
process.env.RATE_LIMIT_BUSQUEDA = '2';
process.env.REDIS_URL = 'redis://127.0.0.1:1'; // puerto cerrado: "Redis caido" salvo que una prueba lo cambie
for (const k of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) process.env[k] = process.env[k] || 'x';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const db = require('../config/db');
const cola = require('../services/colaEmbeddings');
const app = require('../server');

let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { await cola.cerrar(); server.close(); });

let seq = 5000;
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
  return { status: res.status, json };
}

const falsearFastAPI = (fn) => {
  axios.request = async (cfg) => fn(cfg);
  axios.post = async (url, data) => fn({ url, data });
};
const ok = (data, status = 200) => ({ status, data });

// ── Limite propio de la busqueda semantica ──────────────────────────────────────────
test('busqueda semantica: 429 tras RATE_LIMIT_BUSQUEDA (2), independiente del limite del chat (3)', async () => {
  falsearFastAPI(() => ok({ resultados: [] }));
  const cuerpo = { descripcion: 'copas para brindar' };
  const u = tokenDe('cliente');
  const estados = [];
  for (let i = 0; i < 3; i++) estados.push((await llamar('POST', '/api/ia/busqueda-semantica', { token: u, cuerpo })).status);
  assert.deepEqual(estados, [200, 200, 429]);
});

test('buscar no gasta la cuota del chat', async () => {
  falsearFastAPI(() => ok({ resultados: [] }));
  const u = tokenDe('cliente');
  for (let i = 0; i < 3; i++) await llamar('POST', '/api/ia/busqueda-semantica', { token: u, cuerpo: { descripcion: 'platos blancos' } });
  // busqueda agotada; el chat (limite 3) sigue disponible: ninguna de sus 3 peticiones es 429
  falsearFastAPI(() => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); });
  const chat = [];
  for (let i = 0; i < 4; i++) chat.push((await llamar('POST', '/api/ia/chat', { token: u, cuerpo: { mensaje: 'hola' } })).status);
  assert.deepEqual(chat.map((s) => s === 429), [false, false, false, true]);
});

test('el chat no gasta la cuota de busqueda', async () => {
  falsearFastAPI(() => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); });
  const u = tokenDe('cliente');
  for (let i = 0; i < 4; i++) await llamar('POST', '/api/ia/chat', { token: u, cuerpo: { mensaje: 'hola' } });
  falsearFastAPI(() => ok({ resultados: [] }));
  const r = await llamar('POST', '/api/ia/busqueda-semantica', { token: u, cuerpo: { descripcion: 'vasos altos' } });
  assert.equal(r.status, 200);
});

// ── Cola de embeddings al crear/editar productos ────────────────────────────────────
function espiarCola(devuelve = true) {
  const llamadas = [];
  cola.encolarEmbeddingProducto = async (id) => { llamadas.push(id); return devuelve; };
  return llamadas;
}
const NUEVO = { nombre: 'Copa de prueba', categoria_id: 1, precio_unidad: 2.5 };

test('crear producto encola la regeneracion de su embedding', async () => {
  const original = cola.encolarEmbeddingProducto;
  const llamadas = espiarCola();
  db.query = async () => ({ rows: [{ id: 77, nombre: 'Copa de prueba' }] });
  const r = await llamar('POST', '/api/productos', { token: tokenDe('dueno'), cuerpo: NUEVO });
  assert.equal(r.status, 201);
  assert.deepEqual(llamadas, [77]);
  cola.encolarEmbeddingProducto = original;
});

test('crear producto con Redis caido: se guarda igual (201) y se registra el aviso', async () => {
  const avisos = [];
  const warn = console.warn;
  console.warn = (...a) => avisos.push(a.join(' '));
  try {
    db.query = async () => ({ rows: [{ id: 78, nombre: 'Copa de prueba' }] });
    const t0 = Date.now();
    const r = await llamar('POST', '/api/productos', { token: tokenDe('dueno'), cuerpo: NUEVO });
    assert.equal(r.status, 201);
    assert.equal(r.json.id, 78);
    assert.ok(Date.now() - t0 < 1000, 'el guardado no espera a Redis');
    for (let i = 0; i < 40 && !avisos.length; i++) await new Promise((res) => setTimeout(res, 100));
    assert.ok(avisos.some((a) => a.includes('producto 78') && a.includes('se guardó igual')), avisos.join('|'));
  } finally { console.warn = warn; }
});

test('editar producto: encola si cambia el texto, no si solo cambia el precio; solo dueño', async () => {
  const original = cola.encolarEmbeddingProducto;
  const llamadas = espiarCola();
  db.query = async () => ({ rows: [{ id: 5 }] });
  const dueno = tokenDe('dueno');
  let r = await llamar('PATCH', '/api/productos/5', { token: dueno, cuerpo: { nombre: 'Copa nueva' } });
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, [5]);
  r = await llamar('PATCH', '/api/productos/5', { token: dueno, cuerpo: { precio_unidad: 3 } });
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, [5], 'cambiar solo el precio no regenera el embedding');

  r = await llamar('PATCH', '/api/productos/5', { token: tokenDe('trabajador'), cuerpo: { nombre: 'x' } });
  assert.equal(r.status, 403);
  r = await llamar('PATCH', '/api/productos/5', { token: dueno, cuerpo: { nombre: '<script>' } });
  assert.equal(r.status, 400);
  r = await llamar('PATCH', '/api/productos/5', { token: dueno, cuerpo: {} });
  assert.equal(r.status, 400);
  db.query = async () => ({ rows: [] });
  r = await llamar('PATCH', '/api/productos/999', { token: dueno, cuerpo: { nombre: 'x' } });
  assert.equal(r.status, 404);
  assert.deepEqual(llamadas, [5]);
  cola.encolarEmbeddingProducto = original;
});

test('colaEmbeddings contra Redis real: anota el id en el SET (se omite si Redis no responde)', async (t) => {
  const { createClient } = require('redis');
  const url = 'redis://localhost:6379/0';
  const lector = createClient({ url, socket: { connectTimeout: 1000, reconnectStrategy: false } });
  lector.on('error', () => {});
  try { await lector.connect(); } catch { return t.skip('Redis no responde'); }
  const ID = 987654;
  try {
    process.env.REDIS_URL = url;
    await cola.cerrar();
    assert.equal(await cola.encolarEmbeddingProducto(ID), true);
    assert.equal(await lector.sIsMember(cola.CLAVE, String(ID)), true);
    await cola.encolarEmbeddingProducto(ID); // repetir no duplica (es un SET)
    assert.equal(await lector.sCard(cola.CLAVE) >= 1, true);
  } finally {
    await lector.sRem(cola.CLAVE, String(ID));
    await lector.disconnect();
    await cola.cerrar();
    process.env.REDIS_URL = 'redis://127.0.0.1:1';
  }
});
