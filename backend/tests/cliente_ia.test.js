// Pruebas de la logica del cliente (Fase 6B): pasos de espera, sugerencias y dictado por voz.
// El navegador real no interviene: la API de reconocimiento de voz se sustituye por un doble.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../frontend/assets/js/cliente-ia.js');

test('el indicador de espera avanza por pasos con el tiempo', () => {
  const textos = [0, 1000, 1500, 4000, 12000, 30000, 120000].map(C.pasoEspera);
  assert.equal(textos[0], 'Entendiendo tu pregunta…');
  assert.equal(textos[1], textos[0]);
  assert.equal(textos[2], 'Buscando en el catálogo…');
  assert.equal(textos[3], 'Consultando al asistente…');
  assert.equal(textos[4], 'Preparando la respuesta…');
  assert.match(textos[5], /tardando más de lo normal/);
  assert.equal(textos[6], textos[5]);
  assert.equal(new Set(textos).size, 5, 'cinco pasos distintos');
});

test('los pasos estan ordenados por tiempo y empiezan en 0', () => {
  const t = C.PASOS_ESPERA.map(p => p[0]);
  assert.equal(t[0], 0);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
});

test('hay sugerencias de busqueda y de chat, sin repetidas ni vacias', () => {
  for (const lista of [C.SUGERENCIAS_BUSQUEDA, C.SUGERENCIAS_CHAT]) {
    assert.ok(lista.length >= 3);
    assert.equal(new Set(lista).size, lista.length);
    assert.ok(lista.every(s => s.trim().length >= 2 && s.length <= 500));
  }
});

test('mensajeSobreProducto limpia espacios y acota la longitud', () => {
  assert.equal(C.mensajeSobreProducto('  Copa   de  Cristal '), '¿Me cuentas más sobre Copa de Cristal?');
  assert.ok(C.mensajeSobreProducto('x'.repeat(500)).length < 120);
});

// --- Dictado por voz ---
class ReconocimientoFalso {
  static ultimo = null;
  constructor() { ReconocimientoFalso.ultimo = this; this.iniciado = false; }
  start() { this.iniciado = true; }
  stop() { this.iniciado = false; this.onend && this.onend(); }
}
const resultado = (...partes) => ({ results: partes.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f })) });

test('sin soporte del navegador el dictado es null (la interfaz oculta el boton)', () => {
  assert.equal(C.crearDictado(undefined), null);
});

test('el dictado configura espanol, resultados parciales y entrega el texto', () => {
  const d = C.crearDictado(ReconocimientoFalso, 'es-PE');
  const recibido = [];
  let fin = 0;
  d.iniciar({ onTexto: (t, f) => recibido.push([t, f]), onFin: () => { fin++; } });
  const r = ReconocimientoFalso.ultimo;
  assert.equal(r.lang, 'es-PE');
  assert.equal(r.interimResults, true);
  assert.equal(r.iniciado, true);
  assert.equal(d.activo, true);
  r.onresult(resultado(['copas para', false]));
  r.onresult(resultado(['copas para ', true], ['una boda', true]));
  assert.deepEqual(recibido, [['copas para', false], ['copas para una boda', true]]);
  d.detener();
  assert.equal(fin, 1);
  assert.equal(d.activo, false);
});

test('iniciar dos veces no crea otro reconocimiento mientras hay uno activo', () => {
  const d = C.crearDictado(ReconocimientoFalso);
  d.iniciar({});
  const primero = ReconocimientoFalso.ultimo;
  d.iniciar({});
  assert.equal(ReconocimientoFalso.ultimo, primero);
});

test('un error del navegador se informa y los mensajes para el usuario son claros', () => {
  const d = C.crearDictado(ReconocimientoFalso);
  let codigo;
  d.iniciar({ onError: (c) => { codigo = c; } });
  ReconocimientoFalso.ultimo.onerror({ error: 'not-allowed' });
  assert.equal(codigo, 'not-allowed');
  assert.match(C.mensajeErrorDictado('not-allowed'), /micrófono/);
  assert.match(C.mensajeErrorDictado('no-speech'), /no se oyó/i);
  assert.match(C.mensajeErrorDictado('network'), /conexión/);
  assert.match(C.mensajeErrorDictado('otra-cosa'), /No se pudo/);
});

test('si start() lanza, el dictado no queda atascado como activo', () => {
  class Roto extends ReconocimientoFalso { start() { throw new Error('ya iniciado'); } }
  const d = C.crearDictado(Roto);
  let codigo;
  d.iniciar({ onError: (c) => { codigo = c; } });
  assert.equal(d.activo, false);
  assert.equal(codigo, 'no-iniciado');
});
