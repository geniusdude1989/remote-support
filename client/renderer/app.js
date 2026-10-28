// Antigravity Remote Support - Main Dashboard Controller
let systemInfo = null;
let currentPin = '';
let unattendedEnabled = false;
let unattendedPassword = '';
let serverUrl = localStorage.getItem('server_url') || 'http://localhost:8080';
let authToken = localStorage.getItem('auth_token') || null;
let currentUser = null;

let ws = null;
let isConnectedToCloud = false;
let activePeerConnection = null;
let activeDataChannel = null;
let localMediaStream = null;
let pendingIncomingCall = null;
let pendingConnectTarget = null;
let lanPeers = [];

// DOM Elements
const myDeviceIdEl = document.getElementById('my-device-id');
const sessionPinEl = document.getElementById('session-pin');
const cloudDot = document.getElementById('cloud-dot');
const cloudStatusText = document.getElementById('cloud-status-text');
const lanCountText = document.getElementById('lan-count-text');
const targetDeskIdInput = document.getElementById('target-desk-id');
const btnConnect = document.getElementById('btn-connect');
const recentListEl = document.getElementById('recent-connections-list');
const lanListEl = document.getElementById('lan-devices-list');
const addressBookListEl = document.getElementById('address-book-list');

// Modals
const incomingModal = document.getElementById('incoming-modal');
const incomingCallerIdEl = document.getElementById('incoming-caller-id');
const incomingCallerNameEl = document.getElementById('incoming-caller-name');
const btnAcceptCall = document.getElementById('btn-accept-call');
const btnRejectCall = document.getElementById('btn-reject-call');
const activeHostBanner = document.getElementById('active-host-banner');
const activeSessionPartner = document.getElementById('active-session-partner');
const btnHostDisconnect = document.getElementById('btn-host-disconnect');

const passwordModal = document.getElementById('password-modal');
const pwdDialogTargetId = document.getElementById('pwd-dialog-target-id');
const pwdInput = document.getElementById('pwd-input');
const btnPwdSubmit = document.getElementById('btn-pwd-submit');
const btnPwdCancel = document.getElementById('btn-pwd-cancel');

// Navigation Tabs
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    const tabName = item.getAttribute('data-tab');
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) targetPane.classList.add('active');
    if (tabName === 'address-book') loadAddressBook();
  });
});

// User Profile Avatar Click -> Go to Auth Tab
document.getElementById('btn-user-profile').addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-auth').classList.add('active');
});

// Generate 4-digit PIN
function generateRandomPin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Format 9-digit ID as '123 456 789'
function formatDeviceId(id) {
  if (!id || id.length !== 9) return id || '';
  return `${id.slice(0, 3)} ${id.slice(3, 6)} ${id.slice(6, 9)}`;
}

