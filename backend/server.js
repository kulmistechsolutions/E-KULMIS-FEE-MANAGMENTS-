import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import routes
import authRoutes from './routes/auth.js';
import brandingRoutes from './routes/branding.js';
import schoolRoutes from './routes/schools.js';
import parentRoutes from './routes/parents.js';
import monthRoutes from './routes/months.js';
import paymentRoutes from './routes/payments.js';
import reportRoutes from './routes/reports.js';
import userRoutes from './routes/users.js';
import userMonitoringRoutes from './routes/userMonitoring.js';
import teacherRoutes from './routes/teachers.js';
import teacherSalaryRoutes from './routes/teacherSalary.js';
import expenseRoutes from './routes/expenses.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Configure allowed origins for CORS
const getAllowedOrigins = () => {
  const origins = ["http://localhost:3000", "http://127.0.0.1:3000"];
  
  // Add FRONTEND_URL if set
  if (process.env.FRONTEND_URL) {
    const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
    origins.push(...frontendUrls);
  }
  
  // Add all known Vercel domains
  const vercelDomains = [
    "https://rowdafeems-cu97.vercel.app",
    "https://rowdafeems-t9x62.vercel.app"
  ];
  
  vercelDomains.forEach(domain => {
    if (!origins.includes(domain)) {
      origins.push(domain);
    }
  });
  
  // Also allow any vercel.app subdomain for flexibility
  // This will be handled in the origin callback function
  
  return origins;
};

const allowedOrigins = getAllowedOrigins();

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      // Allow any vercel.app subdomain for flexibility
      if (origin.includes('.vercel.app') || origin.includes('vercel.app')) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 5000;

// Make io available to routes
app.set('io', io);

// Middleware - Configure CORS to match Socket.IO settings
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow any vercel.app subdomain for flexibility
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // Allow any vercel.app preview deployments
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Publicly serve uploaded assets (school logos, etc.)
app.use('/api/uploads', express.static(join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/parents', parentRoutes);
// Students is a terminology rename; keep parents endpoints for backward compatibility
app.use('/api/students', parentRoutes);
app.use('/api/months', monthRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/users', userRoutes);
app.use('/api/user-monitoring', userMonitoringRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/teachers/salary', teacherSalaryRoutes);
app.use('/api/expenses', expenseRoutes);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id, 'Transport:', socket.conn.transport.name);

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected:', socket.id, 'Reason:', reason);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.io server initialized`);
});

