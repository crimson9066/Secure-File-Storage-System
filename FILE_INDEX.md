# SecureVault - Complete File Index

## Project Files Overview

### Root Directory
- **README.md** - Main project documentation
- **QUICKSTART.md** - 5-minute setup guide
- **API.md** - Complete API reference
- **SECURITY.md** - Encryption and security architecture
- **ARCHITECTURE.md** - System design and diagrams
- **TESTING.md** - Testing guide and procedures
- **DEPLOYMENT.md** - Production deployment guide
- **PROJECT_SUMMARY.md** - Project overview and statistics
- **setup.sh** - Setup script for Linux/macOS
- **setup.bat** - Setup script for Windows

---

## Backend Files (`/backend`)

### Configuration
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (create locally)
- `.gitignore` - Git ignore rules
- `src/config/database.js` - PostgreSQL connection
- `src/config/sql.sql` - Database schema and migrations

### Core Application
- `src/index.js` - Express server entry point

### Middleware
- `src/middleware/auth.js` - JWT authentication and error handling

### Routes
- `src/routes/auth.js` - Signup/login endpoints
- `src/routes/files.js` - File CRUD and sharing endpoints

### Models
- `src/models/user.js` - Database queries and operations

### Utilities
- `src/utils/auth.js` - Password hashing and JWT functions
- `src/utils/encryption.js` - AES-256-GCM, RSA-4096, SHA-256 functions

### Database
- `uploads/` - Encrypted file storage directory

### Setup Scripts
- `setup-db.sh` - Database setup for Linux/macOS
- `setup-db.bat` - Database setup for Windows

---

## Frontend Files (`/frontend`)

### Configuration
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (create locally)
- `.gitignore` - Git ignore rules
- `tailwind.config.js` - Tailwind CSS configuration
- `postcss.config.js` - PostCSS configuration
- `public/index.html` - HTML template

### Core Application
- `src/index.js` - React entry point
- `src/App.js` - Main app component with routing
- `src/index.css` - Global styles and animations

### Context (State Management)
- `src/context/AuthContext.js` - Authentication state
- `src/context/NotificationContext.js` - Notification state

### Pages
- `src/pages/LoginPage.js` - Login/signup page component
- `src/pages/DashboardPage.js` - Main dashboard component

### Components
- `src/components/Notification.js` - Toast notification display
- `src/components/PasswordInput.js` - Password input with strength meter
- `src/components/Modal.js` - Modal and confirm dialogs
- `src/components/FileUploader.js` - Drag-drop file uploader
- `src/components/FileList.js` - File list with actions

### Utilities
- `src/utils/api.js` - API client and HTTP requests
- `src/utils/encryption.js` - Client-side encryption using Web Crypto API

---

## 📊 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create new account |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Get current user |

### File Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload encrypted file |
| GET | `/api/files/list` | List user files |
| GET | `/api/files/download/:id` | Download encrypted file |
| DELETE | `/api/files/delete/:id` | Delete file |
| POST | `/api/files/share` | Share file with user |

---

## 🗄️ Database Schema

### Users Table
- `id` - UUID primary key
- `email` - Unique email address
- `encrypted_private_key` - Password-protected RSA private key
- `public_key` - RSA public key
- `password_hash` - Bcrypt hash
- `password_salt` - PBKDF2 salt
- `created_at` - Account creation timestamp

### Files Table
- `id` - UUID primary key
- `owner_id` - FK to users
- `filename` - Original filename
- `file_hash` - SHA-256 hash
- `encrypted_key` - RSA-encrypted AES key
- `file_path` - Storage path
- `size` - File size in bytes
- `created_at` - Upload timestamp

### File Shares Table
- `id` - UUID primary key
- `file_id` - FK to files
- `owner_id` - FK to users
- `recipient_id` - FK to users
- `encrypted_key` - AES key encrypted for recipient
- `created_at` - Share timestamp

### Audit Logs Table
- `id` - UUID primary key
- `user_id` - FK to users
- `action` - Action type
- `resource_type` - Resource being acted on
- `resource_id` - Resource ID
- `details` - JSON details
- `ip_address` - Request IP
- `created_at` - Log timestamp

---

## Security Implementation

### Encryption Algorithms
1. **AES-256-GCM** - File encryption (authenticated)
2. **RSA-4096** - Key sharing and encryption
3. **SHA-256** - File integrity verification
4. **PBKDF2** - Password-based key derivation (100k iterations)
5. **Bcrypt** - Password hashing (10 salt rounds)
6. **JWT** - Authentication tokens (24-hour expiry)

### Security Features
- End-to-end encryption
- Zero-knowledge storage
- Client-side encryption
- Secure key sharing
- CORS protection
- JWT authentication
- Audit logging
- Input validation
- Error handling
- HTTPS ready

---

## Documentation Files

### Getting Started
- **QUICKSTART.md** - 5-minute setup guide
- **README.md** - Comprehensive project guide

