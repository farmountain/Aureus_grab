# Feedback Guidelines - Aureus Agentic OS Beta

## How to Provide Feedback

We value your feedback! Here are the channels and guidelines for sharing your experience with Aureus Agentic OS.

## Feedback Channels

### 1. **Weekly Office Hours** (Preferred)
- **Schedule**: Every Tuesday & Thursday, 3-4 PM EST
- **Link**: Provided in beta participant email
- **Best For**: Interactive discussions, live demos of issues, architectural questions

### 2. **Beta Feedback Form**
- **Link**: https://forms.gle/[beta-feedback-form]
- **Response Time**: 48 hours
- **Best For**: Detailed feature requests, workflow issues, documentation gaps

### 3. **Bug Reports**
- **Method**: GitHub Issues with `[BETA]` tag
- **Template**: Use `.github/ISSUE_TEMPLATE/beta-bug-report.md`
- **Best For**: Reproducible bugs, technical errors, unexpected behavior

### 4. **Slack Channel** (Beta Participants Only)
- **Channel**: `#aureus-beta-participants`
- **Best For**: Quick questions, community discussions, sharing workarounds

### 5. **Email**
- **Address**: beta@aureus.ai
- **Response Time**: 48-72 hours
- **Best For**: Private concerns, security issues, partnership inquiries

## What We're Looking For

### Critical Feedback Areas

1. **Workflow Usability**
   - How easy is it to create and deploy agents?
   - Are the tools intuitive?
   - What's confusing or unclear?

2. **Performance & Reliability**
   - Response times for workflow execution
   - Memory usage patterns
   - Crash frequency and conditions
   - Recovery from failures

3. **Documentation Quality**
   - Is information easy to find?
   - Are examples helpful?
   - What's missing?
   - What's confusing?

4. **Feature Gaps**
   - What capabilities are you missing?
   - What workarounds are you using?
   - What would make your workflows easier?

5. **Integration Experience**
   - How smooth is integration with your stack?
   - What connectors are missing?
   - Authentication/authorization issues?

### Nice-to-Have Feedback

- UI/UX improvements
- Performance optimization ideas
- Feature enhancement suggestions
- Comparison with other platforms
- Use case ideas

## Feedback Format Guidelines

### Bug Reports

**Use This Template:**
```markdown
**Summary**: Brief description

**Environment**:
- OS: Windows/Linux/macOS
- Deployment: Docker/K8s
- Version: [from VERSION file]

**Steps to Reproduce**:
1. ...
2. ...
3. ...

**Expected Behavior**: What should happen

**Actual Behavior**: What actually happens

**Logs/Screenshots**: [Attach if available]

**Impact**: Critical/High/Medium/Low
```

### Feature Requests

**Use This Template:**
```markdown
**Feature**: Brief title

**Use Case**: What problem does this solve?

**Current Workaround**: How are you handling this now?

**Proposed Solution**: Your idea (optional)

**Priority**: Must-have/Nice-to-have

**Affected Workflows**: Which parts of your workflow need this?
```

### General Feedback

**Use This Template:**
```markdown
**Area**: Workflow/Documentation/Performance/Integration/UI

**Observation**: What you noticed

**Context**: When does this occur?

**Suggestion**: How to improve (optional)

**Impact**: How much does this affect your usage?
```

## Feedback Incentives

### Recognition Program

- **Top Contributor Badge**: For participants providing 5+ actionable feedback items
- **Early Feature Access**: Test new features before general beta release
- **Priority Support**: Faster response times for top contributors
- **Beta Credits**: Extended free tier credits for GA launch

### Monthly Spotlight

We highlight one beta participant each month:
- Featured in newsletter
- Case study published (with permission)
- 1:1 with founding team
- Permanent discount on commercial tier

## Feedback Response Process

### What Happens to Your Feedback?

1. **Acknowledgment** (24 hours)
   - We confirm receipt
   - Assign tracking number
   - Initial priority assessment

