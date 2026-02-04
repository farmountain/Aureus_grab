# Aureus Demo Environment - Quick Start Guide for Windows

## Issue: Docker Image Not Available

The full demo environment requires building the Aureus console from source since the Docker image hasn't been published to Docker Hub yet.

## Option 1: Build and Run Locally (Recommended for Full Demo)

### Step 1: Build the Console Application

```powershell
# Navigate to repository root
cd D:\All_Projects\Aureus_Agentic_OS\Aureus_Agentic_OS

# Install dependencies
npm install

# Build all packages
npm run build

# Navigate to console app
cd apps\console

# Install console dependencies
npm install

# Build console
npm run build
```

### Step 2: Start Supporting Services

```powershell
# Navigate to demo-deployment
cd D:\All_Projects\Aureus_Agentic_OS\Aureus_Agentic_OS\demo-deployment

# Start only supporting services (PostgreSQL, Redis, Monitoring)
docker-compose up -d postgres redis prometheus grafana
```

### Step 3: Run Console Locally

```powershell
# Navigate to console directory
cd D:\All_Projects\Aureus_Agentic_OS\Aureus_Agentic_OS\apps\console

# Set environment variables
$env:NODE_ENV="development"
$env:DATABASE_URL="postgresql://aureus:demopassword@localhost:5432/aureus_demo"
$env:REDIS_URL="redis://localhost:6379"
$env:PORT="3000"

# Start console
npm start
```

### Step 4: Access the Demo

Open your browser to:
- **Console:** http://localhost:3000
- **Grafana:** http://localhost:3001 (admin/demodemo)
- **Prometheus:** http://localhost:9090

---

## Option 2: Simplified Demo (Services Only)

If you just want to test the infrastructure without the console:

```powershell
# Start only database and monitoring
cd D:\All_Projects\Aureus_Agentic_OS\Aureus_Agentic_OS\demo-deployment

docker-compose up -d postgres redis prometheus grafana

# Check services
docker-compose ps

# Access monitoring
# Grafana: http://localhost:3001 (admin/demodemo)
# Prometheus: http://localhost:9090
```

---

## Option 3: Build Docker Image Locally

### Step 1: Create Dockerfile for Console

Create `apps/console/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/console/package*.json ./apps/console/

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build
RUN npm run build

# Expose port
EXPOSE 3000

# Start command
CMD ["npm", "start", "--workspace=@aureus/console"]
```

### Step 2: Build Image

```powershell
# From repository root
cd D:\All_Projects\Aureus_Agentic_OS\Aureus_Agentic_OS

docker build -t aureus/console:latest .
```

### Step 3: Start All Services

```powershell
cd demo-deployment
docker-compose up -d
```

---

## Quick Status Check

```powershell
# Check what's running
docker-compose ps

# View logs
docker-compose logs -f

# Check specific service
docker-compose logs postgres
docker-compose logs redis

# Test database connection
docker-compose exec postgres psql -U aureus -d aureus_demo -c "SELECT 1"
```

---

## Troubleshooting

### If PostgreSQL fails to start:
```powershell
# Check logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### If you get port conflicts:
```powershell
# Check what's using port 3000
netstat -ano | findstr :3000

# Change port in .env file
# PORT=3001
```

### To completely reset:
```powershell
# Stop and remove everything
docker-compose down -v

# Remove all volumes
docker volume prune -f

# Start fresh
docker-compose up -d
```

---

## Current Limitations

Since this is a development/demo setup:

1. **Console image not published** - Need to build locally
2. **Development mode** - Uses in-memory state by default
3. **Mock LLM** - Set `LLM_MOCK_FALLBACK=true` in `.env` to avoid API costs

---

## Recommended Next Steps

1. **Build the console** (Option 1 above)
2. **Start supporting services** (PostgreSQL, Redis, Grafana)
3. **Run console locally** in development mode
4. **Access demos** at http://localhost:3000

This gives you a fully functional demo environment without needing published Docker images.

---

## Getting Help

- Check logs: `docker-compose logs -f`
- Check service status: `docker-compose ps`
- Full documentation: `README.md` and `QUICKSTART.md`
- Email: demo-support@aureus.io
