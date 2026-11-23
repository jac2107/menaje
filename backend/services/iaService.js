// services/iaService.js - Servicio para comunicación con FastAPI

const axios = require('axios');

const PYTHON_IA_URL = process.env.PYTHON_IA_URL || 'http://127.0.0.1:8000';
const IA_SERVICE_TOKEN = process.env.IA_SERVICE_TOKEN;

if (!IA_SERVICE_TOKEN) {
    throw new Error('Falta la variable de entorno IA_SERVICE_TOKEN (debe coincidir con la de python-ia/.env)');
}

/**
 * Llamar a FastAPI para obtener respuesta de Gemini
 */
async function chatConIA(usuarioId, mensaje, historico = []) {
    try {
        console.log(`📤 Enviando a FastAPI: usuario=${usuarioId}, mensaje="${mensaje.substring(0, 50)}..."`);

        const response = await axios.post(
            `${PYTHON_IA_URL}/chat`,
            {
                usuario_id: usuarioId,
                mensaje: mensaje,
                historico: historico
            },
            {
                timeout: 120000, // 120 segundos timeout (Gemini puede tardar 20-50s)
                headers: {
                    'Content-Type': 'application/json',
                    'X-IA-Token': IA_SERVICE_TOKEN
                }
            }
        );

        console.log(`✅ Respuesta de FastAPI recibida: ${response.data.tokens_usados} tokens`);

        return {
            success: true,
            data: response.data
        };

    } catch (error) {
        console.error(`❌ Error llamando a FastAPI:`, error.message);

        if (error.code === 'ECONNREFUSED') {
            return {
                success: false,
                error: 'No se pudo conectar al servicio de IA. Intenta de nuevo.'
            };
        }

        if (error.response) {
            // Los 4xx del microservicio son de validacion y son seguros de mostrar;
            // los 5xx pueden contener detalles internos, asi que se registran y se enmascaran.
            const status = error.response.status;
            if (status >= 400 && status < 500) {
                return {
                    success: false,
                    error: error.response.data?.detail || 'Solicitud no válida para el servicio de IA'
                };
            }
            console.error(`❌ Error ${status} del servicio IA:`, error.response.data);
            return {
                success: false,
                error: 'El asistente no está disponible en este momento. Intenta de nuevo en unos minutos.'
            };
        }

        return {
            success: false,
            error: 'Error al procesar tu solicitud'
        };
    }
}

/**
 * Verificar que FastAPI está corriendo
 */
async function verificarIA() {
    try {
        const response = await axios.get(`${PYTHON_IA_URL}/health`, {
            timeout: 5000,
            headers: { 'X-IA-Token': IA_SERVICE_TOKEN }
        });
        return response.data.status === 'ok';
    } catch (error) {
        console.warn('⚠️  Servicio IA no disponible');
        return false;
    }
}

/**
 * OPCION 2: reenvia una descripcion libre a FastAPI para la busqueda semantica
 */
async function busquedaSemantica(descripcion, limite) {
    try {
        const response = await axios.post(
            `${PYTHON_IA_URL}/busqueda-semantica`,
            { descripcion, limite },
            {
                timeout: 30000, // la primera peticion carga el modelo de embeddings
                headers: {
                    'Content-Type': 'application/json',
                    'X-IA-Token': IA_SERVICE_TOKEN
                }
            }
        );
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Error en busqueda semantica:', error.message);
        if (error.code === 'ECONNREFUSED') {
            return { success: false, status: 503, error: 'No se pudo conectar al servicio de IA. Intenta de nuevo.' };
        }
        const status = error.response?.status;
        if (status >= 400 && status < 500) {
            return { success: false, status: 400, error: error.response.data?.detail || 'Solicitud no válida' };
        }
        return { success: false, status: 503, error: 'La búsqueda no está disponible en este momento.' };
    }
}

/**
 * OPCION 2 (capa 9): reenvia tipo de evento, mes y asistentes a FastAPI para el
 * pronostico de demanda por categoria.
 */
