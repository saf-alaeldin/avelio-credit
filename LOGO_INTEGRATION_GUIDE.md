# Kush Air Logo Integration Guide

## 📸 Logo Requirements

To complete the Kush Air branding, you need to add the company logo to the system.

### Logo Specifications

**Recommended formats:**
- PNG with transparent background (preferred)
- SVG for scalability
- Minimum resolution: 500x500px
- Aspect ratio: Square or horizontal (max 2:1)

**File sizes:**
- Login page logo: ~200KB max
- Dashboard logo: ~100KB max
- Favicon: 32x32px, 48x48px, 192x192px

---

## 📁 Step 1: Prepare Logo Files

Create these versions of your Kush Air logo:

1. **kushair-logo.png** - Main logo (transparent PNG, ~500x200px)
2. **kushair-logo-square.png** - Square version for avatar/icon (500x500px)
3. **favicon.ico** - Browser tab icon (32x32px)
4. **logo192.png** - PWA icon (192x192px)
5. **logo512.png** - PWA icon (512x512px)

---

## 📂 Step 2: Add Logo Files to Project

### Frontend Logos (React App)

```bash
cd /Users/mohamedsaeed/Documents/avelio-credit/avelio-frontend

# Create public/images directory
mkdir -p public/images

# Copy your logo files:
# Place these files in: public/images/
# - kushair-logo.png
# - kushair-logo-square.png

# Replace favicons in public/
# - favicon.ico
# - logo192.png
# - logo512.png
```

---

## 🔧 Step 3: Update Code to Use Logo

### A. Login Page Logo

Edit: `avelio-frontend/src/pages/Login.js`

**Find this section (around line 76-82):**
```javascript
<div className="login-logo">
  <div className="logo-icon">
    <Plane size={36} />
  </div>
  <h1 className="login-title">Kush Air</h1>
  <p className="login-subtitle">Credit Management System</p>
</div>
```

**Replace with:**
```javascript
<div className="login-logo">
  <div className="logo-icon">
    <img
      src="/images/kushair-logo.png"
      alt="Kush Air Logo"
      style={{ width: '180px', height: 'auto' }}
    />
  </div>
  <h1 className="login-title">Kush Air</h1>
  <p className="login-subtitle">Credit Management System</p>
</div>
```

### B. Dashboard/Header Logo

Edit: `avelio-frontend/src/pages/AppHeader.js`

**Find this section (around line 42-48):**
```javascript
<Link to="/dashboard" className="brand-link" aria-label="Go to Dashboard">
  <div className="brand-logo"><Plane size={20} color="white" /></div>
  <div className="brand-text">
    <span className="brand-title">Kush Air</span>
    <span className="brand-subtitle">Credit Management</span>
  </div>
</Link>
```

**Replace with:**
```javascript
<Link to="/dashboard" className="brand-link" aria-label="Go to Dashboard">
  <div className="brand-logo">
    <img
      src="/images/kushair-logo-square.png"
      alt="KU"
      style={{ width: '24px', height: '24px', borderRadius: '4px' }}
    />
  </div>
  <div className="brand-text">
    <span className="brand-title">Kush Air</span>
    <span className="brand-subtitle">Credit Management</span>
  </div>
</Link>
```

### C. PDF Receipt Logo (Optional)

If you want the logo in PDF receipts:

1. Convert your logo to base64:
   ```bash
   base64 -i kushair-logo.png -o kushair-logo-base64.txt
   ```

2. Update receipt generation in `avelio-backend/src/controllers/receiptController.js`:
   ```javascript
   // After line 223, add:
   company_logo: 'data:image/png;base64,YOUR_BASE64_STRING_HERE'
   ```

---

## 🎨 Step 4: Update Login Page Styling (Optional)

To better accommodate the logo, you might want to adjust the login CSS:

Edit: `avelio-frontend/src/pages/Login.css`

```css
.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: transparent; /* Remove background if logo has one */
}

.logo-icon img {
  max-width: 200px;
  height: auto;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1));
}
```

---

## 🧪 Step 5: Test the Logo

1. **Start the application:**
   ```bash
   cd /Users/mohamedsaeed/Documents/avelio-credit
   npm run start:network
   ```

2. **Check these locations:**
   - ✅ Browser tab (favicon)
   - ✅ Login page (main logo)
   - ✅ Dashboard header (compact logo)
   - ✅ Mobile home screen icon (if saved as PWA)

3. **Clear browser cache:**
   - Press `Cmd+Shift+R` to see logo changes

---

## 📱 Step 6: Update PWA Manifest

Edit: `avelio-frontend/public/manifest.json`

```json
{
  "short_name": "Kush Air Credit",
  "name": "Kush Air Credit Management System",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": ".",
  "display": "standalone",
  "theme_color": "#0EA5E9",
  "background_color": "#ffffff"
}
```

---

## 🎯 Quick Checklist

- [ ] Prepared logo files (PNG, square version, favicons)
- [ ] Created `public/images/` directory
- [ ] Copied logo files to `public/images/`
- [ ] Replaced favicon.ico, logo192.png, logo512.png
- [ ] Updated Login.js to use logo image
- [ ] Updated AppHeader.js to use logo image
- [ ] Updated manifest.json with Kush Air name
- [ ] Tested on login page
- [ ] Tested on dashboard header
- [ ] Cleared browser cache and verified
- [ ] Tested on mobile (if applicable)

---

## 🆘 Troubleshooting

### Logo not showing?
1. Check file path is correct: `/images/kushair-logo.png`
2. Verify file exists in `public/images/` folder
3. Clear browser cache with `Cmd+Shift+R`
4. Check browser console (F12) for 404 errors
5. Restart the dev server

### Logo too big/small?
Adjust the `width` and `height` in the style prop:
```javascript
style={{ width: '180px', height: 'auto' }}
```

### Logo quality poor?
- Use higher resolution PNG (at least 500px width)
- Consider using SVG format for perfect scaling
- Ensure logo has transparent background

---

## 📞 Logo Design Tips

If you need to create logo files:

**Tools:**
- **Canva** - Easy online tool
- **Figma** - Professional design
- **Adobe Express** - Quick logo maker

**For Kush Air:**
- Use airline industry colors (sky blue, white)
- Include "KU" IATA code if possible
- Keep it simple and recognizable
- Ensure readability at small sizes

---

## ✅ After Adding Logo

Once logo is added, restart the application:
```bash
# Stop servers (Ctrl+C)
cd /Users/mohamedsaeed/Documents/avelio-credit
npm run start:network
```

The Kush Air branding will be complete! 🎉
