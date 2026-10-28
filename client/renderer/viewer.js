// Antigravity Remote Support - Dedicated Viewer Controller
let sessionData = null;
let ws = null;
let peerConnection = null;
let dataChannel = null;
let inputEnabled = true;
let isFullscreen = false;
let isFitScreen = true;

const remoteVideo = document.getElementById('remote-video');
const statusOverlay = document.getElementById('status-overlay');
const statusMsg = document.getElementById('status-msg');
const remoteLabel = document.getElementById('remote-label');
const statLatency = document.getElementById('stat-latency');
const btnToggleInput = document.getElementById('btn-toggle-input');
const btnCad = document.getElementById('btn-cad');
const btnFit = document.getElementById('btn-fit');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnChat = document.getElementById('btn-chat');
const btnDisconnect = document.getElementById('btn-disconnect');
const chatDrawer = document.getElementById('chat-drawer');
const chatMessages = document.getElementById('chat-messages');
const chatText = document.getElementById('chat-text');
const btnSendChat = document.getElementById('btn-send-chat');
const btnCloseChat = document.getElementById('btn-close-chat');

// Receive initialization parameters from Electron Main
window.electronAPI.onRemoteViewerInit((data) => {
  sessionData = data;
  remoteLabel.innerText = `${data.remoteName} (${data.remoteId})`;
  startSession();
});

async function startSession() {
  try {
    const wsUrl = sessionData.serverUrl.replace(/^http/, 'ws');
    ws = new WebSocket(wsUrl);

    ws.onopen = async () => {
      // Register temporary viewer ID
      const myViewerId = `viewer-${Math.floor(Math.random() * 100000)}`;
      ws.send(JSON.stringify({
        type: 'register',
        deviceId: myViewerId,
        deviceName: 'Viewer'
      }));

      // Setup WebRTC connection
      await initializeWebRTC(myViewerId);
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleSignaling(msg);
      } catch (e) {
        console.error('Signaling parse error:', e);
      }
    };

    ws.onclose = () => {
      showStatus('Signaling disconnected.');
    };
  } catch (err) {
    showStatus('Failed to connect: ' + err.message);
  }
}

async function initializeWebRTC(myViewerId) {
  const iceServers = await fetchIceServers();
  peerConnection = new RTCPeerConnection(iceServers);

  // Setup WebRTC DataChannel for low-latency mouse/keyboard commands
  dataChannel = peerConnection.createDataChannel('remote_input', {
    ordered: true
  });

  dataChannel.onopen = () => {
    console.log('[WebRTC] Input DataChannel opened.');
  };

  dataChannel.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'chat') {
        appendChatMessage(msg.sender, msg.text, false);
      }
    } catch (e) {}
  };

  // Remote screen stream track
  peerConnection.ontrack = (event) => {
    console.log('[WebRTC] Received remote stream track');
    remoteVideo.srcObject = event.streams[0];
    statusOverlay.style.display = 'none';
  };

  // ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && ws) {
      ws.send(JSON.stringify({
        type: 'webrtc_ice',
        targetId: sessionData.remoteId,
        fromId: myViewerId,
        candidate: event.candidate
      }));
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      statusOverlay.style.display = 'none';
      startStatsMonitor();
    } else if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
      showStatus('Connection lost or failed.');
    }
  };

  // Create WebRTC Offer
  const offer = await peerConnection.createOffer({
    offerToReceiveVideo: true,
    offerToReceiveAudio: true
  });
  await peerConnection.setLocalDescription(offer);

  ws.send(JSON.stringify({
    type: 'webrtc_offer',
    targetId: sessionData.remoteId,
    fromId: myViewerId,
    sdp: offer
  }));
}

async function handleSignaling(msg) {
  const { type } = msg;

  if (type === 'webrtc_answer') {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }
  } else if (type === 'webrtc_ice') {
    if (peerConnection && peerConnection.remoteDescription) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
      } catch (e) {}
    }
  } else if (type === 'call_hangup') {
    showStatus('Remote partner disconnected.');
  }
}

async function fetchIceServers() {
  try {
    const res = await fetch(`${sessionData.serverUrl}/api/config/ice`);
    const data = await res.json();
    return { iceServers: data.iceServers };
  } catch (e) {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }
}

function showStatus(text) {
  statusOverlay.style.display = 'flex';
  statusMsg.innerText = text;
}

// Send Input Command over DataChannel
function sendInputCommand(cmd) {
  if (!inputEnabled || !dataChannel || dataChannel.readyState !== 'open') return;
  try {
    dataChannel.send(JSON.stringify(cmd));
  } catch (e) {}
}

