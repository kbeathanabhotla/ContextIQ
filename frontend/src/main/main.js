const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let meetingWindow = null;
let currentMeetingProfileId = null; // Track which profile is in the current meeting

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/main-preload.js')
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/main-window/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

function createMeetingWindow(profileId) {
  // Store the profile ID for this meeting
  currentMeetingProfileId = profileId;
  
  // Minimize main window
  if (mainWindow) {
    mainWindow.minimize();
  }

  meetingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/meeting-preload.js'),
      webSecurity: false  // Allow loading local files and CDN
    },
    skipTaskbar: false,
    resizable: false,
    center: true
  });

  // Set always on top using OS-specific flags
  // 'screen-saver' level ensures it stays on top even over fullscreen apps
  meetingWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  
  // Make visible on all workspaces/spaces (macOS/Windows)
  if (process.platform === 'darwin') {
    meetingWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    meetingWindow.setVisibleOnAllWorkspaces(true);
  }

  // Set opacity after window is created (more reliable)
  meetingWindow.setOpacity(0.7);

  // Hide window from screenshots and screen sharing (OS-level protection)
  // This works on macOS, Windows, and some Linux distributions
  // On macOS: Prevents window from appearing in screenshots and screen recordings
  // On Windows: Prevents window from being captured by screen capture APIs
  meetingWindow.setContentProtection(true);

  meetingWindow.loadFile(path.join(__dirname, '../renderer/meeting-window/index.html'));

  meetingWindow.on('closed', () => {
    // Clear the current meeting profile when window closes
    currentMeetingProfileId = null;
    meetingWindow = null;
    // Restore main window and notify it to refresh meetings
    if (mainWindow) {
      mainWindow.restore();
      mainWindow.focus();
      // Send message to refresh meetings list
      mainWindow.webContents.send('meeting-ended');
    }
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    meetingWindow.webContents.openDevTools();
  }
}

// IPC Handlers
ipcMain.handle('start-meeting', (event, profileId) => {
  if (!meetingWindow) {
    if (!profileId) {
      return { success: false, message: 'Profile ID is required' };
    }
    createMeetingWindow(profileId);
    return { success: true };
  }
  return { success: false, message: 'Meeting window already open' };
});

ipcMain.handle('end-meeting', async (event, meetingData) => {
  if (meetingWindow && currentMeetingProfileId) {
    // Create meeting record before closing
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const apiUrl = new URL(`${API_BASE_URL}/api/meetings`);
      const postData = JSON.stringify({
        profile_id: currentMeetingProfileId,
        summary: meetingData?.summary || null,
        transcript: meetingData?.transcript || null,
        followup: meetingData?.followup || null
      });
      
      const options = {
        hostname: apiUrl.hostname,
        port: apiUrl.port || (apiUrl.protocol === 'https:' ? 443 : 80),
        path: apiUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };
      
      await new Promise((resolve, reject) => {
        const client = apiUrl.protocol === 'https:' ? https : http;
        const req = client.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      
      console.log('Meeting record created successfully');
    } catch (error) {
      console.error('Error creating meeting record:', error);
      // Still close the window even if API call fails
    }
    
    meetingWindow.close();
    return { success: true };
  }
  return { success: false, message: 'No meeting window open' };
});

ipcMain.handle('get-current-meeting-profile', () => {
  return currentMeetingProfileId;
});

ipcMain.handle('get-api-url', () => {
  return API_BASE_URL;
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

