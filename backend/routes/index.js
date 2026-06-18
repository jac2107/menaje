const express = require('express');
const router  = express.Router();

const { autenticar, autorizar } = require('../middleware/auth');
const authCtrl      = require('../controllers/authController');
const prodCtrl      = require('../controllers/productosController');
const alqCtrl       = require('../controllers/alquileresController');
const userCtrl      = require('../controllers/usuariosController');
const reportCtrl    = require('../controllers/reportesController');

// ── AUTH ──────────────────────────────────────────────────────────────────
router.post('/auth/registrar', authCtrl.registrar);
router.post('/auth/login',     authCtrl.login);

// ── PERFIL PROPIO ─────────────────────────────────────────────────────────
router.get('/perfil', autenticar, userCtrl.getMiPerfil);

// ── CATÁLOGO (público autenticado) ────────────────────────────────────────
router.get('/categorias',           autenticar, prodCtrl.getCategorias);
router.get('/productos/catalogo',   autenticar, prodCtrl.getCatalogo);

// ── INVENTARIO (trabajador / dueño) ───────────────────────────────────────
router.get('/productos',            autenticar, autorizar('trabajador','dueno'), prodCtrl.getInventario);
// CORREGIDO (CU-12): Se agregó el rol 'trabajador' para permitirle registrar productos
router.post('/productos',           autenticar, autorizar('trabajador','dueno'), prodCtrl.crearProducto);
router.patch('/productos/:id/stock',autenticar, autorizar('dueno'), prodCtrl.ajustarStock);

// ── ALQUILERES ────────────────────────────────────────────────────────────
// Cliente: crear solicitud, ver sus propios alquileres
router.post('/alquileres',           autenticar, autorizar('cliente'), alqCtrl.crearAlquiler);
router.get('/alquileres/mis',        autenticar, autorizar('cliente'), alqCtrl.getMisAlquileres);

// Trabajador / Dueño: ver activos, pago, revisión, cierre
router.get('/alquileres',                autenticar, autorizar('trabajador','dueno'), alqCtrl.getAlquileresActivos);
router.get('/alquileres/:id',            autenticar, alqCtrl.getAlquilerDetalle);
// CORREGIDO (CU-06): Se agregó el rol 'cliente' para permitirle procesar/registrar el pago desde la web
router.post('/alquileres/:id/pago',      autenticar, autorizar('cliente','trabajador','dueno'), alqCtrl.registrarPago);
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

module.exports = router;