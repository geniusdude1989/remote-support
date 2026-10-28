const dgram = require('node:dgram');
const os = require('node:os');
const EventEmitter = require('node:events');

const BROADCAST_PORT = 38990;
const BROADCAST_ADDR = '255.255.255.255';
const BEACON_INTERVAL_MS = 4000;
const PEER_TIMEOUT_MS = 12000;

class LanDiscovery extends EventEmitter {
  constructor(deviceId, deviceName) {
    super();
    this.deviceId = deviceId;
    this.deviceName = deviceName || os.hostname();
    this.socket = null;
    this.beaconTimer = null;
    this.cleanupTimer = null;
    this.peers = new Map(); // deviceId -> { deviceId, deviceName, ip, lastSeen }
  }

  getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips;
  }

  start() {
    try {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('error', (err) => {
        console.warn('[LAN Discovery] Socket error:', err.message);
      });

      this.socket.on('message', (msg, rinfo) => {
        try {
          const data = JSON.parse(msg.toString());
          if (data && data.type === 'antigravity_beacon' && data.deviceId !== this.deviceId) {
            const peer = {
              deviceId: data.deviceId,
              deviceName: data.deviceName,
              ip: rinfo.address,
              lastSeen: Date.now()
            };
            const isNew = !this.peers.has(peer.deviceId);
            this.peers.set(peer.deviceId, peer);
            if (isNew) {
              this.emit('peer-discovered', peer);
            }
            this.emit('peers-updated', Array.from(this.peers.values()));
          }
        } catch (e) {
          // ignore corrupted packets
        }
      });

      this.socket.bind(BROADCAST_PORT, () => {
        try {
          this.socket.setBroadcast(true);
        } catch (e) {
          console.warn('[LAN Discovery] Failed to set broadcast:', e.message);
        }
        console.log(`[LAN Discovery] Listening on UDP port ${BROADCAST_PORT}`);

        // Broadcast presence
        this.sendBeacon();
        this.beaconTimer = setInterval(() => this.sendBeacon(), BEACON_INTERVAL_MS);

        // Clean stale peers
        this.cleanupTimer = setInterval(() => this.cleanStalePeers(), 5000);
      });
    } catch (err) {
      console.warn('[LAN Discovery] Initialization failed:', err.message);
    }
  }

  sendBeacon() {
    if (!this.socket) return;
    const packet = Buffer.from(JSON.stringify({
      type: 'antigravity_beacon',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      timestamp: Date.now()
    }));

    try {
      this.socket.send(packet, 0, packet.length, BROADCAST_PORT, BROADCAST_ADDR, (err) => {
        if (err && err.code !== 'ENETUNREACH') {
          // Silent ignore common socket warnings
        }
      });
    } catch (e) {
      // Ignore broadcast errors on networks that prohibit it
    }
  }

  cleanStalePeers() {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of this.peers.entries()) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        this.emit('peer-lost', peer);
        changed = true;
      }
    }
    if (changed) {
      this.emit('peers-updated', Array.from(this.peers.values()));
    }
  }

  getDiscoveredPeers() {
    return Array.from(this.peers.values());
  }

  stop() {
    if (this.beaconTimer) clearInterval(this.beaconTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {}
      this.socket = null;
    }
  }
}

module.exports = LanDiscovery;
