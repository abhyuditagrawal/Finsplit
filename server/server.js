const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const groupRoutes = require('./routes/groups');
const userRoutes = require('./routes/users');
const splitRoutes = require('./routes/splits');

// Route registration
app.use('/api/auth', authRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/users', userRoutes);
app.use('/api/splits', splitRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({ 
    message: 'FinSplit API is running',
    version: '1.0.0',
    endpoints: [
      'GET /api/auth/me',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/expenses',
      'POST /api/expenses',
      'GET /api/splits',
      'POST /api/splits',
      'POST /api/splits/validate-emails'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/finsplit')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('🚀 FinSplit API Server Started');
  console.log('📍 Server running on port:', PORT);
  console.log('🌍 API Base URL: http://localhost:' + PORT);
  console.log('📝 Environment:', process.env.NODE_ENV || 'development');
  console.log('⏰ Started at:', new Date().toLocaleString());
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

module.exports = app;
