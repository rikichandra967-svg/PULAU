const pool = require('../config/db');

const VALID_STATUSES = [
  'created', 'picked_up', 'at_origin_hub', 'in_transit',
  'at_destination_hub', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
];

/**
 * GET /api/tracking/:resi
 * Publik - riwayat perjalanan paket lengkap, diurutkan dari yang terbaru.
 */
async function getHistory(req, res, next) {
  try {
    const { resi } = req.params;

    const shipmentResult = await pool.query(
      'SELECT id, resi_number, status FROM shipments WHERE resi_number = $1',
      [resi]
    );
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resi tidak ditemukan' });
    }
    const shipment = shipmentResult.rows[0];

    const historyResult = await pool.query(
      `SELECT status, location_note, description, created_at
       FROM tracking_history
       WHERE shipment_id = $1
       ORDER BY created_at DESC`,
      [shipment.id]
    );

    return res.json({
      resiNumber: shipment.resi_number,
      currentStatus: shipment.status,
      history: historyResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/tracking/:resi/update
 * Hanya courier & admin. Menambah entri tracking baru + update status shipment.
 * body: { status, locationNote, description, photoBase64 }
 *   - photoBase64 opsional: data URL foto (mis. "data:image/jpeg;base64,...."),
 *     otomatis disimpan sebagai bukti "pickup" kalau status=picked_up,
 *     atau "delivery" kalau status=delivered. Untuk status lain, foto diabaikan.
 */
async function addUpdate(req, res, next) {
  const client = await pool.connect();
  try {
    const { resi } = req.params;
    const { status, locationNote, description, photoBase64 } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status harus salah satu dari: ${VALID_STATUSES.join(', ')}` });
    }

    const shipmentResult = await pool.query('SELECT id FROM shipments WHERE resi_number = $1', [resi]);
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resi tidak ditemukan' });
    }
    const shipmentId = shipmentResult.rows[0].id;

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO tracking_history (shipment_id, status, location_note, description, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [shipmentId, status, locationNote || null, description || null, req.user.id]
    );

    await client.query(
      `UPDATE shipments SET status = $1, updated_at = now() WHERE id = $2`,
      [status, shipmentId]
    );

    // Simpan foto bukti kalau disertakan & status-nya relevan (pickup/delivery)
    if (photoBase64) {
      const photoType = status === 'picked_up' ? 'pickup' : status === 'delivered' ? 'delivery' : null;
      if (photoType) {
        await client.query(
          `INSERT INTO proof_photos (shipment_id, type, photo_data, created_by)
           VALUES ($1, $2, $3, $4)`,
          [shipmentId, photoType, photoBase64, req.user.id]
        );
      }
    }

    await client.query('COMMIT');

    return res.status(201).json({ message: 'Status berhasil diperbarui', status });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/tracking/:resi/photos
 * Publik - foto bukti pickup & delivery untuk paket ini (kalau ada).
 */
async function getPhotos(req, res, next) {
  try {
    const { resi } = req.params;

    const shipmentResult = await pool.query('SELECT id FROM shipments WHERE resi_number = $1', [resi]);
    if (shipmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Resi tidak ditemukan' });
    }

    const photosResult = await pool.query(
      `SELECT type, photo_data, created_at FROM proof_photos WHERE shipment_id = $1 ORDER BY created_at ASC`,
      [shipmentResult.rows[0].id]
    );

    return res.json(photosResult.rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getHistory, addUpdate, getPhotos };
