# Technical Beta Program - Aureus Agentic OS

## Overview

Welcome to the Aureus Agentic OS Technical Beta Program! This initiative allows early adopters to evaluate our production-grade AI agent orchestration platform in real-world scenarios while helping us refine the product for general availability.

## Program Details

### What is the Technical Beta?

The Technical Beta is a controlled release of Aureus Agentic OS to technical users (DevOps engineers, platform engineers, AI researchers) who are comfortable deploying containerized applications and providing structured feedback.

**Program Duration**: 8-12 weeks (February - April 2026)  
**Target Participants**: 10-15 technical users  
**Support Level**: Community + Email support  
**Cost**: Free for beta participants

### What's Included

✅ **Full Platform Access**
- Complete Aureus Agentic OS codebase
- Docker Compose deployment configuration
- All core features: Orchestration, CRV, Policy, Memory, Observability
- Agent Studio (visual builder)
- Monitoring dashboard (Prometheus + Grafana)
- Python SDK and TypeScript SDK

✅ **Documentation**
- Installation and setup guides
- Architecture documentation
- API reference
- Example implementations

✅ **Support**
- Dedicated Slack channel for beta participants
- Email support (48-hour response time)
- Bi-weekly office hours with engineering team
- Direct feedback channel to product team

❌ **Not Included (Coming Later)**
- Kubernetes deployment (expected Week 6-8 of beta)
- Enterprise SSO/OAuth integration
- SLA guarantees
- 24/7 support

## Beta Phases

### Phase 1: Technical Validation (Weeks 1-4)
**Goal**: Validate core orchestration, CRV, and policy features

**Activities**:
- Install and deploy using Docker Compose
- Run example workflows
- Test basic agent creation and execution
- Provide feedback on installation process

**Deliverables**:
- Installation survey
- Core feature validation checklist
- Bug reports (if any)

### Phase 2: Real-World Integration (Weeks 5-8)
**Goal**: Deploy Aureus in production-like environments

**Activities**:
- Integrate with your existing systems
- Build custom agents for your use cases
- Test scalability and reliability
- Evaluate monitoring and observability

**Deliverables**:
- Use case description
- Integration feedback
- Performance benchmarks
- Feature requests

### Phase 3: Kubernetes Preview (Weeks 9-12)
**Goal**: Validate Kubernetes deployment (when available)

**Activities**:
- Migrate from Docker Compose to K8s
- Test multi-node deployment
- Evaluate enterprise readiness
- Provide go-to-market feedback

**Deliverables**:
- K8s deployment feedback
- Enterprise feature assessment
- Pricing model feedback

## Eligibility Criteria

We're looking for participants who:

✅ **Technical Requirements**:
- Comfortable with Docker and container orchestration
- Experience deploying and managing backend services
- Familiarity with TypeScript or Python
- Understanding of AI/LLM concepts (preferred)

✅ **Commitment Requirements**:
- Available 5-10 hours/week for evaluation
- Willing to provide structured feedback
- Can attend bi-weekly sync meetings (optional)
- Open to testing new features as they're released

✅ **Use Case Requirements**:
- Have a real-world use case for AI agents
- Can deploy to non-production or staging environment
- Willing to share anonymized usage data
- Open to case study participation (optional)

## How to Apply

### Application Process

