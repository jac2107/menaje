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

module.exports = {
    chatConIA,
    verificarIA
};
