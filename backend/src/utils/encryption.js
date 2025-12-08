const crypto = require('crypto');

// AES-256-GCM Encryption
const encryptFile = (fileBuffer) => {
  const key = crypto.randomBytes(32); // 256-bit key
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(fileBuffer);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    encryptedData: encrypted,
    key: key,
    iv: iv,
    authTag: authTag,
    encryptionPackage: Buffer.concat([iv, authTag, encrypted]).toString('base64'),
    keyBase64: key.toString('base64'),
    ivBase64: iv.toString('base64'),
    authTagBase64: authTag.toString('base64')
  };
};

const decryptFile = (encryptedBuffer, key, iv, authTag) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedBuffer);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted;
};

// Generate RSA-4096 Key Pair
const generateRSAKeyPair = () => {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          cipher: undefined,
          passphrase: undefined
        }
      },
      (err, publicKey, privateKey) => {
        if (err) reject(err);
        resolve({ publicKey, privateKey });
      }
    );
  });
};

// Encrypt AES key with RSA public key
const encryptKeyWithPublicKey = (symmetricKey, publicKeyPem) => {
  const buffer = typeof symmetricKey === 'string' 
    ? Buffer.from(symmetricKey, 'base64') 
    : symmetricKey;
  
  const encrypted = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    buffer
  );
  
  return encrypted.toString('base64');
};

// Decrypt AES key with RSA private key
const decryptKeyWithPrivateKey = (encryptedKey, privateKeyPem) => {
  const encryptedBuffer = Buffer.from(encryptedKey, 'base64');
  
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    encryptedBuffer
  );
  
  return decrypted;
};

// SHA-256 hash for file integrity
const hashFile = (fileBuffer) => {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

// Derive key from password using PBKDF2
const deriveKeyFromPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
};

// Generate random salt
const generateSalt = () => {
  return crypto.randomBytes(16).toString('hex');
};

module.exports = {
  encryptFile,
  decryptFile,
  generateRSAKeyPair,
  encryptKeyWithPublicKey,
  decryptKeyWithPrivateKey,
  hashFile,
  deriveKeyFromPassword,
  generateSalt
};
