// Logica pura de la experiencia del cliente con la IA (Fase 6B), sin DOM, para probarla con
// `node --test` (backend/tests/cliente_ia.test.js). En el navegador queda como `ClienteIA`.
(function (raiz) {
  // Sugerencias clicables bajo la caja de busqueda del catalogo.
  const SUGERENCIAS_BUSQUEDA = [
    'copas para brindar en una boda',
    'vajilla elegante para 50 personas',
    'manteles para una mesa redonda',
    'cubiertos dorados',
    'vasos para un cumpleaños infantil'
  ];
  // Preguntas de ejemplo que el chat ofrece al abrirse.
  const SUGERENCIAS_CHAT = [
    '¿Qué necesito para una boda de 100 personas?',
    '¿Tienen copas disponibles?',
    '¿Cómo funciona la garantía?'
  ];

  // Indicador de espera por pasos mientras Gemini responde: [desde (ms), texto].
  // Los pasos son orientativos (el servidor no informa su avance real) pero siguen el
  // orden real del flujo: contexto -> catalogo -> modelo -> respuesta.
  const PASOS_ESPERA = [
    [0, 'Entendiendo tu pregunta…'],
    [1500, 'Buscando en el catálogo…'],
    [4000, 'Consultando al asistente…'],
    [12000, 'Preparando la respuesta…'],
    [30000, 'Esto está tardando más de lo normal; sigue en marcha…']
  ];

  /** Texto del paso que corresponde a `ms` milisegundos de espera. */
  function pasoEspera(ms) {
    let texto = PASOS_ESPERA[0][1];
    for (const [desde, t] of PASOS_ESPERA) if (ms >= desde) texto = t;
    return texto;
  }

  /** Mensaje que envia el chat al pulsar la sugerencia de un producto. */
  function mensajeSobreProducto(nombre) {
    return '¿Me cuentas más sobre ' + String(nombre).replace(/\s+/g, ' ').trim().slice(0, 80) + '?';
  }

  /**
   * Dictado por voz con la API del navegador (Web Speech: SpeechRecognition / webkitSpeechRecognition).
   * `Ctor` se inyecta para poder probarlo; en el navegador se usa el del `window`. Devuelve null
   * si el navegador no lo soporta (la interfaz oculta el boton).
   * iniciar({ onTexto(texto, esFinal), onFin(), onError(codigo) }); detener().
   */
  function crearDictado(Ctor, idioma) {
    if (!Ctor) return null;
    let rec = null;
    let activo = false;
    return {
      get activo() { return activo; },
      iniciar({ onTexto, onFin, onError } = {}) {
        if (activo) return;
        rec = new Ctor();
        rec.lang = idioma || 'es-PE';
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        rec.onresult = (ev) => {
          let texto = '';
          let esFinal = false;
          for (let i = 0; i < ev.results.length; i++) {
            texto += ev.results[i][0].transcript;
            if (ev.results[i].isFinal) esFinal = true;
          }
          if (onTexto) onTexto(texto.trim(), esFinal);
        };
        rec.onerror = (ev) => { if (onError) onError(ev && ev.error ? ev.error : 'desconocido'); };
        rec.onend = () => { activo = false; if (onFin) onFin(); };
        activo = true;
        try { rec.start(); } catch (e) { activo = false; if (onError) onError('no-iniciado'); }
      },
      detener() { if (rec && activo) { try { rec.stop(); } catch (e) { /* ya parado */ } } }
    };
  }

  /** Mensaje para el usuario segun el codigo de error de SpeechRecognition. */
  function mensajeErrorDictado(codigo) {
    if (codigo === 'not-allowed' || codigo === 'service-not-allowed') return 'Permite el acceso al micrófono para dictar.';
    if (codigo === 'no-speech') return 'No se oyó nada; inténtalo de nuevo.';
    if (codigo === 'audio-capture') return 'No se encontró un micrófono.';
    if (codigo === 'network') return 'El dictado necesita conexión a internet.';
    return 'No se pudo usar el dictado por voz.';
  }

  const api = { SUGERENCIAS_BUSQUEDA, SUGERENCIAS_CHAT, PASOS_ESPERA, pasoEspera,
    mensajeSobreProducto, crearDictado, mensajeErrorDictado };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ClienteIA = api;
})(typeof window !== 'undefined' ? window : globalThis);
