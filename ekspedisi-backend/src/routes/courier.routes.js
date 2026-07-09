const express = require('express');
const { getMe, updateStatus } = require('../controllers/courier.controller');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/me', verifyToken, requireRole('courier', 'admin'), getMe);
router.patch('/me/status', verifyToken, requireRole('courier'), updateStatus);

module.exports = router;