// Initialize Application
async function init() {
  try {
    const config = await window.electronAPI.getAppConfig();
    if (!localStorage.getItem('server_url') && config && config.serverUrl) {
      serverUrl = config.serverUrl;
      document.getElementById('setting-server-url').value = serverUrl;
    }

    systemInfo = await window.electronAPI.getSystemInfo();
    myDeviceIdEl.innerText = formatDeviceId(systemInfo.deviceId);
    currentPin = generateRandomPin();
    sessionPinEl.innerText = currentPin;

    // Load recent connections
    renderRecentConnections();

    // Check saved credentials
    unattendedPassword = localStorage.getItem('unattended_pwd') || '';
    unattendedEnabled = localStorage.getItem('unattended_enabled') === 'true';
    document.getElementById('chk-unattended').checked = unattendedEnabled;
    document.getElementById('unattended-label').innerText = unattendedEnabled ? 'Enabled' : 'Disabled';
    if (unattendedPassword) {
      document.getElementById('setting-unattended-pwd').value = unattendedPassword;
    }

    // Connect to Cloud Signaling
    connectSignalingServer();

    // Setup LAN discovery listener
    window.electronAPI.onLanPeersUpdated((peers) => {
      lanPeers = peers;
      lanCountText.innerText = `LAN: ${peers.length} nearby`;
      renderLanDevices(peers);
    });

    // Check user profile if token exists
    if (authToken) {
      fetchUserProfile();
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

// Copy ID Button
document.getElementById('btn-copy-id').addEventListener('click', () => {
  if (systemInfo) {
    window.electronAPI.copyToClipboard(systemInfo.deviceId);
    const orig = document.getElementById('btn-copy-id').innerHTML;
    document.getElementById('btn-copy-id').innerText = 'Copied!';
    setTimeout(() => { document.getElementById('btn-copy-id').innerHTML = orig; }, 1500);
  }
});

// Regenerate PIN
document.getElementById('btn-regen-pin').addEventListener('click', () => {
  currentPin = generateRandomPin();
  sessionPinEl.innerText = currentPin;
});

// Unattended Access Toggle
document.getElementById('chk-unattended').addEventListener('change', (e) => {
  unattendedEnabled = e.target.checked;
  localStorage.setItem('unattended_enabled', unattendedEnabled.toString());
  document.getElementById('unattended-label').innerText = unattendedEnabled ? 'Enabled' : 'Disabled';
  if (unattendedEnabled && !unattendedPassword) {
    alert('Please set an Unattended Master Password in Settings tab.');
  }
});

// Connect to Cloud Signaling Server
function connectSignalingServer() {
  cloudDot.className = 'badge-dot';
  cloudStatusText.innerText = 'Connecting...';

  const wsUrl = serverUrl.replace(/^http/, 'ws');
  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      isConnectedToCloud = true;
      cloudDot.className = 'badge-dot online';
      cloudStatusText.innerText = 'Cloud Connected';

      // Register device with server
      ws.send(JSON.stringify({
        type: 'register',
        deviceId: systemInfo.deviceId,
        deviceName: systemInfo.deviceName,
        userId: currentUser ? currentUser.id : null
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleSignalingMessage(msg);
      } catch (e) {
        console.error('Failed to parse signaling message:', e);
      }
    };

    ws.onclose = () => {
      isConnectedToCloud = false;
      cloudDot.className = 'badge-dot';
      cloudStatusText.innerText = 'Cloud Offline';
      // Auto-reconnect in 5 seconds
      setTimeout(connectSignalingServer, 5000);
    };

    ws.onerror = (err) => {
      console.warn('Signaling error:', err);
    };
  } catch (e) {
    console.error('WS connection failed:', e);
  }
}

// Handle Signaling Messages (HOST & CLIENT)
async function handleSignalingMessage(msg) {
  const { type } = msg;

  switch (type) {
    case 'incoming_call': {
      // Remote user wants to connect to us (We are Host)
      handleIncomingCall(msg);
      break;
    }

    case 'call_response': {
      // Host answered our call request
      if (pendingConnectTarget) {
        if (msg.accepted) {
          // Open viewer window and pass WebRTC parameters
          saveRecentConnection(pendingConnectTarget.targetId, msg.fromName || 'Remote Desk');
          window.electronAPI.openRemoteViewer({
            sessionId: `${systemInfo.deviceId}-${pendingConnectTarget.targetId}`,
            remoteId: pendingConnectTarget.targetId,
            remoteName: msg.fromName || 'Remote Desk',
            isHost: false,
            serverUrl: serverUrl,
            permissions: msg.permissions
          });
        } else {
          alert(`Connection Rejected: ${msg.reason || 'User declined the connection.'}`);
        }
        pendingConnectTarget = null;
      }
      break;
    }

    case 'call_error': {
      alert(`Connection Failed: ${msg.reason}`);
      pendingConnectTarget = null;
      break;
    }

    case 'webrtc_offer': {
      // Host receives WebRTC Offer from Viewer
      handleRemoteOffer(msg);
      break;
    }

    case 'webrtc_ice': {
      if (activePeerConnection && activePeerConnection.remoteDescription) {
        try {
          await activePeerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (e) {
          console.warn('Error adding ICE candidate:', e);
        }
      }
      break;
    }

    case 'call_hangup': {
      terminateHostSession('Remote user ended the session.');
      break;
    }
  }
}

// Host: Handle Incoming Call
function handleIncomingCall(msg) {
  const { fromId, fromName, hasPassword, isUnattended, passwordHash } = msg;

  // Check if unattended access matches
  if (isUnattended && unattendedEnabled && unattendedPassword) {
    if (passwordHash === unattendedPassword) {
      acceptIncomingCall(msg);
      return;
    }
  }

  // Otherwise, show AnyDesk incoming call consent prompt
  pendingIncomingCall = msg;
  incomingCallerIdEl.innerText = formatDeviceId(fromId);
  incomingCallerNameEl.innerText = `${fromName} is requesting remote control`;
  incomingModal.classList.add('active');
}

// Accept incoming call
async function acceptIncomingCall(callData) {
  const allowControl = document.getElementById('perm-control').checked;
  const allowClipboard = document.getElementById('perm-clipboard').checked;

  incomingModal.classList.remove('active');

  // Start screen capture
  try {
    const sources = await window.electronAPI.getScreenSources();
    if (sources.length === 0) {
      alert('No display screens found to share.');
      return;
    }

    const primarySource = sources[0];

    // High quality 60fps screen stream
    localMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080,
          maxFrameRate: 60
        }
      }
    });

    // Notify caller that call was accepted
    ws.send(JSON.stringify({
      type: 'call_response',
      targetId: callData.fromId,
      fromId: systemInfo.deviceId,
      fromName: systemInfo.deviceName,
      accepted: true,
      permissions: { control: allowControl, clipboard: allowClipboard }
    }));

    // Show active host banner
    activeHostBanner.classList.add('active');
    activeSessionPartner.innerText = `${callData.fromName || callData.fromId} (${callData.fromId})`;

  } catch (err) {
    console.error('Failed to capture screen:', err);
    ws.send(JSON.stringify({
      type: 'call_response',
      targetId: callData.fromId,
      fromId: systemInfo.deviceId,
      accepted: false,
      reason: 'Failed to capture host desktop screen.'
    }));
  }
}

