const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script: Secure bridge between Electron's Node.js main process
 * and the browser window renderer process.
 *
 * contextBridge safely exposes chosen APIs onto the `window` object in renderer
 * without exposing raw Node.js or Electron internal privileges.
 */

// Application & System information API
contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info')
});

// Supabase Authentication Bridge API
contextBridge.exposeInMainWorld('supabaseAuth', {
  signUp: (payload) => ipcRenderer.invoke('auth:signup', payload),
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  
  // Register callback for real-time auth state updates from the main process
  onAuthStateChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('auth:state-changed', handler);
    // Return cleanup function to unsubscribe when needed
    return () => {
      ipcRenderer.removeListener('auth:state-changed', handler);
    };
  }
});
