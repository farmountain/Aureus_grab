# Beta Application Form - Setup Guide

This document provides the configuration for setting up the Aureus Agentic OS beta program application form.

## Recommended Platform: Google Forms

**Why Google Forms?**
- Free
- Easy to set up
- Integrates with Google Sheets for responses
- Professional appearance
- Mobile-friendly
- Email notifications

**Alternative**: Typeform (better UX, but paid for advanced features)

## Form Configuration

### Form Title
**"Aureus Agentic OS - Technical Beta Application"**

### Form Description
```
Thank you for your interest in the Aureus Agentic OS technical beta program!

We're looking for technical teams to help us refine our AI agent orchestration platform before general availability. The beta program runs for 12 weeks and includes:

✅ Free access to full platform
✅ Direct line to engineering team
✅ Bi-weekly office hours
✅ Private Slack community
✅ Early access to new features
✅ Influence on roadmap

ELIGIBILITY:
- Technical background (developers, DevOps, data engineers)
- Ability to commit 5-10 hours per week
- Willingness to provide detailed feedback
- Use case that aligns with platform capabilities

TIMELINE:
- Applications accepted on rolling basis
- Acceptance notification within 5 business days
- Onboarding: 30-minute quick start
- Program duration: 12 weeks minimum

Questions? Email beta@aureus.ai
```

## Form Fields

### Section 1: Basic Information

**1. Email Address**
- Type: Email
- Required: Yes
- Validation: Valid email format
- Description: "We'll send acceptance notification and onboarding details here"

**2. Full Name**
- Type: Short answer
- Required: Yes
- Description: "First and last name"

**3. Company / Organization**
- Type: Short answer
- Required: Yes
- Description: "Your employer or startup name (or 'Independent' if freelance)"

**4. Job Title**
- Type: Short answer
- Required: Yes
- Description: "e.g., Senior Software Engineer, CTO, ML Engineer"

**5. Company Size**
- Type: Multiple choice
- Required: Yes
- Options:
  - Solo / Independent
  - 2-10 employees
  - 11-50 employees
  - 51-200 employees
  - 201-1000 employees
  - 1000+ employees

**6. Country**
- Type: Short answer
- Required: Yes
- Description: "For time zone coordination (office hours)"

---

### Section 2: Technical Background

**7. Primary Role**
- Type: Multiple choice
- Required: Yes
- Options:
  - Software Engineer / Developer
  - DevOps / Platform Engineer
  - Data Engineer / Scientist
  - ML / AI Engineer
  - Solutions Architect
  - Engineering Manager / Technical Lead
  - CTO / VP Engineering
  - Other (please specify)

**8. Technical Expertise** (Check all that apply)
- Type: Checkboxes
- Required: Yes (at least one)
- Options:
  - Docker / Containerization
  - Kubernetes / Orchestration
  - Cloud platforms (AWS/GCP/Azure)
  - CI/CD pipelines
  - Microservices architecture
  - AI/ML model deployment
  - API development
  - Database management
  - Infrastructure as Code
  - Monitoring & Observability

**9. Programming Languages** (Select your strongest 3)
- Type: Checkboxes
- Required: Yes
- Options:
  - TypeScript / JavaScript
  - Python
  - Go
  - Java / Kotlin
  - C# / .NET
  - Rust
  - Ruby
  - PHP
  - Other (please specify)

**10. Experience with AI/LLM Integration**
- Type: Multiple choice
- Required: Yes
- Options:
  - Extensive (built multiple LLM-powered applications)
  - Moderate (integrated OpenAI/Anthropic APIs in projects)
  - Basic (experimented with ChatGPT API, prompt engineering)
  - None (but interested in learning)

---

### Section 3: Use Case & Motivation

**11. Primary Use Case**
- Type: Paragraph
- Required: Yes
- Description: "What problem are you trying to solve with Aureus? Be specific about your workflow or application. (150-300 words)"
- Validation: Minimum 50 words

**12. Current Solution / Pain Points**
- Type: Paragraph
- Required: Yes
- Description: "How are you handling this today? What are the limitations or frustrations? (100-200 words)"
- Validation: Minimum 30 words

