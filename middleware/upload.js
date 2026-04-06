// Multer configuration for file uploads
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
const maxSize = (parseInt(process.env.MAX_FILE_SIZE_MB) || 500) * 1024 * 1024;

// Storage config — unique timestamped filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxSize }
});

module.exports = upload;
