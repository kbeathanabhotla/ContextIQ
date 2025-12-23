from flask import Flask
from flask_cors import CORS
from config import config
from models import db, Profile
from routes import register_blueprints
import time
import logging

logger = logging.getLogger(__name__)


def create_app(config_name='default'):
    """Application factory pattern"""
    app = Flask(__name__)
    
    # Load configuration
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    CORS(app)
    db.init_app(app)
    
    # Register blueprints (this also initializes SocketIO)
    socketio = register_blueprints(app)
    
    # Store socketio in app for access
    app.socketio = socketio
    
    # Initialize database with retry logic
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            with app.app_context():
                db.create_all()
                
                # Create default profile if no profiles exist
                if Profile.query.count() == 0:
                    try:
                        default_profile = Profile(
                            profile_name='default',
                            meeting_context='Default profile for meetings'
                        )
                        db.session.add(default_profile)
                        db.session.commit()
                        logger.info("Default profile created successfully")
                    except Exception as e:
                        logger.warning(f"Failed to create default profile: {e}")
                        db.session.rollback()
                else:
                    logger.info("Profiles already exist, skipping default profile creation")
                
            logger.info("Database initialized successfully")
            break
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"Database initialization failed (attempt {attempt + 1}/{max_retries}): {e}")
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Failed to initialize database after {max_retries} attempts: {e}")
                raise
    
    return app

