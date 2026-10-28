const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

class InputManager {
  constructor() {
    this.process = null;
    this.isReady = false;
    this.screenSize = { width: 1920, height: 1080 };
  }

  resolveExecutablePath() {
    // 1. Packaged: Check resources/native or resources/app.asar.unpacked/native
    if (app && app.isPackaged && process.resourcesPath) {
      const candidates = [
        path.join(process.resourcesPath, 'native', 'input_injector.exe'),
        path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'input_injector.exe')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
    }

    // 2. Development mode or fallback: Look outside asar
    const devPath = path.join(__dirname, '..', 'native', 'input_injector.exe');
    if (!devPath.includes('app.asar') && fs.existsSync(devPath)) {
      return devPath;
    }

    // 3. Last fallback
    if (process.resourcesPath) {
      const resPath = path.join(process.resourcesPath, 'native', 'input_injector.exe');
      if (fs.existsSync(resPath)) return resPath;
    }

    return null;
  }

  start() {
    const exePath = this.resolveExecutablePath();
    if (!exePath) {
      console.warn('[InputManager] Native input injector executable not found on disk. Falling back to non-injected mode.');
      return;
    }

    console.log(`[InputManager] Launching input injector from: ${exePath}`);

    try {
      this.process = spawn(exePath, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.process.on('error', (err) => {
        console.error('[InputManager] Process error:', err.message);
        this.isReady = false;
        this.process = null;
      });

      this.process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.status === 'ready') {
              this.isReady = true;
              this.queryScreenSize();
            } else if (parsed.width && parsed.height) {
              this.screenSize = parsed;
              console.log(`[InputManager] Screen size detected: ${parsed.width}x${parsed.height}`);
            }
          } catch (e) {}
        }
      });

      this.process.stderr.on('data', (data) => {
        console.warn('[InputManager stderr]:', data.toString());
      });

      this.process.on('close', (code) => {
        console.log(`[InputManager] Process exited with code ${code}`);
        this.isReady = false;
        this.process = null;
      });
    } catch (err) {
      console.error('[InputManager] Failed to start input injector:', err.message);
      this.isReady = false;
      this.process = null;
    }
  }

  send(command) {
    if (this.process && this.process.stdin.writable) {
      this.process.stdin.write(JSON.stringify(command) + '\n');
    }
  }

  queryScreenSize() {
    this.send({ action: 'get_screen_size' });
  }

  injectMouseMove(normX, normY) {
    this.send({ action: 'mouse_move', x: normX, y: normY, norm: true });
  }

  injectMouseDown(button) {
    this.send({ action: 'mouse_down', button });
  }

  injectMouseUp(button) {
    this.send({ action: 'mouse_up', button });
  }

  injectMouseWheel(deltaY) {
    this.send({ action: 'mouse_wheel', deltaY });
  }

  injectKeyDown(vk, scan, char) {
    this.send({ action: 'key_down', vk, scan, char });
  }

  injectKeyUp(vk, scan, char) {
    this.send({ action: 'key_up', vk, scan, char });
  }

  stop() {
    if (this.process) {
      try {
        this.process.stdin.write('exit\n');
        this.process.kill();
      } catch (e) {}
      this.process = null;
    }
  }
}

module.exports = new InputManager();
