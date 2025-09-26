const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

// @route   GET /api/expenses
// @desc    Get all expenses for a user (personal + splits)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { category, startDate, endDate, search, includeSettled } = req.query;
    
    let query = {
      $or: [
        { owner: req.user._id }, // Expenses created by user
        { 'splits.user': req.user._id } // Splits involving user
      ]
    };

    // Add filters
    if (category && category !== 'all') {
      query.category = category;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    if (search) {
      query.description = { $regex: search, $options: 'i' };
    }

    // Filter settled splits if requested
    if (includeSettled === 'false') {
      query.$and = [
        query.$and || {},
        {
          $or: [
            { 'splits.0': { $exists: false } }, // Personal expenses
            { isSettled: false } // Unsettled splits
          ]
        }
      ];
    }

    const expenses = await Expense.find(query)
      .populate('owner', 'name email')
      .populate('splits.user', 'name email')
      .sort({ date: -1 });

    res.json({
      success: true,
      data: expenses
    });
  } catch (error) {
    console.error('Get expenses error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/expenses
// @desc    Create a new expense
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { amount, description, category, date, notes } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    if (!description || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Description is required'
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Category is required'
      });
    }

    const expense = new Expense({
      owner: req.user._id,
      amount: +parseFloat(amount).toFixed(2),
      description: description.trim(),
      category: category,
      date: date ? new Date(date) : new Date(),
      notes: notes || ''
    });

    await expense.save();

    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense added successfully'
    });
  } catch (error) {
    console.error('Create expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/expenses/:id
// @desc    Update an expense
// @access  Private
router.put('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check if user owns the expense
    if (expense.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this expense'
      });
    }

    // Don't allow editing settled splits
    if (expense.splits && expense.splits.length > 0 && expense.isSettled) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit settled splits'
      });
    }

    const { amount, description, category, date, notes } = req.body;

    // Update fields if provided
    if (amount !== undefined) expense.amount = +parseFloat(amount).toFixed(2);
    if (description !== undefined) expense.description = description.trim();
    if (category !== undefined) expense.category = category;
    if (date !== undefined) expense.date = new Date(date);
    if (notes !== undefined) expense.notes = notes;

    await expense.save();

    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Update expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    // Check if user owns the expense
    if (expense.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this expense'
      });
    }

    // Don't allow deleting splits with payments made
    if (expense.splits && expense.splits.length > 0) {
      const hasPaidSplits = expense.splits.some(split => split.paid);
      if (hasPaidSplits) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete splits with payments made'
        });
      }
    }

    await Expense.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/expenses/stats
