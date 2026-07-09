const pool = require('../config/db');
const { generateResi } = require('../utils/generateResi');
const { calculateOngkir } = require('../utils/calculateOngkir');

/**
 * POST /api/shipments/calculate
 * body: { originCityId, destinationCityId, weightKg, serviceType }
 * Endpoint publik (tanpa login) - dipakai untuk kalkulator ongkir di halaman utama.
 */
async function calculate(req, res, next) {
  try {
    const { originCityId, destinationCityId, weightKg, serviceType } = req.body;

    if (!originCityId || !destinationCityId || !weightKg || !serviceType) {
      return res.status(400).json({
        error: 'originCityId, destinationCityId, weightKg, dan serviceType wajib diisi',
      });
    }

    const result = await calculateOngkir(originCityId, destinationCityId, weightKg, serviceType);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/shipments
 * Butuh login (customer). Membuat shipment baru + resi + entri tracking pertama.
 * body: { senderName, senderPhone, senderAddress, originCityId,
 *         receiverName, receiverPhone, receiverAddress, destinationCityId,
 *         weightKg, lengthCm, widthCm, heightCm, serviceType }
 */
async function create(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      senderName, senderPhone, senderAddress, originCityId,
      receiverName, receiverPhone, receiverAddress, destinationCityId,
      weightKg, lengthCm, widthCm, heightCm, serviceType,
    } = req.body;

    const required = {
      senderName, senderPhone, senderAddress, originCityId,
      receiverName, receiverPhone, receiverAddress, destinationCityId,
      weightKg, serviceType,
    };
    const missing = Object.entries(required).filter(([, v]) => v === undefined || v === null || v === '');
    if (missing.length > 0) {
      return res.status(400).json({ error: `Field wajib belum diisi: ${missing.map(([k]) => k).join(', ')}` });
    }

    // Ongkir dihitung ulang di server (jangan percaya harga dari client)
    const ongkir = await calculateOngkir(originCityId, destinationCityId, weightKg, serviceType);

    // Ambil customer_id dari user yang login
    const customerResult = await pool.query('SELECT id FROM customers WHERE user_id = $1', [req.user.id]);
    const customerId = customerResult.rows[0] ? customerResult.rows[0].id : null;

    const resiNumber = generateResi();

    await client.query('BEGIN');

    const shipmentResult = await client.query(
      `INSERT INTO shipments (
         resi_number, customer_id,
         sender_name, sender_phone, sender_address, origin_city_id,
         receiver_name, receiver_phone, receiver_address, destination_city_id,
         weight_kg, length_cm, width_cm, height_cm,
         service_type, price, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'created')
       RETURNING *`,
      [
        resiNumber, customerId,
        senderName, senderPhone, senderAddress, originCityId,
        receiverName, receiverPhone, receiverAddress, destinationCityId,
        weightKg, lengthCm || null, widthCm || null, heightCm || null,
        serviceType, ongkir.price,
      ]
    );

    const shipment = shipmentResult.rows[0];

    await client.query(
      `INSERT INTO tracking_history (shipment_id, status, location_note, description, created_by)
       VALUES ($1, 'created', $2, 'Paket dibuat oleh pelanggan', $3)`,
      [shipment.id, senderAddress, req.user.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({ shipment, ongkir });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * GET /api/shipments/:resi
 * Detail shipment berdasarkan nomor resi (publik, dipakai juga oleh halaman tracking).
 */
async function getByResi(req, res, next) {
  try {
    const { resi } = req.params;
    const result = await pool.query('SELECT * FROM shipments WHERE resi_number = $1', [resi]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resi tidak ditemukan' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/shipments/tasks/available
 * Hanya courier/admin. Menampilkan paket yang belum ada kurirnya di kota tempat
 * kurir ini bertugas - baik tugas pickup (kota asal) maupun delivery (kota tujuan).
 */
async function getAvailableTasks(req, res, next) {
  try {
    const courierResult = await pool.query('SELECT id, city_id FROM couriers WHERE user_id = $1', [req.user.id]);
    if (courierResult.rows.length === 0) {
      return res.status(400).json({ error: 'Akun ini belum punya profil kurir (city_id belum diset)' });
    }
    const { city_id: cityId } = courierResult.rows[0];

    const result = await pool.query(
      `SELECT s.*, 
              CASE WHEN s.origin_city_id = $1 AND s.status = 'created' THEN 'pickup'
                   ELSE 'delivery' END AS task_type
       FROM shipments s
       WHERE s.assigned_courier_id IS NULL
         AND (
           (s.origin_city_id = $1 AND s.status = 'created')
           OR (s.destination_city_id = $1 AND s.status = 'at_destination_hub')
         )
       ORDER BY s.created_at ASC`,
      [cityId]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/shipments/tasks/mine
 * Paket yang sedang ditangani kurir ini (sudah diklaim, belum selesai).
 */
async function getMyTasks(req, res, next) {
  try {
    const courierResult = await pool.query('SELECT id FROM couriers WHERE user_id = $1', [req.user.id]);
    if (courierResult.rows.length === 0) {
      return res.status(400).json({ error: 'Akun ini belum punya profil kurir' });
    }
    const courierId = courierResult.rows[0].id;

    const result = await pool.query(
      `SELECT * FROM shipments
       WHERE assigned_courier_id = $1
         AND status NOT IN ('delivered', 'cancelled', 'returned')
       ORDER BY updated_at DESC`,
      [courierId]
    );

    return res.json(result.rows);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/shipments/:resi/claim
 * Kurir mengambil alih sebuah tugas. Pakai kondisi WHERE assigned_courier_id IS NULL
 * di query agar aman dari race condition kalau 2 kurir klaim bersamaan.
 */
async function claimTask(req, res, next) {
  try {
    const { resi } = req.params;
    const courierResult = await pool.query('SELECT id FROM couriers WHERE user_id = $1', [req.user.id]);
    if (courierResult.rows.length === 0) {
      return res.status(400).json({ error: 'Akun ini belum punya profil kurir' });
    }
    const courierId = courierResult.rows[0].id;

    const result = await pool.query(
      `UPDATE shipments SET assigned_courier_id = $1, updated_at = now()
       WHERE resi_number = $2 AND assigned_courier_id IS NULL
       RETURNING *`,
      [courierId, resi]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Paket tidak ditemukan atau sudah diambil kurir lain' });
    }

    return res.json({ message: 'Tugas berhasil diklaim', shipment: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { calculate, create, getByResi, getAvailableTasks, getMyTasks, claimTask };
