// Multer configuration for exam answer file uploads
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(
      __dirname, '..', 'uploads', 'exam_submissions',
      `exam_${req.params.id}`,
      `student_${req.session.user.id}`
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
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
