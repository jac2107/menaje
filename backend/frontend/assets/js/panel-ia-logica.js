// Logica pura del Panel IA (sin DOM), para poder probarla con `node --test` (backend/tests).
// En el navegador queda como `PanelIALogica`; en Node se exporta con module.exports.
(function (raiz) {
  const ACTIVAS = ['pendiente', 'en_curso'];

  /** { id: estado } de la lista de tareas que devuelve GET /ia/tareas. */
  function estadosDe(tareas) {
    const m = {};
    (tareas || []).forEach(t => { m[t.id] = t.estado; });
    return m;
  }

  /**
   * ¿Alguna tarea que estaba pendiente/en curso ya termino (completada o error)?
   * Con ello el panel vuelve a pedir /ia/estado al instante en lugar de esperar
   * al siguiente ciclo de 15 s: asi la tarjeta "Datos del ultimo entrenamiento" y el
   * semaforo de deriva muestran la version nueva sin recargar la pagina.
   * `previos` es el resultado de estadosDe() en la consulta anterior.
   */
  function hayTareaTerminada(previos, tareas) {
    return (tareas || []).some(t =>
      ACTIVAS.includes(previos[t.id]) && !ACTIVAS.includes(t.estado));
  }

  /** Texto del aviso de modo degradado del panel; null si no hay que mostrarlo. */
  function avisoDegradado(estado, nombres) {
    if (!estado || !estado.modo_degradado) return null;
    const afectados = Object.entries(estado.componentes || {})
      .filter(([k, c]) => c.estado !== 'ok' && ['pronostico', 'busqueda_vectorial', 'ia_servicio'].includes(k))
      .map(([k]) => (nombres && nombres[k]) || k);
    return afectados.length ? 'Afectado: ' + afectados.join(', ') + '.' : '';
  }

  const api = { estadosDe, hayTareaTerminada, avisoDegradado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PanelIALogica = api;
})(typeof window !== 'undefined' ? window : globalThis);
