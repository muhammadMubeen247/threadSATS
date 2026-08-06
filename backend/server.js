const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const http = require('http');
const { initSocket } = require('./socket');
const { startNotificationDigestJob, runNotificationDigest } = require('./jobs/notificationDigest');

connectDB();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const allowedOrigins = [
  'http://localhost',
  'http://localhost:5173',
  process.env.CLIENT_URL
]

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}));

app.use('/api/auth', require('./routes/routes.auth'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/personas', require('./routes/personas'));
app.use('/api/dm', require('./routes/dm'));
app.use('/api/trends', require('./routes/trends'));
app.use('/api/notifications', require('./routes/notifications'));

// Dev-only: manually trigger the notification digest job
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/admin/trigger-digest', async (req, res) => {
    await runNotificationDigest();
    res.json({ success: true, message: 'Digest job ran — check server logs.' });
  });
}

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Personas API is running',
    timestamp: new Date().toISOString(),
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

const server = http.createServer(app);

initSocket(server);
startNotificationDigestJob();

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Personas API is running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});