# 🚀 Avelio Credit - Local Network Deployment Guide

## Network Information
- **Network IP**: `192.168.7.114`
- **Frontend URL**: `http://192.168.7.114:3000`
- **Backend API**: `http://192.168.7.114:5001`

---

## 📋 Pre-Deployment Checklist

### 1. System Requirements
- [ ] Node.js (v14 or higher) installed
- [ ] PostgreSQL database running
- [ ] Port 3000 (frontend) available
- [ ] Port 5001 (backend) available
- [ ] Network connectivity to `192.168.7.114`

### 2. Database Setup
- [ ] PostgreSQL is running
- [ ] Database `avelio_db` created
- [ ] Database tables created (from schema.sql)
- [ ] Database credentials configured in `.env`

---

## 🔧 Step-by-Step Deployment

### Step 1: Update Database Password

**IMPORTANT:** Update the database password in the backend .env file!

```bash
cd /home/user/avelio-credit/avelio-backend
nano .env
```

Change this line to your actual PostgreSQL password:
```
DB_PASSWORD=your_actual_password_here
```

Save and exit (Ctrl+O, Enter, Ctrl+X)

### Step 2: Install Dependencies

```bash
# Backend dependencies
cd /home/user/avelio-credit/avelio-backend
npm install

# Frontend dependencies
cd /home/user/avelio-credit/avelio-frontend
npm install
```

### Step 3: Create Users

```bash
cd /home/user/avelio-credit/avelio-backend
node seed-users-deployment.js
```

This will create:
1. **Mohamed Saeed** - Admin (full access)
2. **Ahmed Sami** - Staff (can view/create receipts and dashboard)
3. **Sarah Lado** - Staff (can view/create receipts and dashboard)

**Save the credentials displayed!**

### Step 4: Start Backend Server

```bash
cd /home/user/avelio-credit/avelio-backend
npm start
```

You should see:
```
🚀 Avelio Credit-Lite API Server
✅ Server running on: http://0.0.0.0:5001
✅ Local access: http://localhost:5001
✅ Network access: http://192.168.7.114:5001
```

**Keep this terminal window open!**

### Step 5: Start Frontend Server (in a new terminal)

```bash
cd /home/user/avelio-credit/avelio-frontend
PORT=3000 HOST=0.0.0.0 npm start
```

You should see:
```
On Your Network: http://192.168.7.114:3000
```

**Keep this terminal window open too!**

---

## 👥 User Accounts

### Admin User
- **Name**: Mohamed Saeed
- **Email**: `mohamed.saeed@avelio.com`
- **Password**: `Mohamed@123`
- **Role**: Admin
- **Permissions**:
  - ✅ View Dashboard
  - ✅ Create Receipts
  - ✅ View All Receipts (all users)
  - ✅ Edit Receipts
  - ✅ Void Receipts
  - ✅ Manage Agencies
  - ✅ View Analytics
  - ✅ Export Data

### Staff User - Ahmed Sami
- **Name**: Ahmed Sami
- **Email**: `ahmed.sami@avelio.com`
- **Password**: `Ahmed@123`
- **Role**: Staff
- **Permissions**:
  - ✅ View Dashboard (own receipts)
  - ✅ Create Receipts
  - ✅ View Own Receipts only
  - ✅ Download PDF receipts
  - ❌ Cannot edit or void receipts
  - ❌ Cannot manage agencies

### Staff User - Sarah Lado
- **Name**: Sarah Lado
- **Email**: `sarah.lado@avelio.com`
- **Password**: `Sarah@123`
- **Role**: Staff
- **Permissions**:
  - ✅ View Dashboard (own receipts)
  - ✅ Create Receipts
  - ✅ View Own Receipts only
  - ✅ Download PDF receipts
  - ❌ Cannot edit or void receipts
  - ❌ Cannot manage agencies

---

## 🧪 Testing the Deployment

### Test 1: Health Check
```bash
curl http://192.168.7.114:5001/health
```

Expected response:
```json
{
  "success": true,
  "message": "Avelio API is running!",
  "timestamp": "2025-11-13T10:00:00.000Z"
}
```

### Test 2: Frontend Access
Open a browser and navigate to:
```
http://192.168.7.114:3000
```

You should see the login page.

### Test 3: Login Test
Try logging in with Mohamed Saeed's credentials:
- Email: `mohamed.saeed@avelio.com`
- Password: `Mohamed@123`

### Test 4: Network Access from Another Device
1. From another computer/phone on the same network
2. Open browser
3. Navigate to `http://192.168.7.114:3000`
4. Try logging in

---

## 🔐 Security Recommendations

### Immediate Actions:
1. ✅ Change the `JWT_SECRET` in `.env` to a unique random string
2. ✅ Update the database password to a strong password
3. ✅ Ask all users to change their passwords after first login

### Password Requirements:
- Minimum 8 characters
- Include uppercase and lowercase letters
- Include numbers
- Include special characters (@, #, $, etc.)

### Network Security:
- The application is accessible to anyone on your local network
- Consider using firewall rules if needed
- Monitor access logs regularly

---

## 🐛 Troubleshooting

### Issue: Cannot access from network
**Solution:**
```bash
# Check if ports are open
sudo ufw status
sudo ufw allow 3000
sudo ufw allow 5001

# Check if server is listening on 0.0.0.0
netstat -tuln | grep :3000
netstat -tuln | grep :5001
```

### Issue: Database connection failed
**Solution:**
1. Check PostgreSQL is running: `sudo systemctl status postgresql`
2. Verify database exists: `psql -U postgres -l`
3. Check .env file has correct credentials
4. Test connection: `psql -U postgres -d avelio_db`

### Issue: CORS errors in browser
**Solution:**
Check backend `.env` has correct `FRONTEND_URL`:
```
FRONTEND_URL=http://192.168.7.114:3000
```

### Issue: "Cannot GET /" on frontend
**Solution:**
Make sure frontend is built and running:
```bash
cd /home/user/avelio-credit/avelio-frontend
npm start
```

---

## 📊 Monitoring

### Check Backend Logs
```bash
cd /home/user/avelio-credit/avelio-backend
tail -f logs/combined.log
```

### Check Active Users
```bash
cd /home/user/avelio-credit/avelio-backend
psql -U postgres -d avelio_db -c "SELECT name, email, role, is_active FROM users;"
```

### Check Recent Receipts
```bash
psql -U postgres -d avelio_db -c "SELECT receipt_number, agency_id, amount, status, created_at FROM receipts ORDER BY created_at DESC LIMIT 10;"
```

---

## 🔄 Stopping the Application

### Stop Backend:
In the backend terminal, press `Ctrl+C`

### Stop Frontend:
In the frontend terminal, press `Ctrl+C`

---

## 📱 Access URLs Summary

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | `http://192.168.7.114:3000` | Main application |
| Backend API | `http://192.168.7.114:5001` | API server |
| Health Check | `http://192.168.7.114:5001/health` | Server status |
| API Info | `http://192.168.7.114:5001/api/v1` | API version |

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review backend logs: `tail -f avelio-backend/logs/combined.log`
3. Check browser console for frontend errors (F12 → Console)
4. Verify all services are running

---

## ✅ Post-Deployment Checklist

- [ ] Backend server is running
- [ ] Frontend server is running
- [ ] All 3 users can log in successfully
- [ ] Dashboard displays correctly
- [ ] Receipts can be created
- [ ] PDF generation works
- [ ] Network access works from other devices
- [ ] All users changed their default passwords
- [ ] Database backups configured (recommended)

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Verified By**: _______________

---

🎉 **Congratulations! Your Avelio Credit system is now deployed on the local network!**
