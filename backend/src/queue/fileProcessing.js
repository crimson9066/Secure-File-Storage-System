const Queue = require('bull');
const logger = require('../utils/logger');

// Initialize Redis-backed job queue for background tasks
const fileProcessingQueue = new Queue('file-processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
  }
});

// Job processor: async file encryption/decryption
fileProcessingQueue.process('encrypt', async (job) => {
  logger.info('Processing encryption job %s', job.id);
  const { fileId, inputPath, outputPath, key, iv } = job.data;
  
  // Placeholder: actual streaming encryption handled in routes
  logger.info('Encryption job %s completed', job.id);
  return { fileId, success: true };
});

fileProcessingQueue.process('decrypt', async (job) => {
  logger.info('Processing decryption job %s', job.id);
  const { fileId, inputPath, outputPath, key, iv, authTag } = job.data;
  
  // Placeholder: actual streaming decryption handled in routes
  logger.info('Decryption job %s completed', job.id);
  return { fileId, success: true };
});

fileProcessingQueue.on('completed', (job) => {
  logger.info('Job %s completed', job.id);
});

fileProcessingQueue.on('failed', (job, err) => {
  logger.error('Job %s failed: %s', job.id, err.message);
});

module.exports = fileProcessingQueue;
