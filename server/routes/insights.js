const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');
const axios = require('axios');

// ML Service URL
const ML_SERVICE_URL = 'http://localhost:5001';

// @route   GET /api/insights/predictions
// @desc    Get ML expense predictions for user
// @access  Private
router.get('/predictions', auth, async (req, res) => {
  try {
    console.log(' Insights prediction requested for user:', req.user._id);

    // Fetch user's expenses from last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const expenses = await Expense.find({
      owner: req.user._id,
      date: { $gte: twelveMonthsAgo }
    }).select('amount category date splits').lean();

    console.log(`Found ${expenses.length} expenses for analysis`);

    // If no expenses, return message
    if (!expenses || expenses.length === 0) {
      return res.json({
        success: false,
        message: 'No expense data available',
        suggestion: 'Add at least 3 months of expenses to see predictions'
      });
    }

    // Format expenses for ML service
    const formattedExpenses = expenses.map(exp => {
      // Calculate user's share for split expenses
      let userShare = 0;
      if (exp.splits && exp.splits.length > 0) {
        const userSplit = exp.splits.find(
          split => split.user.toString() === req.user._id.toString()
        );
        userShare = userSplit ? userSplit.share : 0;
      }

      return {
        amount: exp.amount,
        category: exp.category,
        date: exp.date.toISOString().split('T')[0],
        user_share: userShare
      };
    });

    console.log(' Calling ML service...');

    // Call ML service
    const mlResponse = await axios.post(`${ML_SERVICE_URL}/predict`, {
      user_id: req.user._id.toString(),
      expenses: formattedExpenses,
      periods: 12
    });

    console.log(' ML prediction successful');

    // Return predictions
    res.json(mlResponse.data);

  } catch (error) {
    console.error(' Prediction error:', error.message);
    
    // If ML service is down
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'ML service temporarily unavailable',
        error: 'Make sure Python ML service is running on port 5001'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
