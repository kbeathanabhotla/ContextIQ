const axios = require('axios');

class API {
  constructor(baseURL) {
    this.client = axios.create({
      baseURL: baseURL || 'http://localhost:5000',
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // User endpoints
  async getUsers() {
    const response = await this.client.get('/api/users');
    return response.data;
  }

  async getUser(userId) {
    const response = await this.client.get(`/api/users/${userId}`);
    return response.data;
  }

  async createUser(userData) {
    const response = await this.client.post('/api/users', userData);
    return response.data;
  }

  async updateUser(userId, userData) {
    const response = await this.client.put(`/api/users/${userId}`, userData);
    return response.data;
  }

  async deleteUser(userId) {
    const response = await this.client.delete(`/api/users/${userId}`);
    return response.data;
  }

  // Meeting endpoints
  async getMeetings(userId = null) {
    const params = userId ? { user_id: userId } : {};
    const response = await this.client.get('/api/meetings', { params });
    return response.data;
  }

  async getMeeting(meetingId) {
    const response = await this.client.get(`/api/meetings/${meetingId}`);
    return response.data;
  }

  async createMeeting(meetingData) {
    const response = await this.client.post('/api/meetings', meetingData);
    return response.data;
  }

  async deleteMeeting(meetingId) {
    const response = await this.client.delete(`/api/meetings/${meetingId}`);
    return response.data;
  }
}

module.exports = API;

