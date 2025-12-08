const crypto = require('crypto');
const { Transform } = require('stream');

// Stream-based AES-256-GCM encryption
const createEncryptionStream = () => {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encryptionStream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const encrypted = cipher.update(chunk);
        callback(null, encrypted);
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      try {
        const final = cipher.final();
        const authTag = cipher.getAuthTag();
        // Return final data with iv and authTag prepended (handled by caller)
        callback(null, Buffer.concat([final, iv, authTag]));
      } catch (err) {
        callback(err);
      }
    }
  });

  return {
    stream: encryptionStream,
    key,
    iv,
    getAuthTag: () => cipher.getAuthTag()
  };
};

// Stream-based AES-256-GCM decryption
const createDecryptionStream = (key, iv, authTag) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decryptionStream = new Transform({
    transform(chunk, encoding, callback) {
      try {
        const decrypted = decipher.update(chunk);
        callback(null, decrypted);
      } catch (err) {
        callback(err);
      }
    },
    flush(callback) {
      try {
        const final = decipher.final();
        callback(null, final);
      } catch (err) {
        callback(err);
      }
    }
  });

  return decryptionStream;
};

// Stream-based SHA-256 hashing
const createHashStream = () => {
  const hash = crypto.createHash('sha256');

  const hashStream = new Transform({
    transform(chunk, encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      callback(null);
    }
  });

  return {
    stream: hashStream,
    getDigest: () => hash.digest('hex')
  };
};

module.exports = {
  createEncryptionStream,
  createDecryptionStream,
  createHashStream
};