// Host: Handle WebRTC Offer
async function handleRemoteOffer(msg) {
  try {
    const iceConfig = await fetchIceServers();
    activePeerConnection = new RTCPeerConnection(iceConfig);

    // Add local desktop stream tracks
    if (localMediaStream) {
      localMediaStream.getTracks().forEach(track => {
        activePeerConnection.addTrack(track, localMediaStream);
      });
    }

    // Listen for incoming DataChannel from Viewer (for mouse & keyboard events)
    activePeerConnection.ondatachannel = (event) => {
      activeDataChannel = event.channel;
      activeDataChannel.onmessage = (e) => {
        handleRemoteInputCommand(e.data);
      };
    };

    activePeerConnection.onicecandidate = (event) => {
      if (event.candidate && ws) {
        ws.send(JSON.stringify({
          type: 'webrtc_ice',
          targetId: msg.fromId,
          fromId: systemInfo.deviceId,
          candidate: event.candidate
        }));
      }
    };

    await activePeerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await activePeerConnection.createAnswer();
    await activePeerConnection.setLocalDescription(answer);

    ws.send(JSON.stringify({
      type: 'webrtc_answer',
      targetId: msg.fromId,
      fromId: systemInfo.deviceId,
      sdp: answer
    }));
  } catch (e) {
    console.error('Error handling WebRTC offer on host:', e);
  }
}

