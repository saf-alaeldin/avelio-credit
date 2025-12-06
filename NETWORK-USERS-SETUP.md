# Network Users - HTTPS Certificate Installation Guide

## Overview
To access the Avelio Credit application over HTTPS on your local network without security warnings, you need to install the Certificate Authority (CA) certificate on your device.

## Application URLs
- Frontend: https://192.168.7.114:3000
- Backend: https://192.168.7.114:5001

## Certificate File
The certificate file is: `avelio-localhost-ca.pem`

---

## Installation Instructions by Platform

### Windows

1. **Locate the certificate file** (`avelio-localhost-ca.pem`)
2. **Right-click** on the file and select **"Install Certificate"**
3. Select **"Local Machine"** → Click **Next**
4. You may be prompted for administrator password - enter it
5. Select **"Place all certificates in the following store"**
6. Click **Browse** → Select **"Trusted Root Certification Authorities"**
7. Click **Next** → Click **Finish**
8. You should see: "The import was successful"
9. **Restart your browser**

**Alternative method (if right-click doesn't work):**
1. Press `Win + R`, type `certmgr.msc`, press Enter
2. Navigate to **Trusted Root Certification Authorities** → **Certificates**
3. Right-click → **All Tasks** → **Import**
4. Browse to `avelio-localhost-ca.pem` and import it
5. Restart your browser

---

### macOS

1. **Locate the certificate file** (`avelio-localhost-ca.pem`)
2. **Double-click** the certificate file
3. **Keychain Access** will open
4. If prompted, select **"System"** keychain (or "login" if you don't have admin access)
5. Enter your password if prompted
6. Find the certificate in the list (it will be named "mkcert ...")
7. **Double-click** the certificate
8. Expand **"Trust"** section
9. Set **"When using this certificate"** to **"Always Trust"**
10. Close the window and enter your password again
11. **Restart your browser**

---

### Android

1. **Transfer** the `avelio-localhost-ca.pem` file to your Android device
2. Open **Settings**
3. Go to **Security** (or **Security & Location**)
4. Scroll down to **Encryption & credentials**
5. Tap **Install a certificate** (or **Install from storage**)
6. Select **CA certificate**
7. Tap **Install anyway** if warned
8. Browse to the certificate file and select it
9. Enter your PIN/password if prompted
10. The certificate is now installed
11. **Restart your browser**

**Note:** Path may vary by Android version:
- Settings → Security → Advanced → Encryption & credentials → Install a certificate

---

### iOS/iPadOS

1. **Email or AirDrop** the `avelio-localhost-ca.pem` file to your iOS device
2. **Tap** the certificate file to download it
3. Go to **Settings** → **General** → **VPN & Device Management** (or **Profiles**)
4. You should see "mkcert..." profile
5. Tap on it → Tap **Install**
6. Enter your passcode
7. Tap **Install** again (may appear multiple times)
8. Tap **Done**
9. Go to **Settings** → **General** → **About** → **Certificate Trust Settings**
10. Enable full trust for the "mkcert..." certificate (toggle it ON)
11. Tap **Continue** when warned
12. **Restart your browser**

---

### Linux

#### Ubuntu/Debian:
```bash
sudo cp avelio-localhost-ca.pem /usr/local/share/ca-certificates/avelio-localhost-ca.crt
sudo update-ca-certificates
```

#### Fedora/CentOS/RHEL:
```bash
sudo cp avelio-localhost-ca.pem /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

#### Arch Linux:
```bash
sudo cp avelio-localhost-ca.pem /etc/ca-certificates/trust-source/anchors/
sudo trust extract-compat
```

**Restart your browser after installation**

---

## Verification

After installation, visit: https://192.168.7.114:3000

✅ **Success:** You should see a secure connection (lock icon) without warnings
❌ **Still seeing warnings:** Try restarting your browser or device

---

## Troubleshooting

### Chrome/Edge still shows warning:
- Clear browser cache: Settings → Privacy → Clear browsing data
- Restart browser completely (close all windows)
- Check certificate is in "Trusted Root" store

### Firefox (uses its own certificate store):
Firefox doesn't use system certificates by default.
1. Visit https://192.168.7.114:3000
2. Click "Advanced"
3. Click "Accept the Risk and Continue"
4. Or import the certificate into Firefox:
   - Settings → Privacy & Security → Certificates → View Certificates
   - Authorities tab → Import → Select the .pem file
   - Check "Trust this CA to identify websites"

### Safari on iOS still shows warning:
- Make sure you enabled trust in: Settings → General → About → Certificate Trust Settings
- Restart Safari completely (swipe up and close it)

### Android still shows warning:
- Some apps ignore system certificates
- Try using Chrome browser specifically
- Ensure certificate is installed as "CA certificate" not "VPN & app user certificate"

---

## Security Note

⚠️ **Important:** This certificate is for **local development only**. Only install it on devices you trust and control. Do not install certificates from unknown sources.

---

## Need Help?

If you continue to experience issues:
1. Verify you're connected to the same network (192.168.7.x)
2. Check that the servers are running
3. Try accessing via IP: https://192.168.7.114:3000
4. Contact the system administrator

---

## Removing the Certificate (When No Longer Needed)

### Windows:
- Press `Win + R`, type `certmgr.msc`
- Navigate to Trusted Root Certification Authorities → Certificates
- Find "mkcert..." → Right-click → Delete

### macOS:
- Open Keychain Access
- Search for "mkcert"
- Right-click → Delete

### Android:
- Settings → Security → Encryption & credentials → User credentials
- Find and remove the certificate

### iOS:
- Settings → General → VPN & Device Management
- Select the profile → Remove Profile
