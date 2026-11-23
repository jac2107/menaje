// Pruebas de la logica del Panel IA (sin navegador): refresco tras reentrenar y aviso de modo degradado.
// Ejecutar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../frontend/assets/js/panel-ia-logica.js');

const t = (id, estado, tipo = 'reentrenar_pronostico') => ({ id, tipo, estado });

test('una tarea que pasa de en_curso a completada pide refrescar el estado', () => {
  const previos = L.estadosDe([t('a', 'en_curso')]);
  assert.equal(L.hayTareaTerminada(previos, [t('a', 'completada')]), true);
});

test('pendiente -> error tambien cuenta como terminada', () => {
  assert.equal(L.hayTareaTerminada(L.estadosDe([t('a', 'pendiente')]), [t('a', 'error')]), true);
});

test('sin cambios, o aun en curso, no refresca', () => {
  assert.equal(L.hayTareaTerminada(L.estadosDe([t('a', 'en_curso')]), [t('a', 'en_curso')]), false);
  assert.equal(L.hayTareaTerminada(L.estadosDe([t('a', 'completada')]), [t('a', 'completada')]), false);
  assert.equal(L.hayTareaTerminada({}, [t('a', 'completada')]), false); // primera carga de la pagina
});

test('pasar de pendiente a en_curso no cuenta como terminada', () => {
  assert.equal(L.hayTareaTerminada(L.estadosDe([t('a', 'pendiente')]), [t('a', 'en_curso')]), false);
});

test('el panel marca el modo degradado y nombra lo afectado', () => {
  const estado = {
    modo_degradado: true,
    componentes: { pronostico: { estado: 'degradado' }, redis: { estado: 'ok' }, gemini: { estado: 'caido' } }
  };
  const texto = L.avisoDegradado(estado, { pronostico: 'Modelo de pronóstico', gemini: 'Gemini' });
  assert.equal(texto, 'Afectado: Modelo de pronóstico.'); // gemini caido no es "degradado" del sistema
});

test('sin modo degradado no hay aviso (null)', () => {
  assert.equal(L.avisoDegradado({ modo_degradado: false, componentes: {} }, {}), null);
  assert.equal(L.avisoDegradado(null, {}), null);
});

// ── Fase 6B: riesgo de faltante y serie temporal ─────────────────────────────────
const FILAS = [
  { mes: '2026-01-01', categoria: 'Copa', unidades: 100, alquileres: 3, unidades_ejemplo: 100 },
  { mes: '2026-01-01', categoria: 'Plato', unidades: 50, alquileres: 3, unidades_ejemplo: 50 },
  { mes: '2026-02-01', categoria: 'Copa', unidades: 200, alquileres: 5, unidades_ejemplo: 0 }
];

test('riesgoPorCategoria indexa por categoria y tolera respuesta nula', () => {
  const r = L.riesgoPorCategoria({ categorias: [{ categoria: 'Copa', semaforo: 'justo' }] });
  assert.equal(r.Copa.semaforo, 'justo');
  assert.deepEqual(L.riesgoPorCategoria(null), {});
});

test('los tres semaforos de riesgo tienen texto y color distintos', () => {
  assert.deepEqual(Object.keys(L.RIESGO), ['alcanza', 'justo', 'faltara']);
  assert.equal(new Set(Object.values(L.RIESGO).map(s => s.color)).size, 3);
  assert.equal(L.RIESGO.faltara.texto, 'Faltará');
});

test('agruparSerie ordena meses, categorias y calcula el maximo apilado', () => {
  const g = L.agruparSerie(FILAS);
  assert.deepEqual(g.meses, ['2026-01-01', '2026-02-01']);
  assert.deepEqual(g.categorias, ['Copa', 'Plato']);
  assert.equal(g.valor['2026-01-01'].Plato, 50);
  assert.equal(g.maximo, 200);
});

test('svgSerieDemanda dibuja un segmento por valor con su titulo, y vacio sin datos', () => {
  const svg = L.svgSerieDemanda(FILAS);
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<rect /g) || []).length, 3);
  assert.match(svg, /<title>ene 26 · Copa: 100 unid\.<\/title>/);
  assert.equal(L.svgSerieDemanda([]), '');
});

test('svgSerieDemanda escapa el texto que viene de la API', () => {
  const svg = L.svgSerieDemanda([{ mes: '2026-01-01', categoria: '<img onerror=x>', unidades: 5, alquileres: 1, unidades_ejemplo: 0 }]);
  assert.ok(!svg.includes('<img'));
  assert.ok(svg.includes('&lt;img'));
});

test('la leyenda usa el mismo orden y colores distintos por categoria', () => {
  const l = L.leyendaSerie(FILAS);
  assert.deepEqual(l.map(x => x.categoria), ['Copa', 'Plato']);
  assert.notEqual(l[0].color, l[1].color);
});