### Technical Documentation
- **API.md** - Complete API reference with examples
- **ARCHITECTURE.md** - System design and diagrams
- **SECURITY.md** - Encryption details and security architecture
- **DEPLOYMENT.md** - Production deployment guide
- **TESTING.md** - Testing procedures and examples

### Project Info
- **PROJECT_SUMMARY.md** - Overview and statistics
- **FILE_INDEX.md** - This file

---

## Quick Commands

### Setup
```bash
# Setup backend
cd backend && npm install

# Setup frontend
cd frontend && npm install

# Setup database
createdb secure_file_storage
psql -U postgres -d secure_file_storage -f backend/src/config/sql.sql
```

### Development
```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm start
```

### Production
```bash
# Build frontend
cd frontend && npm run build

# Start backend in production
cd backend && NODE_ENV=production npm start
```

### Testing
```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test
```

---

## 📦 Dependencies

### Backend
- express: Web server framework
- pg: PostgreSQL driver
- bcryptjs: Password hashing
- jsonwebtoken: JWT generation
- multer: File upload handling
- cors: CORS middleware
- dotenv: Environment variables

### Frontend
- react: UI framework
- react-router-dom: Routing
- axios: HTTP client
- tailwindcss: CSS framework
- crypto-js: Encryption utilities (optional)

---

## 🔍 File Sizes (Approximate)

| File | Size |
|------|------|
| Backend Index | 2 KB |
| Auth Routes | 4 KB |
| Files Routes | 8 KB |
| Encryption Utils | 6 KB |
| Frontend App | 3 KB |
| Dashboard Page | 10 KB |
| Login Page | 6 KB |
| File List Component | 10 KB |
| **Total Code** | ~60 KB |
| **With Comments** | ~80 KB |
| **Total Project** | ~200 KB |

---

## Key Concepts

### Zero-Knowledge Storage
Server stores encrypted files but cannot decrypt them (no private key)

### End-to-End Encryption
All encryption/decryption happens on user's device

### Key Sharing
Recipients can access files because their AES key is encrypted with their public key

### Audit Logging
All file operations are logged for compliance and security

### JWT Authentication
Stateless tokens used for request authentication

---

## 🔗 Related Resources

### Security Standards
- [NIST Cryptography Guidelines](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)

### Technologies
- [Express.js Documentation](https://expressjs.com/)
- [React Documentation](https://react.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### Tools
- [Node.js](https://nodejs.org/)
- [React DevTools](https://react-devtools-tutorial.vercel.app/)
- [PostgreSQL GUI Tools](https://www.pgadmin.org/)

---

## Setup Checklist

### Before Starting
- [ ] Node.js v14+ installed
- [ ] PostgreSQL v12+ installed
- [ ] Git installed
- [ ] Code editor (VS Code recommended)

### Backend Setup
- [ ] `npm install` in backend directory
- [ ] `.env` file created and configured
- [ ] Database created
- [ ] Migrations run
- [ ] `npm run dev` starts successfully

### Frontend Setup
- [ ] `npm install` in frontend directory
- [ ] `.env` file configured with API URL
- [ ] `npm start` runs successfully
- [ ] Page loads on http://localhost:3000

### Verification
- [ ] Can create account
- [ ] Can login
- [ ] Can upload file
- [ ] Can download file
- [ ] Can share file
- [ ] Uploaded files are encrypted

---

## 🎓 Learning Paths

### For Security Learners
1. Read SECURITY.md
2. Study encryption.js files
3. Review API.md for data flow
4. Read ARCHITECTURE.md

### For Full-Stack Developers
1. Read QUICKSTART.md
2. Explore backend routes
3. Explore frontend components
4. Run tests and check output

### For DevOps Engineers
1. Read DEPLOYMENT.md
2. Review .env configuration
3. Study database setup
4. Review scaling considerations

### For Product Managers
1. Read PROJECT_SUMMARY.md
2. Review feature list in README.md
3. Check QUICKSTART.md for workflow
4. Review use cases

---

## 📞 Support & Questions

### Where to Find Answers
1. **Setup Issues:** QUICKSTART.md
2. **API Questions:** API.md
3. **Security Questions:** SECURITY.md
4. **Architecture Questions:** ARCHITECTURE.md
5. **Deployment Issues:** DEPLOYMENT.md
6. **Testing Questions:** TESTING.md

### File Organization Philosophy
- Configuration files in `config/` directories
- Route handlers in `routes/` directories
- Reusable utilities in `utils/` directories
- Components in `components/` directories
- Pages in `pages/` directories
- Context in `context/` directories

### Best Practices
- Always use absolute imports
- Keep components small and focused
- Use context for global state
- Document complex logic
- Add error handling
- Log important events
- Write tests for critical functions

---

**Last Updated:** December 3, 2024
**Total Files:** 35+
**Total Documentation:** 8 comprehensive guides
**Code Quality:** Production-ready
**Security:** Enterprise-grade

---

*For more information, visit the project directory and read the documentation files.*
