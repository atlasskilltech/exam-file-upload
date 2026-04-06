// Category controller — list, create, update, delete
const pool = require('../config/db');

// GET /categories
exports.listCategories = async (req, res) => {
  try {
    const user = req.session.user;

    let query, params;
    if (user.role === 'admin') {
      // Admin sees all categories with file count
      query = `SELECT c.*, u.username AS creator,
               (SELECT COUNT(*) FROM uploaded_files WHERE category_id = c.id) AS file_count
               FROM categories c LEFT JOIN users u ON c.created_by = u.id ORDER BY c.name`;
      params = [];
    } else {
      // User sees own categories with file count
      query = `SELECT c.*,
               (SELECT COUNT(*) FROM uploaded_files WHERE category_id = c.id AND uploaded_by = ?) AS file_count
               FROM categories c WHERE c.created_by = ? ORDER BY c.name`;
      params = [user.id, user.id];
    }

    const [rows] = await pool.execute(query, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List categories error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// POST /categories
exports.createCategory = async (req, res) => {
  try {
    const user = req.session.user;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO categories (name, description, created_by) VALUES (?, ?, ?)',
      [name.trim(), description || '', user.id]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'created category', name.trim()]
    );

    return res.json({ success: true, data: { id: result.insertId, name: name.trim() } });
  } catch (err) {
    console.error('Create category error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create category' });
  }
};

// PUT /categories/:id
exports.updateCategory = async (req, res) => {
  try {
    const user = req.session.user;
    const catId = req.params.id;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }

    // Check ownership (admin can edit any)
    let query = 'SELECT * FROM categories WHERE id = ?';
    const params = [catId];
    if (user.role !== 'admin') {
      query += ' AND created_by = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await pool.execute(
      'UPDATE categories SET name = ?, description = ? WHERE id = ?',
      [name.trim(), description || '', catId]
    );

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'updated category', name.trim()]
    );

    return res.json({ success: true, message: 'Category updated' });
  } catch (err) {
    console.error('Update category error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update category' });
  }
};

// DELETE /categories/:id
exports.deleteCategory = async (req, res) => {
  try {
    const user = req.session.user;
    const catId = req.params.id;

    let query = 'SELECT * FROM categories WHERE id = ?';
    const params = [catId];
    if (user.role !== 'admin') {
      query += ' AND created_by = ?';
      params.push(user.id);
    }

    const [rows] = await pool.execute(query, params);
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    const catName = rows[0].name;

    // Nullify category_id on files in this category
    await pool.execute('UPDATE uploaded_files SET category_id = NULL WHERE category_id = ?', [catId]);

    // Delete the category
    await pool.execute('DELETE FROM categories WHERE id = ?', [catId]);

    await pool.execute(
      'INSERT INTO activity_log (user_id, action, target) VALUES (?, ?, ?)',
      [user.id, 'deleted category', catName]
    );

    return res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    console.error('Delete category error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete category' });
  }
};
