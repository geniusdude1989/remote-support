const { WebSocketServer } = require('ws');
const db = require('./db');

class SignalingServer {
  constructor(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer });
    // Map: deviceId -> { ws, deviceName, userId, connectTime }
    this.clients = new Map();

    this.wss.on('connection', (ws, req) => {
      let registeredDeviceId = null;
      ws.isAlive = true;

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(ws, msg, (devId) => {
            registeredDeviceId = devId;
          });
        } catch (err) {
          console.error('[Signaling] Failed to parse message:', err.message);
        }
      });

      ws.on('close', () => {
        if (registeredDeviceId) {
          console.log(`[Signaling] Device disconnected: ${registeredDeviceId}`);
          this.clients.delete(registeredDeviceId);
          this.updateDeviceLastSeen(registeredDeviceId);
        }
      });

      ws.on('error', (err) => {
        console.error(`[Signaling] Socket error on device ${registeredDeviceId}:`, err.message);
      });
    });

    // Heartbeat every 25 seconds
    this.heartbeatInterval = setInterval(() => {
      for (const [devId, client] of this.clients.entries()) {
        if (!client.ws.isAlive) {
          console.log(`[Signaling] Client ${devId} timed out`);
          client.ws.terminate();
          this.clients.delete(devId);
          continue;
        }
        client.ws.isAlive = false;
        client.ws.ping();
      }
    }, 25000);
  }

  handleMessage(ws, msg, setDeviceId) {
    const { type } = msg;

    switch (type) {
      case 'register': {
        const { deviceId, deviceName, userId } = msg;
        if (!deviceId) return;

        setDeviceId(deviceId);
        this.clients.set(deviceId, {
          ws,
          deviceName: deviceName || 'Unknown Device',
          userId: userId || null,
          connectTime: Date.now()
        });

        console.log(`[Signaling] Device registered: ${deviceId} (${deviceName})`);
        this.updateDeviceLastSeen(deviceId);

        ws.send(JSON.stringify({
          type: 'register_ack',
          deviceId,
          status: 'online',
          serverTime: Date.now()
        }));
        break;
      }

      case 'query_status': {
        const { targetId } = msg;
        const target = this.clients.get(targetId);
        ws.send(JSON.stringify({
          type: 'status_result',
          targetId,
          online: !!target,
          deviceName: target ? target.deviceName : null
        }));
        break;
      }

      case 'call_request': {
        const { targetId, fromId, fromName, hasPassword, isUnattended, passwordHash } = msg;
        const target = this.clients.get(targetId);

        if (!target) {
          ws.send(JSON.stringify({
            type: 'call_error',
            targetId,
            reason: 'Device is offline or ID does not exist.'
          }));
          return;
        }

        console.log(`[Signaling] Call request from ${fromId} (${fromName}) -> ${targetId}`);
        target.ws.send(JSON.stringify({
          type: 'incoming_call',
          fromId,
          fromName,
          hasPassword,
          isUnattended,
          passwordHash
        }));
        break;
      }

      case 'call_response': {
        const { targetId, fromId, accepted, reason, permissions } = msg;
        const caller = this.clients.get(targetId);

        if (caller) {
          console.log(`[Signaling] Call response from ${fromId} -> ${targetId}: accepted=${accepted}`);
          caller.ws.send(JSON.stringify({
            type: 'call_response',
            fromId,
            accepted,
            reason,
            permissions
          }));
        }
        break;
      }

      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice':
      case 'call_hangup': {
        const { targetId } = msg;
        const target = this.clients.get(targetId);

        if (target) {
          target.ws.send(JSON.stringify(msg));
        }
        break;
      }

      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      default:
        console.warn('[Signaling] Unknown message type:', type);
    }
  }

  updateDeviceLastSeen(deviceId) {
    try {
      const update = db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?');
      update.run(deviceId);
    } catch (e) {
      // Ignore if device not in DB yet
    }
  }

  isOnline(deviceId) {
    return this.clients.has(deviceId);
  }
}

module.exports = SignalingServer;
