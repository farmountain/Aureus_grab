# CI/CD Pipeline Templates

This directory contains production-ready CI/CD pipeline templates for deploying Aureus Agentic OS to various environments.

## Available Templates

### GitHub Actions

- **`github-actions/build-test-package.yml`** - Build, test, and package pipeline
  - Automated build on every push/PR
  - Comprehensive testing (unit, integration, security)
  - Artifact creation and storage
  - Docker image building (optional)
  
- **`github-actions/production-deployment.yml`** - Complete production deployment pipeline
  - Multi-stage deployment (staging → production)
  - Pre/post deployment verification
  - Automated rollback on failure
  - Multi-node deployment support

### GitLab CI

- **`gitlab-ci/.gitlab-ci.yml`** - GitLab CI/CD pipeline
  - Similar features to GitHub Actions
  - GitLab-specific runners and caching

### Jenkins

- **`jenkins/Jenkinsfile`** - Jenkins declarative pipeline
  - Groovy-based pipeline definition
  - Jenkins-specific plugins and stages

## Quick Start

### 1. Choose Your Platform

Select the appropriate template for your CI/CD platform:
- GitHub Actions → `github-actions/production-deployment.yml`
- GitLab CI → `gitlab-ci/.gitlab-ci.yml`
- Jenkins → `jenkins/Jenkinsfile`

### 2. Copy to Your Repository

```bash
# GitHub Actions
cp docs/ci-cd-templates/github-actions/production-deployment.yml .github/workflows/

# GitLab CI
cp docs/ci-cd-templates/gitlab-ci/.gitlab-ci.yml .gitlab-ci.yml

# Jenkins
cp docs/ci-cd-templates/jenkins/Jenkinsfile Jenkinsfile
```

### 3. Configure Secrets/Variables

Each platform requires certain secrets or environment variables:

**GitHub Actions:**
- `STAGING_SSH_KEY` - SSH key for staging servers
- `STAGING_HOST` - Staging server hostname
- `STAGING_USER` - SSH user
- `PRODUCTION_SSH_KEY` - SSH key for production servers
- `PRODUCTION_HOSTS` - Comma-separated list of production hosts
- `PRODUCTION_USER` - SSH user

**GitLab CI:**
- `STAGING_SSH_PRIVATE_KEY` - SSH key for staging
- `STAGING_HOST` - Staging server hostname
- `PRODUCTION_SSH_PRIVATE_KEY` - SSH key for production
- `PRODUCTION_HOSTS` - Production server hosts

**Jenkins:**
- Jenkins credentials for SSH (ID: `staging-ssh`, `production-ssh`)
- Environment variables for hosts and users

### 4. Customize for Your Environment

Edit the template to match your:
- Environment URLs
- Server hostnames
- Deployment paths
- Health check endpoints
- Notification channels

## Pipeline Stages

All templates follow a similar multi-stage approach:

### 1. Pre-Deployment Verification
- Build all packages
- Run tests
- Security scanning
- Version validation
- Environment checks

### 2. Build & Package
- Create deployment artifacts
- Version tagging
- Artifact storage/upload

### 3. Deploy to Staging
- Deploy to staging environment
- Run smoke tests
- Post-deployment verification
- Health checks

### 4. Deploy to Production
- Manual approval (optional)
- Deploy to production servers
- Multi-node deployment
- Health checks on all nodes
- Verify deployment success

### 5. Rollback (on failure)
- Automatic rollback trigger
- Restore previous version
- Verify rollback success
- Send notifications

## Features

### ✅ Safety Gates
- Pre-deployment verification prevents bad deployments
- Post-deployment verification ensures deployment success
- Automated rollback on failure
- Manual approval for production (optional)

### ✅ Multi-Node Support
- Deploy to multiple servers simultaneously
- Health checks on all nodes
- Gradual rollout support

### ✅ Health Monitoring
- Service readiness checks
- API endpoint verification
- Database connectivity tests
- Metrics validation

### ✅ Artifact Management
- Build artifact creation and storage
- Version tracking
- Long-term retention
- Easy rollback to previous versions

