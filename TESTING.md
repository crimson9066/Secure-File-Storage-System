# Testing Guide

## Unit Testing

### Backend Testing

Install test framework:
```bash
npm install --save-dev jest supertest
```

Example test file: `backend/src/__tests__/encryption.test.js`
```javascript
const {
  encryptFile,
  decryptFile,
  hashFile,
  generateRSAKeyPair
} = require('../utils/encryption');

describe('Encryption Utils', () => {
  test('should encrypt and decrypt file', async () => {
    const fileBuffer = Buffer.from('test file content');
    
    const encrypted = encryptFile(fileBuffer);
    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.key).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    
    const decrypted = decryptFile(
      encrypted.encryptedData,
      encrypted.key,
      encrypted.iv,
      encrypted.authTag
    );
    
    expect(decrypted.toString()).toBe('test file content');
  });

  test('should generate valid RSA key pair', async () => {
    const { publicKey, privateKey } = await generateRSAKeyPair();
    
    expect(publicKey).toContain('BEGIN PUBLIC KEY');
    expect(privateKey).toContain('BEGIN PRIVATE KEY');
  });

  test('should calculate file hash', () => {
    const fileBuffer = Buffer.from('test content');
    const hash = hashFile(fileBuffer);
    
    expect(hash).toHaveLength(64); // SHA-256 hex is 64 chars
    expect(/^[a-f0-9]{64}$/.test(hash)).toBe(true);
  });
});
```

### Frontend Testing

Install test framework:
```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

Example test file: `frontend/src/__tests__/encryption.test.js`
```javascript
import {
  encryptFileData,
  decryptFileData,
  calculateSHA256,
  checkPasswordStrength
} from '../utils/encryption';

describe('Frontend Encryption', () => {
  test('should encrypt and decrypt file', async () => {
    const testData = new TextEncoder().encode('test file content');
    
    const encrypted = await encryptFileData(testData);
    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.keyBase64).toBeDefined();
    expect(encrypted.ivBase64).toBeDefined();
    
    const decrypted = await decryptFileData(
      encrypted.encryptedData,
      encrypted.keyBase64,
      encrypted.ivBase64
    );
    
    expect(new TextDecoder().decode(decrypted)).toBe('test file content');
  });

  test('should calculate SHA-256 hash', async () => {
    const data = new TextEncoder().encode('test');
    const hash = await calculateSHA256(data);
    
    expect(hash).toHaveLength(64);
  });

  test('should check password strength', () => {
    const weak = checkPasswordStrength('pass');
    expect(weak.score).toBeLessThan(3);
    
    const strong = checkPasswordStrength('SecurePassword123!@#');
    expect(strong.score).toBeGreaterThanOrEqual(5);
  });
});
```

## Integration Testing

### API Testing with cURL

Test signup:
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPassword123!"
  }' | jq .
```

Test login:
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "TestPassword123!"
  }' | jq .
```

Save token:
```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"TestPassword123!"}' \
  | jq -r '.token')

echo $TOKEN
```

Test file upload:
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@testfile.pdf" \
  -F "encryptedKey=$(echo 'base64_encrypted_key')" | jq .
```

