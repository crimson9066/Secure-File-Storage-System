# SecureVault - Secure File Storage System

A functional end-to-end encrypted file storage system. Files are encrypted on the client with AES-256-GCM before being sent to the server. The server never sees unencrypted data.

## Security Features

- **End-to-End Encryption**: Files encrypted with AES-256-GCM on the client side
- **Zero-Knowledge Storage**: Server stores only encrypted blobs; cannot decrypt files
- **RSA-4096 Key Pairs**: Each user gets a unique key pair for file sharing
- **Password Hashing**: Bcrypt (10 rounds) + PBKDF2 (100k iterations) for key derivation
- **Client-Side Encryption**: All encryption/decryption happens in the browser
- **Audit Logging**: All file operations tracked (who, what, when, why)

## Project Structure

```
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js          # PostgreSQL connection
│   │   │   └── sql.sql              # Database schema
│   │   ├── middleware/
│   │   │   └── auth.js              # JWT authentication middleware
│   │   ├── models/
│   │   │   └── user.js              # Database models
│   │   ├── routes/
│   │   │   ├── auth.js              # Authentication endpoints
│   │   │   └── files.js             # File management endpoints
│   │   ├── utils/
│   │   │   ├── encryption.js        # AES-256-GCM, RSA encryption
│   │   │   └── auth.js              # JWT, password hashing
│   │   └── index.js                 # Express server entry point
│   ├── uploads/                     # Encrypted file storage (local)
│   ├── package.json
│   ├── .env                         # Environment variables
│   └── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Notification.js      # Toast notifications
│   │   │   ├── PasswordInput.js     # Password input with strength meter
│   │   │   ├── Modal.js             # Modal and confirmation dialogs
│   │   │   ├── FileUploader.js      # Drag-and-drop file upload
│   │   │   └── FileList.js          # File list with actions
│   │   ├── pages/
│   │   │   ├── LoginPage.js         # Login/signup page
│   │   │   └── DashboardPage.js     # Main dashboard
│   │   ├── context/
│   │   │   ├── AuthContext.js       # Auth state management
│   │   │   └── NotificationContext.js # Notification state
│   │   ├── utils/
│   │   │   ├── api.js               # API client
│   │   │   └── encryption.js        # Client-side encryption
│   │   ├── App.js                   # Main app component
│   │   ├── index.js                 # React entry point
│   │   └── index.css                # Global styles
│   ├── public/
│   │   └── index.html               # HTML template
│   ├── package.json
│   ├── .env                         # Environment variables
│   ├── tailwind.config.js           # Tailwind CSS config
│   ├── postcss.config.js            # PostCSS config
│   └── .gitignore
│
└── README.md
```

## Setup & Installation

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Set up PostgreSQL database:**
   ```bash
   createdb secure_file_storage
   psql -U postgres -d secure_file_storage -f src/config/sql.sql
   ```

3. **Configure environment (.env):**
   ```
   NODE_ENV=development
   PORT=5000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=secure_file_storage
   DB_USER=postgres
   DB_PASSWORD=your_password
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRE=24h
   RSA_KEY_SIZE=4096
   UPLOAD_DIR=./uploads
   MAX_FILE_SIZE=104857600
   ```

4. **Start backend server:**
   ```bash
   npm run dev
   ```
   
   Server runs on http://localhost:5000

