# Mac Sleep Issue - Fix Network Accessibility

## Problem
When your Mac goes to sleep or is inactive for several minutes, network users cannot access the Kush Air system at `http://192.168.7.114:3000`.

## Why This Happens
macOS automatically puts the computer to sleep after a period of inactivity to save energy. When the Mac sleeps:
- Network services stop responding
- The servers (frontend/backend) become unreachable
- Network users get connection timeout errors

## Solution Options

### Option 1: Automated Fix (Recommended)
Run the automated script that configures everything for you:

```bash
cd /home/user/avelio-credit
chmod +x prevent-mac-sleep.sh
sudo ./prevent-mac-sleep.sh
```

This script will:
- ✅ Disable system sleep when plugged into AC power
- ✅ Keep display sleep enabled (saves energy, screen can turn off)
- ✅ Enable "Wake for network access"
- ✅ Create a background service to keep Mac awake
- ✅ Configure TCP keep-alive for network connections

### Option 2: Manual System Preferences Configuration

#### Step 1: Configure Energy Saver Settings

1. **Open System Preferences**
   - Click the Apple menu () → System Preferences
   - Click "Battery" or "Energy Saver" (depending on macOS version)

2. **For Power Adapter (AC Power)**
   - Select "Power Adapter" tab
   - Set "Turn display off after" to 15 minutes or "Never"
   - Set "Prevent your Mac from automatically sleeping when the display is off" to **CHECKED**
   - Set "Put hard disks to sleep when possible" to **UNCHECKED**
   - Set "Wake for network access" to **CHECKED**

3. **For Battery (Optional)**
   - Select "Battery" tab
   - Set sleep to 30 minutes or longer
   - This allows sleep on battery to save power when not plugged in

#### Step 2: Use Terminal Commands

```bash
# Disable sleep on AC power
sudo pmset -c sleep 0
sudo pmset -c disksleep 0

# Keep display sleep enabled
sudo pmset -c displaysleep 15

# Enable wake for network access
sudo pmset -a womp 1

# Enable TCP keep-alive
sudo pmset -a tcpkeepalive 1

# Check current settings
pmset -g
```

### Option 3: Use Caffeinate While Servers Run

Keep your Mac awake while the servers are running:

```bash
# Open a new terminal window and run:
caffeinate -dims

# This keeps the Mac awake until you press Ctrl+C
# -d: prevent display sleep
# -i: prevent idle sleep
# -m: prevent disk sleep
# -s: prevent system sleep
```

Or use it with your server start script:

```bash
# Run servers with caffeinate
caffeinate -dims npm start
```

### Option 4: Third-Party Apps

Consider these free apps to prevent sleep:
- **Amphetamine** (Mac App Store) - Highly recommended, lots of control
- **KeepingYouAwake** (GitHub) - Simple, lightweight

## Recommended Solution for Server Deployment

For a Mac acting as a network server, use **Option 1** (Automated Fix) because it:
- ✅ Keeps network services running 24/7
- ✅ Allows display to sleep (saves energy)
- ✅ Automatically starts on boot
- ✅ Optimized for server use case
- ✅ Still allows battery sleep when unplugged

## Quick Fix (Temporary)

If you need immediate access and don't want to configure settings:

```bash
# In a terminal, run this and leave it running:
caffeinate -s

# Or even simpler:
pmset noidle
```

## Verification

After applying any fix, test it:

1. **Start your servers**:
   ```bash
   cd /home/user/avelio-credit
   ./start-all.sh
   ```

2. **From a network device**, access:
   - http://192.168.7.114:3000

3. **Wait 10 minutes** without using your Mac

4. **Check network access again** - it should still work!

## Additional Tips

### For Long-Term Deployment:

1. **Keep Mac Plugged In**
   - Always keep the Mac connected to AC power
   - This ensures the "no sleep on AC" settings work

2. **Disable Automatic Updates During Work Hours**
   - System Preferences → Software Update
   - Uncheck "Automatically keep my Mac up to date"
   - Schedule updates manually during off-hours

3. **Enable Auto-Start on Power Failure**
   - System Preferences → Energy Saver
   - Check "Start up automatically after a power failure"

4. **Consider UPS (Uninterruptible Power Supply)**
   - Protects against power outages
   - Keeps servers running during brief power loss

### Monitor System Status:

```bash
# Check if Mac is preventing sleep:
pmset -g assertions

# Check power settings:
pmset -g

# Check if caffeinate is running:
ps aux | grep caffeinate

# Check if LaunchDaemon is running:
sudo launchctl list | grep kushair
```

## Troubleshooting

### Problem: Mac still sleeps even after configuration

**Solution 1**: Check if settings were applied correctly
```bash
pmset -g
# Look for "sleep 0" under "AC Power"
```

**Solution 2**: Reload the launch daemon
```bash
sudo launchctl unload /Library/LaunchDaemons/net.kushair.keepawake.plist
sudo launchctl load /Library/LaunchDaemons/net.kushair.keepawake.plist
```

**Solution 3**: Run caffeinate manually
```bash
caffeinate -s &
```

### Problem: Display turns off and network stops

This shouldn't happen with correct configuration, but if it does:

```bash
# Allow display sleep but keep network awake:
sudo pmset -c displaysleep 15
sudo pmset -c sleep 0
sudo pmset -c networkoversleep 1
```

### Problem: Settings reset after macOS update

After major macOS updates, settings may reset. Re-run the script:

```bash
sudo ./prevent-mac-sleep.sh
```

## Restore Original Settings

If you want to restore default sleep behavior:

```bash
# Remove the launch daemon
sudo launchctl unload /Library/LaunchDaemons/net.kushair.keepawake.plist
sudo rm /Library/LaunchDaemons/net.kushair.keepawake.plist

# Restore default power settings
sudo pmset -c sleep 10
sudo pmset -c displaysleep 10
sudo pmset -c disksleep 10

# Verify
pmset -g
```

## Summary

**For a Mac server hosting Kush Air on the network:**

1. ✅ Run `sudo ./prevent-mac-sleep.sh`
2. ✅ Keep Mac plugged into AC power
3. ✅ Verify network access after 10 minutes of inactivity
4. ✅ Consider using a UPS for power reliability

Your network users should now be able to access the system 24/7 without interruption!