// Host: Inject Remote Input Command
function handleRemoteInputCommand(raw) {
  try {
    const cmd = JSON.parse(raw);
    const { action } = cmd;

    if (action === 'mouse_move') {
      window.electronAPI.injectMouseMove(cmd.normX, cmd.normY);
    } else if (action === 'mouse_down') {
      window.electronAPI.injectMouseDown(cmd.button);
    } else if (action === 'mouse_up') {
      window.electronAPI.injectMouseUp(cmd.button);
    } else if (action === 'mouse_wheel') {
      window.electronAPI.injectMouseWheel(cmd.deltaY);
    } else if (action === 'key_down') {
      window.electronAPI.injectKeyDown(cmd.vk, cmd.scan, cmd.char);
    } else if (action === 'key_up') {
      window.electronAPI.injectKeyUp(cmd.vk, cmd.scan, cmd.char);
    }
  } catch (e) {}
}

// Host: Terminate Session
function terminateHostSession(reason) {
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null;
  }
  if (activePeerConnection) {
    activePeerConnection.close();
    activePeerConnection = null;
  }
  activeHostBanner.classList.remove('active');
  if (reason) console.log(reason);
}

btnHostDisconnect.addEventListener('click', () => {
  if (ws && pendingIncomingCall) {
    ws.send(JSON.stringify({
      type: 'call_hangup',
      targetId: pendingIncomingCall.fromId,
      fromId: systemInfo.deviceId
    }));
  }
  terminateHostSession();
});

btnAcceptCall.addEventListener('click', () => {
  if (pendingIncomingCall) {
    acceptIncomingCall(pendingIncomingCall);
  }
});

btnRejectCall.addEventListener('click', () => {
  if (pendingIncomingCall && ws) {
    ws.send(JSON.stringify({
      type: 'call_response',
      targetId: pendingIncomingCall.fromId,
      fromId: systemInfo.deviceId,
      accepted: false,
      reason: 'User declined the connection.'
    }));
    incomingModal.classList.remove('active');
    pendingIncomingCall = null;
  }
});

// CLIENT: Initiate Connection
btnConnect.addEventListener('click', () => {
  const target = targetDeskIdInput.value.trim().replace(/\s+/g, '');
  if (!target) {
    alert('Please enter a target 9-Digit Device ID or LAN IP.');
    return;
  }
  initiateConnection(target);
});

function initiateConnection(targetId) {
  pendingConnectTarget = { targetId };

  // Show password prompt modal
  pwdDialogTargetId.innerText = formatDeviceId(targetId);
  pwdInput.value = '';
  passwordModal.classList.add('active');
  pwdInput.focus();
}

btnPwdSubmit.addEventListener('click', () => {
  const pwd = pwdInput.value.trim();
  passwordModal.classList.remove('active');

  if (!ws || !isConnectedToCloud) {
    alert('Cloud signaling server is not connected. Check your connection or server settings.');
    return;
  }

  // Send call request to target via Cloud
  ws.send(JSON.stringify({
    type: 'call_request',
    targetId: pendingConnectTarget.targetId,
    fromId: systemInfo.deviceId,
    fromName: systemInfo.deviceName,
    hasPassword: !!pwd,
    isUnattended: !!pwd,
    passwordHash: pwd
  }));
});

btnPwdCancel.addEventListener('click', () => {
  passwordModal.classList.remove('active');
  pendingConnectTarget = null;
});

