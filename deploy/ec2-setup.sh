#!/usr/bin/env bash
# Run once on a fresh Ubuntu 22.04 EC2 instance.
# Usage: bash ec2-setup.sh
set -euo pipefail

REPO_DIR="$HOME/bluejay_assessment"
PDF_URL="https://files.consumerfinance.gov/f/documents/cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf"
PDF_NAME="YOUR MONEY, YOUR GOALS_ A financial empowerment toolkit - cfpb_your-money-your-goals_financial-empowerment_toolkit.pdf"

echo "==> Updating system packages"
sudo apt-get update -q
sudo apt-get install -y python3.11 python3.11-venv python3-pip git curl

echo "==> Cloning repo (skip if already present)"
if [ ! -d "$REPO_DIR" ]; then
  git clone https://github.com/govgovnahr/bluejay-assessment.git "$REPO_DIR"
fi
cd "$REPO_DIR"

echo "==> Downloading CFPB PDF"
if [ ! -f "$PDF_NAME" ]; then
  curl -L "$PDF_URL" -o "$PDF_NAME"
  echo "PDF downloaded."
else
  echo "PDF already present, skipping."
fi

echo "==> Creating Python venv"
python3.11 -m venv agent/.venv
source agent/.venv/bin/activate

echo "==> Installing Python dependencies"
pip install --upgrade pip -q
pip install -r agent/requirements.txt -q

echo "==> Copying env file (fill in .env manually after this)"
if [ ! -f agent/.env ]; then
  cp agent/.env.example agent/.env
  echo ""
  echo "  !!! ACTION REQUIRED: edit agent/.env and fill in your API keys !!!"
  echo "      nano $REPO_DIR/agent/.env"
fi

echo "==> Installing systemd service"
sudo cp deploy/quartermaster-agent.service /etc/systemd/system/
sudo sed -i "s|/home/ubuntu|$HOME|g" /etc/systemd/system/quartermaster-agent.service
sudo systemctl daemon-reload
sudo systemctl enable quartermaster-agent

echo ""
echo "==> Setup complete."
echo "    1. Fill in API keys:  nano $REPO_DIR/agent/.env"
echo "    2. Start agent:       sudo systemctl start quartermaster-agent"
echo "    3. Watch logs:        journalctl -u quartermaster-agent -f"
echo ""
echo "    The token server runs on Vercel — no HTTP port needed on this instance."
