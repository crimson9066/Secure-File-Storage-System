# Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT SIDE                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐         ┌──────────────────────────┐           │
│  │ React Frontend   │         │  Web Crypto API          │           │
│  ├──────────────────┤         ├──────────────────────────┤           │
│  │ • Login/Signup   │         │ • AES-256-GCM Encrypt    │           │
│  │ • Dashboard      │◄───────►│ • RSA-4096 Key Ops       │           │
│  │ • File Manager   │         │ • SHA-256 Hashing        │           │
│  │ • Settings       │         │ • PBKDF2 Derivation      │           │
│  └──────────────────┘         └──────────────────────────┘           │
│          ▲                                                             │
│          │                          ▲                                 │
│          │ HTTPS Only               │ Private Key                     │
│          │ JWT Tokens               │ (In Memory Only)                │
│          └──────────────┬───────────┘                                 │
│                         │                                             │
└─────────────────────────┼──────────────────────────────────────────────┘
                          │
                     HTTP/HTTPS
                          │
┌─────────────────────────┼──────────────────────────────────────────────┐
│                 │       │                                               │
│  ┌──────────────▼────┐  │     ┌─────────────────────────────────────┐  │
│  │   Express.js      │  │     │   File Storage                      │  │
│  │   REST API        │──┼────►│   • Local filesystem                │  │
│  │   Server          │  │     │   • Encrypted files only            │  │
│  ├───────────────────┤  │     │   • Cannot decrypt (no key)         │  │
│  │                   │  │     └─────────────────────────────────────┘  │
│  │ Routes:           │  │                                               │
│  │ • /auth/signup    │  │     ┌─────────────────────────────────────┐  │
│  │ • /auth/login     │  └────►│   PostgreSQL Database               │  │
│  │ • /files/upload   │        │   • Encrypted private keys          │  │
│  │ • /files/download │        │   • Encrypted file keys             │  │
│  │ • /files/list     │        │   • Metadata (hash, size, etc)      │  │
│  │ • /files/delete   │        │   • User accounts                   │  │
│  │ • /files/share    │        │   • Audit logs                      │  │
│  │                   │        └─────────────────────────────────────┘  │
│  └───────────────────┘                                                 │
│                                                                         │
│              BACKEND SIDE (ZERO-KNOWLEDGE)                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

### Upload Flow

```
┌─────────────┐
│  Raw File   │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Generate AES Key     │
│ + Generate Random IV (12B)   │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Encrypt with         │
│ AES-256-GCM                  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Encrypted File               │
│ + Auth Tag + IV              │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Encrypt AES Key      │
│ with User's RSA Public Key   │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Encrypted File +             │
│ Encrypted AES Key            │
└──────┬───────────────────────┘
       │
       ▼ HTTPS
┌──────────────────────────────┐
│ Server: Store encrypted file │
│ + Store encrypted key        │
│ + Store metadata (hash, size)│
└──────────────────────────────┘
```

### Download Flow

```
┌─────────────────────────────┐
│ Server: Retrieve encrypted  │
│ file + encrypted key        │
└──────┬──────────────────────┘
       │
       ▼ HTTPS
┌──────────────────────────────┐
│ Client: Receive              │
│ encrypted file + key         │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Decrypt AES Key      │
│ with User's RSA Private Key  │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Decrypt File         │
│ with AES-256-GCM             │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Client: Verify File Hash     │
│ (SHA-256)                    │
└──────┬───────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ Plaintext File               │
│ (User's Machine Only)        │
└──────────────────────────────┘
```

### Sharing Flow

```
Owner Side                     Server                    Recipient Side
───────────────────────────────────────────────────────────────────

Has AES Key                                              Has RSA Public Key
for File                                                 (shared beforehand)
    │
    ├───────► Get Recipient's RSA Public Key
    │         from Server
    │                          │
    │◄─────────────────────────┤ Return Public Key
    │
    ├───► Encrypt AES Key with
    │     Recipient's Public Key
    │
    └──────► Send encrypted key
             to server
                          │
                          ├─ Store encrypted key
                          │  in file_shares table
                          │
                          └──► Recipient can now
                               access file
                               
                               ├─ Decrypt AES key
                               │  with their private
                               │  key
                               │
                               └──► Download & decrypt
                                    file with AES key
```

## Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  LoginPage ◄─────────────► AuthContext                       │
│  DashboardPage ◄─────────► NotificationContext              │
│  FileList                                                    │
│  FileUploader                                                │
│  Modal                                                       │
│  PasswordInput                                               │
│  Notification                                                │
│                                                               │
│  All components use utilities:                               │
│  • api.js (HTTP requests)                                   │
│  • encryption.js (Web Crypto)                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │
         ▼ HTTP/HTTPS
