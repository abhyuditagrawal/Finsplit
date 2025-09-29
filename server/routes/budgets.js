const express = require('express');
const router = express.Router();
const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

// @route   GET /api/budgets
// @desc    Get all budgets for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const budgets = await Budget.find({ user: req.user._id, isActive: true })
      .populate('includeGroups', 'name icon color')
      .sort({ createdAt: -1 });

    // Calculate current spending for each budget
    for (let budget of budgets) {
      await budget.calculateSpending();
      await budget.save();
    }

    res.json({
      success: true,
      data: budgets
    });
  } catch (error) {
    console.error('Get budgets error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/budgets
// @desc    Create a new budget
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { 
      name, amount, category, period, startDate, endDate, 
      alertThreshold, includeGroups, excludeCategories, notes 
    } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Budget name is required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Budget amount must be greater than 0'
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Budget category is required'
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    // Check for overlapping budgets in the same category
    const existingBudget = await Budget.findOne({
      user: req.user._id,
      category: category,
      isActive: true,
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } }
      ]
    });

    if (existingBudget) {
      return res.status(400).json({
        success: false,
        message: `You already have an active budget for ${category} during this period`
      });
    }

    // Create budget
    const budget = new Budget({
      user: req.user._id,
      name: name.trim(),
      amount: +parseFloat(amount).toFixed(2),
      category,
      period: period || 'monthly',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      alertThreshold: alertThreshold || 80,
      includeGroups: includeGroups || [],
      excludeCategories: excludeCategories || [],
      notes: notes || ''
    });

    // Calculate initial spending
    await budget.calculateSpending();
    await budget.save();

    res.status(201).json({
      success: true,
      data: budget,
      message: 'Budget created successfully'
    });

  } catch (error) {
    console.error('Create budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/budgets/:id
// @desc    Get budget details with spending breakdown
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id)
      .populate('includeGroups', 'name icon color');

    if (!budget || !budget.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    if (budget.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this budget'
      });
    }

    // Recalculate spending
    await budget.calculateSpending();
    await budget.save();

    // Get detailed spending breakdown
    let query = {
      owner: req.user._id,
      date: { $gte: budget.startDate, $lte: budget.endDate }
    };

    if (budget.category !== 'All Categories') {
      query.category = budget.category;
    }

    if (budget.excludeCategories && budget.excludeCategories.length > 0) {
      query.category = { $nin: budget.excludeCategories };
    }

    const expenses = await Expense.find(query)
      .populate('splits.user', 'name email')
      .sort({ date: -1 });

    // Calculate daily spending for chart
    const dailySpending = {};
    const startDate = new Date(budget.startDate);
    const endDate = new Date(budget.endDate);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dailySpending[d.toISOString().split('T')[0]] = 0;
    }

    expenses.forEach(expense => {
      const dateKey = expense.date.toISOString().split('T')[0];
      let amount = 0;

      if (expense.splits && expense.splits.length > 0) {
        const userSplit = expense.splits.find(s => s.user._id.toString() === req.user._id.toString());
        amount = userSplit ? userSplit.share : 0;
      } else {
        amount = expense.amount;
      }

      if (dailySpending[dateKey] !== undefined) {
        dailySpending[dateKey] += amount;
      }
    });

    const budgetWithDetails = {
      ...budget.toJSON(),
      expenses: expenses.slice(0, 20), // Last 20 expenses
      dailySpending: Object.keys(dailySpending).map(date => ({
        date,
        amount: +dailySpending[date].toFixed(2)
      }))
    };

    res.json({
      success: true,
      data: budgetWithDetails
    });
  } catch (error) {
    console.error('Get budget details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/budgets/:id
// @desc    Update budget
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);

    if (!budget || !budget.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    if (budget.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this budget'
      });
    }

    const { name, amount, alertThreshold, notes } = req.body;

    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Budget name cannot be empty'
        });
      }
      budget.name = name.trim();
    }

    if (amount !== undefined) {
      if (amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Budget amount must be greater than 0'
        });
      }
      budget.amount = +parseFloat(amount).toFixed(2);
    }

    if (alertThreshold !== undefined) {
      if (alertThreshold < 50 || alertThreshold > 95) {
        return res.status(400).json({
          success: false,
          message: 'Alert threshold must be between 50% and 95%'
        });
      }
      budget.alertThreshold = alertThreshold;
    }

    if (notes !== undefined) {
      budget.notes = notes;
    }

    // Recalculate spending
    await budget.calculateSpending();
    await budget.save();

    res.json({
      success: true,
      data: budget,
      message: 'Budget updated successfully'
    });
  } catch (error) {
    console.error('Update budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/budgets/:id
// @desc    Delete budget (deactivate)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);

    if (!budget || !budget.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    if (budget.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this budget'
      });
    }

    budget.isActive = false;
    await budget.save();

    res.json({
      success: true,
      message: 'Budget deleted successfully'
    });
  } catch (error) {
    console.error('Delete budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/budgets/analytics/summary
// @desc    Get budget analytics summary
// @access  Private
router.get('/analytics/summary', auth, async (req, res) => {
  try {
    const budgets = await Budget.find({ user: req.user._id, isActive: true });

    // Update all budget spending
    for (let budget of budgets) {
      await budget.calculateSpending();
      await budget.save();
    }

    const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);
    const totalSpent = budgets.reduce((sum, b) => sum + b.spent, 0);
    const budgetsExceeded = budgets.filter(b => b.isExceeded).length;
    const budgetsOnTrack = budgets.filter(b => !b.isExceeded && b.spentPercentage <= 80).length;
    const budgetsNearLimit = budgets.filter(b => !b.isExceeded && b.spentPercentage > 80).length;

    // Category breakdown
    const categoryBreakdown = {};
    budgets.forEach(budget => {
      if (!categoryBreakdown[budget.category]) {
        categoryBreakdown[budget.category] = {
          budgeted: 0,
          spent: 0,
          count: 0
        };
      }
      categoryBreakdown[budget.category].budgeted += budget.amount;
      categoryBreakdown[budget.category].spent += budget.spent;
      categoryBreakdown[budget.category].count += 1;
    });

    res.json({
      success: true,
      data: {
        totalBudgets: budgets.length,
        totalBudgeted: +totalBudgeted.toFixed(2),
        totalSpent: +totalSpent.toFixed(2),
        remaining: +(totalBudgeted - totalSpent).toFixed(2),
        overallPercentage: totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0,
        budgetsOnTrack,
        budgetsNearLimit,
        budgetsExceeded,
        categoryBreakdown: Object.keys(categoryBreakdown).map(category => ({
          category,
          ...categoryBreakdown[category],
          percentage: categoryBreakdown[category].budgeted > 0 ? 
            Math.round((categoryBreakdown[category].spent / categoryBreakdown[category].budgeted) * 100) : 0
        }))
      }
    });
  } catch (error) {
    console.error('Budget analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/budgets/:id/reset
// @desc    Reset budget for next period
// @access  Private
router.post('/:id/reset', auth, async (req, res) => {
  try {
    const budget = await Budget.findById(req.params.id);

    if (!budget || !budget.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Budget not found'
      });
    }

    if (budget.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reset this budget'
      });
    }

    budget.resetForNextPeriod();
    await budget.save();

    res.json({
      success: true,
      data: budget,
      message: 'Budget reset for next period'
    });
  } catch (error) {
    console.error('Reset budget error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