// Coordinate mapping: maps pointer position on the HTML video element to normalized [0.0 .. 1.0] coordinates
function getNormalizedCoordinates(e) {
  const rect = remoteVideo.getBoundingClientRect();
  const normX = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0.0), 1.0);
  const normY = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0.0), 1.0);
  return { normX, normY };
}

// Mouse Event Listeners
remoteVideo.addEventListener('mousemove', (e) => {
  const { normX, normY } = getNormalizedCoordinates(e);
  sendInputCommand({ action: 'mouse_move', normX, normY });
});

remoteVideo.addEventListener('mousedown', (e) => {
  e.preventDefault();
  let button = 'left';
  if (e.button === 1) button = 'middle';
  if (e.button === 2) button = 'right';
  sendInputCommand({ action: 'mouse_down', button });
});

remoteVideo.addEventListener('mouseup', (e) => {
  e.preventDefault();
  let button = 'left';
  if (e.button === 1) button = 'middle';
  if (e.button === 2) button = 'right';
  sendInputCommand({ action: 'mouse_up', button });
});

remoteVideo.addEventListener('wheel', (e) => {
  e.preventDefault();
  sendInputCommand({ action: 'mouse_wheel', deltaY: e.deltaY });
}, { passive: false });

remoteVideo.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// Keyboard Event Listeners
window.addEventListener('keydown', (e) => {
  if (!inputEnabled) return;
  // Don't forward keys if typing in chat
  if (document.activeElement === chatText) return;

  // Intercept special browser shortcut combinations
  if (['Tab', 'Alt', 'Meta', 'F5', 'F11'].includes(e.key)) {
    e.preventDefault();
  }

  sendInputCommand({
    action: 'key_down',
    vk: e.keyCode,
    char: e.key.length === 1 ? e.key : null
  });
});

window.addEventListener('keyup', (e) => {
  if (!inputEnabled) return;
  if (document.activeElement === chatText) return;

  sendInputCommand({
    action: 'key_up',
    vk: e.keyCode,
    char: e.key.length === 1 ? e.key : null
  });
});

// Toolbar Controls
btnToggleInput.addEventListener('click', () => {
  inputEnabled = !inputEnabled;
  btnToggleInput.className = inputEnabled ? 'tool-btn active' : 'tool-btn';
  btnToggleInput.innerText = inputEnabled ? '⌨ Mouse & Keys: ON' : '⌨ Mouse & Keys: OFF';
});

btnCad.addEventListener('click', () => {
  // Simulate Ctrl+Alt+Del
  sendInputCommand({ action: 'key_down', vk: 17 }); // Ctrl
  sendInputCommand({ action: 'key_down', vk: 18 }); // Alt
  sendInputCommand({ action: 'key_down', vk: 46 }); // Del
  setTimeout(() => {
    sendInputCommand({ action: 'key_up', vk: 46 });
    sendInputCommand({ action: 'key_up', vk: 18 });
    sendInputCommand({ action: 'key_up', vk: 17 });
  }, 100);
});

btnFit.addEventListener('click', () => {
  isFitScreen = !isFitScreen;
  remoteVideo.style.objectFit = isFitScreen ? 'contain' : 'fill';
  btnFit.innerText = isFitScreen ? 'Fit Screen' : 'Stretch Screen';
});

btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
    btnFullscreen.innerText = 'Exit Fullscreen';
  } else {
    document.exitFullscreen().catch(() => {});
    btnFullscreen.innerText = 'Fullscreen';
  }
});

btnDisconnect.addEventListener('click', () => {
  if (ws && sessionData) {
    ws.send(JSON.stringify({
      type: 'call_hangup',
      targetId: sessionData.remoteId
    }));
  }
  window.close();
});

// Chat Drawer
btnChat.addEventListener('click', () => {
  chatDrawer.classList.toggle('open');
});

btnCloseChat.addEventListener('click', () => {
  chatDrawer.classList.remove('open');
});

btnSendChat.addEventListener('click', sendChat);
chatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

function sendChat() {
  const text = chatText.value.trim();
  if (!text) return;
  appendChatMessage('You', text, true);
  chatText.value = '';

  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify({
      type: 'chat',
      sender: 'Technician',
      text
    }));
  }
}

function appendChatMessage(sender, text, isMe) {
  const div = document.createElement('div');
  div.className = `chat-msg ${isMe ? 'me' : 'them'}`;
  div.innerText = `${sender}: ${text}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Stats Monitor (RTT / Latency)
function startStatsMonitor() {
  setInterval(async () => {
    if (!peerConnection) return;
    try {
      const stats = await peerConnection.getStats();
      stats.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          if (report.currentRoundTripTime !== undefined) {
            const rttMs = Math.round(report.currentRoundTripTime * 1000);
            statLatency.innerText = `${rttMs} ms`;
          }
        }
      });
    } catch (e) {}
  }, 2000);
}
