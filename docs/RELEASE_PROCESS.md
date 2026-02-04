# Release Process Guide

Complete guide for creating and publishing Aureus Sentinel releases.

## Overview

Aureus Sentinel uses automated release workflows triggered by version tags. The process handles:

- Semantic versioning
- Automated testing
- npm package publishing (SDK and CLI)
- Docker image builds (multi-platform)
- GitHub releases with changelogs
- Distribution package creation

---

## Release Types

### Patch Release (X.Y.Z)

**Purpose:** Bug fixes, small improvements, security patches  
**Breaking Changes:** No  
**Frequency:** As needed (usually weekly)

**Example:** 1.0.0 → 1.0.1

### Minor Release (X.Y.0)

**Purpose:** New features, deprecations, significant improvements  
**Breaking Changes:** No (backwards compatible)  
**Frequency:** Monthly

**Example:** 1.0.1 → 1.1.0

### Major Release (X.0.0)

**Purpose:** Breaking changes, major refactors, API changes  
**Breaking Changes:** Yes  
**Frequency:** Yearly or as needed

**Example:** 1.1.0 → 2.0.0

---

## Pre-Release Checklist

Before starting a release:

- [ ] All tests passing locally
- [ ] CI/CD pipeline green
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Breaking changes documented (if any)
- [ ] Migration guides written (if needed)
- [ ] Version compatibility matrix updated
- [ ] Security audit completed (for major/minor)
- [ ] Performance benchmarks run (for major/minor)

---

## Release Steps

### 1. Prepare Release

```bash
# Ensure you're on main branch
git checkout main
git pull origin main

# Verify tests pass
cd Aureus-Sentinel/bridge
npm test

cd ../sdk
npm test

cd ../cli
npm test

# Run integration tests
cd ../..
node Aureus-Sentinel/tests/integration.test.js
```

### 2. Update Version

```bash
# Choose version bump type
# patch: Bug fixes (1.0.0 → 1.0.1)
# minor: New features (1.0.1 → 1.1.0)
# major: Breaking changes (1.1.0 → 2.0.0)

VERSION_TYPE="patch"  # or "minor" or "major"

# Update SDK version
cd Aureus-Sentinel/sdk
npm version $VERSION_TYPE -m "Release v%s - SDK"

# Update CLI version
cd ../cli
npm version $VERSION_TYPE -m "Release v%s - CLI"

# Update root package.json (if exists)
cd ../..
# Manually update version in package.json at root

# Verify versions match
grep version Aureus-Sentinel/sdk/package.json
grep version Aureus-Sentinel/cli/package.json
```

### 3. Update CHANGELOG

```bash
# Edit CHANGELOG.md
nano CHANGELOG.md

# Add new version section at top:
## [1.0.1] - 2024-12-XX

### Added
- New feature descriptions

### Fixed
- Bug fix descriptions

### Changed
- Change descriptions

# Commit changelog
git add CHANGELOG.md
git commit -m "docs: Update CHANGELOG for v1.0.1"
```

### 4. Create Release Tag

```bash
# Get the new version
NEW_VERSION=$(node -p "require('./Aureus-Sentinel/sdk/package.json').version")

# Create annotated tag
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}

Release highlights:
- Feature 1
- Feature 2
- Bug fix 1

See CHANGELOG.md for full details."

# Push tag (triggers CI/CD)
git push origin "v${NEW_VERSION}"
```

### 5. Monitor Automated Release

The `.github/workflows/release.yml` workflow will automatically:

1. ✅ Run all tests
2. 📦 Publish SDK to npm
3. 📦 Publish CLI to npm
4. 🐳 Build Docker images (amd64, arm64)
5. 🐳 Push to Docker Hub and GHCR
6. 📝 Create GitHub release
7. 📝 Generate release notes from commits

**Monitor progress:**
- GitHub Actions: https://github.com/farmountain/Aureus-Sentinel/actions
- Look for workflow: "Release"

### 6. Verify Release

```bash
# Verify npm packages
npm view @aureus-sentinel/bridge-client version
npm view @aureus-sentinel/cli version

# Verify Docker images
docker pull ghcr.io/farmountain/aureus-bridge:v${NEW_VERSION}
docker pull ghcr.io/farmountain/aureus-bridge:latest

# Verify GitHub release
# Visit: https://github.com/farmountain/Aureus-Sentinel/releases

# Test installations
npm install -g @aureus-sentinel/cli@${NEW_VERSION}
aureus --version

docker run --rm ghcr.io/farmountain/aureus-bridge:v${NEW_VERSION} node --version
```

### 7. Post-Release Checks

- [ ] npm packages published and accessible
- [ ] Docker images pushed and pullable
- [ ] GitHub release created with assets
- [ ] Release notes accurate and complete
- [ ] Documentation site updated (if separate)
- [ ] Community notified (Discord, Twitter, etc.)
- [ ] Update project README (if needed)

---

## Manual Release (Fallback)

If automated release fails, manual steps:

### Publish to npm

```bash
# Login to npm
npm login

# Publish SDK
cd Aureus-Sentinel/sdk
npm publish --access public

# Publish CLI
cd ../cli
npm publish --access public
```

### Build and Push Docker Image

```bash
# Build multi-platform image
docker buildx create --use
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag ghcr.io/farmountain/aureus-bridge:v${NEW_VERSION} \
  --tag ghcr.io/farmountain/aureus-bridge:latest \
  --push \
  .
```