async function pronosticoDemanda(tipoEvento, mes, asistentes) {
    try {
        const response = await axios.post(
            `${PYTHON_IA_URL}/pronostico-demanda`,
            { tipo_evento: tipoEvento, mes, asistentes },
            {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'X-IA-Token': IA_SERVICE_TOKEN
                }
            }
        );
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Error en pronostico de demanda:', error.message);
        if (error.code === 'ECONNREFUSED') {
            return { success: false, status: 503, error: 'No se pudo conectar al servicio de IA. Intenta de nuevo.' };
        }
        const status = error.response?.status;
        if (status === 422) {
            return { success: false, status: 400, error: 'Datos del evento no válidos para el pronóstico' };
        }
        return { success: false, status: 503, error: 'El pronóstico no está disponible en este momento.' };
    }
}

/**
 * OPCION 2 (Fase 4): llamada generica de administracion a FastAPI. Devuelve
 * { success, status, data | error }. Los 4xx del microservicio (409 tarea ya en
 * curso, 404 tarea inexistente...) son seguros de mostrar; los 5xx se enmascaran.
 */
async function llamarAdmin(metodo, ruta, cuerpo, timeout = 15000) {
    try {
        const response = await axios.request({
            method: metodo,
            url: `${PYTHON_IA_URL}${ruta}`,
            data: cuerpo,
            timeout,
            headers: { 'Content-Type': 'application/json', 'X-IA-Token': IA_SERVICE_TOKEN }
        });
        return { success: true, status: response.status, data: response.data };
    } catch (error) {
        console.error(`❌ Error en ${metodo} ${ruta}:`, error.message);
        const status = error.response?.status;
        if (status === 404 || status === 409) {
            return { success: false, status, error: error.response.data?.detail || 'Solicitud no válida' };
        }
        if (status >= 400 && status < 500) {
            return { success: false, status: 400, error: 'Solicitud no válida para el servicio de IA' };
        }
        return { success: false, status: 503, error: 'El servicio de IA no está disponible en este momento.' };
    }
}

const crearTarea = (tipo) => llamarAdmin('post', '/tareas', { tipo });
const listarTareas = () => llamarAdmin('get', '/tareas');
const estadoTarea = (id) => llamarAdmin('get', `/tareas/${encodeURIComponent(id)}`);

// Fase 6B
const productosSimilares = (id, limite) =>
    llamarAdmin('get', `/productos-similares/${encodeURIComponent(id)}?limite=${encodeURIComponent(limite)}`);
const riesgoFaltante = (tipoEvento, mes, asistentes) =>
    llamarAdmin('post', '/riesgo-faltante', { tipo_evento: tipoEvento, mes, asistentes });
const serieDemanda = (meses) => llamarAdmin('get', `/serie-demanda?meses=${encodeURIComponent(meses)}`);
const metricasUso = (dias) => llamarAdmin('get', `/metricas-uso?dias=${encodeURIComponent(dias)}`);

/**
 * Estado de cada pieza. Si FastAPI no responde, NO es un error del panel: se devuelve
 * un estado "degradado" con ia_servicio caido, para que el panel lo muestre.
 */
async function estadoSistema() {
    const r = await llamarAdmin('get', '/estado', undefined, 20000);
    if (r.success) return r;
    return {
        success: true,
        status: 200,
        data: {
            estado_general: 'degradado',
            modo_degradado: true,
            componentes: {
                ia_servicio: { estado: 'caido', detalle: 'FastAPI no responde' }
            },
            datos_pronostico: 'SINTETICOS'
        }
    };
}

module.exports = {
    chatConIA,
    verificarIA,
    busquedaSemantica,
    pronosticoDemanda,
    crearTarea,
    listarTareas,
    estadoTarea,
    estadoSistema,
    productosSimilares,
    riesgoFaltante,
    serieDemanda,
    metricasUso
};
