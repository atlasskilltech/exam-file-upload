// Run this script to create admin users:
// node scripts/seed-admins.js

const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function seedAdmins() {
  const users = [
    'asha.uchil@atlasuniversity.edu.in',
    'dhanashree.mane@atlasuniversity.edu.in',
    'hemal.thakker@atlasuniversity.edu.in'
  ];
  const password = 'Atlas@2026';
  const hashed = await bcrypt.hash(password, 10);

  for (const username of users) {
    try {
      const [existing] = await pool.execute('SELECT id FROM users WHERE username = ?', [username]);
      if (existing.length > 0) {
        console.log('Already exists:', username);
        continue;
      }
      await pool.execute(
        'INSERT INTO users (username, password, app_id, role) VALUES (?, ?, ?, ?)',
        [username, hashed, null, 'admin']
      );
      console.log('Created admin:', username);
    } catch (err) {
      console.error('Error creating', username, ':', err.message);
    }
  }

  console.log('\nDone. All admin users created with password: Atlas@2026');
  process.exit(0);
}

seedAdmins();
