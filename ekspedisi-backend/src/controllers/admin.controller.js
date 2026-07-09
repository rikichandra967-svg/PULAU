const pool = require('../config/db');

/**
 * GET /api/admin/stats
 * Ringkasan angka untuk kartu-kartu di dashboard admin.
 */
async function getStats(req, res, next) {
  try {
    const byStatus = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM shipments GROUP BY status`
    );
    const todayResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shipments WHERE created_at::date = CURRENT_DATE`
    );
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(price), 0)::numeric AS total FROM shipments WHERE status != 'cancelled'`
    );
    const complaintsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM shipments WHERE status = 'returned'`
    );

    const statusCounts = {};
    for (const row of byStatus.rows) {
      statusCounts[row.status] = row.count;
    }

    return res.json({
      totalToday: todayResult.rows[0].count,
      totalRevenue: Number(revenueResult.rows[0].total),
      complaints: complaintsResult.rows[0].count,
      byStatus: statusCounts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/shipments
 * Monitoring semua paket. Query params opsional: status, resi (pencarian sebagian), limit.
 */
async function getAllShipments(req, res, next) {
  try {
    const { status, resi, limit = 100 } = req.query;

    const conditions = [];
    const values = [];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    if (resi) {
      values.push(`%${resi}%`);
      conditions.push(`resi_number ILIKE $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(Math.min(Number(limit) || 100, 500));

    const result = await pool.query(
      `SELECT s.*, oc.name AS origin_city_name, dc.name AS destination_city_name
       FROM shipments s
       JOIN cities oc ON oc.id = s.origin_city_id
       JOIN cities dc ON dc.id = s.destination_city_id
       ${whereClause}
       ORDER BY s.created_at DESC
       LIMIT $${values.length}`,
      values
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/tariffs
 */
async function getTariffs(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM tariffs ORDER BY origin_zone, destination_zone, service_type`
    );
    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tariffs
 * Buat tarif baru ATAU update kalau kombinasi zona+layanan sudah ada (upsert).
 * body: { originZone, destinationZone, serviceType, basePrice, pricePerKg, estimatedDaysMin, estimatedDaysMax }
 */
async function upsertTariff(req, res, next) {
  try {
    const {
      originZone, destinationZone, serviceType,
      basePrice, pricePerKg, estimatedDaysMin, estimatedDaysMax,
    } = req.body;

    const required = { originZone, destinationZone, serviceType, basePrice, pricePerKg, estimatedDaysMin, estimatedDaysMax };
    const missing = Object.entries(required).filter(([, v]) => v === undefined || v === null || v === '');
    if (missing.length > 0) {
      return res.status(400).json({ error: `Field wajib belum diisi: ${missing.map(([k]) => k).join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO tariffs (origin_zone, destination_zone, service_type, base_price, price_per_kg, estimated_days_min, estimated_days_max)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (origin_zone, destination_zone, service_type)
       DO UPDATE SET base_price = $4, price_per_kg = $5, estimated_days_min = $6, estimated_days_max = $7
       RETURNING *`,
      [originZone, destinationZone, serviceType, basePrice, pricePerKg, estimatedDaysMin, estimatedDaysMax]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/admin/tariffs/:id
 */
async function deleteTariff(req, res, next) {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM tariffs WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tarif tidak ditemukan' });
    }
    return res.json({ message: 'Tarif dihapus' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/provinces
 */
async function getProvinces(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM provinces ORDER BY name');
    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/provinces
 * body: { name, islandZone }
 */
async function createProvince(req, res, next) {
  try {
    const { name, islandZone } = req.body;
    if (!name || !islandZone) {
      return res.status(400).json({ error: 'name dan islandZone wajib diisi' });
    }
    const result = await pool.query(
      'INSERT INTO provinces (name, island_zone) VALUES ($1, $2) RETURNING *',
      [name, islandZone]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/cities
 * body: { provinceId, name, isHub }
 */
async function createCity(req, res, next) {
  try {
    const { provinceId, name, isHub = false } = req.body;
    if (!provinceId || !name) {
      return res.status(400).json({ error: 'provinceId dan name wajib diisi' });
    }
    const result = await pool.query(
      'INSERT INTO cities (province_id, name, is_hub) VALUES ($1, $2, $3) RETURNING *',
      [provinceId, name, isHub]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  getAllShipments,
  getTariffs,
  upsertTariff,
  deleteTariff,
  getProvinces,
  createProvince,
  createCity,
};
