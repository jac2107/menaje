// middleware/rateLimitIA.js - Rate limiting para endpoint /api/ia/chat

// ipKeyGenerator normaliza la IP (agrupa /56 en IPv6). express-rate-limit v8 LANZA
// ERR_ERL_KEY_GEN_IPV6 si un keyGenerator propio usa req.ip sin pasarlo por aqui,
// porque si no un usuario con IPv6 puede saltarse el limite cambiando de direccion.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

// process.env siempre entrega cadenas: sin parseInt, RATE_LIMIT_IA=0 bloquearia
// todas las peticiones y un valor no numerico desactivaria el limite en silencio.
const LIMITE_POR_DEFECTO = 5;
const limiteConfigurado = Number.parseInt(process.env.RATE_LIMIT_IA ?? '', 10);
const LIMITE_IA = Number.isInteger(limiteConfigurado) && limiteConfigurado > 0
    ? limiteConfigurado
    : LIMITE_POR_DEFECTO;

if (process.env.RATE_LIMIT_IA && LIMITE_IA !== limiteConfigurado) {
    console.warn(
        `⚠️  RATE_LIMIT_IA="${process.env.RATE_LIMIT_IA}" no es un entero positivo; ` +
        `se usa el valor por defecto (${LIMITE_POR_DEFECTO} peticiones/minuto).`
    );
}

const iaRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    limit: LIMITE_IA,    // 'limit' es el nombre actual; 'max' esta obsoleto desde la v7
    // La ruta ya exige JWT, asi que se limita por usuario y no por IP: de lo contrario
    // todos los clientes detras de un mismo NAT comparten la misma cuota.
    keyGenerator: (req) => (
        req.usuario?.id ? `u:${req.usuario.id}` : `ip:${ipKeyGenerator(req.ip)}`
    ),
    standardHeaders: 'draft-7', // expone RateLimit / Retry-After para que el widget informe
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Intenta de nuevo en 1 minuto.'
    }
});

module.exports = iaRateLimiter;
