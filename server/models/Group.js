const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    maxlength: [50, 'Group name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: ''
  },
  color: {
    type: String,
    default: '#667eea'
  },
  icon: {
    type: String,
    default: '👥'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Group must have an owner']
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['admin', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowMembersToAddExpenses: {
      type: Boolean,
      default: true
    },
    allowMembersToInvite: {
      type: Boolean,
      default: false
    },
    requireApprovalForExpenses: {
      type: Boolean,
      default: false
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  totalSplits: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Virtual to get member count (including owner)
groupSchema.virtual('memberCount').get(function() {
  return this.members ? this.members.length + 1 : 1;
});

// Method to check if user is admin (owner or admin role)
// FIXED: Handles both populated and unpopulated owner
groupSchema.methods.isAdmin = function(userId) {
  if (!userId) return false;
  
  const userIdStr = userId.toString();
  
  // Handle both populated (owner._id) and unpopulated (owner) owner field
  const ownerIdStr = this.owner._id ? this.owner._id.toString() : this.owner.toString();
  
  // Owner is always admin
  if (ownerIdStr === userIdStr) {
    return true;
  }
  
  // Check if user has admin role
  const member = this.members.find(m => {
    const memberIdStr = m.user._id ? m.user._id.toString() : m.user.toString();
    return memberIdStr === userIdStr;
  });
  
  return member && member.role === 'admin';
};

// Method to check if user is member (including owner)
// FIXED: Handles both populated and unpopulated fields
groupSchema.methods.isMember = function(userId) {
  if (!userId) return false;
  
  const userIdStr = userId.toString();
  
  // Handle both populated (owner._id) and unpopulated (owner) owner field
  const ownerIdStr = this.owner._id ? this.owner._id.toString() : this.owner.toString();
  
  // Owner is always a member
  if (ownerIdStr === userIdStr) {
    return true;
  }
  
  // Check if user is in members array
  return this.members.some(m => {
    const memberIdStr = m.user._id ? m.user._id.toString() : m.user.toString();
    return memberIdStr === userIdStr;
  });
};

// Include virtuals when converting to JSON
groupSchema.set('toJSON', { virtuals: true });
groupSchema.set('toObject', { virtuals: true });

// Index for faster queries
groupSchema.index({ owner: 1, isActive: 1 });
groupSchema.index({ 'members.user': 1, isActive: 1 });
groupSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Group', groupSchema);
