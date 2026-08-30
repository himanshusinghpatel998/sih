const mongoose = require('../config/miniMongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {

    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    role: {
      type: String,
      enum: ['student', 'collector', 'admin', 'citizen', 'worker', 'supervisor'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    dept: {
      type: String,
      default: '',
    },
    // block is required for citizens and workers (legacy student/collector)
    block: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'E'],
      default: null,
      validate: {
        validator: function (v) {
          // Citizen/worker roles (and legacy student/collector) need a block
          if (['collector', 'student', 'citizen', 'worker'].includes(this.role)) return !!v;
          return true;
        },
        message: 'Block is required for citizens and workers',
      },
    },
    avatar: {
      type: String,
      default: null,
    },
    rewardPoints: {
      type: Number,
      default: 100,
    },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
