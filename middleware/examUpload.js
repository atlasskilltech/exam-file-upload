// Multer configuration for exam answer file uploads
// Files upload to a temp directory first, then the controller
// moves them to the proper exam-named folder
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const tempDir = path.join(__dirname, '..', 'uploads', 'exam_submissions', '_temp');
fs.mkdirSync(tempDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const stamp = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, stamp + ext);
  }
});

module.exports = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB
});
