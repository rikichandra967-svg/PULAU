require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const shipmentRoutes = require('./routes/shipment.routes');
const trackingRoutes = require('./routes/tracking.routes');
const cityRoutes = require('./routes/city.routes');
const courierRoutes = require('./routes/courier.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' })); // dinaikkan dari default 100kb supaya bisa terima foto base64

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ekspedisi-backend' });
});

app.use('/api/auth', authRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/admin', adminRoutes);

// 404 untuk route yang tidak dikenal
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// Error handler global - semua controller memanggil next(err) untuk sampai ke sini
app.use((err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Terjadi kesalahan pada server' : err.message,
  });
});

// Hanya expose "app" di sini, TANPA app.listen().
// Ini yang memungkinkan file yang sama dipakai baik oleh server tradisional (Render, VPS, dst)
// maupun dibungkus sebagai serverless function (Vercel) - keduanya tinggal import app ini.
module.exports = app;
