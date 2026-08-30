/**
 * Creates/updates an admin login.
 * Run: node scripts/createAdmin.js [email] [password] [name]
 * Defaults to bilimagga / 10405 if no args given.
 */
require('dotenv').config();
const mongoose = require('../config/miniMongoose');
const connectDB = require('../config/db');
const { User } = require('../models');

const [, , argEmail, argPassword, argName] = process.argv;
const email = (argEmail || 'bilimagga').toLowerCase();
const password = argPassword || '10405';
const name = argName || 'Admin';

const run = async () => {
  await connectDB();

  let user = await User.findOne({ email });
  if (!user) {
    user = new User({ email, name, role: 'admin', password });
  } else {
    user.password = password;
    user.role = 'admin';
  }
  await user.save(); // triggers pre('save') bcrypt hashing
  console.log(` Admin ready — login with email "${email}" / password "${password}"`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(' createAdmin failed:', err);
  process.exit(1);
});
