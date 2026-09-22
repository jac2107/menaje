// middleware/rateLimitIA.js - Rate limiting para endpoint /api/ia/chat

const rateLimit = require('express-rate-limit');

const iaRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: process.env.RATE_LIMIT_IA || 5, // máximo 5 requests por minuto
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.'
    },
    standardHeaders: false,
    skip: (req, res) => {
        // No aplicar rate limit a rutas que no sean /api/ia/chat
        return !req.path.includes('/ia/chat');
    }
});

module.exports = iaRateLimiter;
