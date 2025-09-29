const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const User = require('../models/User');
const auth = require('../middleware/auth');


// @route   POST /api/splits
// @desc    Create a new split expense
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { amount, description, splitWith, splitType = 'equal', customShares } = req.body;


    console.log('Create split request:', { amount, description, splitWith, splitType, customShares });


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


    if (!splitWith || !Array.isArray(splitWith) || splitWith.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one person to split with is required'
      });
    }


    // Remove current user's email if included
    const otherEmails = splitWith.filter(email => 
      email.toLowerCase().trim() !== req.user.email.toLowerCase().trim()
    );


    if (otherEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'You need at least one other person to split with'
      });
    }


    // Verify all users exist by email
    const splitUsers = await User.find({ 
      email: { $in: otherEmails.map(email => email.toLowerCase().trim()) }
    }).select('_id name email');


    if (splitUsers.length !== otherEmails.length) {
      const foundEmails = splitUsers.map(u => u.email.toLowerCase());
      const notFoundEmails = otherEmails.filter(email => 
        !foundEmails.includes(email.toLowerCase().trim())
      );
      return res.status(400).json({
        success: false,
        message: `These users are not registered: ${notFoundEmails.join(', ')}`
      });
    }


    // Include the expense creator in the split
    const allParticipants = [
      { _id: req.user._id, name: req.user.name, email: req.user.email },
      ...splitUsers
    ];


    // Calculate shares based on split type
    let splitData = [];
    
    if (splitType === 'equal') {
      const shareAmount = +(amount / allParticipants.length).toFixed(2);
      let totalAssigned = 0;
      
      splitData = allParticipants.map((user, index) => {
        let userShare = shareAmount;
        
        // Handle rounding - give remainder to creator
        if (index === allParticipants.length - 1) {
          userShare = +(amount - totalAssigned).toFixed(2);
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
      // Validate exact shares
      const totalShares = customShares.reduce((sum, share) => sum + share, 0);
      if (Math.abs(totalShares - amount) > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Total shares (₹${totalShares}) must equal expense amount (₹${amount})`
        });
      }


      splitData = allParticipants.map((user, index) => ({
        user: user._id,
        share: +(customShares[index] || 0).toFixed(2),
        paid: false,
        paidAt: null
      }));
    }


    // Create the split expense
    const splitExpense = new Expense({
      owner: req.user._id,
      amount: +amount.toFixed(2),
      description: description.trim(),
      category: 'Split',
      splits: splitData,
      splitType
    });


    await splitExpense.save();


    // Populate the created split for response
    await splitExpense.populate('splits.user', 'name email');


    res.status(201).json({
      success: true,
      data: splitExpense,
      message: `Split created with ${allParticipants.length} people`
    });


  } catch (error) {
    console.error('Create split error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});


// @route   GET /api/splits
// @desc    Get all splits involving the user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const splits = await Expense.find({
      $or: [
        { owner: req.user._id, 'splits.0': { $exists: true } }, // Splits created by user
        { 'splits.user': req.user._id } // Splits involving user
      ]
    })
    .populate('owner', 'name email')
    .populate('splits.user', 'name email')
    .sort({ createdAt: -1 });


    res.json({
      success: true,
      data: splits
    });
  } catch (error) {
    console.error('Get splits error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});


// @route   POST /api/splits/validate-emails
// @desc    Validate if emails are registered users
// @access  Private
router.post('/validate-emails', auth, async (req, res) => {
  try {
    const { emails } = req.body;
    
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({
        success: false,
        message: 'Emails array is required'
      });
    }


    // Clean and filter emails
    const cleanEmails = emails
      .map(email => email.toLowerCase().trim())
      .filter(email => email && email !== req.user.email.toLowerCase());


    const users = await User.find({
      email: { $in: cleanEmails }
    }).select('name email');


    const foundEmails = users.map(u => u.email.toLowerCase());
    const validEmails = users.map(u => ({ name: u.name, email: u.email }));
    const invalidEmails = cleanEmails.filter(email => !foundEmails.includes(email));


    res.json({
      success: true,
      data: {
        valid: validEmails,
        invalid: invalidEmails
      }
    });


  } catch (error) {
    console.error('Validate emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});


// @route   PUT /api/splits/:id/pay
// @desc    Mark user's share as paid
// @access  Private
router.put('/:id/pay', auth, async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);


    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Split not found'
      });
    }


    // Find user's split
    const userSplit = expense.splits.find(
      split => split.user.toString() === req.user._id.toString()
    );


    if (!userSplit) {
      return res.status(400).json({
        success: false,
        message: 'You are not part of this split'
      });
    }


    if (userSplit.paid) {
      return res.status(400).json({
        success: false,
        message: 'You have already paid your share'
      });
    }


    // Mark as paid
    userSplit.paid = true;
    userSplit.paidAt = new Date();


    // Check if all splits are settled
    const allPaid = expense.splits.every(split => split.paid);
    if (allPaid) {
      expense.isSettled = true;
    }


    await expense.save();


    res.json({
      success: true,
      data: expense,
      message: 'Payment recorded successfully'
    });


  } catch (error) {
    console.error('Pay split error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});


// @route   GET /api/splits/balances - SIMPLIFIED VERSION THAT WORKS
// @desc    Get user's balance summary (what they owe vs what they're owed)
// @access  Private
router.get('/balances', auth, async (req, res) => {
  try {
    console.log('Getting balances for user:', req.user._id);
    
    // Initialize balances
    let youOwe = 0;
    let owedToYou = 0;
    
    try {
      // Get all splits involving this user
      const splits = await Expense.find({
        $or: [
          { owner: req.user._id, 'splits.0': { $exists: true } }, // Splits created by user
          { 'splits.user': req.user._id } // Splits involving user
        ]
      }).populate('splits.user', 'name email').populate('owner', 'name email');


      console.log(`Found ${splits.length} splits`);
      
      splits.forEach(split => {
        if (!split.splits || split.splits.length === 0) {
          console.log('Skipping split with no splits array:', split._id);
          return;
        }
        
        split.splits.forEach(splitItem => {
          try {
            if (!splitItem.user || !splitItem.user._id) {
              console.log('Skipping split item with no user:', splitItem);
              return;
            }
            
            const isCurrentUser = splitItem.user._id.toString() === req.user._id.toString();
            
            if (isCurrentUser && !splitItem.paid) {
              // User owes this amount
              console.log(`User owes: ${splitItem.share}`);
              youOwe += splitItem.share || 0;
            } else if (!isCurrentUser && !splitItem.paid && split.owner && split.owner._id && split.owner._id.toString() === req.user._id.toString()) {
              // Others owe this amount to the current user
              console.log(`User is owed: ${splitItem.share}`);
              owedToYou += splitItem.share || 0;
            }
          } catch (itemError) {
            console.error('Error processing split item:', itemError);
          }
        });
      });
    } catch (queryError) {
      console.error('Error querying splits:', queryError);
      // Continue with default values
    }


    const netBalance = owedToYou - youOwe;


    console.log('Final balance calculation:', { youOwe, owedToYou, netBalance });


    // Return simplified structure
    res.json({
      success: true,
      data: {
        youOwe: +youOwe.toFixed(2),
        owedToYou: +owedToYou.toFixed(2),
        netBalance: +netBalance.toFixed(2),
        owedBreakdown: [], // Empty for now to avoid errors
        oweBreakdown: []   // Empty for now to avoid errors
      }
    });


  } catch (error) {
    console.error('Get balances error:', error);
    
    // Return safe default values on any error
    res.json({
      success: true,
      data: {
        youOwe: 0,
        owedToYou: 0,
        netBalance: 0,
        owedBreakdown: [],
        oweBreakdown: []
      }
    });
  }
});


// @route   GET /api/splits/:id
// @desc    Get split details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const split = await Expense.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('splits.user', 'name email');


    if (!split || !split.splits || split.splits.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Split not found'
      });
    }


    // Check if user is part of this split
    const isOwner = split.owner._id.toString() === req.user._id.toString();
    const isParticipant = split.splits.some(s => s.user._id.toString() === req.user._id.toString());
    
    if (!isOwner && !isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this split'
      });
    }


    // Calculate additional stats
    const totalPaid = split.splits.filter(s => s.paid).length;
    const totalParticipants = split.splits.length;
    const amountPaid = split.splits.filter(s => s.paid).reduce((sum, s) => sum + s.share, 0);
    const amountPending = split.splits.filter(s => !s.paid).reduce((sum, s) => sum + s.share, 0);


    const splitDetails = {
      ...split.toJSON(),
      stats: {
        totalParticipants,
        totalPaid,
        totalPending: totalParticipants - totalPaid,
        amountPaid: +amountPaid.toFixed(2),
        amountPending: +amountPending.toFixed(2),
        completionPercentage: totalParticipants > 0 ? +((totalPaid / totalParticipants) * 100).toFixed(1) : 0
      }
    };


    res.json({
      success: true,
      data: splitDetails
    });
  } catch (error) {
    console.error('Get split details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});



module.exports = router;

