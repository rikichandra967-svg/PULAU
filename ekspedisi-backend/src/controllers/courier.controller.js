const pool = require('../config/db');

const VALID_STATUSES = ['offline', 'available', 'on_delivery'];

/**
 * GET /api/couriers/me
 * Profil kurir yang sedang login, termasuk kota operasional & status saat ini.
 */
async function getMe(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT co.id, co.status, co.vehicle_type, co.rating, c.id AS city_id, c.name AS city_name
       FROM couriers co
       JOIN cities c ON c.id = co.city_id
       WHERE co.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profil kurir tidak ditemukan untuk akun ini' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/couriers/me/status
 * body: { status: 'offline' | 'available' | 'on_delivery' }
 * Kurir mengubah status ketersediaan dirinya sendiri (mirip toggle online/offline).
 */
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status harus salah satu dari: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE couriers SET status = $1 WHERE user_id = $2 RETURNING id, status`,
      [status, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profil kurir tidak ditemukan untuk akun ini' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateStatus };
