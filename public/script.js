const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const userCount = document.getElementById('userCount');

let localStream = null;
let peerConnection = null;
let partnerId = null;

// STUN servers para sa IP lookup
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Kailangan ng camera at microphone access para gumana ang video chat.');
    }
}

initMedia();

socket.on('user-count', (count) => {
    userCount.textContent = count;
});

startBtn.addEventListener('click', () => {
    if (!localStream) {
        alert('Paki-payagan muna ang camera at microphone access.');
        return;
    }
    startBtn.disabled = true;
    skipBtn.disabled = false;
    socket.emit('find-match');
});

skipBtn.addEventListener('click', () => {
    resetConnection();
    socket.emit('skip');
    socket.emit('find-match');
});

socket.on('match-found', async (data) => {
    partnerId = data.partnerId;
    createPeerConnection();

    if (data.initiator) {
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('signal', { target: partnerId, signal: { type: 'offer', sdp: offer } });
        } catch (err) {
            console.error('Failed to create offer:', err);
        }
    }
});

socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection();

    try {
        if (data.signal.type === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('signal', { target: data.sender, signal: { type: 'answer', sdp: answer } });
        } else if (data.signal.type === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        } else if (data.signal.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
    } catch (err) {
        console.error('Signaling error:', err);
    }
});

socket.on('partner-disconnected', () => {
    resetConnection();
    socket.emit('find-match');
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && partnerId) {
            socket.emit('signal', { target: partnerId, signal: { candidate: event.candidate } });
        }
    };
}

function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    partnerId = null;
}
