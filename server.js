const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const geoip = require('geoip-lite');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = 0;
let waitingQueue = [];

io.on('connection', (socket) => {
    activeUsers++;
    io.emit('user-count', activeUsers);

    // Kumuha ng IP address para sa Country Detection
    let clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0];
    const geo = geoip.lookup(clientIp);
    socket.country = geo ? geo.country : 'Unknown';

    socket.on('find-match', () => {
        waitingQueue = waitingQueue.filter(s => s.id !== socket.id && s.connected);

        if (waitingQueue.length > 0) {
            const partner = waitingQueue.shift();

            socket.partnerId = partner.id;
            partner.partnerId = socket.id;

            socket.emit('match-found', { initiator: true, partnerId: partner.id, partnerCountry: partner.country });
            partner.emit('match-found', { initiator: false, partnerId: socket.id, partnerCountry: socket.country });
        } else {
            if (!waitingQueue.some(s => s.id === socket.id)) {
                waitingQueue.push(socket);
            }
        }
    });

    socket.on('signal', (data) => {
        if (data.target) {
            io.to(data.target).emit('signal', { sender: socket.id, signal: data.signal });
        }
    });

    socket.on('skip', () => handleDisconnect(socket));
    socket.on('disconnect', () => {
        activeUsers = Math.max(0, activeUsers - 1);
        io.emit('user-count', activeUsers);
        handleDisconnect(socket);
    });

    function handleDisconnect(sock) {
        waitingQueue = waitingQueue.filter(s => s.id !== sock.id);
        if (sock.partnerId) {
            io.to(sock.partnerId).emit('partner-disconnected');
            const partnerSocket = io.sockets.sockets.get(sock.partnerId);
            if (partnerSocket) partnerSocket.partnerId = null;
            sock.partnerId = null;
        }
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
