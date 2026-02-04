# Kubernetes Deployment for Aureus Agentic OS

This directory contains Kubernetes manifests for deploying Aureus Agentic OS to production Kubernetes clusters.

## Structure

```
kubernetes/
├── base/                    # Base configurations (environment-agnostic)
│   ├── namespace.yaml
│   ├── console-deployment.yaml
│   ├── console-service.yaml
│   ├── postgres-statefulset.yaml
│   ├── postgres-service.yaml
│   ├── redis-deployment.yaml
│   ├── redis-service.yaml
│   ├── prometheus-deployment.yaml
│   ├── grafana-deployment.yaml
│   ├── configmap.yaml
│   ├── secrets.yaml (template)
│   └── kustomization.yaml
│
└── overlays/                # Environment-specific overrides
    ├── development/
    │   ├── kustomization.yaml
    │   └── patches/
    ├── staging/
    │   ├── kustomization.yaml
    │   └── patches/
    └── production/
        ├── kustomization.yaml
        ├── ingress.yaml
        ├── hpa.yaml           # Horizontal Pod Autoscaler
        └── patches/
```

## Quick Start

### Prerequisites

- Kubernetes cluster (1.24+)
- `kubectl` configured
- `kustomize` (or kubectl 1.14+ with built-in kustomize)
- Cluster with at least:
  - 4 CPU cores
  - 8 GB RAM
  - 50 GB storage (PersistentVolumes)

### 1. Create Namespace

```bash
kubectl apply -f base/namespace.yaml
```

### 2. Configure Secrets

```bash
# Copy secrets template
cp base/secrets.yaml.template base/secrets.yaml

# Edit with your values
# IMPORTANT: Never commit secrets.yaml to git!

# Create secrets in cluster
kubectl apply -f base/secrets.yaml
```

**Required Secrets**:
- `db-password`: PostgreSQL password
- `jwt-secret`: JWT signing secret
- `openai-api-key`: OpenAI API key (if using)

### 3. Deploy Base Configuration

```bash
# Using kustomize
kubectl apply -k base/

# Or using kubectl with kustomization
kubectl apply -k base/
```

### 4. Deploy Environment-Specific Configuration

**Development**:
```bash
kubectl apply -k overlays/development/
```

**Production**:
```bash
kubectl apply -k overlays/production/
```

### 5. Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n aureus

# Check services
kubectl get svc -n aureus

# Check persistent volumes
kubectl get pvc -n aureus

# View logs
kubectl logs -f deployment/aureus-console -n aureus
```

## Configuration

### Environment Variables

Key environment variables are managed via ConfigMaps and Secrets:

**ConfigMap** (`configmap.yaml`):
- Application settings
- Feature flags
- Resource limits
- Non-sensitive configuration

**Secrets** (`secrets.yaml`):
- Database credentials
- API keys
- JWT secrets
- OAuth credentials

### Persistent Storage

**PostgreSQL**:
- Uses StatefulSet with PersistentVolumeClaim
- Default: 10Gi storage
- StorageClass: Use your cluster's default or specify in overlays

**Event Logs**:
- Uses PersistentVolumeClaim mounted to console pods
- Default: 5Gi storage

**Redis**:
- Optional persistence with PVC
- Can use emptyDir for ephemeral storage (development)

### Resource Limits

**Console Pods**:
- Requests: 500m CPU, 512Mi RAM
- Limits: 2 CPU, 2Gi RAM

**PostgreSQL**:
- Requests: 250m CPU, 512Mi RAM
- Limits: 1 CPU, 1Gi RAM

**Redis**:
- Requests: 100m CPU, 128Mi RAM
- Limits: 500m CPU, 512Mi RAM

Adjust in overlays for your environment.

### Ingress

Production overlay includes Ingress configuration:

```yaml
# overlays/production/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: aureus-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
    - hosts:
        - aureus.yourdomain.com
      secretName: aureus-tls
  rules:
    - host: aureus.yourdomain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: aureus-console
                port:
                  number: 3000
```

### Horizontal Pod Autoscaling

Production includes HPA for console pods:

```yaml
# overlays/production/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aureus-console-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aureus-console
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

## Cloud Provider Guides

### AWS EKS

```bash
# Create EKS cluster
eksctl create cluster \
  --name aureus-cluster \
  --region us-west-2 \
  --nodegroup-name standard-workers \
  --node-type t3.large \
  --nodes 3 \
  --nodes-min 2 \
  --nodes-max 5

# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name aureus-cluster

# Deploy
kubectl apply -k overlays/production/
```

**EKS-Specific Considerations**:
- Use EBS CSI driver for PersistentVolumes
- Configure ALB Ingress Controller
- Use AWS Secrets Manager integration (optional)

### Google GKE

