const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

// @route   GET /api/groups
// @desc    Get all groups for a user
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [
        { owner: req.user._id },
        { 'members.user': req.user._id }
      ],
      isActive: true
    })
    .populate('owner', 'name email')
    .populate('members.user', 'name email')
    .sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: groups
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/groups
// @desc    Create a new group
// @access  Private
router.post('/', auth, async (req, res) => {
  try {
    const { name, description, color, icon, members } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Group name is required'
      });
    }

    if (name.trim().length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Group name must be less than 50 characters'
      });
    }

    // Process member emails if provided
    let groupMembers = [];
    if (members && Array.isArray(members) && members.length > 0) {
      // Remove current user's email if included
      const otherEmails = members.filter(email => 
        email.toLowerCase().trim() !== req.user.email.toLowerCase().trim()
      );

      if (otherEmails.length > 0) {
        // Verify all users exist
        const memberUsers = await User.find({
          email: { $in: otherEmails.map(email => email.toLowerCase().trim()) }
        }).select('_id name email');

        if (memberUsers.length !== otherEmails.length) {
          const foundEmails = memberUsers.map(u => u.email.toLowerCase());
          const notFoundEmails = otherEmails.filter(email => 
            !foundEmails.includes(email.toLowerCase().trim())
          );
          return res.status(400).json({
            success: false,
            message: `These users are not registered: ${notFoundEmails.join(', ')}`
          });
        }

        groupMembers = memberUsers.map(user => ({
          user: user._id,
          role: 'member'
        }));
      }
    }

    // Create the group
    const group = new Group({
      name: name.trim(),
      description: description ? description.trim() : '',
      color: color || '#667eea',
      icon: icon || '👥',
      owner: req.user._id,
      members: groupMembers
    });

    await group.save();

    // Populate the created group for response
    await group.populate('owner', 'name email');
    await group.populate('members.user', 'name email');

    res.status(201).json({
      success: true,
      data: group,
      message: `Group "${group.name}" created successfully${groupMembers.length > 0 ? ` with ${groupMembers.length} members` : ''}`
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/groups/:id
// @desc    Get group details
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('owner', 'name email')
      .populate('members.user', 'name email');

    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is part of this group
    if (!group.isMember(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this group'
      });
    }

    // Get group statistics
    const groupExpenses = await Expense.find({
      group: group._id
    });

    const stats = {
      totalExpenses: groupExpenses.length,
      totalAmount: groupExpenses.reduce((sum, exp) => sum + exp.amount, 0),
      totalSplits: groupExpenses.filter(exp => exp.splits && exp.splits.length > 0).length,
      recentActivity: groupExpenses
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(exp => ({
          _id: exp._id,
          description: exp.description,
          amount: exp.amount,
          category: exp.category,
          createdAt: exp.createdAt,
          owner: exp.owner
        }))
    };

    const groupWithStats = {
      ...group.toJSON(),
      stats
    };

    res.json({
      success: true,
      data: groupWithStats
    });
  } catch (error) {
    console.error('Get group details error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/groups/:id
// @desc    Update group
// @access  Private (Admin only)
router.put('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check if user is admin
    if (!group.isAdmin(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: 'Only group admins can update group settings'
      });
    }

    const { name, description, color, icon, settings } = req.body;

    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Group name cannot be empty'
        });
      }
      group.name = name.trim();
    }

    if (description !== undefined) {
      group.description = description.trim();
    }

    if (color !== undefined) {
      group.color = color;
    }

    if (icon !== undefined) {
      group.icon = icon;
    }

    if (settings !== undefined) {
      group.settings = { ...group.settings, ...settings };
    }

    await group.save();
    await group.populate('owner', 'name email');
    await group.populate('members.user', 'name email');

    res.json({
      success: true,
      data: group,
      message: 'Group updated successfully'
    });
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/groups/:id/members
// @desc    Add member to group
// @access  Private (Admin only)
router.post('/:id/members', auth, async (req, res) => {
  try {
    const { email, role = 'member' } = req.body;

    const group = await Group.findById(req.params.id);

    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Check permissions
    if (!group.isAdmin(req.user._id) && !group.settings.allowMembersToInvite) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add members to this group'
      });
    }

    // Find user by email
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select('_id name email');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'User not found with this email address'
      });
    }

    // Check if user is already a member
    if (group.isMember(user._id)) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this group'
      });
    }

    // Add member
    group.members.push({
      user: user._id,
      role: role
    });

    await group.save();
    await group.populate('members.user', 'name email');

    res.json({
      success: true,
      data: group,
      message: `${user.name} added to group successfully`
    });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/groups/:id/members/:userId
// @desc    Remove member from group
// @access  Private (Admin only or self)
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const targetUserId = req.params.userId;
    const isRemovingSelf = targetUserId === req.user._id.toString();
    const isAdmin = group.isAdmin(req.user._id);

    // Check permissions
    if (!isRemovingSelf && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to remove members from this group'
      });
    }

    // Cannot remove group owner
    if (targetUserId === group.owner.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove group owner'
      });
    }

    // Remove member
    group.members = group.members.filter(
      member => member.user.toString() !== targetUserId
    );

    await group.save();

    res.json({
      success: true,
      message: isRemovingSelf ? 'Left group successfully' : 'Member removed successfully'
    });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   DELETE /api/groups/:id
// @desc    Delete group (deactivate)
// @access  Private (Owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);

    if (!group || !group.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Only group owner can delete
    if (group.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only group owner can delete the group'
      });
    }

    // Check if there are unsettled expenses
    const unsettledExpenses = await Expense.find({
      group: group._id,
      'splits.0': { $exists: true },
      isSettled: { $ne: true }
    });

    if (unsettledExpenses.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete group with ${unsettledExpenses.length} unsettled split(s). Please settle all splits first.`
      });
    }

    // Soft delete (deactivate)
    group.isActive = false;
    await group.save();

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
