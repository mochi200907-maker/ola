const socket = io();

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const skipBtn = document.getElementById('skipBtn');
const userCount = document.getElementById('userCount');
const statusOverlay = document.getElementById('statusOverlay');
const loadingSpinner = document.getElementById('loadingSpinner');
const statusText = document.getElementById('statusText');
const remoteInfo = document.getElementById('remoteInfo');

const cameraSelect = document.getElementById('cameraSelect');
const micSelect = document.getElementById('micSelect');

let localStream = null;
let peerConnection = null;
let partnerId = null;
let isSearchingOrConnected = false;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelay', credential: 'openrelay' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelay', credential: 'openrelay' }
    ]
};

// Inisyal na pagkuha ng camera at microphone access
async function initMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        await populateDeviceList();
    } catch (err) {
        alert('Kailangan ng camera at mic permission para gumana ang chat.');
    }
}

// Kunin ang mga available na devices (OBS, Virtual Cams, Mics)
async function populateDeviceList() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    cameraSelect.innerHTML = '';
    micSelect.innerHTML = '';

    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;

        if (device.kind === 'videoinput') {
            option.text = device.label || `Camera ${cameraSelect.length + 1}`;
            cameraSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
            option.text = device.label || `Microphone ${micSelect.length + 1}`;
            micSelect.appendChild(option);
        }
    });
}

initMedia();

// Baguhin ang Media Stream kapag pinalitan ang napiling Camera o Mic
cameraSelect.addEventListener('change', updateLocalStream);
micSelect.addEventListener('change', updateLocalStream);

async function updateLocalStream() {
    const videoDeviceId = cameraSelect.value;
    const audioDeviceId = micSelect.value;

    const constraints = {
        video: videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true,
        audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true
    };

    try {
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Palitan ang lumang local stream
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        localStream = newStream;
        localVideo.srcObject = localStream;

        // Kung kasalukuyang nakakonekta sa stranger, palitan ang live track sa WebRTC
        if (peerConnection) {
            const videoTrack = localStream.getVideoTracks()[0];
            const audioTrack = localStream.getAudioTracks()[0];

            const senders = peerConnection.getSenders();
            const videoSender = senders.find(s => s.track && s.track.kind === 'video');
            const audioSender = senders.find(s => s.track && s.track.kind === 'audio');

            if (videoSender && videoTrack) videoSender.replaceTrack(videoTrack);
            if (audioSender && audioTrack) audioSender.replaceTrack(audioTrack);
        }
    } catch (err) {
        console.error('Error switching devices:', err);
    }
}

socket.on('user-count', (count) => userCount.textContent = count);

startBtn.addEventListener('click', () => {
    if (!localStream) return alert('Paki-access muna ang camera.');

    if (!isSearchingOrConnected) {
        isSearchingOrConnected = true;
        setStartBtnState(true);
        skipBtn.disabled = false;
        showLoading('Looking for a stranger...');
        socket.emit('find-match');
    } else {
        stopEverything();
    }
});

skipBtn.addEventListener('click', () => {
    if (!isSearchingOrConnected) return;
    resetConnection();
    showLoading('Finding new stranger...');
    socket.emit('skip');
    socket.emit('find-match');
});

socket.on('match-found', async (data) => {
    partnerId = data.partnerId;
    remoteInfo.textContent = `Stranger (${data.partnerCountry})`;
    showLoading('Connecting video...');
    createPeerConnection();

    if (data.initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { target: partnerId, signal: { type: 'offer', sdp: offer } });
    }
});

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

socket.on('partner-disconnected', () => {
    if (isSearchingOrConnected) {
        resetConnection();
        showLoading('Stranger left. Searching next...');
        socket.emit('find-match');
    }
});

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            hideLoading();
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
    remoteInfo.textContent = 'Stranger';
}

function stopEverything() {
    isSearchingOrConnected = false;
    resetConnection();
    socket.emit('skip');
    setStartBtnState(false);
    skipBtn.disabled = true;
    showStatusOverlay('Click "Start" to connect', false);
}

function setStartBtnState(isStop) {
    if (isStop) {
        startBtn.textContent = 'Stop Chat';
        startBtn.classList.add('stop-mode');
    } else {
        startBtn.textContent = 'Start Chat';
        startBtn.classList.remove('stop-mode');
    }
}

function showLoading(message) {
    showStatusOverlay(message, true);
}

function showStatusOverlay(message, showSpinner) {
    statusOverlay.classList.remove('hidden');
    if (showSpinner) {
        loadingSpinner.classList.remove('hidden');
    } else {
        loadingSpinner.classList.add('hidden');
    }
    statusText.textContent = message;
}

function hideLoading() {
    statusOverlay.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
}
