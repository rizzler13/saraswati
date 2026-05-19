#!/usr/bin/env bash
# setup-server.sh - Provision an Oracle Cloud ARM VM
# Run this once after creating your Always Free VM.
#
# Usage: ssh ubuntu@<your-vm-ip> 'bash -s' < setup-server.sh

set -euo pipefail

echo "===================================================="
echo "  Saraswati Server Setup"
echo "===================================================="

# 1. System Updates
echo ""
echo "▸ [1/6] Updating system packages..."
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# 2. Install Docker
echo ""
echo "▸ [2/6] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "    ✓ Docker installed. You may need to log out and back in for group changes."
else
    echo "    ✓ Docker already installed."
fi

# 3. Install Docker Compose plugin
echo ""
echo "▸ [3/6] Ensuring Docker Compose plugin..."
if ! docker compose version &>/dev/null; then
    sudo apt-get install -y -qq docker-compose-plugin
fi
echo "    ✓ Docker Compose $(docker compose version --short)"

# 4. Configure firewall (iptables)
echo ""
echo "▸ [4/6] Opening firewall ports (80, 443)..."
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || true
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || true

# Persist iptables rules
if command -v netfilter-persistent &>/dev/null; then
    sudo netfilter-persistent save 2>/dev/null || true
else
    sudo apt-get install -y -qq iptables-persistent
    sudo netfilter-persistent save
fi
echo "    ✓ Ports 80 and 443 open."

# 5. Clone repository
echo ""
echo "▸ [5/6] Cloning Saraswati repository..."
REPO_DIR="$HOME/saraswati"
if [ -d "$REPO_DIR" ]; then
    echo "    ✓ Repository already exists at $REPO_DIR"
    cd "$REPO_DIR"
    git pull --ff-only origin main || true
else
    git clone https://github.com/rizzler13/saraswati.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# 6. Setup environment
echo ""
echo "▸ [6/6] Preparing environment..."
cd "$REPO_DIR/deploy"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "    Created .env from template - edit it with your domain!"
    echo "      nano $REPO_DIR/deploy/.env"
else
    echo "    ✓ .env already exists."
fi

echo ""
echo "===================================================="
echo "  Server setup complete."
echo ""
echo "  Next steps:"
echo "    1. Edit your domain:  nano ~/saraswati/deploy/.env"
echo "    2. Launch everything: cd ~/saraswati/deploy && docker compose -f docker-compose.prod.yml up -d --build"
echo "    3. View logs:         docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "  First build takes ~10-15 min (compiling C++ on ARM)."
echo "  Subsequent deploys use cached layers and are much faster."
echo "===================================================="
