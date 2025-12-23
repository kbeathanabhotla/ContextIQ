from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .profile import Profile
from .meeting import Meeting

__all__ = ['db', 'Profile', 'Meeting']
