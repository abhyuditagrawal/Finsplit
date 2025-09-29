const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Food & Dining', 'Transportation', 'Shopping', 'Entertainment', 
           'Bills & Utilities', 'Healthcare', 'Others', 'Split']
  },
  date: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  // Split-specific fields
  splits: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    share: {
      type: Number,
      required: true,
      min: 0
    },
    paid: {
      type: Boolean,
      default: false
    },
    paidAt: {
      type: Date,
      default: null
    },
    paymentMethod: {
      type: String,
      enum: ['manual', 'upi', 'cash', 'bank_transfer'],
      default: 'manual'
    },
    transactionId: {
      type: String,
      default: null
    }
  }],
  splitType: {
    type: String,
    // enum: ['equal', 'exact', 'percent'],
    default: null
  },
  receiptUrl: {
    type: String,
    default: null
  },
  isSettled: {
    type: Boolean,
    default: false
  },
  settledAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Virtual to check if expense is a split
expenseSchema.virtual('isSplit').get(function() {
  return this.splits && this.splits.length > 0;
});

// Virtual to get unsettled amount
expenseSchema.virtual('unsettledAmount').get(function() {
  if (!this.splits || this.splits.length === 0) return 0;
  return this.splits
    .filter(split => !split.paid)
    .reduce((sum, split) => sum + split.share, 0);
});

// Include virtuals when converting to JSON
expenseSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Expense', expenseSchema);
