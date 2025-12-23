// API Client using Fetch API (works in renderer process)
class API {
    constructor(baseURL) {
        this.baseURL = baseURL || 'http://localhost:5000';
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (config.body && typeof config.body === 'object') {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            
            // Check if response is JSON before parsing
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response received:', text.substring(0, 200));
                throw new Error(`Expected JSON but received ${contentType || 'unknown content type'}. Make sure the backend is running at ${this.baseURL}`);
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw { response: { data, status: response.status } };
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            // If it's a network error or CORS issue
            if (error instanceof TypeError && error.message.includes('fetch')) {
                throw new Error(`Cannot connect to backend at ${this.baseURL}. Make sure the backend is running.`);
            }
            throw error;
        }
    }

    async getProfiles() {
        return this.request('/api/profiles');
    }

    async getProfile(profileId) {
        return this.request(`/api/profiles/${profileId}`);
    }

    async createProfile(profileData) {
        return this.request('/api/profiles', {
            method: 'POST',
            body: profileData
        });
    }

    async updateProfile(profileId, profileData) {
        return this.request(`/api/profiles/${profileId}`, {
            method: 'PUT',
            body: profileData
        });
    }

    async deleteProfile(profileId) {
        return this.request(`/api/profiles/${profileId}`, {
            method: 'DELETE'
        });
    }

    async getMeetings(userId = null) {
        const endpoint = userId ? `/api/meetings?user_id=${userId}` : '/api/meetings';
        return this.request(endpoint);
    }

    async getMeeting(meetingId) {
        return this.request(`/api/meetings/${meetingId}`);
    }

    async createMeeting(meetingData) {
        return this.request('/api/meetings', {
            method: 'POST',
            body: meetingData
        });
    }

    async deleteMeeting(meetingId) {
        return this.request(`/api/meetings/${meetingId}`, {
            method: 'DELETE'
        });
    }
}

let api;
let currentView = 'meetings';
let editingProfileId = null;

// Initialize API
async function init() {
    try {
        const apiUrl = await window.electronAPI.getApiUrl();
        console.log('Initializing API with URL:', apiUrl);
        api = new API(apiUrl);
        
        // Test backend connection first
        try {
            const healthCheck = await fetch(`${apiUrl}/health`);
            if (!healthCheck.ok) {
                throw new Error(`Backend health check failed with status ${healthCheck.status}`);
            }
            console.log('Backend connection successful');
        } catch (healthError) {
            console.error('Backend health check failed:', healthError);
            showError(`Cannot connect to backend at ${apiUrl}. Make sure the backend is running (docker-compose up).`);
            // Still set up event listeners so UI is usable
            setupEventListeners();
            return;
        }
        
        // Set up event listeners first
        setupEventListeners();
        
        // Set initial view to meetings (which is the default)
        switchView('meetings');
        
        // Load meetings by default
        await loadMeetings();
        
        // Listen for meeting ended event to refresh meetings list
        if (window.electronAPI && window.electronAPI.onMeetingEnded) {
            window.electronAPI.onMeetingEnded(async () => {
                if (currentView === 'meetings') {
                    await loadMeetings();
                }
            });
        }
        
        // Also refresh meetings list when window regains focus
        window.addEventListener('focus', async () => {
            if (currentView === 'meetings') {
                await loadMeetings();
            }
        });
    } catch (error) {
        console.error('Initialization error:', error);
        const errorMessage = error.message || 'Failed to initialize application. Make sure the backend is running.';
        showError(errorMessage);
        // Still set up event listeners even if API fails
        setupEventListeners();
    }
}

function setupEventListeners() {
    // Navigation buttons
    const btnUsers = document.getElementById('btn-users');
    const btnMeetings = document.getElementById('btn-meetings');
    const btnNewMeeting = document.getElementById('btn-new-meeting');
    
    if (!btnUsers || !btnMeetings || !btnNewMeeting) {
        console.error('Required buttons not found in DOM');
        return;
    }
    
    btnUsers.addEventListener('click', () => {
        console.log('Profiles button clicked');
        switchView('profiles');
        loadProfiles();
    });
    
    btnMeetings.addEventListener('click', () => {
        console.log('Meetings button clicked');
        switchView('meetings');
        loadMeetings();
    });
    
    // New meeting button - show profile selection first
    btnNewMeeting.addEventListener('click', async () => {
        console.log('New meeting button clicked');
        await openProfileSelectionModal();
    });
    
    // Profile management
    const btnAddUser = document.getElementById('btn-add-user');
    const userForm = document.getElementById('user-form');
    const btnCancel = document.getElementById('btn-cancel');
    const closeBtn = document.querySelector('.close');
    
    if (btnAddUser) {
        btnAddUser.addEventListener('click', () => {
            console.log('Add profile button clicked');
            openProfileModal();
        });
    }
    
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Profile form submitted');
            await saveProfile();
        });
    }
    
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            closeProfileModal();
        });
    }
    
    // Modal close
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeProfileModal();
        });
    }
    
    window.addEventListener('click', (e) => {
        const modal = document.getElementById('user-modal');
        const profileSelectModal = document.getElementById('profile-select-modal');
        const meetingDetailsModal = document.getElementById('meeting-details-modal');
        if (e.target === modal) {
            closeProfileModal();
        }
        if (e.target === profileSelectModal) {
            closeProfileSelectionModal();
        }
        if (e.target === meetingDetailsModal) {
            closeMeetingDetailsModal();
        }
    });
}

