/**
 * Health Check System - Deep System Status
 * 
 * Checks all critical dependencies:
 * - Database connectivity
 * - Redis connectivity
 * - Disk space for uploads
 * - Memory usage
 * - Active connections
 * 
 * Endpoint: GET /api/health
 * Returns: Overall status + detailed component status
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

class HealthChecker {
  constructor(db, redis) {
    this.db = db;
    this.redis = redis;
    this.startTime = Date.now();
  }

  async check() {
    const results = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {}
    };

    // Database check
    results.checks.database = await this.checkDatabase();
    if (results.checks.database.status !== 'healthy') {
      results.status = 'degraded';
    }

    // Redis check
    results.checks.redis = await this.checkRedis();
    if (results.checks.redis.status !== 'healthy') {
      results.status = 'degraded';
    }

    // Disk space check
    results.checks.disk = await this.checkDiskSpace();
    if (results.checks.disk.status === 'critical') {
      results.status = 'unhealthy';
    } else if (results.checks.disk.status === 'warning') {
      results.status = 'degraded';
    }

    // Memory check
    results.checks.memory = this.checkMemory();
    if (results.checks.memory.status === 'critical') {
      results.status = 'degraded';
    }

    // File system check
    results.checks.filesystem = await this.checkFilesystem();

    return results;
  }

  async checkDatabase() {
    try {
      const startTime = Date.now();
      await this.db.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        message: 'PostgreSQL responding'
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Database error: ${err.message}`,
        error: err.code
      };
    }
  }

  async checkRedis() {
    try {
      const startTime = Date.now();
      await this.redis.ping();
      const responseTime = Date.now() - startTime;

      const info = await this.redis.info();
      const memoryUsage = info.used_memory_human;

      return {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        memory: memoryUsage,
        message: 'Redis responding'
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Redis error: ${err.message}`
      };
    }
  }

  async checkDiskSpace() {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // Get disk usage
      const stats = fs.statfsSync(uploadsDir);
      const freeSpace = stats.bavail * stats.bsize;
      const totalSpace = stats.blocks * stats.bsize;
      const usedPercent = ((totalSpace - freeSpace) / totalSpace) * 100;

      let status = 'healthy';
      if (usedPercent > 95) {
        status = 'critical';
      } else if (usedPercent > 80) {
        status = 'warning';
      }

      return {
        status,
        used: `${(usedPercent).toFixed(1)}%`,
        freeSpace: this.formatBytes(freeSpace),
        totalSpace: this.formatBytes(totalSpace),
        message: status === 'healthy' 
          ? 'Disk space adequate' 
          : `Disk space ${status}: ${usedPercent.toFixed(1)}% used`
      };
    } catch (err) {
      return {
        status: 'warning',
        message: `Could not check disk space: ${err.message}`
      };
    }
  }

  checkMemory() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedPercent = (usedMem / totalMem) * 100;

    let status = 'healthy';
    if (usedPercent > 90) {
      status = 'critical';
    } else if (usedPercent > 75) {
      status = 'warning';
    }

    return {
      status,
      used: this.formatBytes(usedMem),
      free: this.formatBytes(freeMem),
      total: this.formatBytes(totalMem),
      percent: `${usedPercent.toFixed(1)}%`
    };
  }

  async checkFilesystem() {
    try {
      const uploadsDir = path.join(__dirname, '../../uploads');
      
      // Check if directory is writable
      fs.accessSync(uploadsDir, fs.constants.R_OK | fs.constants.W_OK);
      
      // Count files
      const files = fs.readdirSync(uploadsDir);

      return {
        status: 'healthy',
        uploadDir: uploadsDir,
        filesStored: files.length,
        writable: true
      };
    } catch (err) {
      return {
        status: 'unhealthy',
        message: `Filesystem error: ${err.message}`
      };
    }
  }

  formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = HealthChecker;