```bash
# Create GKE cluster
gcloud container clusters create aureus-cluster \
  --zone us-central1-a \
  --num-nodes 3 \
  --machine-type n1-standard-2 \
  --enable-autoscaling \
  --min-nodes 2 \
  --max-nodes 5

# Get credentials
gcloud container clusters get-credentials aureus-cluster --zone us-central1-a

# Deploy
kubectl apply -k overlays/production/
```

**GKE-Specific Considerations**:
- Use GCE Persistent Disk for PVs
- Configure GCE Ingress Controller
- Enable Workload Identity for GCP service access

### Azure AKS

```bash
# Create AKS cluster
az aks create \
  --resource-group aureus-rg \
  --name aureus-cluster \
  --node-count 3 \
  --node-vm-size Standard_D2s_v3 \
  --enable-cluster-autoscaler \
  --min-count 2 \
  --max-count 5

# Get credentials
az aks get-credentials --resource-group aureus-rg --name aureus-cluster

# Deploy
kubectl apply -k overlays/production/
```

**AKS-Specific Considerations**:
- Use Azure Disk for PVs
- Configure Application Gateway Ingress Controller
- Use Azure Key Vault integration (optional)

## Monitoring

### Prometheus & Grafana

Included in base configuration:

```bash
# Access Prometheus
kubectl port-forward svc/prometheus -n aureus 9090:9090

# Access Grafana
kubectl port-forward svc/grafana -n aureus 3001:3000

# Get Grafana admin password
kubectl get secret grafana-admin -n aureus -o jsonpath="{.data.password}" | base64 --decode
```

### Metrics

Console exposes Prometheus metrics at `/metrics`:

```bash
# View metrics
kubectl port-forward svc/aureus-console -n aureus 3000:3000
curl http://localhost:3000/metrics
```

## Maintenance

### Backup

**Database Backup**:
```bash
# Manual backup
kubectl exec -n aureus postgres-0 -- pg_dump -U aureus aureus > backup-$(date +%Y%m%d).sql

# Scheduled backup (use CronJob - see base/cronjobs/)
kubectl apply -f base/backup-cronjob.yaml
```

**State Backup**:
```bash
# Backup PVCs
kubectl get pvc -n aureus

# Use Velero or your cloud provider's backup solution
```

### Updates

**Rolling Update**:
```bash
# Update console image
kubectl set image deployment/aureus-console -n aureus \
  aureus-console=aureus/console:v1.2.0

# Monitor rollout
kubectl rollout status deployment/aureus-console -n aureus
```

**Database Migration**:
```bash
# Run migration job
kubectl apply -f base/migration-job.yaml

# Check migration status
kubectl logs job/db-migration -n aureus
```

### Scaling

**Manual Scaling**:
```bash
# Scale console pods
kubectl scale deployment/aureus-console -n aureus --replicas=5
```

**Auto-Scaling**:
```bash
# Apply HPA (production)
kubectl apply -f overlays/production/hpa.yaml

# Check HPA status
kubectl get hpa -n aureus
```

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n aureus

# View logs
kubectl logs <pod-name> -n aureus

# Common issues:
# - Insufficient resources
# - Missing secrets
# - PVC not bound
# - Image pull errors
```

### Database Connection Issues

```bash
# Check PostgreSQL pod
kubectl logs postgres-0 -n aureus

# Test connection from console pod
kubectl exec -it <console-pod> -n aureus -- psql -h postgres -U aureus -d aureus

# Verify secret
kubectl get secret aureus-secrets -n aureus -o yaml
```

### Performance Issues

```bash
# Check resource usage
kubectl top pods -n aureus
kubectl top nodes

# Review metrics in Prometheus
kubectl port-forward svc/prometheus -n aureus 9090:9090
# Open http://localhost:9090
```

## Security

### Best Practices

1. **Secrets Management**:
   - Use external secrets management (e.g., AWS Secrets Manager, Vault)
   - Never commit `secrets.yaml` to version control
   - Rotate secrets regularly

2. **Network Policies**:
   ```bash
   # Apply network policies
   kubectl apply -f base/network-policies.yaml
   ```

3. **RBAC**:
   ```bash
   # Apply RBAC rules
   kubectl apply -f base/rbac.yaml
   ```

4. **Pod Security**:
   - Use Pod Security Standards
   - Run as non-root user
   - Enable security contexts

5. **TLS/SSL**:
   - Use cert-manager for automatic certificate management
   - Configure Ingress with TLS

## Support

For issues or questions:

- **GitHub Issues**: [github.com/aureus/Aureus_Agentic_OS/issues](https://github.com/aureus/Aureus_Agentic_OS/issues)
- **Documentation**: [docs/deployment/kubernetes.md](../../docs/deployment/kubernetes.md)
- **Email**: support@aureus.ai

---

**Last Updated**: January 31, 2026  
**Kubernetes Version**: 1.24+  
**Status**: Beta (Week 6-8 of technical beta program)
