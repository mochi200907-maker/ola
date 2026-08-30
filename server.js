const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let activeUsers = 0;
let waitingUser = null;

io.on('connection', (socket) => {
    activeUsers++;
    io.emit('user-count', activeUsers);

    // Kapag nag-click ng Start ang user
    socket.on('find-match', () => {
        if (waitingUser && waitingUser.id !== socket.id) {
            // May naghihintay na partner! Ikonekta silang dalawa.
            const partner = waitingUser;
            waitingUser = null;

            socket.partnerId = partner.id;
            partner.partnerId = socket.id;

            // Sabihan ang initiator na magsimula ng offer
            socket.emit('match-found', { initiator: true, partnerId: partner.id });
            partner.emit('match-found', { initiator: false, partnerId: socket.id });
        } else {
            // Walang partner, ilagay ang user sa waiting area
            waitingUser = socket;
        }
    });

    // WebRTC Signaling Events
    socket.on('signal', (data) => {
        io.to(data.target).emit('signal', {
            sender: socket.id,
            signal: data.signal
        });
    });

    // Kapag nag-skip ang user
    socket.on('skip', () => {
        handleDisconnect(socket);
    });

    // Kapag nag-disconnect o nagsara ng tab
    socket.on('disconnect', () => {
        activeUsers--;
        io.emit('user-count', activeUsers);
        handleDisconnect(socket);
    });

    function handleDisconnect(sock) {
        if (waitingUser && waitingUser.id === sock.id) {
            waitingUser = null;
        }
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
    console.log(`Server running on http://localhost:${PORT}`);
});
