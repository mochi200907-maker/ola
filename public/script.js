const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const userCount = document.getElementById('userCount');

let localStream;
let peerConnection;
let partnerId = null;

// Free Google STUN Servers para sa WebRTC NAT traversal
const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Kunin ang camera at microphone access sa simula
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
    } catch (err) {
        alert('Kailangan ng camera at mic access para gumana ang app.');
    }
}
initMedia();

// Update online user counter
socket.on('user-count', (count) => {
    userCount.textContent = count;
});

// Start button event listener
startBtn.addEventListener('click', () => {
    startBtn.disabled = true;
    skipBtn.disabled = false;
    socket.emit('find-match');
});

// Skip button event listener
skipBtn.addEventListener('click', () => {
    resetConnection();
    socket.emit('skip');
    socket.emit('find-match');
});

// Match logic mula sa server
socket.on('match-found', async (data) => {
    partnerId = data.partnerId;
    createPeerConnection();

    if (data.initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { type: 'offer', sdp: offer } });
    }
});

// WebRTC Signaling Handler
socket.on('signal', async (data) => {
    if (!peerConnection) createPeerConnection();

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
});

// Kapag umalis o nag-skip ang partner
socket.on('partner-disconnected', () => {
    resetConnection();
    alert('Umalis na ang kausap mo. Maghanap ng bago...');
    socket.emit('find-match');
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    // Idagdag ang local tracks (video/audio) sa peer connection
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    // Tanggapin ang remote video track
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    // Ipadala ang ICE Candidates sa partner
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
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