1. **Submit Application**: Fill out the [Beta Application Form](https://forms.aureus.ai/beta) *(link placeholder)*
   - Describe your use case
   - Technical environment details
   - Time commitment confirmation
   
2. **Review** (3-5 business days): Our team reviews applications
   
3. **Acceptance**: Selected participants receive:
   - Beta access credentials
   - Onboarding email with setup instructions
   - Slack invite to beta community
   
4. **Onboarding Call** (Optional): 30-minute setup assistance

### Application Form Fields

- **Your Role**: DevOps, Platform Engineer, AI Researcher, etc.
- **Company/Organization**: Name and size
- **Use Case Description**: What problem are you solving?
- **Technical Environment**: Cloud provider, orchestration, scale
- **Time Commitment**: Hours per week available
- **Feedback Willingness**: How you'll provide feedback
- **LLM Experience**: Have you worked with OpenAI, Anthropic, etc.?

## What We're Looking For

### Priority Use Cases

1. **Autonomous DevOps Operations**
   - Automated incident response
   - Infrastructure provisioning
   - Log analysis and remediation

2. **Enterprise Workflow Automation**
   - Multi-step business processes
   - Document processing pipelines
   - Customer service automation

3. **Research & Development**
   - AI agent research platforms
   - Novel agent architectures
   - Academic use cases

4. **Robotics & IoT Integration**
   - Physical robot control
   - Industrial automation
   - Smart environment management

5. **Creative Applications**
   - Content generation pipelines
   - Multi-agent collaboration
   - Interactive experiences

## Expectations & Responsibilities

### What We Expect from You

**Feedback Requirements**:
- Complete weekly feedback surveys (5 minutes)
- Report bugs via GitHub Issues
- Share use case results (anonymized)
- Participate in 1-2 interviews during beta period

**Usage Requirements**:
- Deploy and test within first week
- Run at least 3 different agent workflows
- Test rollback and recovery features
- Stress test within your environment's limits

**Communication Requirements**:
- Respond to critical bug inquiries within 48 hours
- Attend at least 50% of office hours (optional but encouraged)
- Provide constructive, actionable feedback
- Be respectful in community interactions

### What You Can Expect from Us

**Support Commitments**:
- Bug fixes for critical issues within 1 week
- Feature requests reviewed and prioritized
- Documentation updates based on feedback
- Regular product updates and releases

**Communication Commitments**:
- Weekly release notes
- Bi-weekly office hours
- 48-hour email response time
- Transparent roadmap sharing

**Product Evolution**:
- Kubernetes manifests by Week 6-8
- UI improvements based on feedback
- Additional SDK features
- Documentation improvements

## Benefits of Participation

### For Beta Participants

🎁 **Lifetime Credits**: $5,000 in service credits when we launch (if we offer paid SaaS)

🏆 **Beta Contributor Badge**: Recognition in our community and documentation

📚 **Early Access**: First to access new features and releases

💼 **Priority Support**: Fast-track to enterprise tier when available

🤝 **Influence the Roadmap**: Direct input on feature prioritization

📢 **Co-Marketing Opportunities**: Optional case studies and success stories

### For Aureus

- Real-world validation of architecture and design
- User feedback to prioritize features
- Bug identification before general availability
- Use case discovery for marketing
- Community building and early adopters

## Getting Started After Acceptance

Once accepted, follow these steps:

1. **Read the [Beta Onboarding Guide](./onboarding.md)**
2. **Install Aureus using [Quick Start](../../demo-deployment/QUICKSTART.md)**
3. **Join the Beta Slack Channel** (invite in email)
4. **Complete the Setup Survey**
5. **Run your first agent** using example workflows
6. **Attend first Office Hours** (schedule in Slack)

## FAQs

### Is this truly production-ready?

**Core features are production-ready**: Orchestration, CRV validation, policy enforcement, memory with rollback, and monitoring are all tested and stable.

**Not yet enterprise-ready**: We're still developing Kubernetes deployment, advanced authentication, and some enterprise features.

**Best for**: Staging environments, internal tools, research projects, and non-mission-critical workflows.

### What about data privacy?

- **All data stays in your environment** (on-premise or your cloud)
- **We don't access your data** unless you explicitly share it for debugging
- **Telemetry is optional** and doesn't include sensitive information
- **Open source code** means full transparency

### Can I use this in production?

**Technically yes**, with caveats:
- Docker Compose deployment is stable
- All core invariants are tested (durability, idempotency, verification, governance)
- 129 test files validate reliability
- Production configuration supports PostgreSQL and real LLM providers

**We recommend** starting with non-critical workflows until Kubernetes deployment is available and you've validated in your environment.

### What if I find critical bugs?

- Report immediately via Slack or email (beta@aureus.ai)
- We'll acknowledge within 24 hours
- Critical bugs get priority fixes within 1 week
- You'll be credited in release notes

### Can I contribute code?

**Absolutely!** We welcome contributions:
- Bug fixes and improvements
- Documentation updates
- Example workflows and agents
- SDK enhancements

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

### What happens after the beta?

**For participants**:
- Continue using the platform (it's open source)
- Upgrade to Kubernetes when ready
- Access enterprise features when launched
- Receive credits/benefits as promised

**For the product**:
- General Availability release (Q2 2026)
- Kubernetes deployment fully supported
- Optional managed service offering
- Enterprise support tiers

## Contact & Support

### During Beta

- **Slack**: #beta-technical channel (invite-only)
- **Email**: beta@aureus.ai
- **GitHub Issues**: [github.com/aureus/Aureus_Agentic_OS/issues](https://github.com/aureus/Aureus_Agentic_OS/issues)
- **Office Hours**: Bi-weekly, schedule in Slack

### Application Questions

- **Email**: beta-apply@aureus.ai
- **Response Time**: 3-5 business days

---

**Ready to Apply?**

[Fill out the Beta Application Form →](https://forms.aureus.ai/beta)

---

*Last Updated: January 31, 2026*  
*Program Start: February 2026*  
*Spots Available: 10-15 participants*
