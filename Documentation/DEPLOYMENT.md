# Deployment Guide

## Production Deployment

### Prerequisites

- AWS Account or hosting provider
- Domain name
- SSL/TLS certificate
- PostgreSQL database (managed or self-hosted)
- Node.js production environment

## Backend Deployment

### AWS EC2 Deployment

1. **Launch EC2 Instance**
   ```bash
   # Amazon Linux 2
   # t3.medium or larger
   # Security group: Allow 443, 80, 22
   ```

2. **Setup Server**
   ```bash
   sudo yum update -y
   sudo yum install nodejs npm postgresql-client git -y
   
   # Create application user
   sudo useradd -m securevault
   sudo su - securevault
   ```

3. **Clone Repository**
   ```bash
   git clone https://github.com/yourusername/securevault.git
   cd securevault/backend
   ```

4. **Install Dependencies**
   ```bash
   npm install --production
   ```

5. **Configure Environment (.env)**
   ```
   NODE_ENV=production
   PORT=5000
   DB_HOST=your-rds-endpoint.amazonaws.com
   DB_PORT=5432
   DB_NAME=secure_file_storage
   DB_USER=dbadmin
   DB_PASSWORD=<strong_password>
   JWT_SECRET=<generate-random-64-char-string>
   UPLOAD_DIR=/home/securevault/uploads
   MAX_FILE_SIZE=104857600
   ```

6. **Create Uploads Directory**
   ```bash
   mkdir -p /home/securevault/uploads
   chmod 700 /home/securevault/uploads
   ```

7. **Setup PM2 (Process Manager)**
   ```bash
   npm install -g pm2
   
   # Create ecosystem.config.js
   ```

8. **Create PM2 Config**
   ```javascript
   // ecosystem.config.js
   module.exports = {
     apps: [{
       name: 'securevault-backend',
       script: './src/index.js',
       instances: 'max',
       exec_mode: 'cluster',
       env: {
         NODE_ENV: 'production'
       },
       error_file: './logs/err.log',
       out_file: './logs/out.log',
       log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
     }]
   };
   ```

9. **Start Application**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

10. **Setup Nginx Reverse Proxy**
    ```nginx
    # /etc/nginx/sites-available/securevault-api
    
    upstream securevault_backend {
      server 127.0.0.1:5000;
    }
    
    server {
      listen 80;
      server_name api.yourdomain.com;
      
      # Redirect to HTTPS
      return 301 https://$server_name$request_uri;
    }
    
    server {
      listen 443 ssl http2;
      server_name api.yourdomain.com;
      
      # SSL certificates (use Let's Encrypt)
      ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
      
      # Security headers
      add_header Strict-Transport-Security "max-age=31536000" always;
      add_header X-Content-Type-Options "nosniff" always;
      add_header X-Frame-Options "DENY" always;
      add_header X-XSS-Protection "1; mode=block" always;
      
      # Gzip compression
      gzip on;
      gzip_types application/json text/plain;
      
      location / {
        proxy_pass http://securevault_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts for large file uploads
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
      }
    }
    ```

11. **Enable Nginx Config**
    ```bash
    sudo ln -s /etc/nginx/sites-available/securevault-api /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

12. **Setup SSL with Let's Encrypt**
    ```bash
    sudo apt-get install certbot python3-certbot-nginx -y
    sudo certbot certonly --standalone -d api.yourdomain.com
    ```

### Database Setup (AWS RDS)

1. **Create RDS Instance**
   - Engine: PostgreSQL 14
   - Multi-AZ: Yes (production)
   - Storage: 100 GB, auto-scaling enabled
   - Backup retention: 30 days

2. **Run Migrations**
   ```bash
   psql -h your-rds-endpoint.amazonaws.com -U dbadmin -d secure_file_storage -f backend/src/config/sql.sql
   ```

3. **Enable Backups**
   - Automated backups enabled
   - Manual snapshots weekly

## Frontend Deployment

### AWS S3 + CloudFront

1. **Build React App**
   ```bash
   cd frontend
   npm run build
   ```

2. **Create S3 Bucket**
   ```bash
   aws s3 mb s3://securevault-frontend
   ```

3. **Upload Build Files**
   ```bash
   aws s3 sync build/ s3://securevault-frontend --delete
   ```

4. **Configure S3 for Static Hosting**
   ```bash
   aws s3api put-bucket-website \
     --bucket securevault-frontend \
     --website-configuration IndexDocument={Suffix=index.html}
   ```

5. **Setup CloudFront Distribution**
   - Origin: S3 bucket
   - Viewer Protocol Policy: Redirect HTTP to HTTPS
   - Allowed HTTP Methods: GET, HEAD
   - Cache Policy: Managed-Caching Optimized

6. **Configure Environment**
   - Set `REACT_APP_API_URL` to production backend URL
   - Rebuild and deploy

### Alternative: Vercel Deployment

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy Frontend**
   ```bash
   cd frontend
   vercel --prod
   ```

3. **Configure Environment Variables**
   - `REACT_APP_API_URL=https://api.yourdomain.com/api`

## Monitoring & Logging

### Application Monitoring

