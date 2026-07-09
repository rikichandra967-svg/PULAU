const pool = require('../config/db');

/**
 * GET /api/cities
 * Publik - daftar kota yang tersedia untuk asal/tujuan pengiriman,
 * dipakai untuk mengisi dropdown di frontend.
 */
async function list(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.is_hub, p.name AS province_name, p.island_zone
       FROM cities c
       JOIN provinces p ON p.id = c.province_id
       ORDER BY p.name, c.name`
    );
    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
