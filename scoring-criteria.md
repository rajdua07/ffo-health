# FFO Client Health Scoring Criteria

This file defines the scoring methodology used by the AI auto-scorer. Edit this file to change how clients are evaluated. The AI will read these guidelines when generating scores.

---

## Dimensions & Weights

| Dimension | Weight | Metrics |
|-----------|--------|---------|
| Engagement | 25% | Meeting Attendance (10%), Response / Resolution Time (8%), Communication Quality (7%) |
| Progress | 23% | Project Velocity (10%), Milestone Achievement (13%) |
| Satisfaction | 18% | Direct Feedback (7%), NPS Score (6%), Complaint Frequency (5%) |
| Financial Health | 14% | Strategy Implementation (6%), Results Achieved (5%), Payment Status (3%) |
| Relationship | 11% | Trust Level (6%), Partnership Quality (5%) |
| Referral Awareness | 9% | Referral Willingness (4%), Referral Activity (3%), Network Advocacy (2%) |

---

## Scoring Bands (1-10 per metric)

### Engagement

**Meeting Attendance (10%)**
- 1-3: Chronic no-shows (>40% missed)
- 4-5: Frequently misses (20-40%)
- 6-7: Occasionally misses (10-20%)
- 8-9: Rarely misses (<10%)
- 10: Never misses

**Response / Resolution Time (8%)**
- 1-3: >7 days or no response
- 4-5: 3-7 days
- 6-7: 48-72hrs
- 8-9: 24-48hrs
- 10: <24hrs

**Communication Quality (7%)**
- 1-3: Non-responsive/unclear
- 4-5: Often incomplete
- 6-7: Needs follow-up sometimes
- 8-9: Complete when asked
- 10: Proactive, detailed

### Progress

**Project Velocity (10%)**
- 1-3: Stalled/blocked
- 4-5: Significant delays (2-4 weeks)
- 6-7: Minor delays (<2 weeks)
- 8-9: On track
- 10: Ahead of schedule

**Milestone Achievement (13%)**
- 1-3: <50% milestones hit
- 4-5: 50-74%
- 6-7: 75-89%
- 8-9: 90%+
- 10: 100% milestones hit

### Satisfaction

**Direct Feedback (7%)**
- 1-3: Complaints/dissatisfaction
- 4-5: Some concerns
- 6-7: Neutral
- 8-9: Positive when asked
- 10: Unsolicited praise

**NPS Score (6%)**
- 4-6: Detractor (0-6)
- 7-8: Passive (7-8)
- 10: Promoter (9-10)
- Use proxy if not surveyed

**Complaint Frequency (5%)**
- 1-3: Major unresolved complaints
- 4-5: Recurring issues
- 6-7: 2-3 issues resolved
- 8-9: 1 minor issue
- 10: Zero complaints

### Financial Health

**Strategy Implementation (6%)**
- 1-3: <40% or refusing
- 4-5: 40-59%
- 6-7: 60-79%
- 8-9: 80%+ implemented
- 10: All strategies implemented

**Results Achieved (5%)**
- 1-3: No measurable results
- 4-5: Below expectations
- 6-7: Partial results
- 8-9: Meeting projections
- 10: Exceeding projections

**Payment Status (3%)**
- 1-3: >30 days or disputes
- 4-5: 15-30 day delays
- 6-7: 8-14 day delays
- 8-9: Occasional 1-7 day delay
- 10: Always on time

### Relationship

**Trust Level (6%)**
- 1-3: Distrustful/adversarial
- 4-5: Withholds info
- 6-7: Somewhat guarded
- 8-9: Very open
- 10: Full transparency, trusts completely

**Partnership Quality (5%)**
- 1-3: Hostile/disrespectful
- 4-5: Demanding/difficult
- 6-7: Transactional
- 8-9: Generally collaborative
- 10: True partner, collaborative

### Referral Awareness

**Referral Willingness (4%)**
- 1-3: Would not refer
- 4-5: Unlikely to refer
- 6-7: Might refer
- 8-9: Would refer if asked
- 10: Has referred or actively offers

**Referral Activity (3%)**
- 1-3: No referrals ever
- 4-5: Mentioned once
- 6-7: 1 referral in past year
- 8-9: 2-3 referrals
- 10: Active, ongoing referral source

**Network Advocacy (2%)**
- 1-3: Would not recommend publicly
- 4-5: Neutral
- 6-7: Positive if asked
- 8-9: Mentions to peers
- 10: Champions your brand publicly

---

## AI Scoring Instructions

When scoring a client, the AI should:

1. **Use all available data** — completed tasks, open tasks, Slack messages, call transcripts, CRM notes, and events
2. **Score conservatively** — when evidence is ambiguous, lean toward the middle (5-6) rather than extremes
3. **Cite evidence** — in the observations field, reference specific data points that justify each dimension score
4. **Flag unknowns** — if a metric cannot be assessed from available data, score it 5 (neutral) and note the gap
5. **Consider recency** — recent behavior should weigh more heavily than older data
6. **Look for patterns** — a single missed meeting is different from a pattern of no-shows

## Status Thresholds

- **Healthy**: Weighted score >= 7.0
- **Watch**: Weighted score >= 5.0 and < 7.0
- **At Risk**: Weighted score < 5.0
