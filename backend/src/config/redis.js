const { createClient } = require('redis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const client = createClient({ url: redisUrl });

client.on('error', (err) => {
  console.error('Redis client error', err);
});

// connect immediately (best-effort)
client.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err);
});

module.exports = client;
