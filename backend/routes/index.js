const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router  = express.Router();

const { autenticar, autorizar } = require('../middleware/auth');
const authCtrl      = require('../controllers/authController');
const prodCtrl      = require('../controllers/productosController');
const alqCtrl       = require('../controllers/alquileresController');
const userCtrl      = require('../controllers/usuariosController');
const reportCtrl    = require('../controllers/reportesController');
const paqCtrl       = require('../controllers/paquetesController');
const iaService     = require('../services/iaService');
const iaRateLimiter = require('../middleware/rateLimitIA');
const busquedaRateLimiter = require('../middleware/rateLimitBusqueda');

// Máximo 10 intentos por IP cada 15 minutos en rutas de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, intenta de nuevo más tarde' }
});

// Máximo 30 alquileres por IP cada 15 minutos
const alquilerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});

// ── AUTH ──────────────────────────────────────────────────────────────────
router.post('/auth/registrar', authLimiter, authCtrl.registrar);
router.post('/auth/login',     authLimiter, authCtrl.login);

// ── IA (OPCIÓN 1) ────────────────────────────────────────────────────────
/**
 * POST /api/ia/chat
 * Chat conversacional con Gemini
 * Requiere: JWT token en headers
 * Body: { mensaje: string, historico: array }
 */
router.post('/ia/chat', autenticar, iaRateLimiter, async (req, res) => {
    try {
        const usuarioId = req.usuario.id; // Viene del JWT
        const { mensaje, historico = [] } = req.body;

        // VALIDACIONES
        if (!mensaje || typeof mensaje !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'El campo "mensaje" es requerido y debe ser texto'
            });
        }

        if (mensaje.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'El mensaje es muy corto (mínimo 2 caracteres)'
            });
        }

        // El mensaje de recomendaciones es un prompt generado que incluye el catalogo
        // (frontend/assets/js/recommendationcards.js), acotado a 40 productos: ~4k caracteres.
        // MENSAJE_IA_MAX_CHARS permite subirlo sin tocar codigo si el prompt crece.
        const MENSAJE_MAX = Number.parseInt(process.env.MENSAJE_IA_MAX_CHARS ?? '', 10) || 8000;
        if (mensaje.length > MENSAJE_MAX) {
            return res.status(400).json({
                success: false,
                error: `El mensaje es muy largo (máximo ${MENSAJE_MAX} caracteres)`
            });
        }

        console.log(`\n📨 POST /api/ia/chat - Usuario: ${usuarioId}`);

        // Llamar a FastAPI
        const resultado = await iaService.chatConIA(usuarioId, mensaje, historico);

        if (!resultado.success) {
            return res.status(500).json({
                success: false,
                error: resultado.error
            });
        }

        // Retornar respuesta
        return res.json({
            success: true,
            data: resultado.data
        });

    } catch (error) {
        console.error('❌ Error en /api/ia/chat:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Error procesando tu solicitud'
        });
    }
});

/**
 * POST /api/ia/busqueda-semantica   (OPCION 2)
 * Reenvia la descripcion a FastAPI; devuelve productos con stock por similitud.
 * Requiere: JWT. Body: { descripcion: string, limite?: 1-20 }
 */
router.post('/ia/busqueda-semantica', autenticar, busquedaRateLimiter, async (req, res) => {
    try {
        const { descripcion, limite = 5 } = req.body;

        if (typeof descripcion !== 'string' || descripcion.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'El campo "descripcion" es requerido (mínimo 2 caracteres)'
            });
        }
        if (descripcion.length > 500) {
            return res.status(400).json({
                success: false,
                error: 'La descripción es muy larga (máximo 500 caracteres)'
            });
        }
        const lim = Number.parseInt(limite, 10);
        if (!Number.isInteger(lim) || lim < 1 || lim > 20) {
            return res.status(400).json({
                success: false,
                error: 'El campo "limite" debe ser un entero entre 1 y 20'
            });
        }

        const resultado = await iaService.busquedaSemantica(descripcion.trim(), lim);
        if (!resultado.success) {
            return res.status(resultado.status || 500).json({ success: false, error: resultado.error });
        }
        return res.json({ success: true, data: resultado.data });
    } catch (error) {
        console.error('❌ Error en /api/ia/busqueda-semantica:', error.message);
        return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
    }
});

