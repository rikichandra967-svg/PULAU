const jwt = require('jsonwebtoken');

/**
 * Memverifikasi JWT dari header Authorization: Bearer <token>.
 * Jika valid, payload token (id, role) disisipkan ke req.user.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token tidak ditemukan. Sertakan header Authorization: Bearer <token>' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kedaluwarsa' });
  }
}

/**
 * Membatasi akses endpoint hanya untuk role tertentu.
 * Contoh pemakaian: requireRole('admin', 'courier')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Kamu tidak punya akses untuk aksi ini' });
    }
    next();
  };
}

module.exports = { verifyToken, requireRole };
