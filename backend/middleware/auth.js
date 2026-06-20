const jwt = require('jsonwebtoken');

/**
 * Verifica que el request traiga un JWT válido en Authorization: Bearer <token>
 */
function autenticar(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token no proporcionado' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Formato de token inválido' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = payload;   // { id, nombre, correo, rol }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Fábrica de middleware que restringe el acceso a uno o varios roles.
 * Uso: autorizar('dueno')  |  autorizar('trabajador','dueno')
 */
function autorizar(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Acceso denegado para tu rol' });
    }
    next();
  };
}

module.exports = { autenticar, autorizar };
