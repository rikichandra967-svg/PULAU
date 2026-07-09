/**
 * Menghasilkan nomor resi unik, contoh: EKS172345678901ID
 * Format: [PREFIX][13 digit timestamp][3 digit random]ID
 * Timestamp menjamin urutan waktu, random menghindari tabrakan
 * jika ada 2 request pada milidetik yang sama.
 */
function generateResi(prefix = process.env.RESI_PREFIX || 'EKS') {
  const timestamp = Date.now().toString(); // 13 digit
  const random = Math.floor(100 + Math.random() * 900); // 3 digit, 100-999
  return `${prefix}${timestamp}${random}ID`;
}

module.exports = { generateResi };