// Fetch ICE Server Configuration
async function fetchIceServers() {
  try {
    const res = await fetch(`${serverUrl}/api/config/ice`);
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

// Render Recent Connections
function renderRecentConnections() {
  const saved = JSON.parse(localStorage.getItem('recent_connections') || '[]');
  recentListEl.innerHTML = '';
  if (saved.length === 0) {
    recentListEl.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); padding: 8px;">No recent sessions yet.</div>';
    return;
  }

  saved.forEach(item => {
    const div = document.createElement('div');
    div.className = 'device-item';
    div.innerHTML = `
      <div class="device-item-info">
        <div class="device-item-icon">💻</div>
        <div>
          <div class="device-item-name">${item.name || formatDeviceId(item.id)}</div>
          <div class="device-item-meta">${formatDeviceId(item.id)} • Last: ${new Date(item.time).toLocaleDateString()}</div>
        </div>
      </div>
      <button class="btn-secondary" style="padding: 4px 10px;">Connect</button>
    `;
    div.querySelector('button').addEventListener('click', () => {
      targetDeskIdInput.value = item.id;
      initiateConnection(item.id);
    });
    recentListEl.appendChild(div);
  });
}

function saveRecentConnection(id, name) {
  let saved = JSON.parse(localStorage.getItem('recent_connections') || '[]');
  saved = saved.filter(s => s.id !== id);
  saved.unshift({ id, name, time: Date.now() });
  if (saved.length > 8) saved.pop();
  localStorage.setItem('recent_connections', JSON.stringify(saved));
  renderRecentConnections();
}

// Render LAN Devices
function renderLanDevices(peers) {
  lanListEl.innerHTML = '';
  if (peers.length === 0) {
    lanListEl.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); padding: 12px;">Scanning local network for other Antigravity desks...</div>';
    return;
  }

  peers.forEach(peer => {
    const div = document.createElement('div');
    div.className = 'device-item';
    div.innerHTML = `
      <div class="device-item-info">
        <div class="device-item-icon" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">⚡</div>
        <div>
          <div class="device-item-name">${peer.deviceName}</div>
          <div class="device-item-meta">LAN IP: ${peer.ip} • ID: ${formatDeviceId(peer.deviceId)}</div>
        </div>
      </div>
      <button class="btn-secondary" style="background: #2563eb; color: white; border: none; padding: 6px 14px;">Connect LAN</button>
    `;
    div.querySelector('button').addEventListener('click', () => {
      targetDeskIdInput.value = peer.deviceId;
      initiateConnection(peer.deviceId);
    });
    lanListEl.appendChild(div);
  });
}

// User Accounts & Authentication
document.getElementById('auth-toggle-login').addEventListener('click', () => {
  document.getElementById('auth-toggle-login').style.backgroundColor = 'var(--accent-red)';
  document.getElementById('auth-toggle-login').style.color = 'white';
  document.getElementById('auth-toggle-register').style.backgroundColor = '';
  document.getElementById('auth-toggle-register').style.color = '';
  document.getElementById('group-name').style.display = 'none';
  document.getElementById('btn-auth-submit').innerText = 'Sign In';
});

document.getElementById('auth-toggle-register').addEventListener('click', () => {
  document.getElementById('auth-toggle-register').style.backgroundColor = 'var(--accent-red)';
  document.getElementById('auth-toggle-register').style.color = 'white';
  document.getElementById('auth-toggle-login').style.backgroundColor = '';
  document.getElementById('auth-toggle-login').style.color = '';
  document.getElementById('group-name').style.display = 'flex';
  document.getElementById('btn-auth-submit').innerText = 'Create Account';
});

