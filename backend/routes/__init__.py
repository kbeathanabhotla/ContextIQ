from flask import Blueprint

def register_blueprints(app):
    """Register all blueprints with the app"""
    from .profiles import profiles_bp
    from .meetings import meetings_bp
    from .health import health_bp
    from .transcription import transcription_bp, init_socketio
    
    app.register_blueprint(profiles_bp, url_prefix='/api')
    app.register_blueprint(meetings_bp, url_prefix='/api')
    app.register_blueprint(health_bp)
    app.register_blueprint(transcription_bp, url_prefix='/api')
    
    # Initialize SocketIO and return it
    return init_socketio(app)