**13. Expected Workflow Volume**
- Type: Multiple choice
- Required: Yes
- Description: "How many agent workflows do you expect to run monthly?"
- Options:
  - Experimental (<100 executions/month)
  - Light usage (100-1,000 executions/month)
  - Medium usage (1,000-10,000 executions/month)
  - Heavy usage (10,000+ executions/month)
  - Don't know yet

**14. Deployment Environment**
- Type: Multiple choice
- Required: Yes
- Description: "Where do you plan to deploy Aureus?"
- Options:
  - Local / Development only
  - Cloud (AWS/GCP/Azure)
  - On-premises Kubernetes
  - Hybrid
  - Not sure yet

**15. Timeline to Production**
- Type: Multiple choice
- Required: Yes
- Description: "When do you plan to use Aureus in a production environment?"
- Options:
  - Already have a production use case (urgent)
  - Within 1-2 months
  - Within 3-6 months
  - 6+ months (experimental)
  - Just exploring, no production plans yet

---

### Section 4: Commitment & Expectations

**16. Time Commitment**
- Type: Multiple choice
- Required: Yes
- Description: "Can you commit to 5-10 hours per week for testing and feedback?"
- Options:
  - Yes, 10+ hours per week
  - Yes, 5-10 hours per week
  - Maybe, 2-5 hours per week
  - No, less than 2 hours per week

**17. Feedback Willingness**
- Type: Checkboxes
- Required: Yes (at least one)
- Description: "How will you provide feedback? (Check all that apply)"
- Options:
  - Weekly written feedback (via form or email)
  - Bi-weekly office hours participation
  - Bug reports on GitHub
  - Active in Slack community
  - User testing sessions (screenshare)
  - Feature requests and use case discussions

**18. What are you most excited to test?**
- Type: Checkboxes
- Required: No
- Options:
  - Agent orchestration & DAG workflows
  - CRV validation gates
  - Policy-based governance
  - Memory & state management
  - Tool adapters & integrations
  - Monitoring & observability
  - Agent Studio (visual builder)
  - Kubernetes deployment
  - API & SDK
  - Documentation quality

---

### Section 5: Additional Information

**19. How did you hear about Aureus?**
- Type: Multiple choice
- Required: Yes
- Options:
  - GitHub
  - Twitter / X
  - LinkedIn
  - Hacker News
  - Reddit
  - Blog post / Article
  - Conference / Meetup
  - Referral (please specify below)
  - Other (please specify)

**20. Referral Source** (if applicable)
- Type: Short answer
- Required: No
- Description: "If referred by someone, please provide their name or email"

**21. Additional Comments**
- Type: Paragraph
- Required: No
- Description: "Anything else you'd like us to know about your use case, technical environment, or expectations?"

**22. Newsletter Opt-In**
- Type: Checkboxes
- Required: No
- Options:
  - "Yes, subscribe me to the Aureus newsletter for product updates and technical content"

---

## Form Settings

### General Settings

- **Collect email addresses**: Yes (automatically via Google account)
- **Limit to 1 response**: Yes (prevent duplicate applications)
- **Allow response editing**: Yes (let applicants update before we review)
- **Email notifications**: 
  - Send me email notifications for new responses: Yes
  - To: beta@aureus.ai

### Confirmation Message

```
Thank you for applying to the Aureus Agentic OS beta program!

We'll review your application and respond within 5 business days.

NEXT STEPS:
✅ Check your email for confirmation
✅ If accepted, you'll receive:
   - Beta access credentials
   - Onboarding guide (30-minute setup)
   - Slack invite
   - Office hours calendar

QUESTIONS?
Email us at beta@aureus.ai

Follow us:
🐦 Twitter: @AureusOS
💼 LinkedIn: /company/aureus-os
⭐ GitHub: github.com/farmountain/Aureus_Agentic_OS

We're excited to have you join us on this journey!
```

## Response Handling

### Google Sheets Integration

