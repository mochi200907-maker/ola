const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Pinapayagan ang CORS para sa deployment
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = 0;
let waitingQueue = [];

io.on('connection', (socket) => {
    activeUsers++;
    io.emit('user-count', activeUsers);

    // Hanapan ng kausap ang user
    socket.on('find-match', () => {
        // Linisin ang queue mula sa mga na-disconnect na socket
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id && s.connected);

        if (waitingQueue.length > 0) {
            const partner = waitingQueue.shift();

            socket.partnerId = partner.id;
            partner.partnerId = socket.id;

            socket.emit('match-found', { initiator: true, partnerId: partner.id });
            partner.emit('match-found', { initiator: false, partnerId: socket.id });
        } else {
            if (!waitingQueue.some(s => s.id === socket.id)) {
                waitingQueue.push(socket);
            }
        }
    });

    // WebRTC Signaling Passing
    socket.on('signal', (data) => {
        if (data.target) {
            io.to(data.target).emit('signal', {
                sender: socket.id,
                signal: data.signal
            });
        }
    });

    // Skip Button Handler
    socket.on('skip', () => {
        handleDisconnect(socket);
    });

    // Disconnect Handler
    socket.on('disconnect', () => {
        activeUsers = Math.max(0, activeUsers - 1);
        io.emit('user-count', activeUsers);
        handleDisconnect(socket);
    });

    function handleDisconnect(sock) {
        // Alisin sa waiting queue kung naroroon
        waitingQueue = waitingQueue.filter(s => s.id !== sock.id);

        // Sabihan ang partner na umalis na ang kausap
        if (sock.partnerId) {
            io.to(sock.partnerId).emit('partner-disconnected');
            const partnerSocket = io.sockets.sockets.get(sock.partnerId);
            if (partnerSocket) {
                partnerSocket.partnerId = null;
            }
            sock.partnerId = null;
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});
