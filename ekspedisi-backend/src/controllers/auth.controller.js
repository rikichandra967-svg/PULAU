const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const SALT_ROUNDS = 10;
const VALID_ROLES = ['customer', 'courier', 'agent', 'admin'];
const PUBLICLY_REGISTERABLE_ROLES = ['customer', 'courier', 'agent']; // admin sengaja dikecualikan

/**
 * POST /api/auth/register
 * body: { name, email, phone, password, role }
 * Catatan: di production, pendaftaran role 'admin'/'agent'/'courier'
 * sebaiknya dibatasi (hanya oleh admin), bukan public endpoint.
 */
async function register(req, res, next) {
  try {
    const { name, email, phone, password, role = 'customer', cityId, vehicleType, outletName, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, dan password wajib diisi' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role harus salah satu dari: ${VALID_ROLES.join(', ')}` });
    }
    if (!PUBLICLY_REGISTERABLE_ROLES.includes(role)) {
      return res.status(403).json({
        error: 'Registrasi sebagai admin tidak diizinkan lewat endpoint publik. Hubungi administrator untuk dijadikan admin.',
      });
    }
    if ((role === 'courier' || role === 'agent') && !cityId) {
      return res.status(400).json({ error: 'cityId wajib diisi untuk role courier/agent' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email sudah terdaftar' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role, created_at`,
      [name, email, phone || null, passwordHash, role]
    );

    const user = result.rows[0];

    // Buat baris profil sesuai role, agar relasi 1-1 langsung tersedia.
    // Catatan: di production, pendaftaran courier/agent idealnya lewat undangan admin,
    // bukan self-service publik - disederhanakan di sini untuk keperluan demo.
    if (role === 'customer') {
      await pool.query('INSERT INTO customers (user_id) VALUES ($1)', [user.id]);
    } else if (role === 'courier') {
      await pool.query(
        `INSERT INTO couriers (user_id, city_id, vehicle_type, status) VALUES ($1, $2, $3, 'offline')`,
        [user.id, cityId, vehicleType || 'motor']
      );
    } else if (role === 'agent') {
      await pool.query(
        `INSERT INTO agents (user_id, city_id, outlet_name, address) VALUES ($1, $2, $3, $4)`,
        [user.id, cityId, outletName || `${name} Drop Point`, address || '-']
      );
    }

    const token = signToken(user);
    return res.status(201).json({ user, token });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * body: { email, password }
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email dan password wajib diisi' });
    }

    const result = await pool.query(
      'SELECT id, name, email, phone, role, password_hash, is_active FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email atau password salah' });
    }

    delete user.password_hash;
    const token = signToken(user);
    return res.json({ user, token });
  } catch (err) {
    next(err);
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

module.exports = { register, login };
