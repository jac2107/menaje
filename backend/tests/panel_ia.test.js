// Pruebas de seguridad y de las rutas del panel IA (Fase 4). Sin Redis, sin
// FastAPI ni Gemini: axios se sustituye por un doble. Ejecutar: npm test
process.env.JWT_SECRET = 'secreto-de-prueba';
process.env.IA_SERVICE_TOKEN = 't'.repeat(40);
process.env.PYTHON_IA_URL = 'http://ia.invalida.test';
process.env.CORS_ORIGIN = 'http://panel.test';
process.env.RATE_LIMIT_IA = '3';
process.env.RATE_LIMIT_PANEL_IA = '4';
for (const k of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD']) process.env[k] = process.env[k] || 'x';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const app = require('../server');

let server, base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

let seq = 1000;
const nuevoId = () => ++seq; // cada prueba usa su propio usuario: el limite es por usuario
const tokenDe = (rol, id = nuevoId()) => jwt.sign({ id, rol }, process.env.JWT_SECRET);

async function llamar(metodo, ruta, { token, cuerpo, headers = {} } = {}) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: res.status, json, headers: res.headers };
}

// Doble de FastAPI: guarda las llamadas y responde segun `respuesta`.
let llamadas, respuesta;
function falsearFastAPI(fn) {
  llamadas = [];
  respuesta = fn;
  axios.request = async (cfg) => { llamadas.push(cfg); return respuesta(cfg); };
  axios.post = async (url, data, cfg) => { llamadas.push({ url, data, ...cfg }); return respuesta({ url, data }); };
}
const ok = (data, status = 200) => ({ status, data });
const falla = (status, detail) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail } } });

const ID_TAREA = 'a'.repeat(32);
const RUTAS = [
  ['GET', '/api/ia/estado'],
  ['GET', '/api/ia/tareas'],
  ['GET', `/api/ia/tareas/${ID_TAREA}`],
  ['POST', '/api/ia/tareas', { tipo: 'reentrenar_pronostico' }],
  ['POST', '/api/ia/pronostico-demanda', { tipo_evento: 'boda', mes: 12, asistentes: 100 }]
];

test('sin token -> 401 y no se llama a FastAPI', async () => {
  falsearFastAPI(() => ok({}));
  for (const [m, ruta, cuerpo] of RUTAS) {
    const r = await llamar(m, ruta, { cuerpo });
    assert.equal(r.status, 401, `${m} ${ruta}`);
  }
  assert.equal(llamadas.length, 0);
});

test('token inválido o firmado con otro secreto -> 401', async () => {
  falsearFastAPI(() => ok({}));
  for (const token of ['basura', jwt.sign({ id: 1, rol: 'dueno' }, 'otro-secreto')]) {
    const r = await llamar('GET', '/api/ia/estado', { token });
    assert.equal(r.status, 401);
  }
});

test('roles cliente y trabajador -> 403 y no se llama a FastAPI', async () => {
  falsearFastAPI(() => ok({}));
  for (const rol of ['cliente', 'trabajador']) {
    for (const [m, ruta, cuerpo] of RUTAS) {
      const r = await llamar(m, ruta, { token: tokenDe(rol), cuerpo });
      assert.equal(r.status, 403, `${rol} ${m} ${ruta}`);
    }
  }
  assert.equal(llamadas.length, 0);
});

test('dueño: estado reenvía a FastAPI con X-IA-Token interno', async () => {
  falsearFastAPI(() => ok({ estado_general: 'ok', modo_degradado: false, componentes: {} }));
  const r = await llamar('GET', '/api/ia/estado', { token: tokenDe('dueno') });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.estado_general, 'ok');
  assert.equal(llamadas[0].headers['X-IA-Token'], process.env.IA_SERVICE_TOKEN);
  assert.ok(llamadas[0].url.endsWith('/estado'));
});

test('estado: si FastAPI no responde, 200 con modo degradado (no 5xx)', async () => {
  falsearFastAPI(() => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); });
  const r = await llamar('GET', '/api/ia/estado', { token: tokenDe('dueno') });
  assert.equal(r.status, 200);
  assert.equal(r.json.data.modo_degradado, true);
  assert.equal(r.json.data.componentes.ia_servicio.estado, 'caido');
});