function switchView(view) {
    currentView = view;
    
    // Update navigation buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (view === 'profiles') {
        document.getElementById('btn-users').classList.add('active');
    } else {
        document.getElementById('btn-meetings').classList.add('active');
    }
    
    // Update content views
    document.querySelectorAll('.content-view').forEach(v => {
        v.classList.remove('active');
    });
    
    if (view === 'profiles') {
        document.getElementById('users-view').classList.add('active');
    } else {
        document.getElementById('meetings-view').classList.add('active');
    }
}

async function loadProfiles() {
    try {
        const profiles = await api.getProfiles();
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        if (profiles.length === 0) {
            usersList.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 40px;">No profiles found</p>';
            return;
        }
        
        profiles.forEach(profile => {
            const card = createProfileCard(profile);
            usersList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading profiles:', error);
        showError('Failed to load profiles');
    }
}

function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'card';
    const contextPreview = profile.meeting_context 
        ? (profile.meeting_context.length > 100 
            ? profile.meeting_context.substring(0, 100) + '...' 
            : profile.meeting_context)
        : 'No context set';
    
    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">${profile.profile_name}</div>
            <div class="card-actions">
                <button class="btn-icon btn-edit" onclick="editProfile(${profile.id})">Edit</button>
                <button class="btn-icon btn-delete" onclick="deleteProfile(${profile.id})">Delete</button>
            </div>
        </div>
        <div class="card-info">
            <div class="profile-context-preview">${contextPreview}</div>
            <div style="margin-top: 4px; font-size: 12px; color: #95a5a6;">
                Created: ${new Date(profile.created_at).toLocaleDateString()}
            </div>
        </div>
    `;
    return card;
}

async function loadMeetings() {
    if (!api) {
        console.error('API not initialized');
        showError('API not initialized. Please refresh the window.');
        return;
    }
    
    try {
        console.log('Loading meetings from:', api.baseURL);
        const meetings = await api.getMeetings();
        console.log('Meetings loaded:', meetings);
        const meetingsList = document.getElementById('meetings-list');
        
        if (!meetingsList) {
            console.error('Meetings list element not found');
            return;
        }
        
        meetingsList.innerHTML = '';
        
        if (meetings.length === 0) {
            meetingsList.innerHTML = '<p style="color: #95a5a6; text-align: center; padding: 40px;">No meetings found</p>';
            return;
        }
        
        // Sort by date (newest first)
        meetings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        meetings.forEach(meeting => {
            const card = createMeetingCard(meeting);
            meetingsList.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading meetings:', error);
        const errorMsg = error.response?.data?.error || error.message || 'Failed to load meetings';
        showError(errorMsg);
    }
}

function createMeetingCard(meeting) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const summary = meeting.summary || 'No summary available';
    const transcript = meeting.transcript || '';
    const date = new Date(meeting.created_at).toLocaleString();
    
    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">Meeting #${meeting.id}</div>
            <div class="card-actions">
                <button class="btn-icon btn-delete" onclick="deleteMeeting(${meeting.id})">Delete</button>
            </div>
        </div>
        <div class="card-info">
            <div class="meeting-summary">${summary.substring(0, 100)}${summary.length > 100 ? '...' : ''}</div>
            ${transcript ? `
                <div class="meeting-transcript-preview">
                    <strong>Transcript:</strong> ${transcript.substring(0, 150)}${transcript.length > 150 ? '...' : ''}
                </div>
            ` : ''}
            <div class="meeting-date">${date}</div>
            <button class="btn-view-details" onclick="showMeetingDetails(${meeting.id})" style="margin-top: 8px; padding: 6px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                View Details
            </button>
        </div>
    `;
    return card;
}

// Profile selection modal for starting meetings
async function openProfileSelectionModal() {
    try {
        const profiles = await api.getProfiles();
        const modal = document.getElementById('profile-select-modal');
        const profilesList = document.getElementById('profile-select-list');
        
        if (profiles.length === 0) {
            showError('No profiles found. Please create a profile first.');
            return;
        }
        
        profilesList.innerHTML = '';
        profiles.forEach(profile => {
            const item = document.createElement('div');
            item.className = 'profile-select-item';
            const contextPreview = profile.meeting_context 
                ? (profile.meeting_context.length > 80 
                    ? profile.meeting_context.substring(0, 80) + '...' 
                    : profile.meeting_context)
                : 'No context set';
            item.innerHTML = `
                <div class="profile-select-info">
                    <div class="profile-select-name">${profile.profile_name}</div>
                    <div class="profile-select-context">${contextPreview}</div>
                </div>
                <button class="btn-primary" onclick="selectProfileForMeeting(${profile.id})">Select</button>
            `;
            profilesList.appendChild(item);
        });
        
        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading profiles:', error);
        showError('Failed to load profiles');
    }
}

function closeProfileSelectionModal() {
    const modal = document.getElementById('profile-select-modal');
    modal.classList.remove('active');
}

async function selectProfileForMeeting(profileId) {
    closeProfileSelectionModal();
    try {
        await window.electronAPI.startMeeting(profileId);
    } catch (error) {
        console.error('Error starting meeting:', error);
        showError('Failed to start meeting');
    }
}

function openProfileModal(profile = null) {
    editingProfileId = profile ? profile.id : null;
    const modal = document.getElementById('user-modal');
    const form = document.getElementById('user-form');
    const title = document.getElementById('modal-title');
    
    if (profile) {
        title.textContent = 'Edit Profile';
        document.getElementById('user-id').value = profile.id;
        document.getElementById('profile_name').value = profile.profile_name || '';
        document.getElementById('meeting_context').value = profile.meeting_context || '';
    } else {
        title.textContent = 'Add Profile';
        form.reset();
        document.getElementById('user-id').value = '';
    }
    
    modal.classList.add('active');
}

function closeProfileModal() {
    const modal = document.getElementById('user-modal');
    modal.classList.remove('active');
    editingProfileId = null;
    document.getElementById('user-form').reset();
}

async function saveProfile() {
    try {
        const formData = {
            profile_name: document.getElementById('profile_name').value,
            meeting_context: document.getElementById('meeting_context').value || ''
        };
        
        if (editingProfileId) {
            await api.updateProfile(editingProfileId, formData);
        } else {
            await api.createProfile(formData);
        }
        
        closeProfileModal();
        await loadProfiles();
    } catch (error) {
        console.error('Error saving profile:', error);
        showError(error.response?.data?.error || 'Failed to save profile');
    }
}

async function editProfile(profileId) {
    try {
        const profile = await api.getProfile(profileId);
        openProfileModal(profile);
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
    }
}

async function deleteProfile(profileId) {
    if (!confirm('Are you sure you want to delete this profile?')) {
        return;
    }
    
    try {
        await api.deleteProfile(profileId);
        await loadProfiles();
    } catch (error) {
        console.error('Error deleting profile:', error);
        showError('Failed to delete profile');
    }
}

async function deleteMeeting(meetingId) {
    if (!confirm('Are you sure you want to delete this meeting?')) {
        return;
    }
    
    try {
        await api.deleteMeeting(meetingId);
        await loadMeetings();
    } catch (error) {
        console.error('Error deleting meeting:', error);
        showError('Failed to delete meeting');
    }
}

function showError(message) {
    alert(message); // Simple error display, can be improved with a toast notification
}

// Meeting details functions
async function showMeetingDetails(meetingId) {
    try {
        const meeting = await api.getMeeting(meetingId);
        const modal = document.getElementById('meeting-details-modal');
        const body = document.getElementById('meeting-details-body');
        const title = document.getElementById('meeting-details-title');
        
        title.textContent = `Meeting #${meeting.id}`;
        
        const date = new Date(meeting.created_at).toLocaleString();
        const summary = meeting.summary || 'No summary available';
        const transcript = meeting.transcript || 'No transcript available';
        const followup = meeting.followup || 'No follow-up available';
        
        body.innerHTML = `
            <div class="meeting-detail-section">
                <div class="meeting-detail-label">Date & Time:</div>
                <div class="meeting-detail-value">${date}</div>
            </div>
            <div class="meeting-detail-section">
                <div class="meeting-detail-label">Summary:</div>
                <div class="meeting-detail-value">${summary}</div>
            </div>
            <div class="meeting-detail-section">
                <div class="meeting-detail-label">Transcript:</div>
                <div class="meeting-detail-value transcript-scrollable">${transcript}</div>
            </div>
            <div class="meeting-detail-section">
                <div class="meeting-detail-label">Follow-up:</div>
                <div class="meeting-detail-value">${followup}</div>
            </div>
        `;
        
        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading meeting details:', error);
        showError('Failed to load meeting details');
    }
}

function closeMeetingDetailsModal() {
    const modal = document.getElementById('meeting-details-modal');
    modal.classList.remove('active');
}

// Make functions available globally for onclick handlers
window.editProfile = editProfile;
window.deleteProfile = deleteProfile;
window.deleteMeeting = deleteMeeting;
window.selectProfileForMeeting = selectProfileForMeeting;
window.showMeetingDetails = showMeetingDetails;
window.closeMeetingDetailsModal = closeMeetingDetailsModal;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