Test file list:
```bash
curl -X GET http://localhost:5000/api/files/list \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Manual Testing Checklist

### Authentication
- [ ] Sign up with valid email and password
- [ ] Sign up with weak password (should fail)
- [ ] Sign up with duplicate email (should fail)
- [ ] Login with correct credentials
- [ ] Login with wrong password (should fail)
- [ ] Login with non-existent email (should fail)
- [ ] Token persists after page refresh
- [ ] Token expires after 24 hours
- [ ] Logout clears token

### File Upload
- [ ] Upload small file (< 1 MB)
- [ ] Upload large file (> 100 MB)
- [ ] Upload file near size limit (should work)
- [ ] Upload file over size limit (should fail)
- [ ] Upload progress bar shows correctly
- [ ] Drag-and-drop file upload works
- [ ] File appears in list after upload
- [ ] Uploaded file is encrypted (check /uploads folder)
- [ ] Multiple simultaneous uploads work

### File Download
- [ ] Download uploads correctly
- [ ] Downloaded file matches original after decryption
- [ ] Progress indicator shows during download
- [ ] Cannot download without authentication

### File Deletion
- [ ] Delete file shows confirmation dialog
- [ ] File removed from list after deletion
- [ ] File removed from filesystem
- [ ] Cannot delete other user's files

### File Sharing
- [ ] Share file with valid email
- [ ] Share file with non-existent email (should fail)
- [ ] Shared file appears in recipient's list
- [ ] Recipient can download shared file
- [ ] Recipient can decrypt shared file
- [ ] Can share same file with multiple users
- [ ] Cannot access unshared files

### Security
- [ ] Private key never stored in localStorage
- [ ] Passwords never sent in plaintext
- [ ] Tokens use HTTPS in production
- [ ] CORS only allows trusted origins
- [ ] Audit logs track file operations
- [ ] Cannot access files without authentication

### UI/UX
- [ ] Interface is responsive on mobile
- [ ] UI is responsive on tablet
- [ ] UI is responsive on desktop
- [ ] Notifications appear and disappear
- [ ] Password strength meter works
- [ ] Modals can be closed with X button
- [ ] Settings page is accessible
- [ ] Dark mode (if implemented) works

### Performance
- [ ] Upload large file doesn't freeze UI
- [ ] Decryption doesn't block UI
- [ ] Page loads quickly
- [ ] No memory leaks over time

## Automated Testing

### Run Backend Tests
```bash
cd backend
npm test
```

### Run Frontend Tests
```bash
cd frontend
npm test
```

### Test Coverage Report
```bash
npm test -- --coverage
```

## Load Testing

Using Apache Bench:
```bash
# Test 100 requests with 10 concurrent
ab -n 100 -c 10 http://localhost:5000/api/health
```

Using wrk:
```bash
wrk -t 4 -c 100 -d 30s http://localhost:5000/api/health
```

## Security Testing

### OWASP Top 10 Checks

1. **SQL Injection**
   - [ ] Try SQL injection in email field
   - [ ] Try SQL injection in file name
   - [ ] Try SQL injection in search

2. **Authentication Bypass**
   - [ ] Try accessing /dashboard without token
   - [ ] Try modifying JWT token
   - [ ] Try using expired token

3. **Sensitive Data Exposure**
   - [ ] Check if passwords are sent over HTTP
   - [ ] Check if private keys are logged
   - [ ] Check browser storage for sensitive data

4. **XML External Entities (XXE)**
   - [ ] Upload XML file with XXE payload
   - [ ] Check if server processes XXE

5. **Broken Access Control**
   - [ ] Try accessing other user's files
   - [ ] Try deleting other user's files
   - [ ] Try modifying other user's accounts

6. **Cross-Site Request Forgery (CSRF)**
   - [ ] Check if endpoints verify origin
   - [ ] Test state-changing operations

7. **Using Components with Known Vulnerabilities**
   - [ ] Run `npm audit`
   - [ ] Check for outdated packages
   - [ ] Update packages regularly

## Encryption Verification

### Check Server Cannot Decrypt

1. Upload file through UI
2. SSH into server
3. Check `/uploads` directory
4. Try to open encrypted file with text editor
5. Verify file is gibberish (encrypted)

### Check Private Key Protection

1. Login to app
2. Open Developer Tools
3. Check LocalStorage/SessionStorage
4. Verify private key is NOT stored
5. Verify token IS stored (short-lived)

### Check File Hash Integrity

1. Upload file
2. Download file
3. Compare SHA-256 hashes
4. Should match (file wasn't tampered with)

## Regression Testing

Before each release:

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Manual testing checklist complete
- [ ] Security checklist complete
- [ ] Load testing shows acceptable performance
- [ ] No new console errors
- [ ] No new console warnings

## Test Reporting

Create `test-report.md`:

```markdown
# Test Report - Version 1.0.0

## Test Execution Date
- Date: 2024-12-03
- Tester: John Doe
- Environment: Development

## Test Results

### Unit Tests
- Backend: 50/50 passed
- Frontend: 45/45 passed

### Integration Tests
- API: All endpoints working
- Database: Migrations successful

### Manual Tests
- Authentication: Pass
- File Operations: Pass
- Security: Pass

### Performance
- Upload speed: 5 MB/s
- Download speed: 10 MB/s
- UI responsiveness: Good

### Issues Found
- [ ] No critical issues
- [ ] No high severity issues
- [ ] 2 minor UI improvements noted

## Approval
- [ ] Ready for production
```

---

**Comprehensive testing ensures reliability and security.**
