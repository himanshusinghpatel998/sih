/**
 * Storage: SQLite (via server/config/miniMongoose.js), not MongoDB.
 * No external DB service, no network, no account needed — the whole
 * database lives in server/data/nagarai.sqlite. See miniMongoose.js for why.
 */
const mongoose = require('./miniMongoose');
const { User } = require('../models');

const ensureDefaultAdmin = async () => {
  const adminEmail = 'admin@nagarai.test';
  const existingAdmin = await User.findOne({ email: adminEmail });

  if (!existingAdmin) {
    const admin = await User.create({
      name: 'Municipal Admin',
      email: adminEmail,
      password: 'admin123',
      role: 'admin',
      rewardPoints: 0,
    });

    console.log(`✅ Default admin ready: ${admin.email} / admin123`);
    return admin;
  }

  return existingAdmin;
};

const connectDB = async () => {
  const conn = await mongoose.connect();
  console.log(`✅ Database ready: ${conn.connection.host}`);

  await ensureDefaultAdmin();
  return conn;
};

module.exports = connectDB;
