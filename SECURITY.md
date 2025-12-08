# Security Architecture

## End-to-End Encryption

SecureVault implements military-grade encryption ensuring zero-knowledge storage. Even the server cannot access user files.

## Encryption Algorithms

### AES-256-GCM (File Encryption)

**Why AES-256-GCM?**
- AES-256: 256-bit symmetric encryption (military-grade)
- GCM: Galois/Counter Mode provides authenticated encryption
- Detects tampering: If ciphertext is modified, decryption fails
- NIST approved for government classified information

**Implementation:**
```javascript
// Key generation: 256-bit (32 bytes) random key
const key = crypto.randomBytes(32);

// IV generation: 96-bit (12 bytes) random per file
const iv = crypto.randomBytes(12);

// Encryption with authentication tag
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = cipher.update(fileBuffer);
cipher.final();
const authTag = cipher.getAuthTag(); // Prevents tampering
```

**File Structure:**
```
[12-byte IV] [16-byte Auth Tag] [Encrypted File Data]
```

### RSA-4096 (Key Sharing Encryption)

**Why RSA-4096?**
- 4096-bit RSA: Resistant to quantum attacks
- OAEP Padding: Prevents known plaintext attacks
- SHA-256 Hashing: Secure message digest

**Use Case:** Encrypting AES keys for file sharing

```javascript
// Encrypt AES key with recipient's public key
const encrypted = crypto.publicEncrypt({
  key: publicKeyPem,
  padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha256'
}, aesKey);
```

### PBKDF2 Key Derivation

**Why PBKDF2?**
- Derives encryption key from password
- Resistant to rainbow table attacks
- 100,000 iterations (computational cost)
- SHA-256 hash algorithm

```javascript
const derivedKey = crypto.pbkdf2Sync(
  password,
  salt,
  100000,  // iterations
  32,      // 256-bit key
  'sha256'
);
```

### SHA-256 (File Integrity)

**Purpose:** Verify file hasn't been tampered with

```javascript
const fileHash = crypto.createHash('sha256')
  .update(fileBuffer)
  .digest('hex');
```

## Authentication Flow

### Signup Process

```
User enters email + password
    ↓
Generate RSA-4096 key pair (public + private)
    ↓
Hash password with bcrypt (10 salt rounds)
    ↓
Generate random salt for PBKDF2
    ↓
Derive encryption key from password + salt (100,000 iterations)
    ↓
Encrypt private key with derived key using AES-256-GCM
    ↓
Server stores:
  - Email
  - Password hash (bcrypt)
  - Salt (PBKDF2)
  - Encrypted private key
  - Public key (plaintext - needed for sharing)
    ↓
Generate JWT token
    ↓
Return token + user data
```

### Login Process

```
User enters email + password
    ↓
Verify email exists
    ↓
Compare password against bcrypt hash
    ↓
Retrieve salt from database
    ↓
Derive key: PBKDF2(password, salt, 100k iterations)
    ↓
Decrypt private key using derived key
    ↓
Generate JWT token
    ↓
Return token to client
    ↓
Client stores token (in memory, NOT localStorage for security)
    ↓
Private key loaded into memory for encryption operations
```

**Security Note:** Private key is decrypted only in memory on user's machine. It's never sent to server after login.

## File Upload Encryption

```
Client:
┌─────────────────────────────────────────┐
│ 1. User selects file                    │
│ 2. Generate random AES-256 key          │
│ 3. Generate random 12-byte IV           │
│ 4. Encrypt file with AES-256-GCM        │
│ 5. Calculate SHA-256 hash               │
│ 6. Encrypt AES key with user's RSA pub  │
│ 7. Send encrypted file + encrypted key  │
└─────────────────────────────────────────┘
              ↓
         HTTPS Only
              ↓
Server:
┌─────────────────────────────────────────┐
│ 1. Receive encrypted file               │
│ 2. Receive encrypted AES key            │
│ 3. Verify JWT token is valid            │
│ 4. Store encrypted file (cannot decrypt)│
│ 5. Store encrypted key in database      │
│ 6. Store file metadata (hash, size)     │
│ 7. Log audit event                      │
└─────────────────────────────────────────┘
```

**Key Point:** Server has encrypted file but NO way to decrypt it (no private key).

## File Download Decryption

```
Client:
┌─────────────────────────────────────────┐
│ 1. Request file download                │
│ 2. Send JWT token                       │
└─────────────────────────────────────────┘
              ↓
         HTTPS Only
              ↓
Server:
┌─────────────────────────────────────────┐
│ 1. Verify JWT token                     │
│ 2. Check user owns/has access to file   │
│ 3. Send encrypted file + encrypted key  │
│ 4. Log download event                   │
└─────────────────────────────────────────┘
              ↓
         HTTPS Only
              ↓
Client:
┌─────────────────────────────────────────┐
│ 1. Receive encrypted file               │
│ 2. Receive encrypted AES key            │
│ 3. Decrypt AES key with user's RSA key  │
│ 4. Decrypt file with AES-256-GCM key    │
│ 5. Verify file hash matches             │
│ 6. Return decrypted file to user        │
│ 7. Display/download to user's machine   │
└─────────────────────────────────────────┘

User has plaintext file (never sent to server)
```

## File Sharing Encryption

