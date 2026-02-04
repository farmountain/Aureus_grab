# Support - Aureus Agentic OS Beta

**Quick Access**: For urgent issues, email beta@aureus.ai or ping @support in Slack.

## Support Channels

### 1. 🎯 Beta Office Hours (Highest Priority)

**Live support with engineering team**

- **Schedule**: Tuesday & Thursday, 3-4 PM EST
- **Format**: Video call (Zoom link in beta invitation)
- **Capacity**: Up to 20 participants
- **What to Bring**: 
  - Your questions
  - Screen to share (for live debugging)
  - Logs/error messages

**Best For**:
- Complex technical issues
- Architecture design questions
- Live debugging sessions
- Feature deep dives
- Roadmap discussions

**How to Attend**:
- No registration needed
- Drop in anytime during the hour
- Recording shared afterward (for time zones)

---

### 2. 💬 Slack Community (Real-Time)

**Beta participant community channel**

- **Channel**: `#aureus-beta-participants` (private)
- **Response Time**: 
  - Business hours: ~30 minutes
  - Nights/weekends: Best effort
- **Members**: Beta participants + Aureus team

**Best For**:
- Quick questions
- Sharing workarounds
- Community discussions
- Networking with other users
- Non-urgent troubleshooting

**Slack Tips**:
- 🔥 Use "🔥" emoji for urgent issues (team gets notified)
- 🎯 Tag @engineering for technical questions
- 📚 Tag @docs for documentation issues
- 💡 Use threads to keep conversations organized

**Slack Invite**: Sent to beta participants upon acceptance

---

### 3. 📧 Email Support

**Direct line to beta team**

- **Primary**: beta@aureus.ai
- **Security Issues**: security@aureus.ai (for vulnerabilities)
- **Business Inquiries**: partnerships@aureus.ai

**Response Times**:
- **Critical (P0)**: 4 hours (business days)
- **High (P1)**: 24 hours
- **Medium (P2)**: 48 hours
- **Low (P3)**: 3-5 days

**What to Include**:
1. **Subject**: [BETA] Brief description + [Priority: P0/P1/P2/P3]
2. **Environment**: OS, deployment method, version
3. **Issue**: Clear description of problem
4. **Reproduction**: Steps to reproduce
5. **Logs**: Attach relevant logs/screenshots
6. **Impact**: How this affects your work

**Example Subject**: `[BETA] Docker Compose PostgreSQL connection fails [Priority: P1]`

---

### 4. 🐛 GitHub Issues

**Public bug tracking**

