const http = require('node:http');
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const SignalingServer = require('./signaling');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api', routes);

// Root web dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>HawkRDP Server</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: #0b0f19;
          color: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
        }
        .card {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 16px;
          padding: 36px 48px;
          max-width: 520px;
          text-align: center;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 20px;
        }
        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 10px #10b981;
        }
        h1 { margin: 0 0 8px 0; font-size: 24px; color: #ffffff; }
        p { color: #9ca3af; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          text-align: left;
          background: #1f2937;
          padding: 16px;
          border-radius: 10px;
          font-size: 13px;
        }
        .item-label { color: #9ca3af; font-size: 11px; text-transform: uppercase; }
        .item-val { color: #ffffff; font-weight: 600; margin-top: 2px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">
          <div class="dot"></div>
          <span>HawkRDP Signaling & Auth Server Online</span>
        </div>
        <h1>🦅 HawkRDP Server</h1>
        <p>The secure cloud signaling, WebRTC rendezvous, and account authentication service is operating normally.</p>
        <div class="grid">
          <div>
            <div class="item-label">HTTP API Port</div>
            <div class="item-val">0.0.0.0:${PORT}</div>
          </div>
          <div>
            <div class="item-label">Signaling Protocol</div>
            <div class="item-val">WebSocket (ws://)</div>
          </div>
          <div>
            <div class="item-label">Database Backend</div>
            <div class="item-val">SQLite (node:sqlite)</div>
          </div>
          <div>
            <div class="item-label">Encryption</div>
            <div class="item-val">DTLS-SRTP (E2EE)</div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Antigravity Remote Support Server',
    timestamp: new Date().toISOString()
  });
});

const server = http.createServer(app);
const signaling = new SignalingServer(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Antigravity Remote Support Server Running`);
  console.log(`   HTTP API & Signaling Port: http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket URL: ws://localhost:${PORT}`);
  console.log(`   Health Check: http://localhost:${PORT}/health`);
  console.log(`====================================================`);
});
