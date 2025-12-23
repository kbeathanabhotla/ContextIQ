from flask import Blueprint, request
from flask_socketio import SocketIO, emit
import numpy as np
import base64
import logging
import json

logger = logging.getLogger(__name__)

transcription_bp = Blueprint('transcription', __name__)
socketio = None


def get_asr_service():
    """Lazy import to avoid circular dependencies"""
    from services.asr_service import get_asr_service as _get_asr_service
    return _get_asr_service()


def init_socketio(app):
    """Initialize SocketIO with the Flask app and register handlers"""
    global socketio
    socketio = SocketIO(
        app,
        cors_allowed_origins="*",
        async_mode='threading',
        logger=True,
        engineio_logger=True
    )
    
    # Register event handlers
    @socketio.on('connect', namespace='/transcription')
    def handle_connect():
        """Handle WebSocket connection"""
        logger.info(f"Client connected: {request.sid}")
        emit('connected', {'status': 'connected', 'message': 'Ready for audio transcription'})
    
    @socketio.on('disconnect', namespace='/transcription')
    def handle_disconnect():
        """Handle WebSocket disconnection"""
        logger.info(f"Client disconnected: {request.sid}")
    
    @socketio.on('audio_chunk', namespace='/transcription')
    def handle_audio_chunk(data):
        """
        Handle incoming audio chunk for transcription
        
        Expected data format:
        {
            'audio': base64_encoded_audio_data,
            'sample_rate': 16000,
            'format': 'pcm' or 'wav'
        }
        """
        try:
            asr_service = get_asr_service()
            
            # Decode audio data
            if isinstance(data, str):
                data = json.loads(data)
            
            audio_b64 = data.get('audio')
            sample_rate = data.get('sample_rate', 16000)
            audio_format = data.get('format', 'pcm')
            
            if not audio_b64:
                emit('error', {'message': 'No audio data provided'})
                return
            
            # Decode base64 audio
            audio_bytes = base64.b64decode(audio_b64)
            
            if audio_format == 'pcm':
                # Convert PCM bytes to numpy array
                audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            else:
                # For WAV format, you might need to parse the header
                # For now, assume raw PCM after WAV header
                audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            
            # Transcribe audio chunk
            transcription = asr_service.transcribe_audio_chunk(audio_np, sample_rate)
            
            if transcription:
                emit('transcription', {
                    'text': transcription,
                    'timestamp': data.get('timestamp')
                })
            
        except Exception as e:
            logger.error(f"Error processing audio chunk: {e}")
            emit('error', {'message': str(e)})
    
    @socketio.on('audio_stream_start', namespace='/transcription')
    def handle_stream_start(data=None):
        """Handle start of audio stream"""
        logger.info(f"Audio stream started: {request.sid}")
        try:
            asr_service = get_asr_service()
            # Load model in background to avoid blocking
            # The model will be loaded when first audio chunk arrives if not ready
            try:
                asr_service.load_model()  # Ensure model is loaded
                emit('stream_started', {'status': 'ready'})
            except Exception as load_error:
                logger.error(f"Error loading model: {load_error}")
                # Don't fail the connection, model will be loaded on first chunk
                emit('stream_started', {'status': 'ready', 'warning': 'Model loading in progress'})
        except Exception as e:
            logger.error(f"Error starting audio stream: {e}")
            emit('error', {'message': f'Failed to start audio stream: {str(e)}'})
    
    @socketio.on('audio_stream_end', namespace='/transcription')
    def handle_stream_end():
        """Handle end of audio stream"""
        logger.info(f"Audio stream ended: {request.sid}")
        emit('stream_ended', {'status': 'complete'})
    
    return socketio


@transcription_bp.route('/transcription/health', methods=['GET'])
def transcription_health():
    """Health check for transcription service"""
    try:
        asr_service = get_asr_service()
        return {
            'status': 'healthy',
            'model_loaded': asr_service.is_loaded,
            'device': asr_service.device,
            'model_name': asr_service.model_name
        }, 200
    except Exception as e:
        return {'status': 'error', 'message': str(e)}, 500
