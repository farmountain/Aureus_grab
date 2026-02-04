# Kubernetes Deployment for Aureus Sentinel Bridge

Complete Kubernetes manifests for deploying Aureus Sentinel in production.

## Quick Start

```bash
# Create namespace
kubectl create namespace aureus

# Deploy ConfigMap and secrets
kubectl apply -f configmap.yaml -n aureus
kubectl apply -f secrets.yaml -n aureus

# Deploy Bridge
kubectl apply -f deployment.yaml -n aureus
kubectl apply -f service.yaml -n aureus

# Optional: Ingress for external access
kubectl apply -f ingress.yaml -n aureus

# Check status
kubectl get pods -n aureus
kubectl logs -f deployment/aureus-bridge -n aureus
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Ingress (TLS termination)              │
│  aureus.example.com                     │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Service (LoadBalancer or ClusterIP)    │
│  Port 3000 → 3000                        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Deployment                              │
│  - 3 replicas (HA)                       │
│  - Rolling updates                       │
│  - Health checks                         │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Pods                                    │
│  - aureus-bridge container               │
│  - Resource limits                       │
│  - Security context                      │
└──────────────────────────────────────────┘
```

## Files

- **namespace.yaml**: Namespace configuration
- **configmap.yaml**: Non-sensitive configuration
- **secrets.yaml**: Sensitive data (keys, API keys)
- **deployment.yaml**: Bridge deployment (3 replicas)
- **service.yaml**: LoadBalancer service
- **ingress.yaml**: Ingress for external access
- **hpa.yaml**: Horizontal Pod Autoscaler
- **networkpolicy.yaml**: Network security policies

## Prerequisites

- Kubernetes 1.23+
- kubectl configured
- (Optional) Ingress controller (nginx, traefik)
- (Optional) Cert-manager for TLS

## Configuration

### 1. Create Namespace

```bash
kubectl apply -f namespace.yaml
```

### 2. Configure Secrets

Edit `secrets.yaml` with your keys:

```bash
# Generate base64-encoded private key
cat private.pem | base64 -w 0

# Or use aureus CLI
aureus keygen --output ./keys
cat ./keys/private.pem | base64 -w 0
```

### 3. Configure ConfigMap

Edit `configmap.yaml` with your settings:

- Port
- Log level
- Rate limiting
- KMS configuration

### 4. Deploy

```bash
kubectl apply -f . -n aureus
```

## Monitoring

```bash
# Get pod status
kubectl get pods -n aureus

# View logs
kubectl logs -f deployment/aureus-bridge -n aureus

# View logs for specific pod
kubectl logs -f <pod-name> -n aureus

# Describe pod
kubectl describe pod <pod-name> -n aureus

# Get events
kubectl get events -n aureus --sort-by='.lastTimestamp'
```

## Scaling

### Manual Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment aureus-bridge --replicas=5 -n aureus
```

### Auto-Scaling

```bash
# Apply HPA
kubectl apply -f hpa.yaml -n aureus

# Check HPA status
kubectl get hpa -n aureus
```

## Updates

### Rolling Update

```bash
# Update image
kubectl set image deployment/aureus-bridge \
  aureus-bridge=ghcr.io/farmountain/aureus-bridge:v1.1.0 \
  -n aureus

# Check rollout status
kubectl rollout status deployment/aureus-bridge -n aureus

# View history
kubectl rollout history deployment/aureus-bridge -n aureus
```

### Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/aureus-bridge -n aureus

# Rollback to specific revision
kubectl rollout undo deployment/aureus-bridge --to-revision=2 -n aureus
```

## Security

### Network Policies

```bash
# Apply network policies
kubectl apply -f networkpolicy.yaml -n aureus
```

Policies:
- Deny all ingress by default
- Allow ingress on port 3000 from specific namespaces
- Allow egress to KMS (if using AWS KMS)

### Pod Security

- Runs as non-root user (UID 1001)
- Read-only root filesystem
- Drops all capabilities
- No privilege escalation

## Troubleshooting

### Pod not starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n aureus

# Common issues:
# - Image pull errors
# - Missing secrets/configmaps
# - Insufficient resources
```

### Health check failures

```bash
# Check logs
kubectl logs <pod-name> -n aureus

# Test health endpoint locally
kubectl port-forward <pod-name> 3000:3000 -n aureus
curl http://localhost:3000/health
```

### Connection issues

```bash
# Check service
kubectl get svc aureus-bridge -n aureus
kubectl describe svc aureus-bridge -n aureus

# Test from another pod
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n aureus -- \
  curl http://aureus-bridge:3000/health
```

## Production Checklist

- [ ] Secrets properly configured
- [ ] Resource limits set
- [ ] Health checks configured
- [ ] Multi-replica deployment (HA)
- [ ] Horizontal Pod Autoscaler configured
- [ ] Network policies applied
- [ ] Ingress configured with TLS
- [ ] Monitoring and alerting setup
- [ ] Backup strategy for private keys
- [ ] Log aggregation configured
- [ ] Update strategy defined

## Next Steps

- Configure monitoring (Prometheus/Grafana)
- Setup log aggregation (ELK/Loki)
- Configure alerting
- Setup backup for secrets
- Implement GitOps (ArgoCD/Flux)

---

**Last Updated:** Week 12 - Packaging & Release Automation
