// Exam controller — admin exam management + student submissions
// Exams have multiple time slots (date, start_time, end_time, room)
const pool = require('../config/db');
const path = require('path');
const fs = require('fs');

const SUBMISSIONS_BASE = path.join(__dirname, '..', 'uploads', 'exam_submissions');
const PAPERS_BASE = path.join(__dirname, '..', 'uploads', 'exam_papers');
fs.mkdirSync(PAPERS_BASE, { recursive: true });

// ── Helper: build folder name from exam + slot ────────────
// Format: "{ExamTitle} - {Room} - {Date} - {Start}-{End}"
// Sanitizes for filesystem safety
function sanitize(str) {
  return (str || '').replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
}

// Helper: format MySQL date to YYYY-MM-DD string
function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Helper: format MySQL time to HH:MM string
function formatTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

async function getExamFolderName(examId) {
  const [exams] = await pool.execute('SELECT title, subject FROM exams WHERE id = ?', [examId]);
  if (exams.length === 0) return null;

  const [slots] = await pool.execute(
    'SELECT * FROM exam_slots WHERE exam_id = ? ORDER BY slot_date, start_time LIMIT 1',
    [examId]
  );

  const title = sanitize(exams[0].title);
  const subject = sanitize(exams[0].subject);
  if (slots.length === 0) return `${title} - ${subject}`;

  const slot = slots[0];
  const room = sanitize(slot.room);
  const date = formatDate(slot.slot_date);
  const start = formatTime(slot.start_time).replace(':', '');
  const end = formatTime(slot.end_time).replace(':', '');

  return `${title} - ${subject} - ${room} - ${date} - ${start}-${end}`;
}

function getExamFolderPath(folderName) {
  return path.join(SUBMISSIONS_BASE, folderName);
}

