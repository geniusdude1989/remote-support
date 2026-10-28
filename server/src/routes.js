const express = require('express');
const crypto = require('node:crypto');
const db = require('./db');
const { hashPassword, verifyPassword, createToken, authMiddleware } = require('./auth');

const router = express.Router();

// Register new user
router.post('/auth/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const userId = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);

  const insert = db.prepare(`
    INSERT INTO users (id, email, name, password_hash, salt)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run(userId, email.toLowerCase().trim(), name.trim(), hash, salt);

  const token = createToken({ userId, email: email.toLowerCase().trim() });
  return res.status(201).json({
    token,
    user: { id: userId, email: email.toLowerCase().trim(), name: name.trim() }
  });
});

// Login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createToken({ userId: user.id, email: user.email });
  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// Current user profile
router.get('/auth/me', authMiddleware, (req, res) => {
  return res.json({ user: req.user });
});

// Register or link a device to current account (or update device info)
router.post('/devices/register', (req, res) => {
  const { deviceId, deviceName, alias, os } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  // Check optional auth header
  let userId = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const { verifyToken } = require('./auth');
    const decoded = verifyToken(authHeader.substring(7));
    if (decoded) userId = decoded.userId;
  }

  const existing = db.prepare('SELECT id, user_id FROM devices WHERE device_id = ?').get(deviceId);
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (existing) {
    const update = db.prepare(`
      UPDATE devices
      SET device_name = coalesce(?, device_name),
          alias = coalesce(?, alias),
          os = coalesce(?, os),
          user_id = coalesce(?, user_id),
          last_ip = ?,
          last_seen = CURRENT_TIMESTAMP
      WHERE device_id = ?
    `);
    update.run(deviceName || null, alias || null, os || null, userId || existing.user_id, ip, deviceId);
    return res.json({ success: true, message: 'Device updated' });
  } else {
    const id = crypto.randomUUID();
    const insert = db.prepare(`
      INSERT INTO devices (id, user_id, device_id, device_name, alias, os, last_ip, last_seen)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    insert.run(id, userId, deviceId, deviceName || 'Unknown Device', alias || deviceName || 'My PC', os || 'Windows', ip);
    return res.status(201).json({ success: true, message: 'Device registered' });
  }
});

// List devices belonging to authenticated user
router.get('/devices', authMiddleware, (req, res) => {
  const devices = db.prepare(`
    SELECT id, device_id, device_name, alias, os, last_ip, last_seen, created_at
    FROM devices
    WHERE user_id = ?
    ORDER BY last_seen DESC
  `).all(req.user.id);

  return res.json({ devices });
});

// Delete device from user account
router.delete('/devices/:deviceId', authMiddleware, (req, res) => {
  const { deviceId } = req.params;
  const del = db.prepare('DELETE FROM devices WHERE device_id = ? AND user_id = ?');
  const result = del.run(deviceId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Device not found or not owned by you' });
  }
  return res.json({ success: true });
});

// ICE Servers Configuration for WebRTC NAT traversal
router.get('/config/ice', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ];

  // If environment provides custom TURN credentials
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL
    });
  }

  return res.json({ iceServers });
});

module.exports = router;
