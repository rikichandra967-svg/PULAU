// Vercel mendeteksi file di folder /api sebagai serverless function.
// Express app itu sendiri adalah function dengan signature (req, res) yang kompatibel,
// jadi cukup di-export langsung, tanpa perlu app.listen().
module.exports = require('../src/app');
