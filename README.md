# Antigravity Remote Support ⚡

A high-performance, secure, AnyDesk-style remote support and desktop control application that works both **locally (LAN without internet)** and over the **cloud (WAN with NAT traversal)**.

Packaged as a standalone Windows `.exe` application with support for user accounts, address books, unattended access, and end-to-end encrypted screen streaming and input control.

---

## 🌟 Key Features

- **AnyDesk-Style Experience**:
  - **9-Digit Device ID** (e.g. `482 190 735`) for clean and familiar addressing.
  - **Dynamic One-Time Session PIN** for secure attended support.
  - **Unattended Access**: Configure a master password to allow remote access to your own computers without physical interaction.
  - **Interactive Consent Modal**: Host receives incoming call modal with caller information and explicit permission toggles (mouse/keyboard control, clipboard synchronization).
- **Dual Connectivity Modes**:
  - **Cloud Mode (Internet / WAN)**: Connects via low-latency WebRTC using Google STUN and cloud signaling server with automatic NAT/firewall traversal.
  - **Local LAN Mode (Offline / Zero-Config)**: Automatically discovers other computers on the same Wi-Fi or local subnet via UDP broadcast (port 38990) for high-speed, direct peer-to-peer connection without an internet connection.
- **Microsecond Win32 Input Injection**:
  - Built-in compiled native Windows input injector (`input_injector.exe`) leveraging Win32 `SendInput` and DPI-aware coordinate mapping.
  - Full support for left/right/middle clicks, mouse drag, mouse wheel, virtual key codes, and keyboard modifiers.
- **Security & Encryption**:
  - End-to-End Encryption via WebRTC DTLS-SRTP (AES-128 / AES-256-GCM).
  - Secure Cloud Authentication with `node:crypto.scryptSync` salted password hashing and HMAC-SHA256 JWT tokens.
- **Account & Cloud Address Book**:
  - User registration & login.
  - Save and label remote computers in your address book with online/offline live status.
  - 1-click connect to any registered machine.
- **Windows Executable (.exe)**:
  - Ready to be distributed as a portable executable or NSIS installer.

---

## 📂 Project Architecture

```
h:\rdp/
├── server/                    # Cloud Signaling & Authentication Server
│   ├── src/
│   │   ├── index.js           # Server entry point (Express + WebSockets)
│   │   ├── db.js              # Built-in SQLite database (node:sqlite)
│   │   ├── auth.js            # Scrypt password hashing & JWT auth middleware
│   │   ├── routes.js          # REST endpoints (auth, devices, address book, ICE)
│   │   └── signaling.js       # WebRTC signaling router & presence manager
│   ├── data/                  # SQLite storage directory
│   └── package.json
│
├── client/                    # AnyDesk Desktop Client (Electron + WebRTC)
│   ├── main/
│   │   ├── main.js            # Electron main process & IPC handlers
│   │   ├── input-manager.js   # Native input injector process manager
│   │   └── lan-discovery.js   # UDP beacon broadcaster & receiver (port 38990)
│   ├── native/
│   │   ├── input_injector.cs  # Windows C# SendInput source
│   │   └── input_injector.exe # Compiled zero-dependency native helper
│   ├── preload/
│   │   └── preload.js         # Secure context bridge
│   ├── renderer/
│   │   ├── index.html         # AnyDesk-inspired main dashboard
│   │   ├── styles.css         # Modern dark theme styles
│   │   ├── app.js             # Client controller & host WebRTC engine
│   │   ├── viewer.html        # Remote desktop session viewer window
│   │   └── viewer.js          # Viewer controller & input event forwarder
│   ├── assets/                # App icon & branding
│   └── package.json
│
├── start-server.bat           # 1-Click script to run cloud server
├── start-client.bat           # 1-Click script to run desktop app
├── build-exe.bat              # 1-Click script to compile Windows .exe
└── README.md
```

---

## 🚀 Quick Start Guide

### 1. Start the Cloud Server

Open a terminal or run `start-server.bat`:
```bash
cd server
npm start
```
The server will start on `http://localhost:8080` (WebSocket on `ws://localhost:8080`).

### 2. Start the Desktop Client (Dev Mode)

Open another terminal or run `start-client.bat`:
```bash
cd client
npm start
```

### 3. Build the Windows `.exe` Installer

To compile the application into a standalone Windows installer and portable `.exe`:
```bash
cd client
npm run dist
```
The compiled output will be generated inside:
`client/dist/Antigravity Remote Support Setup 1.0.0.exe` and `client/dist/win-unpacked/`

---

## 🔒 Security Best Practices

1. **Attended Support**: Every incoming connection generates a fresh 4-digit PIN. The host must click **ACCEPT** on the consent prompt before screen or input control begins.
2. **Unattended Access**: When enabled, the connection requires the master password configured in the host's settings.
3. **DTLS-SRTP**: Video, audio, and input data channels are encrypted end-to-end between the two peers. The signaling server never sees or inspects raw screen or keyboard data.
4. **Custom STUN/TURN**: In corporate environments with strict symmetric NATs or firewalls, you can set `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` environment variables on the cloud server.
