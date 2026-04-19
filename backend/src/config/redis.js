/**
 * In-Memory Mock datastore replacing Redis
 * Used for session storage and chunk tracking without an external dependency.
 */
class InMemoryStore {
  constructor() {
    this.data = new Map();
    this.sets = new Map();
  }

  async set(key, value, options = {}) {
    if (options.NX && this.data.has(key)) {
      return null;
    }
    
    this.data.set(key, value);
    
    if (options.PX) {
      setTimeout(() => {
        this.data.delete(key);
      }, options.PX);
    }
    
    return 'OK';
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async del(...keys) {
    let count = 0;
    keys.forEach(k => {
      if (this.data.has(k)) {
        this.data.delete(k);
        count++;
      }
      if (this.sets.has(k)) {
        this.sets.delete(k);
        count++;
      }
    });
    return count;
  }

  async sAdd(key, ...members) {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    let added = 0;
    members.forEach(m => {
      if (!this.sets.get(key).has(String(m))) {
        this.sets.get(key).add(String(m));
        added++;
      }
    });
    return added;
  }

  async sMembers(key) {
    if (!this.sets.has(key)) return [];
    return Array.from(this.sets.get(key));
  }

  async sCard(key) {
    if (!this.sets.has(key)) return 0;
    return this.sets.get(key).size;
  }

  async expire(key, seconds) {
    setTimeout(() => {
      this.data.delete(key);
      this.sets.delete(key);
    }, seconds * 1000);
    return 1;
  }

  // Health-check mocks
  async ping() {
    return 'PONG';
  }

  async info() {
    return 'redis_version:mock-in-memory-datastore';
  }
}

// Export a singleton instance to act just like the imported Redis client
module.exports = new InMemoryStore();
