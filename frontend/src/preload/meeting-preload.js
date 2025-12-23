const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  endMeeting: (meetingData) => ipcRenderer.invoke('end-meeting', meetingData),
  getApiUrl: () => ipcRenderer.invoke('get-api-url')
});