### Create GitHub Release

1. Go to: https://github.com/farmountain/Aureus-Sentinel/releases/new
2. Select tag: `v${NEW_VERSION}`
3. Title: `Release v${NEW_VERSION}`
4. Description: Copy from CHANGELOG.md
5. Upload assets (if any):
   - Standalone executables
   - DEB/RPM packages
   - Checksums
6. Click "Publish release"

---

## Hotfix Release

For critical bugs in production:

```bash
# Create hotfix branch from tag
git checkout -b hotfix/v1.0.1 v1.0.0

# Apply fixes
git commit -m "fix: Critical bug description"

# Update version (patch only)
cd Aureus-Sentinel/sdk
npm version patch -m "Hotfix v%s"

cd ../cli
npm version patch -m "Hotfix v%s"

# Merge to main
git checkout main
git merge hotfix/v1.0.1

# Tag and push
git tag -a v1.0.1 -m "Hotfix v1.0.1: Critical bug fix"
git push origin main
git push origin v1.0.1

# Clean up
git branch -d hotfix/v1.0.1
```

---

## Release Automation

### GitHub Actions Workflow

`.github/workflows/release.yml` handles:

```yaml
name: Release
on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  test:      # Run all tests
  publish-npm:   # Publish to npm
  build-docker:  # Build and push Docker images
  create-release: # Create GitHub release
```

### Environment Variables Required

Set in GitHub Actions secrets:

- `NPM_TOKEN`: npm authentication token (for publishing)
- `GITHUB_TOKEN`: Automatic (for releases)
- `DOCKER_USERNAME`: Docker Hub username (optional)
- `DOCKER_PASSWORD`: Docker Hub token (optional)

**Setup npm token:**
```bash
# Create token at: https://www.npmjs.com/settings/tokens
# Add to GitHub: Settings → Secrets → Actions → NPM_TOKEN
```

---

## Rollback Procedure

If a release has critical issues:

### 1. Deprecate npm Packages

```bash
npm deprecate @aureus-sentinel/bridge-client@1.0.1 "Critical bug, use 1.0.0"
npm deprecate @aureus-sentinel/cli@1.0.1 "Critical bug, use 1.0.0"
```

### 2. Update Docker Tags

```bash
# Re-tag previous version as latest
docker pull ghcr.io/farmountain/aureus-bridge:v1.0.0
docker tag ghcr.io/farmountain/aureus-bridge:v1.0.0 \
           ghcr.io/farmountain/aureus-bridge:latest
docker push ghcr.io/farmountain/aureus-bridge:latest
```

### 3. Update GitHub Release

- Mark release as "pre-release"
- Add warning message
- Point users to previous stable version

### 4. Communicate

- Post announcement in community channels
- Update documentation
- Create hotfix release ASAP

---

## Release Schedule

### Regular Schedule

- **Patch releases**: As needed (bug fixes)
- **Minor releases**: Monthly (new features)
- **Major releases**: Yearly or as needed (breaking changes)

### Security Releases

- **Critical**: Immediate (same day)
- **High**: Within 1 week
- **Medium/Low**: Next regular release

---

## Release Checklist Template

Copy this for each release:

```markdown
## Release v1.0.1 Checklist

### Pre-Release
- [ ] All tests passing
- [ ] CI/CD green
- [ ] CHANGELOG updated
- [ ] Documentation updated
- [ ] Version bumped (SDK, CLI)
- [ ] Git tag created

### Release
- [ ] Tag pushed to GitHub
- [ ] GitHub Actions workflow completed
- [ ] npm packages published
- [ ] Docker images published
- [ ] GitHub release created

### Post-Release
- [ ] Installations verified
- [ ] Community notified
- [ ] Documentation site updated
- [ ] Release notes reviewed

### Issues
- [ ] List any issues encountered
- [ ] Document resolutions
```

---

## Troubleshooting

### npm Publish Fails

```bash
# Check npm authentication
npm whoami

# Re-login
npm login

# Manually publish
npm publish --access public
```

### Docker Build Fails

```bash
# Test build locally
docker build -t test-build .

# Check buildx
docker buildx ls

# Create new builder
docker buildx create --name multiarch --use
```

### GitHub Release Not Created

- Check GitHub Actions logs
- Verify GITHUB_TOKEN permissions
- Manually create release if needed

---

## Best Practices

1. **Test Thoroughly**: Never skip tests before release
2. **Semantic Versioning**: Follow semver strictly
3. **Document Changes**: Update CHANGELOG for every release
4. **Communicate Early**: Announce breaking changes in advance
5. **Automate**: Use CI/CD for consistency
6. **Monitor**: Watch release process completion
7. **Verify**: Always verify packages after release
8. **Rollback Plan**: Be ready to rollback if needed

---

## Links

- **CHANGELOG**: [CHANGELOG.md](../CHANGELOG.md)
- **Release Notes Template**: [.github/RELEASE_NOTES_TEMPLATE.md](../.github/RELEASE_NOTES_TEMPLATE.md)
- **Version Compatibility**: [docs/VERSION_COMPATIBILITY.md](../docs/VERSION_COMPATIBILITY.md)
- **GitHub Releases**: https://github.com/farmountain/Aureus-Sentinel/releases

---

**Last Updated:** Week 12 - Packaging & Release Automation
