#!/usr/bin/env bash
# Prepares a fresh Hetzner Cloud server (Ubuntu 24.04) – O-03, O-04, S-05. Run once as root.
set -euo pipefail

# Automatic security updates (O-04)
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y unattended-upgrades ca-certificates curl gnupg git
dpkg-reconfigure -f noninteractive unattended-upgrades

# SSH only with keys, no password login (O-03)
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?KbdInteractiveAuthentication .*/KbdInteractiveAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
systemctl reload ssh

# Docker Engine + Compose plugin
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Logs: journald, kept 30 days (S-05)
mkdir -p /etc/systemd/journald.conf.d
printf "[Journal]\nMaxRetentionSec=30day\nSystemMaxUse=1G\n" > /etc/systemd/journald.conf.d/retention.conf
systemctl restart systemd-journald

echo "Done. Configure the Hetzner Cloud Firewall: inbound only TCP 22, 80, 443 and UDP 443."