┌─────────────────────────────────────────────────────────────┐
│              Express.js Routes                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  auth.js              files.js                               │
│  ├─ POST /signup      ├─ POST /upload                       │
│  ├─ POST /login       ├─ GET /list                          │
│  └─ GET /me           ├─ GET /download/:id                  │
│                       ├─ DELETE /delete/:id                 │
│                       └─ POST /share                         │
│                                                               │
│  All routes use middleware:                                  │
│  • authMiddleware (verify JWT)                              │
│  • errorHandler (error response)                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
         │
         ├──────────────┬──────────────────┐
         ▼              ▼                  ▼
    ┌────────┐    ┌──────────┐    ┌────────────────┐
    │ Utils  │    │ Models   │    │ File Storage   │
    ├────────┤    ├──────────┤    ├────────────────┤
    │ auth   │    │ user.js  │    │ ./uploads/     │
    │encrypt │    │          │    │ (encrypted)    │
    └────────┘    └────┬─────┘    └────────────────┘
         │             │
         │             ▼
         │        ┌──────────────┐
         └───────►│ PostgreSQL   │
                  │ Database     │
                  └──────────────┘
```

## Authentication Flow Sequence

```
User                              Frontend              Backend
  │                                 │                     │
  ├─ Enter email + password         │                     │
  │                                 │                     │
  ├─ Click "Sign Up"               │                     │
  │                                 │                     │
  └────────────► POST /auth/signup─►│                     │
                                   │                      │
                                   ├─ Validate input      │
                                   │                      │
                                   ├─ Generate RSA keys   │
                                   │                      │
                                   ├─ Hash password       │
                                   │                      │
                                   ├─ Encrypt private key │
                                   │                      │
                                   ├─ Store in database   │
                                   │                      │
                                   ├─ Generate JWT        │
                                   │                      │
                                   │◄─ Return token       │
                                   │                      │
  ◄─────────────────────────────────┤                     │
  Display dashboard                 │                     │
                                    │                     │
  ├─ Upload file                    │                     │
  │                                 │                     │
  ├─ Encrypt with AES-256-GCM      │                     │
  │                                 │                     │
  └─────► POST /files/upload ──────►│                     │
         (JWT + encrypted file)      │                     │
                                    │                     │
                                    ├─ Verify JWT         │
                                    │                      │
                                    ├─ Store file         │
                                    │                      │
                                    ├─ Create file record  │
                                    │                      │
                                    │◄─ Return file ID     │
                                    │                      │
  ◄─────────────────────────────────┤                     │
  Show success message              │                     │
```

## Technology Stack

```
┌────────────────────────────────────────┐
│         Frontend (React)                │
├────────────────────────────────────────┤
│ • React 18.2                           │
│ • React Router v6                      │
│ • Tailwind CSS (styling)               │
│ • Web Crypto API (encryption)          │
│ • Fetch API (HTTP)                     │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│         Backend (Node.js)              │
├────────────────────────────────────────┤
│ • Express.js (framework)               │
│ • Node.js Crypto (encryption)          │
│ • bcryptjs (password hashing)          │
│ • jsonwebtoken (JWT)                   │
│ • Multer (file upload)                 │
│ • CORS (cross-origin)                  │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│         Database (PostgreSQL)          │
├────────────────────────────────────────┤
│ • PostgreSQL 12+                       │
│ • pg (Node.js driver)                  │
│ • UUID data type                       │
│ • JSONB for audit logs                 │
└────────────────────────────────────────┘

┌────────────────────────────────────────┐
│         Storage                        │
├────────────────────────────────────────┤
│ • Local filesystem (development)       │
│ • AWS S3 (production recommended)      │
│ • All files encrypted before upload    │
└────────────────────────────────────────┘
```

## Scalability Considerations

### Current Architecture (Single Server)

```
Client ◄──► Express Server ◄──► PostgreSQL ◄──► Local Filesystem
```

### Horizontal Scaling (Multiple Servers)

```
              ┌──────► Server 1 ┐
Client ◄─ Load Balancer ──────► Server 2 ◄─► PostgreSQL + Replication
              └──────► Server 3 ┘

             S3 / Cloud Storage
             (Encrypted Files)
```

### Optimization Strategies

1. **Database:** Connection pooling, read replicas
2. **Cache:** Redis for user sessions and metadata
3. **CDN:** CloudFront for frontend assets
4. **Storage:** S3 with lifecycle policies
5. **Logging:** ELK stack or CloudWatch
6. **Monitoring:** Prometheus + Grafana

## Error Handling & Logging

```
User Action
    │
    ├─► Validation Error ──► Return 400 Bad Request
    │
    ├─► Authentication Error ──► Return 401 Unauthorized
    │
    ├─► Authorization Error ──► Return 403 Forbidden
    │
    ├─► Resource Not Found ──► Return 404 Not Found
    │
    ├─► Server Error ──► Log + Return 500 Internal Server Error
    │
    └─► Success ──► Log audit event + Return 200/201
```

---

**This architecture ensures security, scalability, and maintainability.**