### Frontend Setup

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure environment (.env):**
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   ```

3. **Start development server:**
   ```bash
   npm start
   ```
   
   App runs on http://localhost:3000

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create account, generate RSA keypair
  - Request: `{ email, password }`
  - Response: `{ token, user }`

- `POST /api/auth/login` - Login, decrypt stored private key
  - Request: `{ email, password }`
  - Response: `{ token, user }`

- `GET /api/auth/me` - Get current user (JWT required)
  - Response: `{ id, email, publicKey }`

### Files

- `POST /api/files/upload` - Upload encrypted file
  - Request: FormData with file + encryptedKey
  - Response: `{ fileId, filename, hash, size }`

- `GET /api/files/list` - List user's files
  - Response: `{ ownFiles, sharedFiles, stats }`

- `GET /api/files/download/:fileId` - Download encrypted file
  - Response: `{ fileId, filename, encryptedData, encryptedKey }`

- `DELETE /api/files/delete/:fileId` - Delete file from server
  - Response: `{ success }`

- `POST /api/files/share` - Share file with another user
  - Request: `{ fileId, recipientEmail, encryptedKey }`
  - Response: `{ shareId }`

## How File Encryption Works

### Upload Flow

1. User picks file in browser
2. Generate random 256-bit AES key + 96-bit IV
3. Encrypt file with AES-256-GCM (authenticated)
4. Encrypt AES key with user's RSA public key
5. Send encrypted file + encrypted key to server
6. Server stores as opaque blob (can't decrypt)
7. User deletes original from disk

### Download Flow

1. User requests file from server
2. Server returns encrypted file + encrypted key
3. Browser decrypts AES key using user's RSA private key
4. Browser decrypts file using AES key
5. File appears to user decrypted

### Sharing Flow

1. File owner has AES key (encrypted with their key)
2. Owner re-encrypts AES key with recipient's RSA public key
3. Owner sends encrypted key to recipient
4. Recipient decrypts key using their private key
5. Recipient can now decrypt the shared file

## Database Schema

### users
- `id` (UUID) - Primary key
- `email` (VARCHAR) - Unique email
- `encrypted_private_key` (TEXT) - Password-protected private key
- `public_key` (TEXT) - RSA public key
- `password_hash` (VARCHAR) - Bcrypt hash
- `password_salt` (VARCHAR) - PBKDF2 salt
- `created_at` (TIMESTAMP)

### files
- `id` (UUID) - Primary key
- `owner_id` (UUID) - FK to users
- `filename` (VARCHAR) - Original filename
- `file_hash` (VARCHAR) - SHA-256 hash
- `encrypted_key` (TEXT) - Encrypted AES key
- `file_path` (VARCHAR) - Local storage path
- `size` (BIGINT) - File size in bytes
- `created_at` (TIMESTAMP)

### file_shares
- `id` (UUID) - Primary key
- `file_id` (UUID) - FK to files
- `owner_id` (UUID) - FK to users
- `recipient_id` (UUID) - FK to users
- `encrypted_key` (TEXT) - Key encrypted with recipient's public key
- `created_at` (TIMESTAMP)

### audit_logs
- `id` (UUID) - Primary key
- `user_id` (UUID) - FK to users
- `action` (VARCHAR) - Action type
- `resource_type` (VARCHAR) - Resource being acted on
- `resource_id` (UUID) - Resource ID
- `details` (JSONB) - Additional details
- `ip_address` (VARCHAR) - IP address of request
- `created_at` (TIMESTAMP)

## Security Best Practices

### Implemented

- AES-256-GCM authenticated encryption
- RSA-4096 asymmetric encryption for key sharing
- Bcrypt password hashing with salt
- PBKDF2 key derivation (100,000 iterations)
- JWT token-based authentication
- CORS protection
- Audit logging
- Client-side encryption (zero-knowledge)

### Recommended Additional Features

- [ ] Two-Factor Authentication (TOTP/WebAuthn)
- [ ] Rate limiting on login attempts
- [ ] Password reset via email with secure tokens
- [ ] Biometric unlock (fingerprint/FaceID)
- [ ] File versioning
- [ ] Trash/recover deleted files
- [ ] End-to-end encrypted sharing links
- [ ] Public key backup/recovery
- [ ] Encrypted file sync across devices

## UI/UX Features

- Clean, modern design with Tailwind CSS
- Responsive layout (mobile, tablet, desktop)
- Drag-and-drop file upload
- Upload progress bar
- Real-time password strength meter
- Toast notifications for user feedback
- Modal dialogs for confirmations
- File search and filtering
- Storage statistics dashboard
- Settings page for account management

## Performance Considerations

- Files stored encrypted on server (no decryption overhead)
- Client-side encryption for instant responsiveness
- Efficient file chunking for large files
- Database indexing for fast queries
- CORS and caching headers optimized

## Troubleshooting

### Backend issues

1. **Database connection error:**
   - Ensure PostgreSQL is running
   - Check `.env` database credentials
   - Run schema migration: `psql -U postgres -d secure_file_storage -f src/config/sql.sql`

2. **Port already in use:**
   - Change PORT in `.env` or kill existing process

3. **CORS errors:**
   - Ensure frontend URL is in CORS whitelist in `backend/src/index.js`

### Frontend issues

1. **API connection error:**
   - Ensure backend is running on correct port
   - Check `REACT_APP_API_URL` in `.env`
   - Clear browser cache and restart dev server

2. **Encryption errors:**
   - Check browser console for WebCrypto API support
   - Ensure HTTPS is used in production

## Example Usage

### Sign Up
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePassword123!"}'
```

### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePassword123!"}'
```

### Upload File
```bash
curl -X POST http://localhost:5000/api/files/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@document.pdf" \
  -F "encryptedKey=<base64-encrypted-key>"
```

## Production Deployment

1. **Environment:**
   - Change JWT_SECRET to secure random value
   - Set NODE_ENV=production
   - Use environment variables for sensitive data
   - Set up SSL/TLS certificates

2. **Database:**
   - Use managed PostgreSQL service (AWS RDS, Azure Database)
   - Enable backups and replication
   - Use strong database passwords

3. **File Storage:**
   - Use S3 or similar cloud storage for production
   - Implement versioning
   - Set up lifecycle policies for old files

4. **Frontend:**
   - Build and serve static files
   - Enable gzip compression
   - Set up CDN
   - Implement service workers for offline support

5. **Monitoring:**
   - Set up error tracking (Sentry)
   - Monitor database performance
   - Log file access and modifications
   - Set up alerting for security events

## License

MIT License - Feel free to use for personal and commercial projects

## Contributing

Contributions welcome! Please submit pull requests with improvements.

## Support

For issues and questions, please open a GitHub issue.

---

**Built for secure file storage**
