from flask import Blueprint, request, jsonify
from models import Meeting, Profile, db

meetings_bp = Blueprint('meetings', __name__)


@meetings_bp.route('/meetings', methods=['GET'])
def get_meetings():
    """Get all meetings, optionally filtered by profile_id"""
    profile_id = request.args.get('profile_id', type=int)
    # Support legacy user_id parameter for backward compatibility
    if not profile_id:
        profile_id = request.args.get('user_id', type=int)
    
    if profile_id:
        meetings = Meeting.query.filter_by(profile_id=profile_id).all()
    else:
        meetings = Meeting.query.all()
    
    return jsonify([meeting.to_dict() for meeting in meetings]), 200


@meetings_bp.route('/meetings/<int:meeting_id>', methods=['GET'])
def get_meeting(meeting_id):
    """Get a specific meeting by ID"""
    meeting = Meeting.query.get_or_404(meeting_id)
    return jsonify(meeting.to_dict()), 200


@meetings_bp.route('/meetings', methods=['POST'])
def create_meeting():
    """Create a new meeting"""
    data = request.get_json()
    
    # Support both user_id (legacy) and profile_id
    profile_id = data.get('profile_id') or data.get('user_id')
    
    if not data or not profile_id:
        return jsonify({'error': 'profile_id is required'}), 400
    
    # Verify profile exists
    profile = Profile.query.get(profile_id)
    if not profile:
        return jsonify({'error': 'Profile not found'}), 404
    
    meeting = Meeting(
        profile_id=profile_id,
        summary=data.get('summary'),
        transcript=data.get('transcript'),
        followup=data.get('followup')
    )
    
    db.session.add(meeting)
    db.session.commit()
    
    return jsonify(meeting.to_dict()), 201


@meetings_bp.route('/meetings/<int:meeting_id>', methods=['DELETE'])
def delete_meeting(meeting_id):
    """Delete a meeting"""
    meeting = Meeting.query.get_or_404(meeting_id)
    db.session.delete(meeting)
    db.session.commit()
    
    return jsonify({'message': 'Meeting deleted successfully'}), 200
