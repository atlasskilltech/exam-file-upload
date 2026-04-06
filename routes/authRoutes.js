// Auth routes — login, logout, session check
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /auth/login — authenticate user
router.post('/login', authController.login);

// GET /auth/logout — destroy session
router.get('/logout', authController.logout);

// GET /auth/check — check if session is active (used by frontend)
router.get('/check', authController.check);

module.exports = router;