document.getElementById('btn-auth-submit').addEventListener('click', async () => {
  const isRegister = document.getElementById('group-name').style.display === 'flex';
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const name = document.getElementById('auth-name').value.trim();
  const errBox = document.getElementById('auth-error-msg');

  errBox.style.display = 'none';
  if (!email || !password || (isRegister && !name)) {
    errBox.innerText = 'Please fill out all required fields.';
    errBox.style.display = 'block';
    return;
  }

  const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
  const payload = isRegister ? { email, password, name } : { email, password };

  try {
    const res = await fetch(`${serverUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      errBox.innerText = data.error || 'Authentication failed.';
      errBox.style.display = 'block';
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('auth_token', authToken);
    updateUserUI();

    // Link current device to account automatically
    await linkCurrentDeviceToAccount();
  } catch (err) {
    errBox.innerText = 'Server connection error: ' + err.message;
    errBox.style.display = 'block';
  }
});

async function fetchUserProfile() {
  try {
    const res = await fetch(`${serverUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      updateUserUI();
    } else {
      authToken = null;
      localStorage.removeItem('auth_token');
    }
  } catch (e) {}
}

function updateUserUI() {
  if (currentUser) {
    document.getElementById('profile-name').innerText = currentUser.name;
    document.getElementById('profile-email').innerText = currentUser.email;
    document.getElementById('avatar-initials').innerText = currentUser.name.charAt(0).toUpperCase();

    document.getElementById('auth-form-card').style.display = 'none';
    document.getElementById('auth-logged-in-card').style.display = 'block';
    document.getElementById('logged-name').innerText = currentUser.name;
    document.getElementById('logged-email').innerText = currentUser.email;
    document.getElementById('logged-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
  } else {
    document.getElementById('profile-name').innerText = 'Guest User';
    document.getElementById('profile-email').innerText = 'Click to Sign In';
    document.getElementById('avatar-initials').innerText = '?';

    document.getElementById('auth-form-card').style.display = 'block';
    document.getElementById('auth-logged-in-card').style.display = 'none';
  }
}

document.getElementById('btn-logout').addEventListener('click', () => {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('auth_token');
  updateUserUI();
});

async function linkCurrentDeviceToAccount() {
  if (!authToken || !systemInfo) return;
  try {
    await fetch(`${serverUrl}/api/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({
        deviceId: systemInfo.deviceId,
        deviceName: systemInfo.deviceName,
        alias: systemInfo.deviceName,
        os: systemInfo.platform
      })
    });
    loadAddressBook();
  } catch (e) {}
}

document.getElementById('btn-link-device').addEventListener('click', async () => {
  await linkCurrentDeviceToAccount();
  alert('Computer linked to your account successfully!');
});

// Address Book
async function loadAddressBook() {
  if (!authToken) {
    addressBookListEl.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); padding: 12px;">Sign in to sync and access your address book.</div>';
    return;
  }

  try {
    const res = await fetch(`${serverUrl}/api/devices`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    addressBookListEl.innerHTML = '';
    if (!data.devices || data.devices.length === 0) {
      addressBookListEl.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); padding: 12px;">No registered devices in address book yet.</div>';
      return;
    }

    data.devices.forEach(dev => {
      const isThisDevice = systemInfo && dev.device_id === systemInfo.deviceId;
      const div = document.createElement('div');
      div.className = 'device-item';
      div.innerHTML = `
        <div class="device-item-info">
          <div class="device-item-icon">🖥️</div>
          <div>
            <div class="device-item-name">${dev.alias || dev.device_name} ${isThisDevice ? '(This PC)' : ''}</div>
            <div class="device-item-meta">ID: ${formatDeviceId(dev.device_id)} • OS: ${dev.os || 'Windows'}</div>
          </div>
        </div>
        ${isThisDevice ? '<span style="font-size: 12px; color: var(--accent-green);">Current Device</span>' : '<button class="btn-primary" style="padding: 6px 14px;">Connect</button>'}
      `;
      if (!isThisDevice) {
        div.querySelector('button').addEventListener('click', () => {
          targetDeskIdInput.value = dev.device_id;
          initiateConnection(dev.device_id);
        });
      }
      addressBookListEl.appendChild(div);
    });
  } catch (e) {
    addressBookListEl.innerHTML = '<div style="font-size: 13px; color: #f87171; padding: 12px;">Failed to load address book.</div>';
  }
}

document.getElementById('btn-refresh-addressbook').addEventListener('click', loadAddressBook);

// Settings
document.getElementById('btn-save-settings').addEventListener('click', () => {
  const newUrl = document.getElementById('setting-server-url').value.trim();
  const newUnattendedPwd = document.getElementById('setting-unattended-pwd').value.trim();

  if (newUrl) {
    serverUrl = newUrl;
    localStorage.setItem('server_url', newUrl);
  }
  if (newUnattendedPwd) {
    unattendedPassword = newUnattendedPwd;
    localStorage.setItem('unattended_pwd', newUnattendedPwd);
  }
  alert('Settings saved! Reconnecting to server...');
  connectSignalingServer();
});

// Run Init
window.addEventListener('DOMContentLoaded', init);
