/**
 * Session Storage Adapter for Electron Main Process
 * 
 * Provides persistent storage for Supabase authentication sessions across
 * desktop application restarts. Stores session tokens securely in the user's
 * OS-specific app data directory (e.g. %APPDATA%\SmartDocs on Windows).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ElectronSessionStorage {
  constructor() {
    this.filePath = null;
  }

  // Resolves the session storage file path lazily once Electron app is ready
  getStoragePath() {
    if (!this.filePath) {
      try {
        const userDataDir = app.getPath('userData');
        if (!fs.existsSync(userDataDir)) {
          fs.mkdirSync(userDataDir, { recursive: true });
        }
        this.filePath = path.join(userDataDir, 'supabase-auth-session.json');
      } catch (err) {
        console.error('[SessionStorage] Error getting userData path:', err);
        return null;
      }
    }
    return this.filePath;
  }

  readData() {
    const file = this.getStoragePath();
    if (!file || !fs.existsSync(file)) {
      return {};
    }
    try {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content || '{}');
    } catch (err) {
      console.warn('[SessionStorage] Corrupted session file, resetting:', err.message);
      return {};
    }
  }

  writeData(data) {
    const file = this.getStoragePath();
    if (!file) return;
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('[SessionStorage] Error writing session file:', err.message);
    }
  }

  getItem(key) {
    const data = this.readData();
    return data[key] ?? null;
  }

  setItem(key, value) {
    const data = this.readData();
    data[key] = value;
    this.writeData(data);
  }

  removeItem(key) {
    const data = this.readData();
    delete data[key];
    this.writeData(data);
  }
}

module.exports = new ElectronSessionStorage();
