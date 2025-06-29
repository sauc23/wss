const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors()); // Enable CORS for all routes

const server = http.createServer(app);

// Configure Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: '*', // Allow all origins for development. In production, specify your client's origin.
    methods: ['GET', 'POST']
  }
});

// Object to hold view counts and connected clients
let viewCounts = {};
let clientInfo = {}; // Format: { id: [referrer1, referrer2, ...] }

// Helper function to broadcast updated data to the /view-data namespace
// This function is crucial for real-time updates on the dashboard.
function broadcastViewData() {
  io.of('/view-data').emit('viewData', { viewCounts, clientInfo });
}

// --- Express HTTP Routes ---
// API endpoint to get view count for a specific ID
app.get('/api/view-count/:id', (req, res) => {
  const { id } = req.params;
  res.json({ viewCount: viewCounts[id] || 0 });
});

// Proxy /raw to https://edit.jdx3.org/path.json (as per your original code)
app.get('/raw', async (req, res) => {
  try {
    const response = await axios.get('http://vccvcvvcvccvv.x10.mx/path.json');
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data from external API:', error.message);
    res.status(500).send('Error fetching data from external source');
  }
});

// --- Socket.IO Namespaces ---

// Namespace for the real-time data viewer dashboard
io.of('/view-data').on('connection', (socket) => {
  console.log('Real-time data viewer connected.');

  // Emit initial data immediately when a new viewer connects to this namespace
  socket.emit('viewData', { viewCounts, clientInfo });

  socket.on('disconnect', () => {
    console.log('Real-time data viewer disconnected.');
    // No need to broadcast here, as disconnecting from /view-data doesn't change global viewCounts
  });
});

// Main connection namespace (default namespace '/')
io.on('connection', (socket) => {
  const id = socket.handshake.query.id; // Expects an 'id' query parameter from the client
  const referrer = socket.handshake.headers.referer || 'Unknown'; // Get referrer from headers

  // Only proceed if an ID is provided to avoid polluting viewCounts with undefined IDs
  if (!id) {
    console.warn('Client connected without an ID:', socket.id);
    socket.disconnect(true); // Disconnect client if no ID is provided
    return;
  }

  // Initialize view count and client info for this ID if it's new
  if (!viewCounts[id]) {
    viewCounts[id] = 0;
    clientInfo[id] = [];
  }

  viewCounts[id]++; // Increment view count for the connected ID
  clientInfo[id].push(referrer); // Add the referrer to the list for this ID

  // Emit an update to all clients (including the main namespace clients if they listen)
  // This is for clients that might want individual stream updates
  io.emit('updateViewCount', { id, viewCount: viewCounts[id], referrers: clientInfo[id] });

  // IMPORTANT: Broadcast the *entire* updated view data to the /view-data dashboard clients
  // This ensures the dashboard updates every time a main client connects.
  broadcastViewData();

  console.log(`Client connected to stream ${id} from referrer ${referrer}`);

  socket.on('disconnect', () => {
    // Only decrement if the ID exists (should always if initialized above)
    if (viewCounts[id] !== undefined) {
      viewCounts[id] = Math.max(viewCounts[id] - 1, 0); // Decrement, ensure it doesn't go below 0

      // Remove one instance of the referrer from the array
      const index = clientInfo[id].indexOf(referrer);
      if (index > -1) {
        clientInfo[id].splice(index, 1);
      }

   
       if (viewCounts[id] === 0 && clientInfo[id].length === 0) {
       delete viewCounts[id];
        delete clientInfo[id];
       }

      // Emit an update to all clients about the specific ID's change
      io.emit('updateViewCount', { id, viewCount: viewCounts[id], referrers: clientInfo[id] });

      // IMPORTANT: Broadcast the *entire* updated view data again to the /view-data dashboard clients
      // This ensures the dashboard updates every time a main client disconnects.
      broadcastViewData();

      console.log(`Client disconnected from stream ${id} (Referrer: ${referrer})`);
    } else {
      console.warn(`Disconnected client with unknown ID: ${id}`);
    }
  });
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
