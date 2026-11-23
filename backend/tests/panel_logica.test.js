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
