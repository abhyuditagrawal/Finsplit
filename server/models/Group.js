const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  color: {
    type: String,
    default: '#667eea' // Default purple color
  },
  icon: {
    type: String,
    default: '👥' // Default group icon
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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

// Virtual to get member count
groupSchema.virtual('memberCount').get(function() {
  return this.members ? this.members.length : 0;
});

// Virtual to check if user is admin
groupSchema.methods.isAdmin = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return this.owner.toString() === userId.toString() || 
         (member && member.role === 'admin');
};

// Virtual to check if user is member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.user.toString() === userId.toString()) ||
         this.owner.toString() === userId.toString();
};

// Include virtuals when converting to JSON
groupSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Group', groupSchema);
