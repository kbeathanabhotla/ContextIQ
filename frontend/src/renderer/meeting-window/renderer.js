// Get API URL from Electron
let apiUrl = 'http://localhost:5000';
let socket = null;
let mediaRecorder = null;
let audioStream = null;
let transcriptionBuffer = [];
let isRecording = false;

// Initialize
(async () => {
    try {
        apiUrl = await window.electronAPI.getApiUrl();
        // Wait for socket.io to load, then initialize
        waitForSocketIO()
            .then(() => {
                initializeTranscription();
            })
            .catch((error) => {
                console.error('Failed to load socket.io:', error);
                alert('Failed to initialize transcription. Please check your internet connection and try again.');
            });
    } catch (error) {
        console.error('Failed to get API URL:', error);
    }
})();

function waitForSocketIO(maxAttempts = 20) {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const checkInterval = setInterval(() => {
            attempts++;
            if (typeof io !== 'undefined') {
                clearInterval(checkInterval);
                console.log('socket.io-client loaded');
                resolve();
            } else if (attempts >= maxAttempts) {
                clearInterval(checkInterval);
                reject(new Error('socket.io-client failed to load'));
            }
        }, 100);
    });
}

function initializeTranscription() {
    // Check if socket.io is available (loaded via script tag)
    if (typeof io === 'undefined') {
        console.error('socket.io-client not loaded');
        alert('Failed to initialize transcription. socket.io-client is not available.');
        return;
    }
    
    connectSocket(io);
}

function connectSocket(socketIO) {
    if (!socketIO) {
        console.error('SocketIO not available');
        return;
    }
    
    socket = socketIO(`${apiUrl}/transcription`, {
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to transcription service');
        socket.emit('audio_stream_start');
    });

    socket.on('connected', (data) => {
        console.log('Transcription service ready:', data.message);
        startAudioCapture();
    });

    socket.on('transcription', (data) => {
        console.log('Transcription received:', data.text);
        if (data.text && data.text.trim()) {
            transcriptionBuffer.push({
                text: data.text,
                timestamp: data.timestamp || Date.now()
            });
        }
    });

    socket.on('error', (error) => {
        console.error('Transcription error:', error);
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from transcription service');
    });
}

async function startAudioCapture() {
    try {
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
        });

        // Create MediaRecorder
        const options = {
            mimeType: 'audio/webm;codecs=opus',
            audioBitsPerSecond: 16000
        };

        // Fallback to default if webm not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'audio/webm';
        }

        mediaRecorder = new MediaRecorder(audioStream, options);
        isRecording = true;

        // Process audio chunks
        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0 && socket && socket.connected) {
                try {
                    // Convert Blob to ArrayBuffer
                    const arrayBuffer = await event.data.arrayBuffer();
                    
                    // Convert to Int16Array (PCM format)
                    const audioContext = new AudioContext({ sampleRate: 16000 });
                    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                    const pcmData = audioBuffer.getChannelData(0);
                    
                    // Convert float32 to int16
                    const int16Array = new Int16Array(pcmData.length);
                    for (let i = 0; i < pcmData.length; i++) {
                        int16Array[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
                    }
                    
                    // Convert to base64
                    const base64Audio = btoa(
                        String.fromCharCode.apply(null, Array.from(int16Array))
                    );
                    
                    // Send to WebSocket
                    socket.emit('audio_chunk', {
                        audio: base64Audio,
                        sample_rate: 16000,
                        format: 'pcm',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    console.error('Error processing audio chunk:', error);
                }
            }
        };

        // Start recording with chunks every 1 second
        mediaRecorder.start(1000);
        console.log('Audio capture started');

    } catch (error) {
        console.error('Error starting audio capture:', error);
        alert('Failed to access microphone. Please check permissions.');
    }
}

function stopAudioCapture() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
    }
    
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    if (socket) {
        socket.emit('audio_stream_end');
        socket.disconnect();
    }
}

// End meeting button
document.getElementById('btn-end-meeting').addEventListener('click', async () => {
    // Stop audio capture
    stopAudioCapture();
    
    // Combine all transcriptions into a single transcript
    const transcript = transcriptionBuffer
        .map(item => item.text)
        .join(' ')
        .trim();
    
    // Create meeting record with transcription
    const meetingData = {
        summary: null,
        transcript: transcript || null,
        followup: null
    };
    
    await window.electronAPI.endMeeting(meetingData);
});

// Assist button
document.getElementById('btn-assist').addEventListener('click', () => {
    // Assist functionality will be implemented later
    alert('Assist functionality coming soon!');
});

// Cleanup on window close
window.addEventListener('beforeunload', () => {
    stopAudioCapture();
});
