const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const http = require('http');
const { initSocket } = require('./socket');

dotenv.config();

connectDB();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

const PORT = process.env.PORT;

server.listen(PORT, () => {
  console.log(`Personas API is running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});