test('tareas: crea (202), valida tipo, propaga 409 y enmascara 5xx', async () => {
  const dueno = tokenDe('dueno');
  falsearFastAPI(() => ok({ id: ID_TAREA, estado: 'pendiente' }, 202));
  let r = await llamar('POST', '/api/ia/tareas', { token: dueno, cuerpo: { tipo: 'regenerar_embeddings' } });
  assert.equal(r.status, 202);
  assert.equal(llamadas[0].data.tipo, 'regenerar_embeddings');

  r = await llamar('POST', '/api/ia/tareas', { token: dueno, cuerpo: { tipo: 'rm -rf /' } });
  assert.equal(r.status, 400);

  falsearFastAPI(() => { throw falla(409, 'Ya hay una tarea en curso'); });
  r = await llamar('POST', '/api/ia/tareas', { token: tokenDe('dueno'), cuerpo: { tipo: 'regenerar_embeddings' } });
  assert.equal(r.status, 409);

  falsearFastAPI(() => { throw falla(500, 'Traceback secreto con rutas internas'); });
  r = await llamar('POST', '/api/ia/tareas', { token: tokenDe('dueno'), cuerpo: { tipo: 'regenerar_embeddings' } });
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.json).includes('Traceback'));
});

test('tareas/:id: valida el formato del id (no llega a FastAPI) y consulta', async () => {
  const dueno = tokenDe('dueno');
  falsearFastAPI(() => ok({ id: ID_TAREA, estado: 'en_curso' }));
  let r = await llamar('GET', '/api/ia/tareas/..%2F..%2Fsalud', { token: dueno });
  assert.equal(r.status, 400);
  assert.equal(llamadas.length, 0);
  r = await llamar('GET', `/api/ia/tareas/${ID_TAREA}`, { token: dueno });
  assert.equal(r.json.data.estado, 'en_curso');
  falsearFastAPI(() => { throw falla(404, 'Tarea no encontrada'); });
  r = await llamar('GET', `/api/ia/tareas/${ID_TAREA}`, { token: dueno });
  assert.equal(r.status, 404);
});

test('pronóstico: valida entradas en Node antes de reenviar', async () => {
  falsearFastAPI(() => ok({ modo: 'modelo' }));
  const dueno = tokenDe('dueno');
  for (const cuerpo of [{ tipo_evento: 'x', mes: 1, asistentes: 5 }, { tipo_evento: 'boda', mes: 13, asistentes: 5 },
    { tipo_evento: 'boda', mes: 1, asistentes: 0 }]) {
    const r = await llamar('POST', '/api/ia/pronostico-demanda', { token: dueno, cuerpo });
    assert.equal(r.status, 400);
  }
  assert.equal(llamadas.length, 0);
});

test('CORS sigue activo: solo el origen configurado recibe Access-Control-Allow-Origin', async () => {
  falsearFastAPI(() => ok({}));
  const permitido = await llamar('OPTIONS', '/api/ia/estado', {
    headers: { Origin: 'http://panel.test', 'Access-Control-Request-Method': 'GET' }
  });
  assert.equal(permitido.headers.get('access-control-allow-origin'), 'http://panel.test');
  const ajeno = await llamar('OPTIONS', '/api/ia/estado', {
    headers: { Origin: 'http://malicioso.test', 'Access-Control-Request-Method': 'GET' }
  });
  assert.notEqual(ajeno.headers.get('access-control-allow-origin'), 'http://malicioso.test');
  // X-IA-Token no es una cabecera permitida desde el navegador
  assert.ok(!(permitido.headers.get('access-control-allow-headers') || '').toLowerCase().includes('x-ia-token'));
});

test('rate limiting sigue activo: acciones -> 429 tras RATE_LIMIT_IA; lecturas -> 429 tras RATE_LIMIT_PANEL_IA', async () => {
  falsearFastAPI(() => ok({ id: ID_TAREA, estado: 'pendiente' }, 202));
  const dueno = tokenDe('dueno');
  const cuerpo = { tipo: 'regenerar_embeddings' };
  const estados = [];
  for (let i = 0; i < 5; i++) estados.push((await llamar('POST', '/api/ia/tareas', { token: dueno, cuerpo })).status);
  assert.deepEqual(estados, [202, 202, 202, 429, 429]);

  falsearFastAPI(() => ok({ estado_general: 'ok', componentes: {} }));
  const lecturas = [];
  const dueno2 = tokenDe('dueno');
  for (let i = 0; i < 6; i++) lecturas.push((await llamar('GET', '/api/ia/estado', { token: dueno2 })).status);
  assert.deepEqual(lecturas, [200, 200, 200, 200, 429, 429]);
  // el limite es por usuario: otro dueño no queda bloqueado
  assert.equal((await llamar('GET', '/api/ia/estado', { token: tokenDe('dueno') })).status, 200);
});

test('Opción 1 intacta: con FastAPI caído el chat responde su error controlado de siempre', async () => {
  falsearFastAPI(() => { throw Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }); });
  const r = await llamar('POST', '/api/ia/chat', { token: tokenDe('cliente'), cuerpo: { mensaje: 'hola' } });
  assert.equal(r.status, 500); // comportamiento previo de la ruta, no se modifico
  assert.equal(r.json.success, false);
  assert.equal(r.json.error, 'No se pudo conectar al servicio de IA. Intenta de nuevo.');
});
