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

  const escapar = (v) => String(v ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // --- Riesgo de faltante (Fase 6B) -------------------------------------------------
  const RIESGO = {
    alcanza: { texto: 'Alcanza', color: 'var(--success)' },
    justo:   { texto: 'Justo',   color: 'var(--warn)' },
    faltara: { texto: 'Faltará', color: 'var(--danger)' }
  };
  /** { categoria: fila } de la respuesta de /ia/riesgo-faltante (vacio si no hay). */
  function riesgoPorCategoria(riesgo) {
    const m = {};
    ((riesgo && riesgo.categorias) || []).forEach(c => { m[c.categoria] = c; });
    return m;
  }

  // --- Serie temporal (Fase 6B) -----------------------------------------------------
  // Paleta apta para daltonismo (Okabe-Ito); una categoria = un color.
  const PALETA = ['#56B4E9', '#E69F00', '#009E73', '#CC79A7', '#F0E442', '#D55E00', '#999999'];
  const NOMBRES_MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  /** { meses: ['2026-01-01',...], categorias: [...], valor: {mes: {cat: unidades}}, maximo } */
  function agruparSerie(filas) {
    const meses = [...new Set((filas || []).map(f => f.mes))].sort();
    const categorias = [...new Set((filas || []).map(f => f.categoria))].sort();
    const valor = {};
    meses.forEach(m => { valor[m] = {}; });
    (filas || []).forEach(f => { valor[f.mes][f.categoria] = f.unidades; });
    const maximo = Math.max(0, ...meses.map(m => Object.values(valor[m]).reduce((a, b) => a + b, 0)));
    return { meses, categorias, valor, maximo };
  }

  function etiquetaMes(iso) {
    const [a, m] = iso.split('-');
    return NOMBRES_MES_CORTO[Number(m) - 1] + ' ' + a.slice(2);
  }

  /** Barras apiladas (una por mes, un segmento por categoria) como cadena SVG. Sin DOM. */
  function svgSerieDemanda(filas) {
    const g = agruparSerie(filas);
    if (!g.meses.length) return '';
    const W = 640, H = 240, ml = 44, mb = 28, mt = 10, mr = 8;
    const ancho = (W - ml - mr) / g.meses.length, barra = Math.max(6, ancho * 0.7);
    const escala = g.maximo > 0 ? (H - mt - mb) / g.maximo : 0;
    const partes = [];
    for (let i = 0; i <= 4; i++) {  // rejilla y eje Y
      const v = Math.round(g.maximo * i / 4), y = H - mb - v * escala;
      partes.push('<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y + '" y2="' + y + '" stroke="currentColor" stroke-opacity=".12"/>',
        '<text x="' + (ml - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="currentColor" fill-opacity=".7">' + escapar(v) + '</text>');
    }
    g.meses.forEach((mes, i) => {
      let y = H - mb;
      const x = ml + i * ancho + (ancho - barra) / 2;
      g.categorias.forEach((cat, k) => {
        const u = g.valor[mes][cat] || 0, h = u * escala;
        if (h <= 0) return;
        y -= h;
        partes.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barra.toFixed(1) + '" height="' + h.toFixed(1) +
          '" fill="' + PALETA[k % PALETA.length] + '"><title>' + escapar(etiquetaMes(mes) + ' · ' + cat + ': ' + u + ' unid.') + '</title></rect>');
      });
      partes.push('<text x="' + (x + barra / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10" fill="currentColor" fill-opacity=".7">' + escapar(etiquetaMes(mes)) + '</text>');
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Demanda real por categoria y mes" style="color:var(--text-muted)">' + partes.join('') + '</svg>';
  }

  /** Leyenda: [{categoria, color}] en el mismo orden que usa el grafico. */
  function leyendaSerie(filas) {
    return agruparSerie(filas).categorias.map((c, k) => ({ categoria: c, color: PALETA[k % PALETA.length] }));
  }

  const api = { estadosDe, hayTareaTerminada, avisoDegradado, RIESGO, riesgoPorCategoria,
    agruparSerie, etiquetaMes, svgSerieDemanda, leyendaSerie };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.PanelIALogica = api;
})(typeof window !== 'undefined' ? window : globalThis);
