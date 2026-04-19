/**
 * Client-side encryption utilities using Web Crypto API
 */

export const encryptFileData = async (fileBuffer) => {
  try {
    const key = await window.crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      fileBuffer
    );

    const keyData = await window.crypto.subtle.exportKey('raw', key);
    const keyBuffer = new Uint8Array(keyData);
    const keyBase64 = btoa(String.fromCharCode.apply(null, keyBuffer));
    const ivBase64 = btoa(String.fromCharCode.apply(null, iv));

    return {
      encryptedData: new Uint8Array(encryptedData),
      key: keyBuffer,
      iv: iv,
      keyBase64,
      ivBase64
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
};

export const decryptFileData = async (encryptedData, keyBase64, ivBase64) => {
  try {
    const keyBuffer = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivBase64), c => c.charCodeAt(0));

    const key = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM' },
      true,
      ['decrypt']
    );

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encryptedData
    );

    return new Uint8Array(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
};

export const encryptKeyWithPublicKey = async (symmetricKey, publicKeyPem) => {
  try {
    const publicKey = await window.crypto.subtle.importKey(
      'spki',
      pem2der(publicKeyPem),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );

    const encryptedKey = await window.crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      symmetricKey
    );

    return btoa(String.fromCharCode.apply(null, new Uint8Array(encryptedKey)));
  } catch (error) {
    console.error('RSA encryption error:', error);
    throw error;
  }
};

const pem2der = (pem) => {
  const lines = pem.split('\n');
  let encoded = '';
  for (let i = 1; i < lines.length - 1; i++) {
    encoded += lines[i];
  }
  return Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
};

export const calculateSHA256 = async (fileBuffer) => {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const generateRandomPassword = (length = 32) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

export const checkPasswordStrength = (password) => {
  let strength = 0;
  const feedback = [];

  if (password.length >= 12) strength++;
  else feedback.push('At least 12 characters');

  if (password.length >= 16) strength++;

  if (/[a-z]/.test(password)) strength++;
  else feedback.push('Lowercase letters');

  if (/[A-Z]/.test(password)) strength++;
  else feedback.push('Uppercase letters');

  if (/\d/.test(password)) strength++;
  else feedback.push('Numbers');

  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;
  else feedback.push('Special characters');

  const levels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
  const colors = ['red', 'orange', 'yellow', 'lime', 'green', 'darkgreen'];

  return {
    score: strength,
    level: levels[strength] || 'Very Weak',
    color: colors[strength] || 'red',
    feedback: feedback.length > 0 ? `Add: ${feedback.join(', ')}` : 'Strong password'
  };
};
