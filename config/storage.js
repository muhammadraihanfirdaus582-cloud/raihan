const { Redis } = require('@upstash/redis');

class StorageConfig {
  constructor() {
    this.redisKey = 'hotspot_users_data';
    this.data = { users: [] };
    
    try {
      this.redis = Redis.fromEnv();
    } catch (err) {
      console.error('Peringatan: Gagal menginisialisasi Upstash Redis:', err.message);
      this.redis = null;
    }
  }

  async initialize() {
    if (!this.redis) return;
    try {
      const existingData = await this.redis.get(this.redisKey);
      if (existingData) {
        this.data = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
      } else {
        await this.saveData();
      }
    } catch (error) {
      console.error('Error initializing storage:', error.message);
    }
  }

  async saveData() {
    if (!this.redis) return;
    try {
      await this.redis.set(this.redisKey, JSON.stringify(this.data));
    } catch (error) {
      console.error('Error saving data:', error.message);
    }
  }

  async addUser(userData) {
    try {
      await this.initialize();
      
      const timestamp = new Date().toISOString();
      const newUser = {
        id: Date.now().toString(),
        timestamp,
        name: userData.name || userData.username,
        email: userData.email || '-',
        phone: userData.phone || '-',
        username: userData.username,
        password: userData.password,
        status: 'PENDING',
        approvedAt: '',
        approvedBy: ''
      };

      if (!this.data.users) this.data.users = [];
      this.data.users.push(newUser);
      await this.saveData();
      
      return newUser;
    } catch (error) {
      console.error('Error adding user:', error.message);
      throw error;
    }
  }

  async getAllUsers() {
    try {
      await this.initialize();
      return this.data.users || [];
    } catch (error) {
      console.error('Error getting users:', error.message);
      return [];
    }
  }

  async approveUser(username, adminName) {
    try {
      await this.initialize();
      const userIndex = this.data.users.findIndex(u => u.username === username);
      
      if (userIndex === -1) throw new Error('User not found');
      
      this.data.users[userIndex].status = 'APPROVED';
      this.data.users[userIndex].approvedAt = new Date().toISOString();
      this.data.users[userIndex].approvedBy = adminName;
      
      await this.saveData();
      return this.data.users[userIndex];
    } catch (error) {
      console.error('Error approving user:', error.message);
      throw error;
    }
  }

  async rejectUser(username, adminName) {
    try {
      await this.initialize();
      const userIndex = this.data.users.findIndex(u => u.username === username);
      
      if (userIndex === -1) throw new Error('User not found');
      
      this.data.users[userIndex].status = 'REJECTED';
      this.data.users[userIndex].approvedAt = new Date().toISOString();
      this.data.users[userIndex].approvedBy = adminName;
      
      await this.saveData();
      return this.data.users[userIndex];
    } catch (error) {
      console.error('Error rejecting user:', error.message);
      throw error;
    }
  }

  async getUserByUsername(username) {
    try {
      await this.initialize();
      return this.data.users.find(u => u.username === username) || null;
    } catch (error) {
      console.error('Error getting user:', error.message);
      return null;
    }
  }

  async deleteUser(username) {
    try {
      await this.initialize();
      const userIndex = this.data.users.findIndex(u => u.username === username);
      
      if (userIndex === -1) throw new Error('User not found');
      
      this.data.users.splice(userIndex, 1);
      await this.saveData();
      return true;
    } catch (error) {
      console.error('Error deleting user:', error.message);
      throw error;
    }
  }
}

module.exports = new StorageConfig();
