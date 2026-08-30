/**
 * Storage: SQLite (via server/config/miniMongoose.js), not MongoDB.
 * No external DB service, no network, no account needed — the whole
 * database lives in server/data/nagarai.sqlite. See miniMongoose.js for why.
 */
const mongoose = require('./miniMongoose');

const connectDB = async () => {
  const conn = await mongoose.connect();
  console.log(`✅ Database ready: ${conn.connection.host}`);
};

module.exports = connectDB;
