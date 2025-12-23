import os
import sys
from pathlib import Path

# Ensure the backend directory is in the Python path
backend_dir = Path(__file__).parent.absolute()
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from __init__ import create_app

# Get config name from environment or default to 'development'
config_name = os.getenv('FLASK_ENV', 'development')

app = create_app(config_name)
socketio = app.socketio

if __name__ == '__main__':
    # Run with SocketIO support
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)
