// middleware/rateLimitBusqueda.js - Limite propio de /api/ia/busqueda-semantica (Fase 6A).
// Separado del limite del chat (RATE_LIMIT_IA): la busqueda es mucho mas barata y se usa
// mientras el cliente escribe, asi que gastar la cuota del chat con ella lo bloqueaba.
// El contador es independiente: buscar no consume peticiones de chat ni al reves.
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const LIMITE_POR_DEFECTO = 20;
const limiteConfigurado = Number.parseInt(process.env.RATE_LIMIT_BUSQUEDA ?? '', 10);
const LIMITE_BUSQUEDA = Number.isInteger(limiteConfigurado) && limiteConfigurado > 0
    ? limiteConfigurado
    : LIMITE_POR_DEFECTO;

if (process.env.RATE_LIMIT_BUSQUEDA && LIMITE_BUSQUEDA !== limiteConfigurado) {
    console.warn(
        `⚠️  RATE_LIMIT_BUSQUEDA="${process.env.RATE_LIMIT_BUSQUEDA}" no es un entero positivo; ` +
        `se usa el valor por defecto (${LIMITE_POR_DEFECTO} peticiones/minuto).`
    );
}

module.exports = rateLimit({
    windowMs: 60 * 1000,
    limit: LIMITE_BUSQUEDA,
    keyGenerator: (req) => (
        req.usuario?.id ? `u:${req.usuario.id}` : `ip:${ipKeyGenerator(req.ip)}`
    ),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Demasiadas búsquedas. Intenta de nuevo en 1 minuto.'
    }
});
