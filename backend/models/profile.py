from datetime import datetime
from . import db


class Profile(db.Model):
    __tablename__ = 'profiles'
    
    id = db.Column(db.Integer, primary_key=True)
    profile_name = db.Column(db.String(80), unique=True, nullable=False)
    meeting_context = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'profile_name': self.profile_name,
            'meeting_context': self.meeting_context,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
