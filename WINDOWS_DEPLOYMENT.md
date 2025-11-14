# Windows Network Deployment Guide
## Kush Air Credit Management System

Complete guide for deploying the system on a Windows PC for local network access.

---

## 📋 Prerequisites

### Required Software

1. **Node.js (LTS version)**
   - Download: https://nodejs.org/
   - Choose: "Recommended For Most Users" (LTS)
   - Install with default settings
   - Verify: Open Command Prompt and run `node --version`

2. **PostgreSQL 16 or later**
   - Download: https://www.postgresql.org/download/windows/
   - During installation:
     - **IMPORTANT**: Remember the password for 'postgres' user
     - Keep default port: 5432
     - Install pgAdmin 4 (GUI tool)
     - Install Command Line Tools
   - Verify: Open Command Prompt and run `psql --version`

3. **Git (Optional - for updates)**
   - Download: https://git-scm.com/download/win
   - Install with default settings

### System Requirements

- Windows 10 or Windows 11
- 4GB RAM minimum (8GB recommended)
- 2GB free disk space
- Network adapter (WiFi or Ethernet)
- Administrator access

---

## 🚀 Installation Steps

### Step 1: Download the Project

**Option A: Using Git (Recommended)**
```cmd
cd C:\
git clone https://github.com/mohamedsaeedm7-rgb/avelio-credit.git
cd avelio-credit
```

**Option B: Download ZIP**
1. Download the project ZIP file
2. Extract to `C:\avelio-credit`
3. Open Command Prompt as Administrator
4. Run: `cd C:\avelio-credit`

### Step 2: Run Automated Setup

Right-click `setup-windows.bat` and select **"Run as administrator"**

This script will:
- ✓ Check if Node.js and PostgreSQL are installed
- ✓ Install all project dependencies
- ✓ Get your Windows IP address
- ✓ Create environment configuration files
- ✓ Configure Windows Firewall rules

**IMPORTANT**: After the script completes, you need to:

1. **Edit the backend .env file**:
   - Open: `C:\avelio-credit\avelio-backend\.env`
   - Find line: `DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE`
   - Replace with your actual PostgreSQL password
   - Save the file

### Step 3: Create Database

**Option A: Using pgAdmin 4 (GUI)**
1. Open pgAdmin 4
2. Connect to PostgreSQL (enter your password)
3. Right-click "Databases"
4. Click "Create" → "Database"
5. Name: `avelio_db`
6. Click "Save"

**Option B: Using Command Line**
```cmd
psql -U postgres -c "CREATE DATABASE avelio_db;"
```

### Step 4: Initialize Database Schema

```cmd
cd C:\avelio-credit\avelio-backend
psql -U postgres -d avelio_db -f schema.sql
```

Enter your PostgreSQL password when prompted.

### Step 5: Create Users

```cmd
cd C:\avelio-credit\avelio-backend
node setup-kushair-production.js
```

When prompted, type `YES` to confirm.

This creates:
- **Admin**: mohamed.saeed / KushAir@2025
- **Staff**: asami / asami
- **Staff**: sarah.lado / KushAir@2025

### Step 6: Start the System

Double-click: `start-network.bat`

Two windows will open:
1. **Backend Server** (Port 5001)
2. **Frontend Server** (Port 3000)

Wait for both to show "Server running" messages.

---

## 🌐 Accessing the System

### From the Windows PC

Open browser and go to:
```
http://localhost:3000
```

### From Other Devices (Phone, Tablet, Other PCs)

1. Find your Windows PC's IP address (shown when you run `start-network.bat`)
2. Make sure all devices are on the **same WiFi network**
3. Open browser on the other device
4. Go to: `http://YOUR_WINDOWS_IP:3000`

Example: `http://192.168.1.100:3000`

---

## 🔥 Windows Firewall Configuration

The setup script automatically adds firewall rules, but if you have issues:

### Manual Firewall Configuration

1. Open **Windows Defender Firewall**
2. Click **Advanced settings**
3. Click **Inbound Rules** → **New Rule**
4. Select **Port** → Click **Next**
5. Select **TCP** and enter port: **3000**
6. Select **Allow the connection**
7. Apply to all profiles (Domain, Private, Public)
8. Name it: **Kush Air Frontend**
9. Repeat steps 3-8 for port **5001** (name: **Kush Air Backend**)

### Quick Command (Run as Administrator)

```cmd
netsh advfirewall firewall add rule name="Kush Air Frontend" dir=in action=allow protocol=TCP localport=3000
netsh advfirewall firewall add rule name="Kush Air Backend" dir=in action=allow protocol=TCP localport=5001
```

---

## 🛠️ Common Issues & Solutions

### Issue 1: "Node.js is not installed"

**Solution**:
1. Download Node.js from https://nodejs.org/
2. Install and restart Command Prompt
3. Run setup again

### Issue 2: "PostgreSQL is not installed"

**Solution**:
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. During installation, remember the password!
3. Add PostgreSQL to PATH:
   - Default location: `C:\Program Files\PostgreSQL\16\bin`
   - Add to System Environment Variables
4. Restart Command Prompt

### Issue 3: "Cannot connect to database"

**Solutions**:

A. **Check PostgreSQL is running**:
   - Open **Services** (Windows + R, type `services.msc`)
   - Find **postgresql-x64-16** (or similar)
   - Make sure it's **Running**
   - If not, right-click → **Start**

B. **Verify password in .env file**:
   - Open `avelio-backend\.env`
   - Check `DB_PASSWORD` matches your PostgreSQL password

