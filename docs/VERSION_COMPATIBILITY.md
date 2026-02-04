# Version Compatibility Matrix

Tracks compatibility between Aureus Sentinel components across versions.

## Current Compatibility (v1.0.0)

| Component | Version | Compatible With | Node.js | Status |
|-----------|---------|-----------------|---------|--------|
| **Bridge Server** | 1.0.0 | CLI 1.x, SDK 1.x | >=18.0.0 | ✅ Stable |
| **CLI** | 1.0.0 | Bridge 1.x, SDK 1.x | >=18.0.0 | ✅ Stable |
| **SDK (TypeScript)** | 1.0.0 | Bridge 1.x | >=18.0.0 | ✅ Stable |

---

## Compatibility Rules

### Semantic Versioning

We follow [Semantic Versioning 2.0.0](https://semver.org/):

- **Major (X.0.0)**: Breaking changes, incompatible API changes
- **Minor (1.X.0)**: New features, backwards-compatible
- **Patch (1.0.X)**: Bug fixes, backwards-compatible

### Version Constraints

#### Bridge Server ↔ CLI

| Bridge Version | Compatible CLI Versions |
|---------------|------------------------|
| 1.0.x | 1.0.x, 1.1.x |
| 1.1.x | 1.0.x, 1.1.x, 1.2.x |

**Rule:** CLI minor versions are forward and backward compatible with Bridge minor versions in the same major release.

#### Bridge Server ↔ SDK

| Bridge Version | Compatible SDK Versions |
|---------------|------------------------|
| 1.0.x | 1.0.x |
| 1.1.x | 1.0.x, 1.1.x |

**Rule:** SDK must match or be lower than Bridge minor version.

#### SDK ↔ Node.js

| SDK Version | Node.js Requirement | Recommended |
|------------|---------------------|-------------|
| 1.0.x | >=18.0.0 | 20.x LTS |
| 1.1.x | >=18.0.0 | 20.x LTS |

---

## Contract Versions

JSON Schema contracts are versioned separately:

| Contract Schema | Version | Used By | Breaking Changes |
|----------------|---------|---------|------------------|
| intent.schema.json | v1 | Bridge, SDK | None since v1 |
| context.schema.json | v1 | Bridge, SDK | None since v1 |
| plan.schema.json | v1 | Bridge, SDK | None since v1 |
| approval.schema.json | v1 | Bridge, SDK | None since v1 |
| report.schema.json | v1 | Bridge, SDK | None since v1 |

**Contract Versioning Policy:**
- Breaking changes to contracts require a major version bump for all components
- New optional fields are considered non-breaking
- Contract version is embedded in URLs: `/v1/sign`, `/v2/sign`

---

## Historical Compatibility

### Version 1.0.0 (Initial Release)

**Released:** 2024-12-XX

**Components:**
- Bridge Server 1.0.0
- CLI 1.0.0
- SDK 1.0.0

**Features:**
- ed25519 signing and verification
- JSON Schema validation
- TTL enforcement
- KMS integration (AWS KMS)
- Event store and replay
- Audit logging
- CLI with 7 commands
- TypeScript SDK
- Docker support
- Kubernetes manifests

**Environment:**
- Node.js: >=18.0.0
- npm: >=9.0.0
- Docker: >=20.10 (optional)
- Kubernetes: >=1.23 (optional)

---

## Deprecation Policy

### Timeline

- **Announcement**: Deprecation announced in release notes
- **Warning Period**: 2 minor versions (e.g., deprecated in 1.1.0, removed in 1.3.0)
- **Removal**: Feature removed in subsequent minor version
- **Migration**: Migration guide provided

### Current Deprecations

_None at this time._

---

## Upgrade Paths

### From 1.0.x to 1.1.x (Future)

**Breaking Changes:** None

**Steps:**
1. Update Bridge: `docker pull ghcr.io/farmountain/aureus-bridge:v1.1.0`
2. Update CLI: `npm install -g @aureus-sentinel/cli@1.1.0`
3. Update SDK: `npm install @aureus-sentinel/bridge-client@1.1.0`

**Recommended Order:**
1. Bridge Server (can operate with old SDK/CLI)
2. SDK (update application dependencies)
3. CLI (update development tools)

---

## Testing Compatibility

### Matrix Testing

We test all combinations of component versions in CI:

```yaml
# Example CI matrix
bridge: [1.0.0, 1.1.0]
cli: [1.0.0, 1.1.0]
sdk: [1.0.0, 1.1.0]
node: [18.x, 20.x, 22.x]
```

### Compatibility Test Results

| Bridge | CLI | SDK | Node.js | Status |
|--------|-----|-----|---------|--------|
| 1.0.0 | 1.0.0 | 1.0.0 | 18.x | ✅ Pass |
| 1.0.0 | 1.0.0 | 1.0.0 | 20.x | ✅ Pass |
| 1.0.0 | 1.0.0 | 1.0.0 | 22.x | ✅ Pass |

---

## Support Windows

| Version | Released | End of Support | Security Fixes | LTS |
|---------|----------|----------------|----------------|-----|
| 1.0.x | 2024-12 | 2025-12 | 2026-06 | ✅ |

**Support Policy:**
- **Active Support:** 12 months (bug fixes, new features)
- **Security Fixes:** 18 months (security updates only)
- **LTS Versions:** Marked versions receive extended support

---

## Platform Support

### Operating Systems

| Platform | Supported | Tested Versions |
|----------|-----------|----------------|
| Linux | ✅ | Ubuntu 20.04+, Debian 11+, RHEL 8+, Fedora 37+ |
| macOS | ✅ | macOS 12 (Monterey)+, Intel & ARM64 |
| Windows | ✅ | Windows 10+, Windows Server 2019+ |

### Container Platforms

| Platform | Supported | Tested Versions |
|----------|-----------|----------------|
| Docker | ✅ | 20.10+ |
| Kubernetes | ✅ | 1.23+ |
| Docker Compose | ✅ | 2.0+ |

### Cloud Providers

| Provider | Supported | Services |
|----------|-----------|----------|
| AWS | ✅ | ECS, EKS, Lambda, KMS |
| Azure | 🔄 | Planned |
| GCP | 🔄 | Planned |

---

## API Compatibility

### REST API Endpoints

| Endpoint | Version | Status | Breaking Changes |
|----------|---------|--------|------------------|
| POST /sign | v1 | ✅ Stable | None |
| GET /verify | v1 | ✅ Stable | None |
| GET /health | v1 | ✅ Stable | None |
| GET /public-key | v1 | ✅ Stable | None |

**API Versioning:**
- Version in URL path: `/v1/sign`, `/v2/sign`
- Old versions supported for 1 major release
- Deprecated versions return warnings in headers

---

## Dependency Compatibility

### Runtime Dependencies

| Dependency | Version Constraint | Used By | Critical |
|-----------|-------------------|---------|----------|
| Node.js | >=18.0.0 | All | ✅ |
| ajv | ^8.12.0 | Bridge, SDK | ✅ |
| commander | ^11.0.0 | CLI | - |
| axios | ^1.6.0 | SDK | ✅ |
| chalk | ^5.3.0 | CLI | - |

### Build Dependencies

| Dependency | Version | Used For |
|-----------|---------|----------|
| pkg | ^5.8.0 | Standalone executables |
| TypeScript | ^5.0.0 | SDK development |
| Jest | ^29.0.0 | Testing |

---

## Migration Guides

### Breaking Change Checklist

When we introduce breaking changes:

- [ ] Update major version (X.0.0)
- [ ] Document in CHANGELOG.md
- [ ] Create migration guide
- [ ] Update compatibility matrix
- [ ] Announce in release notes
- [ ] Provide deprecation warnings (if possible)
- [ ] Update all examples

### Example Migration (Future)

```markdown
## Migrating from 1.x to 2.x

### Breaking Changes

1. **Signature Format Changed**
   - Old: Base64-encoded signature
   - New: Hex-encoded signature
   - Migration: Use new `sign()` method

2. **API Endpoint Renamed**
   - Old: `/sign`
   - New: `/v2/sign`
   - Migration: Update client URL
```

---

## Questions?

- **Compatibility Issues?** [Open an issue](https://github.com/farmountain/Aureus-Sentinel/issues)
- **Upgrade Questions?** [Start a discussion](https://github.com/farmountain/Aureus-Sentinel/discussions)

---

**Last Updated:** Week 12 - Packaging & Release Automation  
**Next Review:** v1.1.0 release