// ════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams — list all exams with slot count + submission count
exports.listExams = async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT e.*, u.username AS created_by_name,
        (SELECT COUNT(*) FROM exam_submissions WHERE exam_id = e.id) AS submission_count,
        (SELECT COUNT(*) FROM exam_slots WHERE exam_id = e.id) AS slot_count
      FROM exams e
      LEFT JOIN users u ON e.created_by = u.id
      ORDER BY e.created_at DESC
    `);

    // Fetch slots for each exam
    for (const exam of rows) {
      const [slots] = await pool.execute(
        'SELECT * FROM exam_slots WHERE exam_id = ? ORDER BY slot_date, start_time',
        [exam.id]
      );
      exam.slots = slots;
    }

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List exams error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exams' });
  }
};

// POST /exams/create — create exam with slots
exports.createExam = async (req, res) => {
  try {
    const { title, subject, slots } = req.body;
    const user = req.session.user;

    if (!title || !subject) {
      return res.status(400).json({ success: false, message: 'Title and subject are required' });
    }

    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one time slot is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO exams (title, subject, created_by) VALUES (?, ?, ?)',
      [title.trim(), subject.trim(), user.id]
    );

    const examId = result.insertId;

    // Insert slots
    for (const slot of slots) {
      if (!slot.slot_date || !slot.start_time || !slot.end_time || !slot.room) continue;
      await pool.execute(
        'INSERT INTO exam_slots (exam_id, slot_date, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)',
        [examId, slot.slot_date, slot.start_time, slot.end_time, slot.room.trim()]
      );
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'created exam', title.trim()]
    );

    return res.json({ success: true, data: { id: examId } });
  } catch (err) {
    console.error('Create exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create exam' });
  }
};

// PUT /exams/update/:id — update exam info + replace slots
exports.updateExam = async (req, res) => {
  try {
    const { title, subject, slots } = req.body;
    const examId = req.params.id;

    if (!title || !subject) {
      return res.status(400).json({ success: false, message: 'Title and subject are required' });
    }

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    await pool.execute(
      'UPDATE exams SET title = ?, subject = ? WHERE id = ?',
      [title.trim(), subject.trim(), examId]
    );

    // Replace all slots if provided
    if (slots && Array.isArray(slots)) {
      await pool.execute('DELETE FROM exam_slots WHERE exam_id = ?', [examId]);
      for (const slot of slots) {
        if (!slot.slot_date || !slot.start_time || !slot.end_time || !slot.room) continue;
        await pool.execute(
          'INSERT INTO exam_slots (exam_id, slot_date, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)',
          [examId, slot.slot_date, slot.start_time, slot.end_time, slot.room.trim()]
        );
      }
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'updated exam', title.trim()]
    );

    return res.json({ success: true, message: 'Exam updated' });
  } catch (err) {
    console.error('Update exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update exam' });
  }
};

// DELETE /exams/delete/:id
exports.deleteExam = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    // Delete files from disk — find all unique folders used by this exam's submissions
    const [subs] = await pool.execute(
      'SELECT DISTINCT folder_name FROM exam_submissions WHERE exam_id = ?', [examId]
    );
    for (const sub of subs) {
      if (sub.folder_name) {
        const dir = path.join(SUBMISSIONS_BASE, sub.folder_name);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    // Also clean up legacy folder if exists
    const legacyDir = path.join(SUBMISSIONS_BASE, `exam_${examId}`);
    if (fs.existsSync(legacyDir)) fs.rmSync(legacyDir, { recursive: true, force: true });

    // Clean up question paper files
    const paperDir = path.join(PAPERS_BASE, `exam_${examId}`);
    if (fs.existsSync(paperDir)) fs.rmSync(paperDir, { recursive: true, force: true });

    await pool.execute('DELETE FROM exams WHERE id = ?', [examId]);

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'deleted exam', exams[0].title]
    );

    return res.json({ success: true, message: 'Exam deleted' });
  } catch (err) {
    console.error('Delete exam error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
};

// POST /exams/:id/status
exports.changeStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const examId = req.params.id;

    if (!['active', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be active or closed' });
    }

    await pool.execute('UPDATE exams SET status = ? WHERE id = ?', [status, examId]);

    return res.json({ success: true, message: `Exam ${status}` });
  } catch (err) {
    console.error('Change status error:', err);
    return res.status(500).json({ success: false, message: 'Failed to change status' });
  }
};

// ── Slot management ───────────────────────────────────────

// POST /exams/:id/slots — add a single slot
exports.addSlot = async (req, res) => {
  try {
    const examId = req.params.id;
    const { slot_date, start_time, end_time, room } = req.body;

    if (!slot_date || !start_time || !end_time || !room) {
      return res.status(400).json({ success: false, message: 'All slot fields are required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO exam_slots (exam_id, slot_date, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)',
      [examId, slot_date, start_time, end_time, room.trim()]
    );

    return res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Add slot error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add slot' });
  }
};

// DELETE /exams/slots/:slotId — remove a slot
exports.deleteSlot = async (req, res) => {
  try {
    await pool.execute('DELETE FROM exam_slots WHERE id = ?', [req.params.slotId]);
    return res.json({ success: true, message: 'Slot deleted' });
  } catch (err) {
    console.error('Delete slot error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete slot' });
  }
};

// GET /exams/:id/slots — get all slots for an exam
exports.getSlots = async (req, res) => {
  try {
    const [slots] = await pool.execute(
      'SELECT * FROM exam_slots WHERE exam_id = ? ORDER BY slot_date, start_time',
      [req.params.id]
    );
    return res.json({ success: true, data: slots });
  } catch (err) {
    console.error('Get slots error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch slots' });
  }
};

// ── Submissions ───────────────────────────────────────────

// GET /exams/:id/submissions
exports.listSubmissions = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [slots] = await pool.execute(
      'SELECT * FROM exam_slots WHERE exam_id = ? ORDER BY slot_date, start_time',
      [examId]
    );

    const [submissions] = await pool.execute(`
      SELECT es.*, u.username AS student_name
      FROM exam_submissions es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
      ORDER BY es.submitted_at DESC
    `, [examId]);

    return res.json({
      success: true,
      data: { exam: exams[0], slots, submissions }
    });
  } catch (err) {
    console.error('List submissions error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
  }
};

// GET /exams/submissions/download/:id
exports.downloadSubmission = async (req, res) => {
  try {
    const subId = req.params.id;
    const user = req.session.user;

    let query = 'SELECT es.*, e.title AS exam_title FROM exam_submissions es LEFT JOIN exams e ON es.exam_id = e.id WHERE es.id = ?';
    const params = [subId];

    if (user.role === 'student') {
      query += ' AND es.student_id = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const sub = rows[0];
    const filePath = sub.folder_name
      ? path.join(SUBMISSIONS_BASE, sub.folder_name, sub.stored_name)
      : path.join(SUBMISSIONS_BASE, `exam_${sub.exam_id}`, `student_${sub.student_id}`, sub.stored_name);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    res.download(filePath, sub.original_name);
  } catch (err) {
    console.error('Download submission error:', err);
    return res.status(500).json({ success: false, message: 'Download failed' });
  }
};

// GET /exams/:id/submissions/export
exports.exportCSV = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT title FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [rows] = await pool.execute(`
      SELECT u.username AS student, es.original_name AS file,
             es.submitted_at, es.size_bytes
      FROM exam_submissions es
      LEFT JOIN users u ON es.student_id = u.id
      WHERE es.exam_id = ?
      ORDER BY u.username
    `, [examId]);

    let csv = 'Student,File,Submitted At,Size\n';
    for (const r of rows) {
      csv += [
        r.student,
        `"${(r.file || '').replace(/"/g, '""')}"`,
        r.submitted_at,
        r.size_bytes
      ].join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=exam_${examId}_submissions.csv`);
    return res.send(csv);
  } catch (err) {
    console.error('Export CSV error:', err);
    return res.status(500).json({ success: false, message: 'Failed to export' });
  }
};

// GET /admin/students
exports.listStudents = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, username, app_id, created_at FROM users WHERE role = 'student' ORDER BY username"
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List students error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch students' });
  }
};

// GET /admin/exam-stats
exports.examStats = async (req, res) => {
  try {
    const [totalExams] = await pool.execute('SELECT COUNT(*) AS count FROM exams');
    const [activeExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'active'");
    const [closedExams] = await pool.execute("SELECT COUNT(*) AS count FROM exams WHERE status = 'closed'");
    const [totalSubs] = await pool.execute('SELECT COUNT(*) AS count FROM exam_submissions');
    const [totalStudents] = await pool.execute("SELECT COUNT(*) AS count FROM users WHERE role = 'student'");
    const [totalSlots] = await pool.execute('SELECT COUNT(*) AS count FROM exam_slots');

    const [subsPerExam] = await pool.execute(`
      SELECT e.title, COUNT(es.id) AS count
      FROM exams e LEFT JOIN exam_submissions es ON e.id = es.exam_id
      GROUP BY e.id ORDER BY count DESC LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        totalExams: totalExams[0].count,
        activeExams: activeExams[0].count,
        closedExams: closedExams[0].count,
        totalSubmissions: totalSubs[0].count,
        totalStudents: totalStudents[0].count,
        totalSlots: totalSlots[0].count,
        subsPerExam
      }
    });
  } catch (err) {
    console.error('Exam stats error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exam stats' });
  }
};

