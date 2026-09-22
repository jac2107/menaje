// services/iaService.js - Servicio para comunicación con FastAPI

const axios = require('axios');

const PYTHON_IA_URL = process.env.PYTHON_IA_URL || 'http://localhost:8000';

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
                    'Content-Type': 'application/json'
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
            return {
                success: false,
                error: error.response.data?.detail || 'Error en servicio de IA'
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
        const response = await axios.get(`${PYTHON_IA_URL}/health`, { timeout: 5000 });
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
