const express = require('express');
const { calculate, create, getByResi, getAvailableTasks, getMyTasks, claimTask } = require('../controllers/shipment.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Publik - dipakai di halaman kalkulator ongkir sebelum user login
router.post('/calculate', calculate);

// Kurir/admin - daftar tugas yang tersedia & yang sedang ditangani
router.get('/tasks/available', verifyToken, requireRole('courier', 'admin'), getAvailableTasks);
router.get('/tasks/mine', verifyToken, requireRole('courier', 'admin'), getMyTasks);
router.post('/:resi/claim', verifyToken, requireRole('courier', 'admin'), claimTask);

// Publik - halaman tracking bisa dibuka tanpa login, cukup dengan nomor resi
router.get('/:resi', getByResi);

// Butuh login - membuat pengiriman baru
router.post('/', verifyToken, create);

module.exports = router;
