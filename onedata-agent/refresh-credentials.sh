#!/bin/bash
# Auto-refresh EC2 IAM role credentials for Docker containers
# Run via crontab every 4 hours to keep Bedrock access alive

set -e

ENV_FILE="/home/ubuntu/scard-v1-template2/onedata-agent/.env"
COMPOSE_DIR="/home/ubuntu/scard-v1-template2/onedata-agent"

# Get IMDSv2 token
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Get role name
ROLE=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/)

# Get credentials
CREDS=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/$ROLE)

ACCESS_KEY=$(echo "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['AccessKeyId'])")
SECRET_KEY=$(echo "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['SecretAccessKey'])")
SESSION_TOKEN=$(echo "$CREDS" | python3 -c "import json,sys; print(json.load(sys.stdin)['Token'])")

# Write .env
cat > "$ENV_FILE" <<EOF
AWS_ACCESS_KEY_ID=$ACCESS_KEY
AWS_SECRET_ACCESS_KEY=$SECRET_KEY
AWS_SESSION_TOKEN=$SESSION_TOKEN
EOF

# Restart backend to pick up new credentials
cd "$COMPOSE_DIR" && docker compose restart backend > /dev/null 2>&1

echo "$(date -Iseconds) - Credentials refreshed successfully"