1. **Auto-create spreadsheet**: Form responses → Create spreadsheet
2. **Sheet name**: "Beta Applications - 2026"
3. **Columns**: Auto-populated from form fields
4. **Additional columns** (manual):
   - Status (Pending / Accepted / Rejected / Waitlist)
   - Review Notes
   - Reviewer
   - Date Reviewed
   - Onboarding Scheduled (Yes/No)
   - Cohort (Week 1, Week 2, etc.)

### Response Review Process

**Criteria for Acceptance**:
1. ✅ Technical expertise (Docker, K8s, or cloud experience)
2. ✅ Clear use case with production potential
3. ✅ Time commitment (5+ hours/week)
4. ✅ Feedback willingness (multiple channels)
5. ✅ Medium to heavy expected usage

**Auto-Accept Triggers** (review manually first):
- CTO / VP Engineering with production use case
- 10+ hours/week commitment + heavy usage
- AI/ML engineer with extensive LLM experience
- Enterprise company (200+ employees) with urgent timeline

**Waitlist Criteria**:
- Good fit but reached cohort capacity
- Promising but needs more details
- Light usage + low commitment

**Rejection Reasons** (send polite decline):
- No technical background
- Less than 2 hours/week commitment
- Vague use case
- Just exploring, no intent to deploy

### Email Templates

**Acceptance Email**: See [beta/overview.md](./overview.md#acceptance-email-template)

**Waitlist Email**:
```
Subject: Aureus Beta - Waitlist Status

Hi [Name],

Thank you for applying to the Aureus Agentic OS beta program!

We've received a high volume of applications and are at capacity for the current cohort. We've added you to our waitlist and will notify you when spots open up.

WHAT THIS MEANS:
- You'll be invited to the next cohort (typically 2-4 weeks)
- We'll email you as soon as space is available
- Your application remains valid (no need to reapply)

IN THE MEANTIME:
- Explore our documentation: github.com/farmountain/Aureus_Agentic_OS
- Follow us on Twitter: @AureusOS
- Join our public Slack (limited support): aureus.ai/slack

Questions? Reply to this email.

Best regards,
The Aureus Team
```

**Rejection Email**:
```
Subject: Aureus Beta - Application Status

Hi [Name],

Thank you for your interest in the Aureus Agentic OS beta program!

After careful review, we've determined that the beta program may not be the best fit at this time. We're prioritizing applicants with:
- Production use cases requiring 5+ hours/week testing
- Technical background in cloud/container orchestration
- Specific AI agent workflow requirements

ALTERNATIVE OPTIONS:
- General Availability (Q2 2026): Free tier available
- Documentation: Full docs on GitHub
- Community: Public Slack channel for questions

We appreciate your interest and hope you'll check back at GA launch!

Best regards,
The Aureus Team
```

## Form URL

Once created, share at:
- **Landing page**: https://aureus.ai/beta
- **GitHub README**: Link in beta section
- **Twitter/LinkedIn**: Announcement posts
- **Docs**: Beta overview page

## Analytics

Track in Google Sheets:
- Applications per week
- Acceptance rate
- Average time to review
- Top use cases
- Top referral sources
- Technical background distribution

Use insights to:
- Refine acceptance criteria
- Identify patterns in successful applicants
- Plan cohort sizing
- Improve marketing messaging

---

## Setup Checklist

- [ ] Create Google Form with all fields above
- [ ] Configure form settings (email notifications, response limits)
- [ ] Test form submission flow
- [ ] Link to Google Sheets for responses
- [ ] Add Status/Review columns to sheet
- [ ] Create email templates (acceptance, waitlist, rejection)
- [ ] Set up beta@aureus.ai email forwarding
- [ ] Add form link to website/README
- [ ] Announce on social media
- [ ] Prepare first cohort onboarding calendar

---

**Questions about form setup?** Email founders@aureus.ai

**Next Steps:**
- Launch form and start accepting applications
- Review [Overview](./overview.md) for program details
- Prepare [Onboarding](./onboarding.md) materials
- Set up [Support](./support.md) channels