/**
 * POST /api/ia/pronostico-demanda   (OPCION 2, capa 9)
 * Demanda estimada por categoria para un evento (modelo entrenado con datos
 * SINTETICOS). Solo administrador (rol "dueno").
 * Body: { tipo_evento: string, mes: 1-12, asistentes: 1-5000 }
 */
const TIPOS_EVENTO = ['boda', 'quinceanos', 'bautizo', 'cumpleanos', 'graduacion', 'corporativo', 'baby_shower'];

router.post('/ia/pronostico-demanda', autenticar, autorizar('dueno'), iaRateLimiter, async (req, res) => {
    try {
        const { tipo_evento, mes, asistentes } = req.body;

        if (!TIPOS_EVENTO.includes(tipo_evento)) {
            return res.status(400).json({
                success: false,
                error: `"tipo_evento" debe ser uno de: ${TIPOS_EVENTO.join(', ')}`
            });
        }
        if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
            return res.status(400).json({ success: false, error: '"mes" debe ser un entero entre 1 y 12' });
        }
        if (!Number.isInteger(asistentes) || asistentes < 1 || asistentes > 5000) {
            return res.status(400).json({ success: false, error: '"asistentes" debe ser un entero entre 1 y 5000' });
        }

        const resultado = await iaService.pronosticoDemanda(tipo_evento, mes, asistentes);
        if (!resultado.success) {
            return res.status(resultado.status || 500).json({ success: false, error: resultado.error });
        }
        return res.json({ success: true, data: resultado.data });
    } catch (error) {
        console.error('❌ Error en /api/ia/pronostico-demanda:', error.message);
        return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
    }
});

