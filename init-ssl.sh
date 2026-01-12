#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="dispatcher-tool.stigri.work"
EMAIL="your-email@example.com"
CERTBOT_DIR="./letsencrypt"
CERTBOT_WEBROOT="./nginx/certbot"

# Display usage
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: ./init-ssl.sh [DOMAIN] [EMAIL]"
    echo "Example: ./init-ssl.sh dispatcher-tool.stigri.work admin@example.com"
    echo ""
    echo "Default values:"
    echo "  DOMAIN: $DOMAIN"
    echo "  EMAIL: $EMAIL"
    exit 0
fi

# Override defaults with arguments
if [ -n "$1" ]; then
    DOMAIN="$1"
fi
if [ -n "$2" ]; then
    EMAIL="$2"
fi

echo -e "${YELLOW}=== Let's Encrypt SSL Certificate Setup ===${NC}"
echo -e "${YELLOW}Domain: $DOMAIN${NC}"
echo -e "${YELLOW}Email: $EMAIL${NC}"

# Create necessary directories
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p "$CERTBOT_DIR"
mkdir -p "$CERTBOT_WEBROOT"

# Start nginx for certbot validation
echo -e "${YELLOW}Starting nginx for certificate validation...${NC}"
docker-compose up -d nginx

# Wait for nginx to be ready
echo -e "${YELLOW}Waiting for nginx to be ready...${NC}"
sleep 5

# Get SSL certificate from Let's Encrypt
echo -e "${YELLOW}Requesting SSL certificate from Let's Encrypt...${NC}"
docker-compose run --rm certbot certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    -d "$DOMAIN"

# Check if certificate was created successfully
if [ -f "$CERTBOT_DIR/live/$DOMAIN/fullchain.pem" ]; then
    echo -e "${GREEN}✓ SSL certificate created successfully!${NC}"
    echo -e "${GREEN}✓ Certificate location: $CERTBOT_DIR/live/$DOMAIN/${NC}"
    
    # Set proper permissions
    chmod -R 755 "$CERTBOT_DIR"
    
    echo -e "${YELLOW}Restarting docker-compose services...${NC}"
    docker-compose down
    docker-compose up -d
    
    echo -e "${GREEN}✓ All services started successfully!${NC}"
    echo -e "${GREEN}✓ Your site is now available at: https://$DOMAIN${NC}"
else
    echo -e "${RED}✗ Failed to create SSL certificate${NC}"
    echo -e "${RED}Please check your domain DNS configuration and try again${NC}"
    docker-compose down
    exit 1
fi

echo -e "${YELLOW}=== Setup Complete ===${NC}"