// @desc    Get expense statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    // Get all user's expenses and splits
    const allExpenses = await Expense.find({
      $or: [
        { owner: req.user._id },
        { 'splits.user': req.user._id }
      ]
    }).populate('splits.user', 'name email');

    let totalExpenses = 0;
    let monthlyExpenses = 0;
    let yearlyExpenses = 0;
    const categoryBreakdown = {};

    allExpenses.forEach(expense => {
      let userAmount = 0;

      if (expense.splits && expense.splits.length > 0) {
        // Split expense - only count user's share
        const userSplit = expense.splits.find(s => s.user && s.user._id && s.user._id.toString() === req.user._id.toString());
        userAmount = userSplit ? userSplit.share : 0;
      } else {
        // Personal expense - count full amount
        userAmount = expense.amount;
      }

      totalExpenses += userAmount;

      if (expense.date >= startOfMonth) {
        monthlyExpenses += userAmount;
      }

      if (expense.date >= startOfYear) {
        yearlyExpenses += userAmount;
      }

      // Category breakdown
      if (!categoryBreakdown[expense.category]) {
        categoryBreakdown[expense.category] = 0;
      }
      categoryBreakdown[expense.category] += userAmount;
    });

    res.json({
      success: true,
      data: {
        totalExpenses: +totalExpenses.toFixed(2),
        monthlyExpenses: +monthlyExpenses.toFixed(2),
        yearlyExpenses: +yearlyExpenses.toFixed(2),
        categoryBreakdown: Object.keys(categoryBreakdown).reduce((acc, key) => {
          acc[key] = +categoryBreakdown[key].toFixed(2);
          return acc;
        }, {}),
        totalTransactions: allExpenses.length
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/expenses/:id/convert-to-split
// @desc    Convert personal expense to split
// @access  Private
router.post('/:id/convert-to-split', auth, async (req, res) => {
  try {
    const { splitWith, splitType = 'equal', customShares } = req.body;

    const expense = await Expense.findById(req.params.id);
    
    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    if (expense.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this expense'
      });
    }

    if (expense.splits && expense.splits.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Expense is already a split'
      });
    }

    // Validation
    if (!splitWith || !Array.isArray(splitWith) || splitWith.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one person to split with is required'
      });
    }

    // Validate split participants
    const User = require('../models/User');
    const cleanEmails = splitWith.map(email => email.toLowerCase().trim());
    const splitUsers = await User.find({
      email: { $in: cleanEmails }
    }).select('_id name email');

    if (splitUsers.length !== cleanEmails.length) {
      const foundEmails = splitUsers.map(u => u.email.toLowerCase());
      const notFoundEmails = cleanEmails.filter(email => !foundEmails.includes(email));
      return res.status(400).json({
        success: false,
        message: `These users are not registered: ${notFoundEmails.join(', ')}`
      });
    }

    const allParticipants = [
      { _id: req.user._id, name: req.user.name, email: req.user.email },
      ...splitUsers
    ];

    // Calculate shares
    let splitData = [];
    
    if (splitType === 'equal') {
      const shareAmount = +(expense.amount / allParticipants.length).toFixed(2);
      let totalAssigned = 0;
      
      splitData = allParticipants.map((user, index) => {
        let userShare = shareAmount;
        
        if (index === allParticipants.length - 1) {
          userShare = +(expense.amount - totalAssigned).toFixed(2);
        }
        
        totalAssigned += userShare;
        
        return {
          user: user._id,
          share: userShare,
          paid: false,
          paidAt: null
        };
      });
    } else if (splitType === 'exact' && customShares) {
      const totalShares = customShares.reduce((sum, share) => sum + share, 0);
      if (Math.abs(totalShares - expense.amount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: 'Custom shares must equal expense amount'
        });
      }

      splitData = allParticipants.map((user, index) => ({
        user: user._id,
        share: +(customShares[index] || 0).toFixed(2),
        paid: false,
        paidAt: null
      }));
    }

    // Update expense
    expense.splits = splitData;
    expense.splitType = splitType;
    expense.category = 'Split';
    
    await expense.save();
    await expense.populate('splits.user', 'name email');

    res.json({
      success: true,
      data: expense,
      message: `Expense converted to split with ${allParticipants.length} people`
    });

  } catch (error) {
    console.error('Convert to split error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/expenses/export
// @desc    Export expenses to CSV
// @access  Private
router.get('/export', auth, async (req, res) => {
  try {
    const { format = 'csv', startDate, endDate } = req.query;
    
    let query = {
      $or: [
        { owner: req.user._id },
        { 'splits.user': req.user._id }
      ]
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const expenses = await Expense.find(query)
      .populate('owner', 'name email')
      .populate('splits.user', 'name email')
      .sort({ date: -1 });

    if (format === 'csv') {
      let csvContent = 'Date,Description,Category,Type,Total Amount,Your Share,Status,Created By,Notes\n';
      
      expenses.forEach(expense => {
        const date = expense.date.toLocaleDateString();
        const description = `"${expense.description.replace(/"/g, '""')}"`;
        const category = expense.category;
        const notes = `"${(expense.notes || '').replace(/"/g, '""')}"`;
        
        if (expense.splits && expense.splits.length > 0) {
          // Split expense
          const userSplit = expense.splits.find(s => s.user && s.user._id && s.user._id.toString() === req.user._id.toString());
          const type = 'Split';
          const totalAmount = expense.amount.toFixed(2);
          const yourShare = userSplit ? userSplit.share.toFixed(2) : '0.00';
          const status = userSplit ? (userSplit.paid ? 'Paid' : 'Unpaid') : 'N/A';
          const createdBy = expense.owner.name;
          
          csvContent += `${date},${description},${category},${type},${totalAmount},${yourShare},${status},${createdBy},${notes}\n`;
        } else {
          // Personal expense
          const type = 'Personal';
          const totalAmount = expense.amount.toFixed(2);
          const yourShare = expense.amount.toFixed(2);
          const status = 'N/A';
          const createdBy = 'You';
          
          csvContent += `${date},${description},${category},${type},${totalAmount},${yourShare},${status},${createdBy},${notes}\n`;
        }
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=finsplit-expenses-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: expenses,
        format: 'json'
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
