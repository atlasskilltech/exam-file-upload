// File routes — upload, list, download, delete
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const fileController = require('../controllers/fileController');
const upload = require('../middleware/upload');

// All file routes require authentication
router.use(requireAuth);

// GET /files — list files with search/filter/sort/pagination
router.get('/', fileController.listFiles);

// POST /files/upload — upload one or more files
router.post('/upload', upload.array('files', 20), fileController.uploadFiles);

// GET /files/download/:id — download a single file
router.get('/download/:id', fileController.downloadFile);

// DELETE /files/delete/:id — delete a file
router.delete('/delete/:id', fileController.deleteFile);

module.exports = router;
