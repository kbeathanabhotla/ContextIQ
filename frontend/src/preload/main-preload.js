const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startMeeting: (profileId) => ipcRenderer.invoke('start-meeting', profileId),
  getApiUrl: () => ipcRenderer.invoke('get-api-url'),
  onMeetingEnded: (callback) => {
    ipcRenderer.on('meeting-ended', callback);
  }
});