1. **CloudWatch**
   ```javascript
   // Log to CloudWatch
   const aws = require('aws-sdk');
   const cloudwatch = new aws.CloudWatch();
   ```

2. **Sentry Integration**
   ```bash
   npm install @sentry/node @sentry/tracing
   ```

   ```javascript
   const Sentry = require('@sentry/node');
   
   Sentry.init({
     dsn: 'https://xxx@sentry.io/xxx',
     environment: 'production',
     tracesSampleRate: 0.1
   });
   ```

3. **Datadog Integration**
   ```bash
   npm install dd-trace
   ```

### Database Monitoring

- Monitor query performance
- Set up alerts for high CPU
- Monitor replication lag
- Set up backup verification

### Log Aggregation

1. **ELK Stack** or **CloudWatch Logs**
2. Log all API requests
3. Log authentication events
4. Log file operations
5. Log errors and exceptions
6. Rotate logs daily
7. Archive logs for 90 days

## Security Hardening

### Network Security

- [ ] VPC with public/private subnets
- [ ] Security groups with least privilege
- [ ] WAF rules for DDoS protection
- [ ] Rate limiting on API endpoints
- [ ] CloudFlare for additional DDoS protection

### Application Security

- [ ] Enable HTTPS everywhere
- [ ] HSTS headers
- [ ] CSP (Content Security Policy)
- [ ] CORS properly configured
- [ ] Input validation and sanitization
- [ ] SQL injection prevention
- [ ] XSS protection

### Data Security

- [ ] Database encryption at rest
- [ ] Database encryption in transit
- [ ] Encrypted backups
- [ ] Encryption key rotation
- [ ] Data retention policies

### Compliance

- [ ] GDPR compliance for EU users
- [ ] CCPA compliance for CA users
- [ ] Regular security audits
- [ ] Penetration testing
- [ ] Privacy policy

## Performance Optimization

### Backend

```javascript
// Connection pooling
const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Caching
const redis = require('redis');
const client = redis.createClient({
  host: 'cache.yourdomain.com',
  port: 6379
});

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);
```

### Frontend

- [ ] Code splitting
- [ ] Lazy loading
- [ ] Image optimization
- [ ] Service workers
- [ ] Caching strategies

### Database

- [ ] Query optimization
- [ ] Index creation
- [ ] Query caching
- [ ] Connection pooling
- [ ] Read replicas

## Backup & Disaster Recovery

### Database Backups

```bash
# Automated RDS backups
# Daily snapshots to S3
# Test restore monthly
```

### File Backups

```bash
# S3 cross-region replication
# Weekly snapshots
# 30-day retention
```

### Disaster Recovery Plan

1. **RTO (Recovery Time Objective):** < 1 hour
2. **RPO (Recovery Point Objective):** < 15 minutes
3. **Runbook:** Document recovery procedures
4. **Testing:** Test restore quarterly

## Scaling Plan

### Horizontal Scaling

```
Stage 1: Single server
- All on one EC2 instance
- Single PostgreSQL instance

Stage 2: Separated services
- Frontend: S3 + CloudFront
- API: ALB + 2-3 instances
- Database: RDS with read replicas

Stage 3: Microservices
- Authentication service
- File service
- Sharing service
- Notification service
```

### Load Balancing

```
Client
  ↓
CloudFlare
  ↓
ALB (Application Load Balancer)
  ├─ API Instance 1
  ├─ API Instance 2
  └─ API Instance 3
  ↓
RDS (read replicas)
  └─ ElastiCache
```

## Maintenance

### Regular Tasks

- [ ] Review logs daily
- [ ] Monitor performance metrics
- [ ] Update dependencies monthly
- [ ] Security patches immediately
- [ ] Database optimization quarterly
- [ ] Disaster recovery testing quarterly

### Update Procedures

1. **Development:** Test updates first
2. **Staging:** Deploy to staging
3. **Canary:** Deploy to 5% of users
4. **Full Rollout:** Deploy to 100%
5. **Rollback Plan:** Ready to revert

## Cost Optimization

### AWS Costs

```
EC2: t3.medium × 2 = $60/month
RDS: db.t3.medium = $100/month
S3: ~$1/month
CloudFront: ~$20/month
ALB: $16/month
NAT: $32/month
────────────────────────
Total: ~$230/month
```

### Cost Reduction

- Use Auto Scaling Groups
- Spot instances for non-critical workloads
- Reserved instances for baseline capacity
- S3 lifecycle policies for old files
- CloudWatch log retention policies

## Migration Checklist

Before going live:

- [ ] Staging environment mirrors production
- [ ] Load testing completed
- [ ] Security audit passed
- [ ] HTTPS enabled
- [ ] Backups tested
- [ ] Monitoring configured
- [ ] Logging enabled
- [ ] Runbooks created
- [ ] Support team trained
- [ ] Incident response plan ready

## Post-Deployment

### Day 1

- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify backups running
- [ ] Test critical user flows

### Week 1

- [ ] Collect user feedback
- [ ] Monitor logs for issues
- [ ] Performance optimization
- [ ] Update documentation

### Month 1

- [ ] Security audit
- [ ] Performance analysis
- [ ] Capacity planning
- [ ] Cost review

---

**Proper deployment ensures security, reliability, and scalability.**