// ── PANEL DE ADMINISTRACION IA (OPCION 2, Fase 4) · solo rol "dueno" ─────────
// El panel consulta estado y tareas cada pocos segundos, asi que las lecturas usan
// un limite mas holgado (por usuario) que el de iaRateLimiter (5/min, que se
// conserva para las acciones: lanzar tareas y pronosticos).
const LIMITE_PANEL = Number.parseInt(process.env.RATE_LIMIT_PANEL_IA ?? '', 10) || 60;
const panelLecturaLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: LIMITE_PANEL,
  keyGenerator: (req) => (req.usuario?.id ? `u:${req.usuario.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.' }
});

const responderAdmin = (res, r) => (
  r.success
    ? res.status(r.status === 202 ? 202 : 200).json({ success: true, data: r.data })
    : res.status(r.status || 500).json({ success: false, error: r.error })
);

/** GET /api/ia/estado — consulta modelo de pronostico, busqueda vectorial, Redis y Gemini */
router.get('/ia/estado', autenticar, autorizar('dueno'), panelLecturaLimiter, async (_req, res) => {
  res.set('Cache-Control', 'no-store'); // el panel debe ver siempre el entrenamiento mas reciente
  try {
    return responderAdmin(res, await iaService.estadoSistema());
  } catch (error) {
    console.error('❌ Error en /api/ia/estado:', error.message);
    return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
  }
});

/** POST /api/ia/tareas { tipo: "reentrenar_pronostico" | "regenerar_embeddings" } */
const TIPOS_TAREA = ['reentrenar_pronostico', 'regenerar_embeddings'];
router.post('/ia/tareas', autenticar, autorizar('dueno'), iaRateLimiter, async (req, res) => {
  try {
    const { tipo } = req.body;
    if (!TIPOS_TAREA.includes(tipo)) {
      return res.status(400).json({ success: false, error: `"tipo" debe ser uno de: ${TIPOS_TAREA.join(', ')}` });
    }
    return responderAdmin(res, await iaService.crearTarea(tipo));
  } catch (error) {
    console.error('❌ Error en POST /api/ia/tareas:', error.message);
    return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
  }
});

/** GET /api/ia/tareas — ultimas tareas */
router.get('/ia/tareas', autenticar, autorizar('dueno'), panelLecturaLimiter, async (_req, res) => {
  try {
    return responderAdmin(res, await iaService.listarTareas());
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
  }
});

/** GET /api/ia/tareas/:id — estado de una tarea */
router.get('/ia/tareas/:id', autenticar, autorizar('dueno'), panelLecturaLimiter, async (req, res) => {
  try {
    if (!/^[0-9a-f]{32}$/.test(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Id de tarea no válido' });
    }
    return responderAdmin(res, await iaService.estadoTarea(req.params.id));
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Error procesando tu solicitud' });
  }
});

/**
 * GET /api/ia/health
 * Verificar que servicio de IA está disponible
 */
router.get('/ia/health', autenticar, async (req, res) => {
    try {
        const iaDisponible = await iaService.verificarIA();

        return res.json({
            success: true,
            ia_disponible: iaDisponible,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Error verificando servicio IA'
        });
    }
});

// ── PERFIL PROPIO ─────────────────────────────────────────────────────────
router.get('/perfil', autenticar, userCtrl.getMiPerfil);

// ── CATÁLOGO (público autenticado) ────────────────────────────────────────
router.get('/categorias',           autenticar, prodCtrl.getCategorias);
router.get('/productos/catalogo',   autenticar, prodCtrl.getCatalogo);
router.get('/paquetes/catalogo',    autenticar, paqCtrl.getCatalogo);

// ── INVENTARIO (trabajador / dueño) ───────────────────────────────────────
router.get('/productos',            autenticar, autorizar('trabajador','dueno'), prodCtrl.getInventario);
// CORREGIDO (CU-12): Se agregó el rol 'trabajador' para permitirle registrar productos
router.post('/productos',           autenticar, autorizar('trabajador','dueno'), prodCtrl.crearProducto);
router.patch('/productos/:id',      autenticar, autorizar('dueno'), prodCtrl.editarProducto);
router.patch('/productos/:id/stock',autenticar, autorizar('dueno'), prodCtrl.ajustarStock);

// ── ALQUILERES ────────────────────────────────────────────────────────────
// Cliente: crear solicitud, ver sus propios alquileres
router.post('/alquileres',           alquilerLimiter, autenticar, autorizar('cliente'), alqCtrl.crearAlquiler);
router.get('/alquileres/mis',        autenticar, autorizar('cliente'), alqCtrl.getMisAlquileres);

// Trabajador / Dueño: ver activos, pago, revisión, cierre
router.get('/alquileres',                autenticar, autorizar('trabajador','dueno'), alqCtrl.getAlquileresActivos);
router.get('/alquileres/:id',            autenticar, alqCtrl.getAlquilerDetalle);
router.post('/alquileres/:id/revision',  autenticar, autorizar('trabajador','dueno'), alqCtrl.registrarRevision);
router.post('/alquileres/:id/cerrar',    autenticar, autorizar('dueno'), alqCtrl.cerrarAlquiler);

// QR
router.get('/qr/:qr_token',             autenticar, alqCtrl.escanearQR);
router.post('/qr/:qr_token/avanzar',    autenticar, autorizar('trabajador','dueno'), alqCtrl.avanzarEstadoQR);

// ── USUARIOS (dueño) ──────────────────────────────────────────────────────
router.get('/usuarios',                  autenticar, autorizar('dueno'), userCtrl.getUsuarios);
router.post('/usuarios',                 autenticar, autorizar('dueno'), userCtrl.crearUsuario);
router.patch('/usuarios/:id/toggle',     autenticar, autorizar('dueno'), userCtrl.toggleUsuario);

// ── DESCUENTOS (dueño) ────────────────────────────────────────────────────
router.get('/descuentos',                autenticar, autorizar('dueno'), userCtrl.getDescuentos);
router.post('/descuentos',               autenticar, autorizar('dueno'), userCtrl.asignarDescuento);

// ── CONFIGURACIÓN ─────────────────────────────────────────────────────────
router.get('/configuracion',             autenticar, autorizar('dueno'), userCtrl.getConfiguracion);
router.put('/configuracion',             autenticar, autorizar('dueno'), userCtrl.updateConfiguracion);

// ── REPORTES (dueño) ──────────────────────────────────────────────────────
router.get('/reportes/dashboard',        autenticar, autorizar('dueno'), reportCtrl.dashboard);
router.get('/reportes/ingresos',         autenticar, autorizar('dueno'), reportCtrl.reporteIngresos);
router.get('/reportes/productos',        autenticar, autorizar('dueno'), reportCtrl.reporteProductos);
router.get('/reportes/danos',            autenticar, autorizar('dueno'), reportCtrl.reporteDanos);
router.get('/reportes/metodos-pago',     autenticar, autorizar('dueno'), reportCtrl.reporteMetodosPago);
router.get('/reportes/categorias',       autenticar, autorizar('dueno'), reportCtrl.reporteCategorias);
router.get('/reportes/clientes',         autenticar, autorizar('dueno'), reportCtrl.reporteClientes);
router.get('/reportes/resumen-financiero', autenticar, autorizar('dueno'), reportCtrl.resumenFinanciero);

module.exports = router;