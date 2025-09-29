const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['Food & Dining', 'Transportation', 'Shopping', 'Entertainment', 
           'Bills & Utilities', 'Healthcare', 'Others', 'All Categories']
  },
  period: {
    type: String,
    required: true,
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  spent: {
    type: Number,
    default: 0
  },
  lastCalculated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  alertThreshold: {
    type: Number,
    default: 80, // Alert when 80% of budget is spent
    min: 50,
    max: 95
  },
  alertSent: {
    type: Boolean,
    default: false
  },
  includeGroups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  excludeCategories: [{
    type: String,
    enum: ['Food & Dining', 'Transportation', 'Shopping', 'Entertainment', 
           'Bills & Utilities', 'Healthcare', 'Others', 'Split']
  }],
  notes: {
    type: String,
    maxlength: 200
  }
}, {
  timestamps: true
});

// Virtual to get remaining amount
budgetSchema.virtual('remaining').get(function() {
  return Math.max(0, this.amount - this.spent);
});

// Virtual to get spending percentage
budgetSchema.virtual('spentPercentage').get(function() {
  return this.amount > 0 ? Math.round((this.spent / this.amount) * 100) : 0;
});

// Virtual to check if budget is exceeded
budgetSchema.virtual('isExceeded').get(function() {
  return this.spent > this.amount;
});

// Virtual to check if alert threshold is reached
budgetSchema.virtual('shouldAlert').get(function() {
  return !this.alertSent && this.spentPercentage >= this.alertThreshold;
});

// Virtual to get days remaining
budgetSchema.virtual('daysRemaining').get(function() {
  const today = new Date();
  const timeDiff = this.endDate - today;
  return Math.max(0, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
});

// Method to calculate spending for this budget period
budgetSchema.methods.calculateSpending = async function() {
  const Expense = mongoose.model('Expense');
  
  let query = {
    owner: this.user,
    date: { $gte: this.startDate, $lte: this.endDate }
  };

  // Filter by category if not "All Categories"
  if (this.category !== 'All Categories') {
    query.category = this.category;
  }

  // Exclude certain categories if specified
  if (this.excludeCategories && this.excludeCategories.length > 0) {
    query.category = { $nin: this.excludeCategories };
  }

  const expenses = await Expense.find(query);
  
  let totalSpent = 0;
  
  expenses.forEach(expense => {
    if (expense.splits && expense.splits.length > 0) {
      // For splits, only count user's share
      const userSplit = expense.splits.find(s => s.user.toString() === this.user.toString());
      if (userSplit) {
        totalSpent += userSplit.share;
      }
    } else {
      // For personal expenses, count full amount
      totalSpent += expense.amount;
    }
  });

  this.spent = +totalSpent.toFixed(2);
  this.lastCalculated = new Date();
  
  return this.spent;
};

// Method to reset budget for next period
budgetSchema.methods.resetForNextPeriod = function() {
  const currentEnd = new Date(this.endDate);
  
  switch (this.period) {
    case 'weekly':
      this.startDate = new Date(currentEnd.getTime() + 1);
      this.endDate = new Date(currentEnd.getTime() + (7 * 24 * 60 * 60 * 1000));
      break;
    case 'monthly':
      this.startDate = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 1, 1);
      this.endDate = new Date(currentEnd.getFullYear(), currentEnd.getMonth() + 2, 0);
      break;
    case 'quarterly':
      const nextQuarter = Math.floor(currentEnd.getMonth() / 3) + 1;
      this.startDate = new Date(currentEnd.getFullYear(), nextQuarter * 3, 1);
      this.endDate = new Date(currentEnd.getFullYear(), (nextQuarter + 1) * 3, 0);
      break;
    case 'yearly':
      this.startDate = new Date(currentEnd.getFullYear() + 1, 0, 1);
      this.endDate = new Date(currentEnd.getFullYear() + 1, 11, 31);
      break;
  }
  
  this.spent = 0;
  this.alertSent = false;
  this.lastCalculated = new Date();
};

// Include virtuals when converting to JSON
budgetSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Budget', budgetSchema);