// ── Question Paper Management ─────────────────────────────

// POST /exams/:id/question-papers — upload question paper(s)
exports.uploadQuestionPaper = async (req, res) => {
  try {
    const examId = req.params.id;
    const user = req.session.user;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = req.file;
    const tempPath = file.path;

    // Move to exam_papers/{exam_id}/
    const paperDir = path.join(PAPERS_BASE, `exam_${examId}`);
    fs.mkdirSync(paperDir, { recursive: true });

    const ext = path.extname(file.originalname);
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const destPath = path.join(paperDir, storedName);

    fs.copyFileSync(tempPath, destPath);
    fs.unlinkSync(tempPath);

    const [result] = await pool.execute(
      `INSERT INTO exam_question_papers (exam_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [examId, file.originalname, storedName, file.mimetype, file.size, user.id]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'uploaded question paper', exams[0].title + ' - ' + file.originalname]
    );

    return res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Upload question paper error:', err);
    return res.status(500).json({ success: false, message: 'Failed to upload question paper' });
  }
};

// GET /exams/:id/question-papers — list question papers for an exam
exports.listQuestionPapers = async (req, res) => {
  try {
    const examId = req.params.id;
    const [papers] = await pool.execute(
      `SELECT qp.*, u.username AS uploaded_by_name
       FROM exam_question_papers qp
       LEFT JOIN users u ON qp.uploaded_by = u.id
       WHERE qp.exam_id = ?
       ORDER BY qp.uploaded_at DESC`,
      [examId]
    );
    return res.json({ success: true, data: papers });
  } catch (err) {
    console.error('List question papers error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch question papers' });
  }
};

// GET /exams/question-papers/download/:id — download a question paper
exports.downloadQuestionPaper = async (req, res) => {
  try {
    const paperId = req.params.id;
    const user = req.session.user;

    const [rows] = await pool.execute(
      'SELECT qp.*, e.title AS exam_title FROM exam_question_papers qp LEFT JOIN exams e ON qp.exam_id = e.id WHERE qp.id = ?',
      [paperId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }

    const paper = rows[0];

    // If student, verify they are assigned to this exam
    if (user.role === 'student') {
      const [assigned] = await pool.execute(
        'SELECT id FROM exam_students WHERE exam_id = ? AND student_id = ?',
        [paper.exam_id, user.id]
      );
      if (assigned.length === 0) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this exam' });
      }
    }

    const filePath = path.join(PAPERS_BASE, `exam_${paper.exam_id}`, paper.stored_name);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk' });
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'downloaded question paper', paper.exam_title + ' - ' + paper.original_name]
    );

    res.download(filePath, paper.original_name);
  } catch (err) {
    console.error('Download question paper error:', err);
    return res.status(500).json({ success: false, message: 'Download failed' });
  }
};

// DELETE /exams/question-papers/:id — delete a question paper
exports.deleteQuestionPaper = async (req, res) => {
  try {
    const paperId = req.params.id;

    const [rows] = await pool.execute('SELECT * FROM exam_question_papers WHERE id = ?', [paperId]);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Question paper not found' });
    }

    const paper = rows[0];
    const filePath = path.join(PAPERS_BASE, `exam_${paper.exam_id}`, paper.stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.execute('DELETE FROM exam_question_papers WHERE id = ?', [paperId]);

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'deleted question paper', paper.original_name]
    );

    return res.json({ success: true, message: 'Question paper deleted' });
  } catch (err) {
    console.error('Delete question paper error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete question paper' });
  }
};

// ── Student Assignment Management ─────────────────────────

// GET /exams/:id/assigned-students — list students assigned to an exam
exports.getAssignedStudents = async (req, res) => {
  try {
    const examId = req.params.id;
    const [rows] = await pool.execute(
      `SELECT es.id AS assignment_id, es.assigned_at, u.id AS student_id, u.username, u.app_id
       FROM exam_students es
       LEFT JOIN users u ON es.student_id = u.id
       WHERE es.exam_id = ?
       ORDER BY u.username`,
      [examId]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get assigned students error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch assigned students' });
  }
};

// POST /exams/:id/assign-students — assign students to an exam
exports.assignStudents = async (req, res) => {
  try {
    const examId = req.params.id;
    const { student_ids } = req.body;

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Provide an array of student_ids' });
    }

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    let added = 0;
    for (const sid of student_ids) {
      try {
        await pool.execute(
          'INSERT IGNORE INTO exam_students (exam_id, student_id) VALUES (?, ?)',
          [examId, sid]
        );
        added++;
      } catch (e) {
        // skip duplicates or invalid refs
      }
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'assigned students to exam', exams[0].title + ' (' + added + ' students)']
    );

    return res.json({ success: true, message: `${added} student(s) assigned`, data: { added } });
  } catch (err) {
    console.error('Assign students error:', err);
    return res.status(500).json({ success: false, message: 'Failed to assign students' });
  }
};

// POST /exams/:id/assign-students-csv — bulk assign via CSV (app_id list)
exports.assignStudentsCSV = async (req, res) => {
  try {
    const examId = req.params.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No CSV file uploaded' });
    }

    const csvContent = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path); // clean up temp file

    const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
    let added = 0;
    let skipped = 0;
    const errors = [];

    for (const line of lines) {
      // Each line can be just app_id, or name,app_id — extract app_id
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
      // If 1 column: app_id. If 2+ columns: last column or second column is app_id
      let appId = parts.length === 1 ? parts[0] : parts[1];
      if (!appId) continue;

      // Skip header row
      if (appId.toLowerCase() === 'app_id' || appId.toLowerCase() === 'appid' || appId.toLowerCase() === 'id') continue;

      // Find student by app_id
      const [students] = await pool.execute(
        "SELECT id FROM users WHERE app_id = ? AND role = 'student'",
        [appId]
      );

      if (students.length === 0) {
        errors.push(appId);
        skipped++;
        continue;
      }

      try {
        await pool.execute(
          'INSERT IGNORE INTO exam_students (exam_id, student_id) VALUES (?, ?)',
          [examId, students[0].id]
        );
        added++;
      } catch (e) {
        skipped++;
      }
    }

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [req.session.user.id, 'bulk assigned students to exam (CSV)', exams[0].title + ' (' + added + ' added, ' + skipped + ' skipped)']
    );

    return res.json({
      success: true,
      message: `${added} student(s) assigned, ${skipped} skipped`,
      data: { added, skipped, errors }
    });
  } catch (err) {
    console.error('Assign students CSV error:', err);
    return res.status(500).json({ success: false, message: 'Failed to process CSV' });
  }
};

// DELETE /exams/:id/unassign-student/:studentId — remove student from exam
exports.unassignStudent = async (req, res) => {
  try {
    const { id: examId, studentId } = req.params;
    await pool.execute(
      'DELETE FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [examId, studentId]
    );
    return res.json({ success: true, message: 'Student removed from exam' });
  } catch (err) {
    console.error('Unassign student error:', err);
    return res.status(500).json({ success: false, message: 'Failed to unassign student' });
  }
};

// ════════════════════════════════════════════════════════════
// STUDENT ENDPOINTS
// ════════════════════════════════════════════════════════════

// GET /exams/student/list — exams visible to assigned students (within time window)
exports.studentExamList = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Show exams that are active, student is assigned, and at least one slot hasn't ended yet
    const [exams] = await pool.execute(`
      SELECT e.*,
        (SELECT COUNT(*) FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ?) AS submitted,
        (SELECT sub.id FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_id,
        (SELECT sub.original_name FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_file,
        (SELECT sub.submitted_at FROM exam_submissions sub WHERE sub.exam_id = e.id AND sub.student_id = ? LIMIT 1) AS submission_date
      FROM exams e
      INNER JOIN exam_students ea ON ea.exam_id = e.id AND ea.student_id = ?
      WHERE e.status = 'active'
        AND EXISTS (SELECT 1 FROM exam_slots s WHERE s.exam_id = e.id AND CONCAT(s.slot_date, ' ', s.end_time) > NOW())
      ORDER BY e.created_at DESC
    `, [userId, userId, userId, userId, userId]);

    // Fetch slots that haven't ended yet and question papers for each exam
    for (const exam of exams) {
      const [slots] = await pool.execute(
        'SELECT * FROM exam_slots WHERE exam_id = ? AND CONCAT(slot_date, \' \', end_time) > NOW() ORDER BY slot_date, start_time',
        [exam.id]
      );
      exam.slots = slots;

      const [papers] = await pool.execute(
        'SELECT id, original_name, size_bytes FROM exam_question_papers WHERE exam_id = ? ORDER BY uploaded_at',
        [exam.id]
      );
      exam.question_papers = papers;
    }

    return res.json({ success: true, data: exams });
  } catch (err) {
    console.error('Student exam list error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exams' });
  }
};

// GET /exams/student/:id — single exam detail (must be assigned)
exports.studentExamDetail = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    // Check assignment
    const [assigned] = await pool.execute(
      'SELECT id FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (assigned.length === 0) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this exam' });
    }

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const [slots] = await pool.execute(
      'SELECT * FROM exam_slots WHERE exam_id = ? ORDER BY slot_date, start_time',
      [examId]
    );

    const [subs] = await pool.execute(
      'SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );

    const [papers] = await pool.execute(
      'SELECT id, original_name, size_bytes FROM exam_question_papers WHERE exam_id = ? ORDER BY uploaded_at',
      [examId]
    );

    return res.json({
      success: true,
      data: { exam: exams[0], slots, submission: subs[0] || null, question_papers: papers }
    });
  } catch (err) {
    console.error('Student exam detail error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch exam' });
  }
};

// POST /exams/student/:id/submit — upload answer file
exports.submitAnswer = async (req, res) => {
  try {
    const examId = req.params.id;
    const userId = req.session.user.id;

    const [exams] = await pool.execute('SELECT * FROM exams WHERE id = ?', [examId]);
    if (exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const exam = exams[0];

    // Check student is assigned to this exam
    const [assigned] = await pool.execute(
      'SELECT id FROM exam_students WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );
    if (assigned.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'You are not assigned to this exam' });
    }

    if (exam.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Exam is closed, submissions not accepted' });
    }

    // Check if last slot has passed (let MySQL compare using server time)
    const [expiredCheck] = await pool.execute(
      `SELECT COUNT(*) AS still_open FROM exam_slots
       WHERE exam_id = ? AND CONCAT(slot_date, ' ', end_time) > NOW()`,
      [examId]
    );

    if (expiredCheck[0].still_open === 0) {
      return res.status(400).json({ success: false, message: 'All exam slots have ended' });
    }

    const [existing] = await pool.execute(
      'SELECT * FROM exam_submissions WHERE exam_id = ? AND student_id = ?',
      [examId, userId]
    );

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const file = req.file;
    const tempPath = file.path; // multer saved to _temp/

    // Build the exam folder name: "{Title} - {Room} - {Date} - {Start}-{End}"
    const folderName = await getExamFolderName(examId);
    if (!folderName) {
      fs.unlinkSync(tempPath);
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const folderPath = getExamFolderPath(folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    // Filename: "{app_id}-{timestamp}{ext}"
    const appId = req.session.user.app_id || req.session.user.username;
    const ext = path.extname(file.originalname);
    const storedName = `${sanitize(appId)}-${Date.now()}${ext}`;
    const destPath = path.join(folderPath, storedName);

    // Move file from temp to exam folder (copy+delete for cross-device safety)
    fs.copyFileSync(tempPath, destPath);
    fs.unlinkSync(tempPath);

    // If re-uploading, delete old file and update record
    if (existing.length > 0) {
      const old = existing[0];
      const oldFolder = old.folder_name ? getExamFolderPath(old.folder_name) : null;
      if (oldFolder) {
        const oldFilePath = path.join(oldFolder, old.stored_name);
        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
      }

      await pool.execute(
        `UPDATE exam_submissions SET original_name = ?, stored_name = ?, folder_name = ?, mime_type = ?, size_bytes = ?, submitted_at = NOW()
         WHERE id = ?`,
        [file.originalname, storedName, folderName, file.mimetype, file.size, old.id]
      );

      await pool.execute(
        'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
        [userId, 're-uploaded exam answer', exam.title + ' - ' + file.originalname]
      );

      return res.json({ success: true, data: { id: old.id, reupload: true } });
    }

    // First submission
    const [result] = await pool.execute(
      `INSERT INTO exam_submissions (exam_id, student_id, original_name, stored_name, folder_name, mime_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [examId, userId, file.originalname, storedName, folderName, file.mimetype, file.size]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [userId, 'submitted exam answer', exam.title + ' - ' + file.originalname]
    );

    return res.json({ success: true, data: { id: result.insertId } });
  } catch (err) {
    console.error('Submit answer error:', err.message, err.stack);
    return res.status(500).json({ success: false, message: 'Submission failed: ' + err.message });
  }
};

// GET /exams/student/history
exports.studentHistory = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const [rows] = await pool.execute(`
      SELECT es.*, e.title AS exam_title, e.subject AS exam_subject
      FROM exam_submissions es
      LEFT JOIN exams e ON es.exam_id = e.id
      WHERE es.student_id = ?
      ORDER BY es.submitted_at DESC
    `, [userId]);

    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Student history error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
};
