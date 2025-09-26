// server/routes/groups.js
const express = require('express');
const router  = express.Router();

/* 
   Real group logic will come later.
   For now we only return an empty array so that
   /api/groups doesn’t 404 and crash the import.
*/

router.get('/', (req, res) => {
  res.json({ success: true, data: [] });
});

module.exports = router;
