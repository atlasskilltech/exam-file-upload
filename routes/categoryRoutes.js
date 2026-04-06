// Category routes — CRUD for file categories
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const categoryController = require('../controllers/categoryController');

router.use(requireAuth);

// GET /categories — list categories
router.get('/', categoryController.listCategories);

// POST /categories — create a new category
router.post('/', categoryController.createCategory);

// PUT /categories/:id — rename/update a category
router.put('/:id', categoryController.updateCategory);

// DELETE /categories/:id — delete a category
router.delete('/:id', categoryController.deleteCategory);

module.exports = router;
