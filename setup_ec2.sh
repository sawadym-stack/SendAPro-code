#!/bin/bash
set -e

echo "============================================="
echo " Starting SendAPro EC2 Server Setup"
echo "============================================="

# 1. Update system packages
echo "--> Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Install Docker & Git
echo "--> Installing Git, Docker, and Docker Compose..."
sudo apt-get install -y git curl apt-transport-https ca-certificates software-properties-common

# Install Docker GPG key and repo
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose v2
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/download/v2.24.5/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

# Add current user to docker group
sudo usermod -aG docker $USER

# 3. Install Nginx & Certbot (for free SSL/HTTPS)
echo "--> Installing Nginx and Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 4. Create Nginx config for backend api
echo "--> Configuring Nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/sendapro-backend << 'EOF'
server {
    listen 80;
    server_name api.sendapro.online; # Replace this if you use another subdomain

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the configuration and restart Nginx
sudo ln -sf /etc/nginx/sites-available/sendapro-backend /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

echo "============================================="
echo " Setup complete!"
echo " "
echo " Next Steps:"
echo " 1. Make sure your domain 'api.sendapro.online' points to this EC2 instance's IP address."
echo " 2. Run this command to enable HTTPS SSL:"
echo "    sudo certbot --nginx -d api.sendapro.online"
echo " 3. Run 'docker compose up -d' inside your project directory to start the backend!"
echo "============================================="
