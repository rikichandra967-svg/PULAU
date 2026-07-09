const express = require('express');
const { getHistory, addUpdate, getPhotos } = require('../controllers/tracking.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Publik - siapa saja bisa lacak paket dengan nomor resi
router.get('/:resi', getHistory);
router.get('/:resi/photos', getPhotos);

// Hanya kurir & admin yang boleh update status perjalanan paket
router.post('/:resi/update', verifyToken, requireRole('courier', 'admin'), addUpdate);

module.exports = router;
