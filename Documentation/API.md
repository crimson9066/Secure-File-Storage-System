# API Documentation

## Overview

SecureVault API provides endpoints for user authentication, file management, and secure file sharing. All sensitive operations are authenticated with JWT tokens.

## Base URL

```
http://localhost:5000/api
```

## Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Response Format

All responses are in JSON format:

**Success Response:**
```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

**Error Response:**
```json
{
  "error": "Error description",
  "code": "ERROR_CODE"
}
```

---

## Authentication Endpoints

### POST /auth/signup

Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (201 Created):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
  }
}
```

**Errors:**
- `400 Bad Request` - Email or password missing
- `400 Bad Request` - Password less than 12 characters
- `409 Conflict` - User already exists

---

### POST /auth/login

Authenticate user and get JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
  }
}
```

**Errors:**
- `400 Bad Request` - Email or password missing
- `401 Unauthorized` - Invalid credentials

---

### GET /auth/me

Get current user information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n..."
}
```

**Errors:**
- `401 Unauthorized` - Invalid or expired token

---

## File Management Endpoints

### POST /files/upload

Upload and encrypt a file.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Form Data:**
- `file` (File) - The file to upload
- `encryptedKey` (String) - Base64-encoded encrypted AES key

**Response (201 Created):**
```json
{
  "fileId": "660e8400-e29b-41d4-a716-446655440001",
  "filename": "document.pdf",
  "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "size": 1024000,
  "createdAt": "2024-12-03T10:30:00Z"
}
```

**Errors:**
- `400 Bad Request` - File or encryptedKey missing
- `413 Payload Too Large` - File exceeds size limit
- `401 Unauthorized` - Invalid token

---

### GET /files/list

List all user files and shared files.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "ownFiles": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "filename": "document.pdf",
      "file_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
      "size": 1024000,
      "created_at": "2024-12-03T10:30:00Z"
    }
  ],
  "sharedFiles": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "filename": "shared_file.txt",
      "file_hash": "b775b56a31533g0e528f9978gfdfc5gb9b05b1g4ggv2fb10009f97g8b38bf4",
      "size": 512000,
      "owner_email": "friend@example.com",
      "created_at": "2024-12-02T15:45:00Z"
    }
  ],
  "stats": {
    "fileCount": 5,
    "totalSize": 10485760
  }
}
```

**Errors:**
- `401 Unauthorized` - Invalid token

---

### GET /files/download/:fileId

Download an encrypted file.

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "fileId": "660e8400-e29b-41d4-a716-446655440001",
  "filename": "document.pdf",
  "fileHash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  "size": 1024000,
  "encryptedData": "base64_encoded_encrypted_file_data",
  "encryptedKey": "base64_encoded_encrypted_aes_key"
}
```

**Client-Side Decryption:**
```javascript
// Decrypt AES key with private key
const keyBuffer = decryptWithPrivateKey(response.encryptedKey);

// Decrypt file with AES key
const fileBuffer = await decryptFileData(
  response.encryptedData,
  response.keyBase64,
  response.ivBase64
);
```

**Errors:**
- `404 Not Found` - File not found
- `403 Forbidden` - Access denied
- `401 Unauthorized` - Invalid token

---

### DELETE /files/delete/:fileId

Delete a file (owner only).

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Errors:**
- `404 Not Found` - File not found
- `403 Forbidden` - Only owner can delete
- `401 Unauthorized` - Invalid token

---

### POST /files/share

Share a file with another user.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "fileId": "660e8400-e29b-41d4-a716-446655440001",
  "recipientEmail": "friend@example.com",
  "encryptedKey": "base64_encoded_aes_key_encrypted_with_recipient_public_key"
}
```

**Response (201 Created):**
```json
{
  "shareId": "880e8400-e29b-41d4-a716-446655440003",
  "fileId": "660e8400-e29b-41d4-a716-446655440001",
  "recipientEmail": "friend@example.com"
}
```

**Errors:**
- `400 Bad Request` - Missing required fields
- `404 Not Found` - File or recipient not found
- `403 Forbidden` - Only owner can share
- `401 Unauthorized` - Invalid token

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_CREDENTIALS` | 401 | Email or password is incorrect |
| `TOKEN_EXPIRED` | 401 | JWT token has expired |
| `INVALID_TOKEN` | 401 | JWT token is invalid |
| `USER_EXISTS` | 409 | User with this email already exists |
| `USER_NOT_FOUND` | 404 | User not found |
| `FILE_NOT_FOUND` | 404 | File not found |
| `ACCESS_DENIED` | 403 | User does not have access to resource |
| `FILE_TOO_LARGE` | 413 | File exceeds maximum size limit |

---

## Rate Limiting

- Login attempts: 5 per minute per IP
- API requests: 1000 per hour per user

---

## CORS

Allowed origins (configured in backend):
- `http://localhost:3000`
- `http://localhost:3001`

Add production domain to allowed list in `backend/src/index.js`

---

## Examples

### Example: Complete Upload Flow

```bash
# 1. Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePassword123!"}'

# Response:
# {"token":"eyJ...", "user": {...}}

# 2. Upload file
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer eyJ..." \
  -F "file=@document.pdf" \
  -F "encryptedKey=base64_encrypted_key"

# Response:
# {"fileId":"660e8400-...", "filename":"document.pdf", ...}

# 3. List files
curl -X GET http://localhost:5000/api/files/list \
  -H "Authorization: Bearer eyJ..."

# Response:
# {"ownFiles": [...], "sharedFiles": [], "stats": {...}}
```

---

## Security Notes

1. **HTTPS Only** - All endpoints should be served over HTTPS in production
2. **Token Storage** - Store tokens in memory or secure HTTPOnly cookies
3. **CORS** - Only allow trusted origins
4. **Rate Limiting** - Implement rate limiting on authentication endpoints
5. **Encryption** - All encryption happens client-side; server cannot access decrypted data
6. **Private Keys** - User private keys never leave the user's machine except encrypted