```
Owner wants to share file with Friend
    ↓
Owner has:
  - File AES key (used for encryption)
  - Friend's public RSA key (queried from server)
    ↓
Owner encrypts AES key with Friend's public RSA key
    ↓
Send encrypted AES key to server
    ↓
Server stores:
  - File ID
  - Owner ID
  - Friend ID
  - Encrypted AES key (encrypted with FRIEND'S public key)
    ↓
When Friend logs in:
  - Friend's private RSA key is decrypted in their memory
  - File appears in "Shared with You" section
  - Friend can decrypt AES key with their private RSA key
  - Friend can decrypt file with AES key
    ↓
Result:
  - Owner's AES key cannot decrypt friend's copy
  - Friend's AES key cannot decrypt owner's copy
  - Each user can only decrypt with their own private key
```

## Database Security

### What's Stored Encrypted

```sql
-- Encrypted with PBKDF2 derived key
users.encrypted_private_key = AES256GCM(RSA_private_key, derived_key_from_password)

-- Encrypted with RSA public key (owner's)
files.encrypted_key = RSA4096_OAEP(AES_key, owner_public_key)

-- Encrypted with RSA public key (recipient's)
file_shares.encrypted_key = RSA4096_OAEP(AES_key, recipient_public_key)
```

### What's NOT Stored Encrypted

```sql
-- Publicly visible (needed for sharing)
users.public_key = RSA_public_key (plaintext)

-- For integrity verification
files.file_hash = SHA256(original_file) (plaintext)

-- For audit trail
audit_logs.* (plaintext)
```

### Why Server Can't Access Files

Server has:
1. ✓ Encrypted files (unreadable gibberish)
2. ✓ Encrypted AES keys (encrypted with user's public key)
3. ✗ No private key (needed to decrypt keys)

Result: **Zero-knowledge storage** - Server cannot access user files

## Password Security

### Bcrypt Hashing (Authentication)

```javascript
// For login verification
const hash = await bcrypt.hash(password, 10);
// 10 salt rounds = computational cost

// Verify during login
const isValid = await bcrypt.compare(inputPassword, hash);
```

**Why Bcrypt?**
- Slow by design (prevents brute force)
- Salt included (prevents rainbow tables)
- Adaptive: Can increase cost as computers get faster

### PBKDF2 Key Derivation (Encryption)

```javascript
// For deriving encryption key
const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
// 100,000 iterations = strong protection
```

**Why PBKDF2?**
- Slow (100k iterations)
- Standard (NIST approved)
- Deterministic (same password + salt = same key)

## JWT Token Security

### Token Structure

```
Header.Payload.Signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
eyJ1c2VySWQiOiI1NTBlODQwMC0uLiIsImlhdCI6MH0.
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

### Token Verification

```javascript
// Server verifies token signature
const decoded = jwt.verify(token, JWT_SECRET);
// If signature doesn't match, token is rejected
// If token expired, it's rejected
```

**Token Lifetime:** 24 hours (configured in .env)

## Attack Prevention

### 1. Man-in-the-Middle (MITM) Attack
- **Prevention:** HTTPS/TLS encryption
- **Implementation:** All API calls use HTTPS

### 2. Rainbow Table Attack
- **Prevention:** Bcrypt with salt
- **Implementation:** Password hashed with unique salt per user

### 3. Brute Force Attack
- **Prevention:** Slow hashing (Bcrypt, PBKDF2)
- **Recommendation:** Rate limiting on login endpoint

### 4. Known Plaintext Attack
- **Prevention:** OAEP padding in RSA
- **Implementation:** `RSA_PKCS1_OAEP_PADDING`

### 5. File Tampering
- **Prevention:** GCM mode authenticated encryption
- **Implementation:** Auth tag verified on decryption

### 6. Quantum Computer Attack
- **Prevention:** RSA-4096 (large key size)
- **Future:** Post-quantum algorithms (lattice-based)

## Compliance & Standards

- **NIST** - Approved algorithms (AES, SHA-256, PBKDF2)
- **FIPS 140-2** - Federal Information Processing Standards
- **OWASP** - Top 10 Web Application Security
- **GDPR** - Data protection (zero-knowledge = GDPR compliant)

## Security Checklist

### Before Production Deployment

- [ ] Change JWT_SECRET to cryptographically random value
- [ ] Enable HTTPS/TLS with valid certificate
- [ ] Set up rate limiting on authentication endpoints
- [ ] Configure CORS to only allow trusted origins
- [ ] Enable database backups with encryption
- [ ] Set up audit logging and monitoring
- [ ] Implement email verification for new accounts
- [ ] Add 2FA support (TOTP, WebAuthn)
- [ ] Set up automated security scans
- [ ] Create incident response plan

### Recommended Enhancements

- [ ] Implement key rotation policy
- [ ] Add file versioning with encryption
- [ ] Set up intrusion detection
- [ ] Add honeypot files for attack detection
- [ ] Implement zero-trust architecture
- [ ] Add biometric unlock support
- [ ] Implement secure file deletion (overwrite)
- [ ] Add encrypted backup to external storage

## References

- [NIST Cryptographic Algorithm Recommendations](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [OWASP - Cryptographic Storage](https://owasp.org/www-community/attacks/Cryptographic_Failure)
- [RFC 2898 - PBKDF2](https://tools.ietf.org/html/rfc2898)
- [RFC 3394 - AES Key Wrap](https://tools.ietf.org/html/rfc3394)

---

**Security is a journey, not a destination. Keep learning, keep updating, keep protecting.**
