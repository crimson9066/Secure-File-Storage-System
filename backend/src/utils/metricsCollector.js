/**
 * Metrics Collection - Production Monitoring
 * 
 * Tracks:
 * - Request counts by endpoint
 * - Error rates
 * - Response times (p50, p95, p99)
 * - Upload/download volumes
 * - Active users
 * 
 * Format: Prometheus-compatible text format
 * Endpoint: GET /api/metrics
 */

class MetricsCollector {
  constructor() {
    this.metrics = {
      // Counter: total requests by endpoint
      requests: {},
      
      // Counter: total errors by type
      errors: {},
      
      // Histogram: response times (ms)
      responseTimes: [],
      
      // Counter: bytes transferred
      uploadedBytes: 0,
      downloadedBytes: 0,
      
      // Gauge: active sessions
      activeSessions: 0,
      
      // Counter: unique users
      uniqueUsers: new Set(),
      
      // Timestamp tracking
      startTime: Date.now()
    };
  }

  recordRequest(endpoint, statusCode, duration, userId) {
    // Track by endpoint
    if (!this.metrics.requests[endpoint]) {
      this.metrics.requests[endpoint] = {
        total: 0,
        status: {}
      };
    }
    this.metrics.requests[endpoint].total++;
    this.metrics.requests[endpoint].status[statusCode] = 
      (this.metrics.requests[endpoint].status[statusCode] || 0) + 1;

    // Track response times
    this.metrics.responseTimes.push(duration);

    // Track unique users
    if (userId) {
      this.metrics.uniqueUsers.add(userId);
    }

    // Keep only last 1000 response times for memory efficiency
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }
  }

  recordError(errorCode, errorType) {
    if (!this.metrics.errors[errorCode]) {
      this.metrics.errors[errorCode] = 0;
    }
    this.metrics.errors[errorCode]++;
  }

  recordUpload(bytes) {
    this.metrics.uploadedBytes += bytes;
  }

  recordDownload(bytes) {
    this.metrics.downloadedBytes += bytes;
  }

  setActiveSessions(count) {
    this.metrics.activeSessions = count;
  }

  getMetrics() {
    const uptime = Math.floor((Date.now() - this.metrics.startTime) / 1000);
    const responseTimes = this.metrics.responseTimes.sort((a, b) => a - b);
    
    const getPercentile = (arr, percentile) => {
      if (arr.length === 0) return 0;
      const index = Math.ceil(arr.length * percentile / 100) - 1;
      return arr[Math.max(0, index)];
    };

    const totalErrors = Object.values(this.metrics.errors)
      .reduce((sum, count) => sum + count, 0);
    
    const totalRequests = Object.values(this.metrics.requests)
      .reduce((sum, endpoint) => sum + endpoint.total, 0);

    return {
      uptime,
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 
        ? ((totalErrors / totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      
      responseTimes: {
        count: responseTimes.length,
        p50: getPercentile(responseTimes, 50),
        p95: getPercentile(responseTimes, 95),
        p99: getPercentile(responseTimes, 99),
        max: responseTimes.length > 0 
          ? responseTimes[responseTimes.length - 1] 
          : 0
      },

      transfers: {
        uploadedBytes: this.metrics.uploadedBytes,
        uploadedMB: (this.metrics.uploadedBytes / (1024 * 1024)).toFixed(2),
        downloadedBytes: this.metrics.downloadedBytes,
        downloadedMB: (this.metrics.downloadedBytes / (1024 * 1024)).toFixed(2)
      },

      sessions: {
        active: this.metrics.activeSessions,
        uniqueUsers: this.metrics.uniqueUsers.size
      },

      byEndpoint: this.metrics.requests,
      
      errors: this.metrics.errors
    };
  }

  // Export Prometheus-compatible format
  toPrometheus() {
    const metrics = this.getMetrics();
    let output = '# HELP vault_requests_total Total requests by endpoint\n';
    output += '# TYPE vault_requests_total counter\n';

    for (const [endpoint, data] of Object.entries(this.metrics.requests)) {
      output += `vault_requests_total{endpoint="${endpoint}"} ${data.total}\n`;
      
      for (const [status, count] of Object.entries(data.status)) {
        output += `vault_requests_total{endpoint="${endpoint}",status="${status}"} ${count}\n`;
      }
    }

    output += '\n# HELP vault_errors_total Total errors by code\n';
    output += '# TYPE vault_errors_total counter\n';
    for (const [code, count] of Object.entries(this.metrics.errors)) {
      output += `vault_errors_total{code="${code}"} ${count}\n`;
    }

    output += '\n# HELP vault_response_time_ms Response time in milliseconds\n';
    output += '# TYPE vault_response_time_ms histogram\n';
    output += `vault_response_time_ms_p50 ${metrics.responseTimes.p50}\n`;
    output += `vault_response_time_ms_p95 ${metrics.responseTimes.p95}\n`;
    output += `vault_response_time_ms_p99 ${metrics.responseTimes.p99}\n`;

    output += '\n# HELP vault_uploaded_bytes Total bytes uploaded\n';
    output += '# TYPE vault_uploaded_bytes counter\n';
    output += `vault_uploaded_bytes ${metrics.transfers.uploadedBytes}\n`;

    output += '\n# HELP vault_downloaded_bytes Total bytes downloaded\n';
    output += '# TYPE vault_downloaded_bytes counter\n';
    output += `vault_downloaded_bytes ${metrics.transfers.downloadedBytes}\n`;

    output += '\n# HELP vault_active_sessions Active user sessions\n';
    output += '# TYPE vault_active_sessions gauge\n';
    output += `vault_active_sessions ${metrics.sessions.active}\n`;

    return output;
  }
}

module.exports = MetricsCollector;
