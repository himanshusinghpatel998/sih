const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sqlitePath = path.join(__dirname, '..', 'data', 'tmp-default-admin.sqlite');
const sqliteWalPath = `${sqlitePath}-wal`;
const sqliteShmPath = `${sqlitePath}-shm`;

const cleanupTmpDb = async () => {
  await mongoose.disconnect();
  for (const file of [sqlitePath, sqliteWalPath, sqliteShmPath]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
};

process.env.SQLITE_PATH = sqlitePath;

for (const mod of ['../config/miniMongoose', '../config/db', '../models/User']) {
  delete require.cache[require.resolve(mod)];
}

const mongoose = require('../config/miniMongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

test('connectDB creates a default admin when the database is empty', async () => {
  await cleanupTmpDb();
  await connectDB();

  const admin = await User.findOne({ email: 'admin@nagarai.test' });
  assert.ok(admin, 'default admin should be created');
  assert.equal(admin.role, 'admin');
  assert.equal(admin.email, 'admin@nagarai.test');
  assert.equal(admin.name, 'Municipal Admin');

  const passwordMatches = await admin.matchPassword('admin123');
  assert.equal(passwordMatches, true);
});

test.after(async () => {
  await cleanupTmpDb();
});
