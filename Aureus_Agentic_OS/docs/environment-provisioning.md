# Environment Provisioning Guide

This guide provides detailed instructions for provisioning staging and production environments for Aureus Agentic OS.

## Table of Contents

1. [Overview](#overview)
2. [Staging Environment](#staging-environment)
3. [Production Environment](#production-environment)
4. [Database Setup](#database-setup)
5. [Event Log Setup](#event-log-setup)
6. [Observability Setup](#observability-setup)
7. [Network Configuration](#network-configuration)
8. [Security Hardening](#security-hardening)

## Overview

### Environment Requirements

| Component | Staging | Production |
|-----------|---------|------------|
| Console Instances | 1-2 | 3+ |
| PostgreSQL | 1 instance | Primary + Standby |
| Redis | 1 instance | Cluster (3+ nodes) |
| Load Balancer | Optional | Required |
| Monitoring | Optional | Required |
| Backup Storage | Local | S3 + Local |

### Infrastructure Checklist

- [ ] Compute resources (VMs/containers)
- [ ] Database instances
- [ ] Cache/state store
- [ ] Load balancer
- [ ] Storage for event logs
- [ ] Backup storage
- [ ] Monitoring and alerting
- [ ] Network security groups
- [ ] SSL/TLS certificates
- [ ] DNS records

## Staging Environment

### Architecture

```
Internet
    ↓
[Load Balancer] (optional)
    ↓
[Console Instance]
    ↓
[PostgreSQL DB] --- [File System Event Log]
```

### Compute Resources

**Recommended Specifications:**
- **CPU:** 2-4 vCPUs
- **Memory:** 4-8 GB RAM
- **Storage:** 50-100 GB SSD
- **OS:** Ubuntu 22.04 LTS or Amazon Linux 2023

**Setup Steps:**

```bash
# 1. Create compute instance
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.medium \
  --key-name aureus-staging \
  --security-group-ids sg-staging \
  --subnet-id subnet-staging \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=aureus-console-staging}]'

# 2. Install dependencies
sudo apt-get update
sudo apt-get install -y nodejs npm postgresql-client redis-tools git curl

# 3. Create aureus user
sudo useradd -m -s /bin/bash aureus
sudo usermod -aG sudo aureus

# 4. Setup application directories
sudo mkdir -p /opt/aureus
sudo mkdir -p /var/log/aureus
sudo mkdir -p /var/aureus/state
sudo mkdir -p /var/run
sudo chown -R aureus:aureus /opt/aureus /var/log/aureus /var/aureus /var/run

# 5. Clone and setup application
cd /opt/aureus
git clone https://github.com/farmountain/Aureus_Agentic_OS.git .
npm ci
npm run build:ordered
```

### Environment Variables

Create `/etc/aureus/staging.env`:

```bash
# Application
NODE_ENV=staging
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://aureus:password@staging-db.internal:5432/aureus_staging
STATE_STORE_TYPE=postgres

# Redis (optional for staging)
REDIS_URL=redis://staging-redis.internal:6379

# Event Log
EVENT_LOG_DIR=/var/run
EVENT_LOG_TYPE=filesystem

# Observability
METRICS_ENABLED=true
METRICS_PORT=9090
TELEMETRY_ENDPOINT=http://prometheus:9090

# Security
JWT_SECRET=staging-jwt-secret-change-me
API_RATE_LIMIT=100

# Feature Flags
ENABLE_DEBUG_ENDPOINTS=true
ENABLE_METRICS_EXPORT=true
```

### Systemd Service

Create `/etc/systemd/system/aureus-console.service`:

```ini
[Unit]
Description=Aureus Console Service (Staging)
After=network.target postgresql.service

[Service]
Type=simple
User=aureus
Group=aureus
WorkingDirectory=/opt/aureus/apps/console
EnvironmentFile=/etc/aureus/staging.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/aureus/console.log
StandardError=append:/var/log/aureus/console-error.log

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable aureus-console
sudo systemctl start aureus-console
```

## Production Environment

### Architecture

```
Internet
    ↓
[Load Balancer (HA)]
    ↓
[Console-1] [Console-2] [Console-3]
    ↓           ↓           ↓
[PostgreSQL Primary] ← [PostgreSQL Standby]
    ↓
[Redis Cluster: Node-1, Node-2, Node-3]
    ↓
[Shared Event Log Storage (NFS/S3)]
```

### High Availability Setup

**Multi-Node Console Deployment:**

```bash
# Node 1
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t3.large \
  --count 3 \
  --key-name aureus-production \
  --security-group-ids sg-production \
  --subnet-id subnet-production-a subnet-production-b subnet-production-c \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=aureus-console-prod}]'
```

**Load Balancer Configuration:**

```bash
# Create Application Load Balancer
aws elbv2 create-load-balancer \
  --name aureus-production-alb \
  --subnets subnet-production-a subnet-production-b subnet-production-c \
  --security-groups sg-alb-production \
  --scheme internet-facing \
  --type application

# Create target group
aws elbv2 create-target-group \
  --name aureus-console-targets \
  --protocol HTTP \
  --port 3000 \
  --vpc-id vpc-production \
  --health-check-enabled \
  --health-check-path /health \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3
```

### Environment Variables

Create `/etc/aureus/production.env`:

```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=warn

# Database
DATABASE_URL=postgresql://aureus:password@prod-db-primary.internal:5432/aureus_production
DATABASE_READ_REPLICA_URL=postgresql://aureus:password@prod-db-standby.internal:5432/aureus_production
STATE_STORE_TYPE=postgres

# Redis Cluster
REDIS_CLUSTER_NODES=prod-redis-1:6379,prod-redis-2:6379,prod-redis-3:6379
STATE_CACHE_ENABLED=true

# Event Log (Shared Storage)
EVENT_LOG_DIR=/mnt/aureus-events
EVENT_LOG_TYPE=filesystem
EVENT_LOG_BACKUP_ENABLED=true
EVENT_LOG_BACKUP_INTERVAL=3600

# Observability
METRICS_ENABLED=true
METRICS_PORT=9090
TELEMETRY_ENDPOINT=http://prometheus.internal:9090
TRACES_ENABLED=true
TRACES_ENDPOINT=http://jaeger.internal:14268/api/traces

# Security
JWT_SECRET=${JWT_SECRET_FROM_SECRETS_MANAGER}
API_RATE_LIMIT=1000
ENABLE_AUDIT_LOG=true
AUDIT_LOG_DIR=/var/log/aureus/audit

# Feature Flags
ENABLE_DEBUG_ENDPOINTS=false
ENABLE_METRICS_EXPORT=true
REQUIRE_TLS=true
```

## Database Setup

### PostgreSQL for Staging

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql-14

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE aureus_staging;
CREATE USER aureus WITH ENCRYPTED PASSWORD 'change-me-staging';
GRANT ALL PRIVILEGES ON DATABASE aureus_staging TO aureus;
EOF

# Configure for remote access
sudo tee -a /etc/postgresql/14/main/pg_hba.conf << EOF
host    aureus_staging    aureus    10.0.0.0/8    md5
EOF

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### PostgreSQL for Production

**Primary Node:**

```bash
# Install PostgreSQL
sudo apt-get install -y postgresql-14

# Create database
sudo -u postgres psql << EOF
CREATE DATABASE aureus_production;
CREATE USER aureus WITH ENCRYPTED PASSWORD '${POSTGRES_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE aureus_production TO aureus;

-- Enable replication
CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD '${REPLICATION_PASSWORD}';
EOF

# Configure for replication
sudo tee -a /etc/postgresql/14/main/postgresql.conf << EOF
# Replication settings
wal_level = replica
max_wal_senders = 10
wal_keep_size = 1GB
hot_standby = on

# Performance tuning
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
EOF

# Configure authentication
sudo tee -a /etc/postgresql/14/main/pg_hba.conf << EOF
host    replication    replicator    10.0.0.0/8    md5
host    aureus_production    aureus    10.0.0.0/8    md5
EOF

sudo systemctl restart postgresql
```

**Standby Node:**

```bash
# Stop PostgreSQL
sudo systemctl stop postgresql

# Remove existing data
sudo rm -rf /var/lib/postgresql/14/main/*

# Base backup from primary
sudo -u postgres pg_basebackup -h primary-db.internal -D /var/lib/postgresql/14/main -U replicator -P -v -R -X stream -C -S standby_1

# Start PostgreSQL
sudo systemctl start postgresql
```

### Redis Setup

**Single Instance (Staging):**

```bash
# Install Redis
sudo apt-get install -y redis-server

# Configure Redis
sudo tee /etc/redis/redis.conf << EOF
bind 0.0.0.0
port 6379
requirepass ${REDIS_PASSWORD}
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfilename "appendonly.aof"
EOF

sudo systemctl restart redis-server
```

**Redis Cluster (Production):**

```bash
# On each node (1, 2, 3)
sudo apt-get install -y redis-server

# Configure cluster node
sudo tee /etc/redis/redis.conf << EOF
port 6379
cluster-enabled yes
cluster-config-file nodes-6379.conf
cluster-node-timeout 5000
appendonly yes
requirepass ${REDIS_PASSWORD}
masterauth ${REDIS_PASSWORD}
EOF

sudo systemctl restart redis-server

# Create cluster (run on one node)
redis-cli --cluster create \
  prod-redis-1:6379 \
  prod-redis-2:6379 \
  prod-redis-3:6379 \
  --cluster-replicas 0 \
  -a ${REDIS_PASSWORD}
```

## Event Log Setup

### File System Based (Staging)

```bash
# Create event log directory
sudo mkdir -p /var/run
sudo chown -R aureus:aureus /var/run

# Configure log rotation
sudo tee /etc/logrotate.d/aureus-events << EOF
/var/run/*/events.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 aureus aureus
    sharedscripts
    postrotate
        systemctl reload aureus-console
    endscript
}
EOF
```

### Shared Storage (Production)

**NFS Setup:**

```bash
# On NFS server
sudo apt-get install -y nfs-kernel-server
sudo mkdir -p /exports/aureus-events
sudo chown -R aureus:aureus /exports/aureus-events

# Export directory
sudo tee -a /etc/exports << EOF
/exports/aureus-events 10.0.0.0/8(rw,sync,no_subtree_check,no_root_squash)
EOF

sudo exportfs -ra

# On console nodes
sudo apt-get install -y nfs-common
sudo mkdir -p /mnt/aureus-events
sudo mount -t nfs nfs-server.internal:/exports/aureus-events /mnt/aureus-events

# Add to fstab
echo "nfs-server.internal:/exports/aureus-events /mnt/aureus-events nfs defaults 0 0" | sudo tee -a /etc/fstab
```

**S3-Based Event Log (Alternative):**

```bash
# Install s3fs
sudo apt-get install -y s3fs

# Create credentials file
echo "${AWS_ACCESS_KEY_ID}:${AWS_SECRET_ACCESS_KEY}" > ~/.passwd-s3fs
chmod 600 ~/.passwd-s3fs

# Mount S3 bucket
sudo mkdir -p /mnt/aureus-events-s3
s3fs aureus-events /mnt/aureus-events-s3 -o passwd_file=~/.passwd-s3fs -o url=https://s3.amazonaws.com -o use_cache=/tmp/s3fs
```

## Observability Setup

### Prometheus

```bash
# Install Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.40.0/prometheus-2.40.0.linux-amd64.tar.gz
tar xvf prometheus-*.tar.gz
cd prometheus-*

# Configure Prometheus
cat > prometheus.yml << EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'aureus-console'
    static_configs:
      - targets: ['console-1:9090', 'console-2:9090', 'console-3:9090']
    
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
    
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
EOF

# Start Prometheus
./prometheus --config.file=prometheus.yml &
```

### Grafana

```bash
# Install Grafana
sudo apt-get install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install -y grafana

# Start Grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
```

### Log Aggregation

**ELK Stack:**

```bash
# Install Elasticsearch
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list
sudo apt-get update
sudo apt-get install -y elasticsearch

# Configure Elasticsearch
sudo tee -a /etc/elasticsearch/elasticsearch.yml << EOF
cluster.name: aureus-logs
node.name: log-node-1
network.host: 0.0.0.0
discovery.type: single-node
EOF

sudo systemctl enable elasticsearch
sudo systemctl start elasticsearch

# Install Filebeat on console nodes
sudo apt-get install -y filebeat

# Configure Filebeat
sudo tee /etc/filebeat/filebeat.yml << EOF
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/aureus/*.log
    fields:
      service: aureus-console
      environment: production

output.elasticsearch:
  hosts: ["elasticsearch.internal:9200"]
EOF

sudo systemctl enable filebeat
sudo systemctl start filebeat
```

## Network Configuration

### Security Groups (AWS)

**Console Security Group:**

```bash
aws ec2 create-security-group \
  --group-name aureus-console-sg \
  --description "Security group for Aureus console" \
  --vpc-id vpc-production

# Allow HTTP from load balancer
aws ec2 authorize-security-group-ingress \
  --group-id sg-console \
  --protocol tcp \
  --port 3000 \
  --source-group sg-alb

# Allow SSH from bastion
aws ec2 authorize-security-group-ingress \
  --group-id sg-console \
  --protocol tcp \
  --port 22 \
  --source-group sg-bastion

# Allow metrics scraping
aws ec2 authorize-security-group-ingress \
  --group-id sg-console \
  --protocol tcp \
  --port 9090 \
  --source-group sg-prometheus
```

**Database Security Group:**

```bash
aws ec2 create-security-group \
  --group-name aureus-db-sg \
  --description "Security group for Aureus database" \
  --vpc-id vpc-production

# Allow PostgreSQL from console
aws ec2 authorize-security-group-ingress \
  --group-id sg-db \
  --protocol tcp \
  --port 5432 \
  --source-group sg-console

# Allow replication between DB nodes
aws ec2 authorize-security-group-ingress \
  --group-id sg-db \
  --protocol tcp \
  --port 5432 \
  --source-group sg-db
```

### DNS Configuration

```bash
# Create Route53 records
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "aureus.example.com",
          "Type": "A",
          "AliasTarget": {
            "HostedZoneId": "Z215JYRZR1TBD5",
            "DNSName": "aureus-alb-123456.us-east-1.elb.amazonaws.com",
            "EvaluateTargetHealth": true
          }
        }
      }
    ]
  }'
```

### SSL/TLS Certificates

```bash
# Request certificate from ACM
aws acm request-certificate \
  --domain-name aureus.example.com \
  --subject-alternative-names "*.aureus.example.com" \
  --validation-method DNS

# Or use Let's Encrypt
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d aureus.example.com
```

## Security Hardening

### Operating System

```bash
# Update packages
sudo apt-get update && sudo apt-get upgrade -y

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 3000/tcp
sudo ufw enable

# Disable root login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Enable automatic security updates
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Application Security

```bash
# Set secure file permissions
sudo chmod 600 /etc/aureus/*.env
sudo chown aureus:aureus /etc/aureus/*.env

# Enable SELinux (if using RHEL/CentOS)
sudo setenforce 1
sudo sed -i 's/SELINUX=disabled/SELINUX=enforcing/' /etc/selinux/config

# Configure audit logging
sudo apt-get install -y auditd
sudo systemctl enable auditd
sudo systemctl start auditd
```

## Verification

After provisioning, verify the environment:

```bash
# Run health checks
./ops/health-checks/full-system-health.sh

# Verify database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Verify Redis
redis-cli -h redis.internal PING

# Check service status
systemctl status aureus-console

# Test API endpoints
curl https://aureus.example.com/health
curl https://aureus.example.com/ready

# Check logs
tail -f /var/log/aureus/console.log
```

## Troubleshooting

### Common Issues

1. **Service won't start:**
   ```bash
   journalctl -u aureus-console -n 100
   sudo -u aureus node /opt/aureus/apps/console/dist/server.js
   ```

2. **Database connection fails:**
   ```bash
   psql $DATABASE_URL -c "SELECT 1;"
   telnet db-host 5432
   ```

3. **Event log issues:**
   ```bash
   df -h /var/run
   ls -la /var/run
   sudo chown -R aureus:aureus /var/run
   ```

## See Also

- [Deployment Guide](deployment.md)
- [Operations Guide](../ops/README.md)
- [DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](../DEPLOYMENT_IMPLEMENTATION_SUMMARY.md)
