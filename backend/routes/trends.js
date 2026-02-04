const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/middleware.auth');
const { getTrends } = require('../controllers/controllers.thread');

router.get('/', protect, getTrends);

module.exports = router;