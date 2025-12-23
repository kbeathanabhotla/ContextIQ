from flask import Blueprint, request, jsonify
from models import Profile, db

profiles_bp = Blueprint('profiles', __name__)


@profiles_bp.route('/profiles', methods=['GET'])
def get_profiles():
    """Get all profiles"""
    profiles = Profile.query.all()
    return jsonify([profile.to_dict() for profile in profiles]), 200


@profiles_bp.route('/profiles/<int:profile_id>', methods=['GET'])
def get_profile(profile_id):
    """Get a specific profile by ID"""
    profile = Profile.query.get_or_404(profile_id)
    return jsonify(profile.to_dict()), 200


@profiles_bp.route('/profiles', methods=['POST'])
def create_profile():
    """Create a new profile"""
    data = request.get_json()
    
    if not data or not data.get('profile_name'):
        return jsonify({'error': 'Profile name is required'}), 400
    
    # Check if profile_name already exists
    if Profile.query.filter_by(profile_name=data['profile_name']).first():
        return jsonify({'error': 'Profile name already exists'}), 400
    
    profile = Profile(
        profile_name=data['profile_name'],
        meeting_context=data.get('meeting_context', '')
    )
    
    db.session.add(profile)
    db.session.commit()
    
    return jsonify(profile.to_dict()), 201


@profiles_bp.route('/profiles/<int:profile_id>', methods=['PUT'])
def update_profile(profile_id):
    """Update a profile"""
    profile = Profile.query.get_or_404(profile_id)
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    if 'profile_name' in data:
        # Check if profile_name is already taken by another profile
        existing_profile = Profile.query.filter_by(profile_name=data['profile_name']).first()
        if existing_profile and existing_profile.id != profile_id:
            return jsonify({'error': 'Profile name already exists'}), 400
        profile.profile_name = data['profile_name']
    
    if 'meeting_context' in data:
        profile.meeting_context = data['meeting_context']
    
    db.session.commit()
    
    return jsonify(profile.to_dict()), 200


@profiles_bp.route('/profiles/<int:profile_id>', methods=['DELETE'])
def delete_profile(profile_id):
    """Delete a profile"""
    profile = Profile.query.get_or_404(profile_id)
    db.session.delete(profile)
    db.session.commit()
    
    return jsonify({'message': 'Profile deleted successfully'}), 200
