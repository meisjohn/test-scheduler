const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Activity = require('./models/Activity');
const activityRoutes = require('./routes/activities');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/activities', activityRoutes);

// Socket.io Setup
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Database Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/scheduler');

// Socket Events
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Triggered when someone moves a test activity
  socket.on('move-activity', async (payload) => {
    const { id, newDetails } = payload;
    // Update DB
    await Activity.findByIdAndUpdate(id, newDetails);
    // Broadcast change to all OTHER connected users
    socket.broadcast.emit('activity-updated', { id, ...newDetails });
  });

  socket.on('sync-work', (data) => {
    // When anyone changes anything, tell all other clients to re-fetch
    socket.broadcast.emit('reload-data');
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Backend live on port ${PORT}`));