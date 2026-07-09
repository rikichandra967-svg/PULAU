const pool = require('../config/db');

/**
 * Menghitung ongkir berdasarkan:
 *   - zona pulau asal & tujuan (diambil dari provinces.island_zone via cities)
 *   - berat paket (dibulatkan ke atas per kg, minimal 1kg)
 *   - jenis layanan (regular/express/same_day/cargo)
 *
 * Rumus: price = base_price + (berat_dibulatkan_kg * price_per_kg)
 *
 * @param {number} originCityId
 * @param {number} destinationCityId
 * @param {number} weightKg
 * @param {string} serviceType - 'regular' | 'express' | 'same_day' | 'cargo'
 * @returns {Promise<{price: number, estimatedDaysMin: number, estimatedDaysMax: number, originZone: string, destinationZone: string}>}
 */
async function calculateOngkir(originCityId, destinationCityId, weightKg, serviceType) {
  // Ambil zona pulau dari kota asal & tujuan
  const zoneQuery = await pool.query(
    `SELECT c.id AS city_id, p.island_zone
     FROM cities c
     JOIN provinces p ON p.id = c.province_id
     WHERE c.id = ANY($1::int[])`,
    [[originCityId, destinationCityId]]
  );

  const zoneByCity = {};
  for (const row of zoneQuery.rows) {
    zoneByCity[row.city_id] = row.island_zone;
  }

  const originZone = zoneByCity[originCityId];
  const destinationZone = zoneByCity[destinationCityId];

  if (!originZone || !destinationZone) {
    const err = new Error('Kota asal atau tujuan tidak ditemukan di master data wilayah');
    err.statusCode = 400;
    throw err;
  }

  // Ambil tarif untuk kombinasi zona + layanan ini
  const tariffQuery = await pool.query(
    `SELECT base_price, price_per_kg, estimated_days_min, estimated_days_max
     FROM tariffs
     WHERE origin_zone = $1 AND destination_zone = $2 AND service_type = $3`,
    [originZone, destinationZone, serviceType]
  );

  if (tariffQuery.rows.length === 0) {
    const err = new Error(
      `Belum ada tarif untuk rute ${originZone} -> ${destinationZone} dengan layanan ${serviceType}`
    );
    err.statusCode = 400;
    throw err;
  }

  const tariff = tariffQuery.rows[0];
  const billedWeight = Math.max(1, Math.ceil(Number(weightKg))); // minimal 1kg, dibulatkan ke atas

  const price = Number(tariff.base_price) + billedWeight * Number(tariff.price_per_kg);

  return {
    price,
    billedWeightKg: billedWeight,
    estimatedDaysMin: tariff.estimated_days_min,
    estimatedDaysMax: tariff.estimated_days_max,
    originZone,
    destinationZone,
  };
}

module.exports = { calculateOngkir };