### ✅ Notifications
- Deployment status updates
- Failure alerts
- Team notifications
- Integration with Slack/PagerDuty/Email

## Usage Examples

### GitHub Actions

```bash
# Manual deployment to production
gh workflow run production-deployment.yml \
  -f environment=production \
  -f version=v1.2.3

# Automatic deployment (push to main/production branch)
git push origin main  # → deploys to staging
git push origin production  # → deploys to production
```

### GitLab CI

```bash
# Automatic deployment via branch
git push origin main  # → staging
git push origin production  # → production

# Manual pipeline trigger
# Use GitLab UI: CI/CD → Pipelines → Run Pipeline
```

### Jenkins

```bash
# Trigger via Jenkins UI
# Build with Parameters → Select environment, version

# Via Jenkins CLI
java -jar jenkins-cli.jar build "Aureus-Deploy" \
  -p ENVIRONMENT=production \
  -p VERSION=v1.2.3
```

## Environment Variables

### Common Variables

```bash
# Application
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:5432/aureus
REDIS_URL=redis://host:6379

# Deployment
DEPLOY_PATH=/opt/aureus
SERVICE_NAME=aureus-console
```

### Platform-Specific Variables

Refer to your platform's documentation for setting environment variables:
- GitHub Actions: Repository Settings → Secrets and variables
- GitLab CI: Project Settings → CI/CD → Variables
- Jenkins: Manage Jenkins → Configure System → Global properties

## Troubleshooting

### Deployment Fails

1. **Check pre-deployment verification logs:**
   ```bash
   # Look for errors in build, test, or security checks
   ```

2. **Verify SSH connectivity:**
   ```bash
   ssh -i ~/.ssh/deploy_key user@host
   ```

3. **Check server logs:**
   ```bash
   journalctl -u aureus-console -n 100
   ```

### Health Checks Fail

1. **Verify service is running:**
   ```bash
   systemctl status aureus-console
   ```

2. **Check health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Review application logs:**
   ```bash
   tail -f /var/log/aureus/console.log
   ```

### Rollback Issues

1. **Check backup availability:**
   ```bash
   ls -lh /opt/aureus/apps/console.backup.*
   ```

2. **Manual rollback:**
   ```bash
   ./ops/rollback/automated-rollback.sh
   ```

## Best Practices

1. **Always test in staging first** - Never skip staging deployment
2. **Use version tags** - Deploy specific versions, not branches
3. **Monitor deployments** - Watch health checks and logs during deployment
4. **Keep backups** - Ensure backups are created before deployment
5. **Document changes** - Include deployment notes in commit messages
6. **Gradual rollouts** - Consider canary or blue-green deployments for large changes
7. **Automated testing** - Run comprehensive tests before production
8. **Audit trail** - Log all deployment activities
9. **Quick rollback** - Keep rollback procedures tested and ready
10. **Team communication** - Notify team before major deployments

## Customization

### Adding Custom Steps

You can extend the pipelines with custom steps:

**GitHub Actions:**
```yaml
- name: Custom Step
  run: |
    # Your custom commands
```

**GitLab CI:**
```yaml
custom_job:
  stage: deploy
  script:
    - # Your custom commands
```

**Jenkins:**
```groovy
stage('Custom Stage') {
    steps {
        sh '''
            # Your custom commands
        '''
    }
}
```

### Adding Notifications

**Slack:**
```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"Deployment to production completed!"}' \
  $SLACK_WEBHOOK_URL
```

**Email:**
```bash
echo "Deployment completed" | mail -s "Deployment Success" team@example.com
```

## See Also

- [Deployment Guide](../deployment.md) - Complete deployment procedures
- [Operations Guide](../../ops/README.md) - Operational scripts and tools
- [Environment Provisioning](../environment-provisioning.md) - Infrastructure setup
- [DEPLOYMENT_IMPLEMENTATION_SUMMARY.md](../../DEPLOYMENT_IMPLEMENTATION_SUMMARY.md) - Implementation details