2. **Triage** (48 hours)
   - Engineering team reviews
   - Categorize: Bug/Feature/Enhancement
   - Assign priority: P0/P1/P2/P3
   - Add to roadmap or sprint

3. **Updates** (Weekly)
   - Status updates on all P0/P1 items
   - Monthly updates on P2/P3 items
   - Announcement when resolved

4. **Verification** (As resolved)
   - We notify you when fixed
   - Request verification
   - Close loop with follow-up

### Priority Definitions

| Priority | Description | Timeline |
|----------|-------------|----------|
| **P0** | Critical - blocks workflows | 24-48 hours |
| **P1** | High - major impact | 1 week |
| **P2** | Medium - workaround exists | 2-4 weeks |
| **P3** | Low - enhancement | Best effort |

## Feedback Quality Tips

### ✅ Good Feedback Examples

**Bug Report:**
> "Agent Studio crashes when generating blueprints with 10+ capabilities. Reproduced 3 times on Windows 11, Docker deployment. Error: 'Maximum call stack exceeded'. Logs attached. **Blocks agent creation for complex workflows.**"

**Feature Request:**
> "Need webhook support for external event triggers. Currently polling APIs every 30s (inefficient). Would trigger workflows from Stripe payments, GitHub PRs, etc. **High priority for our CI/CD use case.**"

**Documentation Feedback:**
> "Memory rollback guide (docs/memory-quick-start.md) unclear on retention policies. Tried steps 1-5 but snapshots disappeared after 7 days unexpectedly. **Add section on retention configuration.**"

### ❌ Less Helpful Feedback

- "Doesn't work" (no details)
- "Too slow" (no metrics)
- "Add more features" (no specifics)
- "UI is ugly" (no actionable suggestions)
- "Just like [competitor]" (no explanation of differences needed)

## Confidentiality & Privacy

### What We Do With Feedback

- **Aggregate anonymously** for analytics
- **Attribute publicly** only with permission
- **Keep private** any sensitive/proprietary information
- **Never share** customer data with third parties

### Sharing Your Feedback

We may:
- Quote feedback in roadmap updates (anonymized by default)
- Reference use cases in marketing (with explicit permission)
- Cite statistics (aggregated, no PII)

If you want feedback kept **strictly confidential**, mark it with `[CONFIDENTIAL]` prefix.

## Feedback FAQ

**Q: How long will you support the beta?**
A: Minimum 12 weeks (see [overview.md](./overview.md)). Extended based on feedback quality.

**Q: Will my feedback influence the roadmap?**
A: Absolutely! Beta feedback directly drives priorities for GA release.

**Q: Can I provide feedback anonymously?**
A: Yes, use the feedback form without identifying information. However, we can't follow up or recognize anonymous contributors.

**Q: What if my feedback contains security issues?**
A: Email security@aureus.ai immediately. Do NOT post publicly or in Slack.

**Q: Can I request features for my specific use case only?**
A: We prioritize broadly applicable features, but unique use cases help us understand edge cases.

**Q: How do I know if my feedback was useful?**
A: We'll let you know! Plus, check the monthly beta newsletter for highlights.

## Feedback Metrics (Transparency)

We track:
- **Response Rate**: % of feedback acknowledged within 24h (Target: 95%)
- **Resolution Rate**: % of P0/P1 items resolved within SLA (Target: 90%)
- **Satisfaction Score**: Post-beta survey rating (Target: 8/10)

Current beta metrics published monthly in office hours.

## Thank You!

Your feedback is critical to making Aureus Agentic OS production-ready for enterprises. We're grateful for your time and insights.

**Questions about feedback?** Ask in office hours or email beta@aureus.ai.

---

**Next Steps:**
- Review [Known Issues](./known-issues.md)
- Check [Support Channels](./support.md)
- Read [Onboarding Guide](./onboarding.md)