- **Repository**: [github.com/farmountain/Aureus_Agentic_OS](https://github.com/farmountain/Aureus_Agentic_OS)
- **For**: Bugs, feature requests, documentation issues
- **Not For**: Sensitive information, security issues, support questions

**Issue Templates**:
- Bug Report: `.github/ISSUE_TEMPLATE/beta-bug-report.md`
- Feature Request: `.github/ISSUE_TEMPLATE/feature-request.md`
- Documentation: `.github/ISSUE_TEMPLATE/docs-issue.md`

**Best For**:
- Reproducible bugs
- Feature requests with use cases
- Documentation gaps
- Community-visible issues

**Response Time**: 48-72 hours for triage

---

### 5. 📝 Feedback Form

**Structured feedback collection**

- **Link**: https://forms.gle/[beta-feedback-form]
- **For**: General feedback, feature ideas, UX suggestions
- **Response Time**: 48 hours acknowledgment

**Best For**:
- Detailed feature requests
- Workflow feedback
- Documentation suggestions
- Non-urgent issues

---

## Support Tiers

### Beta Participant Support (You!)

✅ **Included**:
- Office hours access (2x per week)
- Private Slack channel
- Email support (4-hour P0 response)
- GitHub issue priority tagging
- Direct line to engineering team
- Early access to new features
- Influence on roadmap

❌ **Not Included** (Available in Commercial):
- 24/7 on-call support
- Dedicated customer success manager
- SLA guarantees
- Custom integration development
- Training sessions for team

**Upgrade**: Contact partnerships@aureus.ai to discuss commercial terms.

---

## Common Support Scenarios

### Scenario 1: "I Can't Get It Working"

**Path**: Onboarding Help
1. **Check**: [Onboarding Guide](./onboarding.md) - 30-minute setup
2. **Check**: [Known Issues](./known-issues.md) - see if it's a known problem
3. **Try**: [Troubleshooting section](./onboarding.md#troubleshooting) in onboarding
4. **Ask**: Post in Slack with `🔥` emoji for urgent help
5. **Escalate**: If still stuck after 2 hours, email beta@aureus.ai with logs

---

### Scenario 2: "I Found a Bug"

**Path**: Bug Report
1. **Verify**: Check [Known Issues](./known-issues.md) first
2. **Document**: Gather reproduction steps, logs, environment details
3. **Report**: 
   - **Critical/High**: Email beta@aureus.ai + post in Slack
   - **Medium/Low**: GitHub Issue or feedback form
4. **Follow Up**: We'll respond within SLA with tracking number

---

### Scenario 3: "How Do I...?"

**Path**: Documentation & Community
1. **Search**: [docs/README.md](../README.md) - documentation index
2. **Try**: [Quick Reference](../QUICK_REFERENCE.md) - common tasks
3. **Ask**: Post in Slack - someone may have done this
4. **Wait**: If complex, ask in office hours for live guidance

---

### Scenario 4: "I Have a Feature Idea"

**Path**: Feature Request
1. **Check**: [roadmap.md](../../roadmap.md) - see if already planned
2. **Detail**: Write up use case, problem statement, proposed solution
3. **Submit**: 
   - **Strategic/Large**: Email beta@aureus.ai with detailed proposal
   - **Small/Enhancement**: GitHub Issue with feature request template
4. **Discuss**: We'll reach out to discuss feasibility and priority

---

### Scenario 5: "System is Down / Critical Issue"

**Path**: Emergency Escalation
1. **Assess**: Is this truly blocking production work?
2. **Act Immediately**:
   - Email beta@aureus.ai with subject: `[BETA] [P0] Critical: <brief description>`
   - Post in Slack with 🔥 emoji and @support tag
   - If security issue: Email security@aureus.ai instead
3. **Provide**: Logs, screenshots, exact error messages
4. **Expect**: Response within 4 hours (business days)

---

## Self-Service Resources

### 📚 Documentation

| Resource | Use For |
|----------|---------|
| [README.md](../../README.md) | Platform overview, quick start |
| [architecture.md](../../architecture.md) | System design, components |
| [docs/QUICK_REFERENCE.md](../QUICK_REFERENCE.md) | Fast answers to common tasks |
| [beta/onboarding.md](./onboarding.md) | 30-minute setup guide |
| [beta/known-issues.md](./known-issues.md) | Current bugs and workarounds |

### 🛠️ Troubleshooting Tools

**Built-in Diagnostics**:
```bash
# Check system health
curl http://localhost:3000/health

# View logs
docker-compose logs -f console
docker-compose logs -f postgres

# Test database connection
docker-compose exec console npm run db:test

# Validate configuration
docker-compose config
```

**Debug Mode**:
```bash
# Enable verbose logging
LOG_LEVEL=debug docker-compose up -d

# Watch logs in real-time
docker-compose logs -f --tail=100
```

---

## Support SLAs (Beta)

| Priority | First Response | Resolution Target | Availability |
|----------|---------------|-------------------|--------------|
| **P0 - Critical** | 4 hours | 24 hours | Business days |
| **P1 - High** | 24 hours | 3-5 days | Business days |
| **P2 - Medium** | 48 hours | 1-2 weeks | Business days |
| **P3 - Low** | 3-5 days | Best effort | Business days |

**Business Days**: Monday-Friday, 9 AM - 6 PM EST (excluding US holidays)

**After Hours**: Best effort via Slack. P0 issues may get faster response.

---

## Support Tips for Faster Resolution

### ✅ Do This

1. **Search first** - Check docs, known issues, Slack history
2. **Be specific** - "Agent creation fails at step 5 with error X" vs "doesn't work"
3. **Include context** - OS, version, deployment method, what you tried
4. **Attach logs** - Raw text or screenshots
5. **Show steps** - Exact reproduction sequence
6. **State impact** - "Blocks production deployment" vs "Nice to have"

### ❌ Avoid This

1. "It's broken" - No details
2. "Urgent!!!" - Everything can't be P0
3. Multiple channels simultaneously - Pick one, escalate if needed
4. Sensitive data in public - Use email for anything confidential
5. Demanding immediate fixes - We prioritize by impact, not volume

---

## Support Schedule

### Regular Hours

- **Monday-Friday**: 9 AM - 6 PM EST
- **Email/Slack**: Monitored during business hours
- **Office Hours**: Tuesday/Thursday 3-4 PM EST

### Holidays (US)

We're closed on US federal holidays. Announced 1 week in advance in Slack.

### After Hours

- **Slack**: Best effort monitoring
- **Email**: Queued for next business day
- **P0 Issues**: May get after-hours response (no guarantee)

---

## Escalation Path

If you're not getting the support you need:

1. **Wait for SLA** - Check response time commitments above
2. **Bump the thread** - Reply to your original message after SLA expires
3. **Try different channel** - If Slack isn't working, try email
4. **Request escalation** - In Slack: "@support please escalate"
5. **Email leadership** - Last resort: founders@aureus.ai

**Note**: Escalation is for when process breaks down, not to speed up P2/P3 issues.

---

## Feedback on Support

How are we doing? Tell us!

- **Post-Resolution Survey**: Short 2-question survey after issue closed
- **Monthly Survey**: Feedback on overall beta support experience
- **Office Hours**: Share feedback live
- **Email**: support-feedback@aureus.ai

Your feedback helps us improve support for all beta participants.

---

## FAQs

**Q: Can I call you?**
A: No phone support during beta. Join office hours for live interaction.

**Q: What if I need help outside business hours?**
A: Post in Slack for community help. Official support resumes next business day.

**Q: Do you offer paid priority support?**
A: Not during beta. Contact partnerships@aureus.ai for commercial support options.

**Q: Can I request a private debugging session?**
A: Yes! Email beta@aureus.ai to schedule. Subject to engineering availability.

**Q: What if my issue is confidential?**
A: Email beta@aureus.ai (never post in public GitHub or Slack).

**Q: How do I report security vulnerabilities?**
A: Email security@aureus.ai immediately. Do not post publicly. We follow responsible disclosure.

**Q: Can I get support for custom integrations?**
A: Community support in Slack. Custom development requires commercial agreement.

---

## Emergency Contacts

**Critical System Outage**: beta@aureus.ai + Slack @support

**Security Emergency**: security@aureus.ai

**Business Emergency**: founders@aureus.ai

---

**Next Steps:**
- Join [Slack Channel](https://aureus-beta.slack.com/signup)
- Bookmark [Office Hours Calendar](https://calendar.aureus.ai/beta)
- Review [Feedback Guidelines](./feedback.md)
- Check [Known Issues](./known-issues.md)
- Read [Onboarding Guide](./onboarding.md)

---

**Thank you for participating in the Aureus Agentic OS Beta!** 🚀

We're here to help you succeed. Don't hesitate to reach out.
