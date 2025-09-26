const express = require('express');
const router = express.Router();

// Placeholder users route - will be expanded later
router.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Users endpoint - coming soon',
    data: [] 
  });
});

module.exports = router;