C. **Test connection**:
   ```cmd
   psql -U postgres -d avelio_db
   ```

### Issue 4: "Port 3000 already in use"

**Solution**:
```cmd
REM Find what's using port 3000
netstat -ano | findstr :3000

REM Kill the process (replace PID with actual number)
taskkill /F /PID <PID>
```

### Issue 5: "Cannot access from other devices"

**Checklist**:
- [ ] All devices on same WiFi network
- [ ] Windows Firewall rules added (ports 3000 and 5001)
- [ ] Antivirus not blocking connections
- [ ] Using correct IP address (check with `ipconfig`)
- [ ] Servers are running (check the server windows)

**Test connection**:
```cmd
REM From another device, ping the Windows PC
ping YOUR_WINDOWS_IP

REM From Windows PC, test if ports are listening
netstat -an | findstr :3000
netstat -an | findstr :5001
```

### Issue 6: "Module not found" errors

**Solution**:
```cmd
REM Delete node_modules and reinstall
cd C:\avelio-credit
rmdir /s /q node_modules
rmdir /s /q avelio-backend\node_modules
rmdir /s /q avelio-frontend\node_modules

REM Run setup again
setup-windows.bat
```

### Issue 7: Slow Performance

**Solutions**:

A. **Optimize PostgreSQL**:
   ```cmd
   psql -U postgres -d avelio_db -c "VACUUM ANALYZE;"
   ```

B. **Check Windows Defender**:
   - Add folder to exclusions: `C:\avelio-credit`
   - Settings → Virus & threat protection → Exclusions

C. **Disable unnecessary services**:
   - Close other applications
   - Check Task Manager for high CPU/Memory usage

---

## 🔄 Updating the System

### Pull Latest Changes (if using Git)

```cmd
cd C:\avelio-credit
git pull origin main

REM Reinstall dependencies
npm run install:all

REM Restart servers
stop-servers.bat
start-network.bat
```

### Manual Update

1. Download latest version
2. Replace files (keep `.env` files)
3. Run: `npm run install:all`
4. Restart servers

---

## 📊 Monitoring & Maintenance

### Check Server Status

```cmd
REM Check if Node.js processes are running
tasklist | findstr node.exe

REM Check port usage
netstat -an | findstr :3000
netstat -an | findstr :5001
```

### View Logs

Server logs appear in the terminal windows that open when you run `start-network.bat`.

### Database Maintenance

Run weekly:
```cmd
psql -U postgres -d avelio_db -c "VACUUM ANALYZE;"
```

### Backup Database

```cmd
REM Create backup
pg_dump -U postgres -d avelio_db > backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql

REM Restore from backup
psql -U postgres -d avelio_db < backup_20250113.sql
```

---

## 🔐 Security Considerations

### For Production Use

1. **Change default passwords**:
   - PostgreSQL 'postgres' user
   - All application users
   - JWT_SECRET in .env

2. **Configure HTTPS**:
   - Use nginx or Apache as reverse proxy
   - Install SSL certificate

3. **Firewall rules**:
   - Only allow specific IP ranges
   - Block external access if not needed

4. **Regular backups**:
   - Database backups
   - Configuration files

5. **Keep updated**:
   - Node.js security patches
   - PostgreSQL updates
   - Dependencies: `npm audit fix`

---

## 📞 Getting Help

### Check Logs

- **Backend logs**: Check the "Kush Air - Backend" window
- **Frontend logs**: Check the "Kush Air - Frontend" window
- **PostgreSQL logs**: `C:\Program Files\PostgreSQL\16\data\log\`

### Common Commands

```cmd
REM Get your IP address
ipconfig

REM Test database connection
psql -U postgres -d avelio_db

REM Check Node.js version
node --version

REM Check npm version
npm --version

REM Check PostgreSQL version
psql --version

REM List running Node processes
tasklist | findstr node

REM Kill all Node processes
taskkill /F /IM node.exe
```

---

## 📁 Project Structure

```
C:\avelio-credit\
├── avelio-backend\          # Backend Node.js server
│   ├── .env                 # Backend configuration (edit this!)
│   ├── schema.sql           # Database schema
│   ├── setup-kushair-production.js
│   └── src\
├── avelio-frontend\         # Frontend React app
│   ├── .env                 # Frontend configuration
│   └── src\
├── setup-windows.bat        # Automated setup script
├── start-network.bat        # Start servers
├── stop-servers.bat         # Stop servers
└── WINDOWS_DEPLOYMENT.md    # This file
```

---

## ✅ Quick Start Checklist

- [ ] Node.js installed
- [ ] PostgreSQL installed
- [ ] Project downloaded/cloned
- [ ] Ran `setup-windows.bat` as Administrator
- [ ] Edited `avelio-backend\.env` with PostgreSQL password
- [ ] Created database `avelio_db`
- [ ] Ran `schema.sql`
- [ ] Ran `setup-kushair-production.js`
- [ ] Added Windows Firewall rules
- [ ] Started servers with `start-network.bat`
- [ ] Tested access from browser
- [ ] Tested access from another device

---

## 🎯 Access URLs

| Service | From Windows PC | From Network |
|---------|----------------|--------------|
| Frontend | http://localhost:3000 | http://YOUR_IP:3000 |
| Backend API | http://localhost:5001 | http://YOUR_IP:5001 |
| Database | localhost:5432 | Not accessible from network (security) |

---

**Last Updated**: 2025-01-13
**System**: Kush Air Credit Management System
**Version**: 1.0.0
**Platform**: Windows 10/11
