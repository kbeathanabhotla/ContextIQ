from datetime import datetime
from . import db
from .profile import Profile


class Meeting(db.Model):
    __tablename__ = 'meetings'
    
    id = db.Column(db.Integer, primary_key=True)
    profile_id = db.Column(db.Integer, db.ForeignKey('profiles.id'), nullable=False)
    summary = db.Column(db.Text)
    transcript = db.Column(db.Text)
    followup = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    profile = db.relationship('Profile', backref=db.backref('meetings', lazy=True))
    
    def to_dict(self):
        return {
            'id': self.id,
            'profile_id': self.profile_id,
            'summary': self.summary,
            'transcript': self.transcript,
            'followup': self.followup,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
