const express = require('express');
const {
  getStats, getAllShipments,
  getTariffs, upsertTariff, deleteTariff,
  getProvinces, createProvince, createCity,
} = require('../controllers/admin.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Semua endpoint di sini WAJIB login sebagai admin
router.use(verifyToken, requireRole('admin'));

router.get('/stats', getStats);
router.get('/shipments', getAllShipments);

router.get('/tariffs', getTariffs);
router.post('/tariffs', upsertTariff);
router.delete('/tariffs/:id', deleteTariff);

router.get('/provinces', getProvinces);
router.post('/provinces', createProvince);
router.post('/cities', createCity);

module.exports = router;
