const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6
  },
  upiId: {
    type: String,
    required: [true, 'UPI ID is required'],
    trim: true
  },
  avatar: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    trim: true
  },
  // ADD THESE NEW FIELDS FOR PROFILE FUNCTIONALITY
  resetPasswordToken: {
    type: String,
    default: undefined
  },
  resetPasswordExpiry: {
    type: Date,
    default: undefined
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  preferences: {
    notifications: {
      type: Boolean,
      default: true
    },
    currency: {
      type: String,
      default: 'INR'
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    }
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
userSchema.methods.generateResetToken = function() {
  const crypto = require('crypto');
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  // Hash token and set expire time
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Check if reset token is valid
userSchema.methods.isResetTokenValid = function(token) {
  const crypto = require('crypto');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  
  return this.resetPasswordToken === hashedToken && 
         this.resetPasswordExpiry > Date.now();
};

// Update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save({ validateBeforeSave: false });
};

// Get user stats
userSchema.methods.getStats = async function() {
  const Expense = mongoose.model('Expense');
  
  try {
    const totalExpenses = await Expense.countDocuments({ owner: this._id });
    const totalSplits = await Expense.countDocuments({
      $or: [
        { owner: this._id, 'splits.0': { $exists: true } },
        { 'splits.user': this._id }
      ]
    });
    
    const totalAmount = await Expense.aggregate([
      { $match: { owner: this._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    return {
      totalExpenses,
      totalSplits,
      totalSpent: totalAmount[0]?.total || 0,
      memberSince: this.createdAt,
      lastActive: this.lastLogin
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    return {
      totalExpenses: 0,
      totalSplits: 0,
      totalSpent: 0,
      memberSince: this.createdAt,
      lastActive: this.lastLogin
    };
  }
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.resetPasswordToken;
  delete userObject.resetPasswordExpiry;
  return userObject;
};

// Index for better performance
userSchema.index({ email: 1 });
userSchema.index({ resetPasswordToken: 1 });

module.exports = mongoose.model('User', userSchema);
