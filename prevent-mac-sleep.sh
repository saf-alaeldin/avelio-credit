#!/bin/bash

###############################################################################
# Prevent Mac Sleep - Keep Network Services Running
# This script configures macOS to prevent sleep while servers are running
###############################################################################

echo "=============================================="
echo "  Kush Air - Prevent Mac Sleep Configuration"
echo "=============================================="
echo ""

# Function to check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "⚠️  This script needs administrator privileges."
        echo "Please run with: sudo ./prevent-mac-sleep.sh"
        exit 1
    fi
}

# Function to configure power management
configure_power_settings() {
    echo "📝 Configuring Power Management Settings..."
    echo ""

    # Prevent system sleep while powered (AC power)
    echo "✓ Disabling system sleep on AC power..."
    pmset -c sleep 0
    pmset -c disksleep 0
    pmset -c displaysleep 15  # Display can sleep after 15 minutes

    # Prevent system sleep on battery
    echo "✓ Setting battery sleep to 30 minutes (optional)..."
    pmset -b sleep 30
    pmset -b disksleep 10
    pmset -b displaysleep 10

    # Enable Wake for network access
    echo "✓ Enabling Wake for network access..."
    pmset -a womp 1

    # Prevent sleep when external clients are connected
    echo "✓ Preventing sleep during network activity..."
    pmset -a ttyskeepawake 1
    pmset -a tcpkeepalive 1

    # Disable automatic power off
    echo "✓ Disabling automatic power off..."
    pmset -a autopoweroff 0
    pmset -a standby 0

    echo ""
    echo "✅ Power management configured successfully!"
}

# Function to show current power settings
show_current_settings() {
    echo ""
    echo "📊 Current Power Management Settings:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    pmset -g
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Function to create caffeinate helper script
create_caffeinate_script() {
    echo ""
    echo "📝 Creating caffeinate helper script..."

    cat > /usr/local/bin/kushair-keepawake << 'EOF'
#!/bin/bash
# Keep Mac awake while Kush Air servers are running
echo "☕ Keeping Mac awake for Kush Air servers..."
echo "Press Ctrl+C to stop"
caffeinate -dims
EOF

    chmod +x /usr/local/bin/kushair-keepawake
    echo "✅ Created: /usr/local/bin/kushair-keepawake"
}

# Function to create launch daemon to keep awake
create_launch_daemon() {
    echo ""
    echo "📝 Creating LaunchDaemon to prevent sleep..."

    cat > /Library/LaunchDaemons/net.kushair.keepawake.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>net.kushair.keepawake</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/caffeinate</string>
        <string>-s</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/kushair-keepawake.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/kushair-keepawake.error.log</string>
</dict>
</plist>
EOF

    # Set correct permissions
    chmod 644 /Library/LaunchDaemons/net.kushair.keepawake.plist
    chown root:wheel /Library/LaunchDaemons/net.kushair.keepawake.plist

    # Load the daemon
    launchctl load /Library/LaunchDaemons/net.kushair.keepawake.plist

    echo "✅ LaunchDaemon created and loaded"
}

# Main execution
main() {
    check_root

    echo "This script will:"
    echo "  1. Configure power management to prevent sleep on AC power"
    echo "  2. Enable wake for network access"
    echo "  3. Create helper scripts to keep Mac awake"
    echo "  4. Create a launch daemon for automatic keep-awake"
    echo ""
    read -p "Continue? (y/n): " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Configuration cancelled"
        exit 0
    fi

    configure_power_settings
    create_caffeinate_script
    create_launch_daemon
    show_current_settings

    echo ""
    echo "=============================================="
    echo "✅ Configuration Complete!"
    echo "=============================================="
    echo ""
    echo "📌 Next Steps:"
    echo ""
    echo "1. Your Mac will no longer sleep while on AC power"
    echo "2. Display can still sleep to save energy"
    echo "3. A background service keeps the system awake"
    echo ""
    echo "⚠️  Important Notes:"
    echo "   • Keep your Mac plugged in to AC power for best results"
    echo "   • Network services will remain accessible even with display off"
    echo "   • To manually keep awake, run: kushair-keepawake"
    echo ""
    echo "🔧 To restore original sleep settings later:"
    echo "   sudo launchctl unload /Library/LaunchDaemons/net.kushair.keepawake.plist"
    echo "   sudo rm /Library/LaunchDaemons/net.kushair.keepawake.plist"
    echo "   sudo pmset -c sleep 10  # Restore default"
    echo ""
    echo "✅ Your Kush Air system should now stay accessible on the network!"
    echo "=============================================="
}

main
