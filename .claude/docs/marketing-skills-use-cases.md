# Marketing Skills Use-Case Map (MyVoice)

Last updated: 2026-02-14

## Project Context

- Product: free, open-source, privacy-first macOS dictation app.
- Primary distribution: GitHub releases, README, App Store listing, social launch posts.
- Current business model: free product with voluntary support (Buy Me a Coffee).
- Core constraint: avoid user-tracking patterns that conflict with privacy positioning.
- Current funnel reality: no account signup flow, no in-app paywall, minimal owned-channel infrastructure.

## Priority Rollout

1. `/marketing/product-marketing-context`
2. `/marketing/copywriting` + `/marketing/copy-editing`
3. `/marketing/launch-strategy` + `/marketing/social-content`
4. `/marketing/competitor-alternatives` + `/marketing/content-strategy`
5. `/marketing/seo-audit` + `/marketing/schema-markup`
6. `/marketing/analytics-tracking` + `/marketing/ab-test-setup`
7. `/marketing/free-tool-strategy` + `/marketing/marketing-ideas` + `/marketing/marketing-psychology`
8. `/marketing/referral-program` + `/marketing/pricing-strategy` + `/marketing/paid-ads`

## Skill-by-Skill Mapping

| Skill | Fit for MyVoice | Best MyVoice use cases | Expected outputs |
|---|---|---|---|
| `/marketing/product-marketing-context` | Critical now | Create shared positioning for privacy-first dictation; define ICP, objections, competitor framing, voice/tone | `.claude/product-marketing-context.md` used by all other marketing skills |
| `/marketing/copywriting` | High now | Rewrite README hero and CTA, App Store description, release page copy, landing page copy | Drafted page sections and CTA variants |
| `/marketing/copy-editing` | High now | Tighten existing README and comparison copy; remove weak claims; improve scannability | Line-level copy improvements and rationale |
| `/marketing/launch-strategy` | High now | Plan launch cadence for releases and feature drops; Product Hunt/HN/social timing | Phased launch plan with channel checklist |
| `/marketing/social-content` | High now | X/LinkedIn launch posts, release announcement threads, founder narrative posts | Platform-specific post drafts and content calendar |
| `/marketing/competitor-alternatives` | High now | Create "MyVoice vs Wispr Flow/Superwhisper/macOS Dictation" pages and messaging modules | Comparison page outlines and modular sections |
| `/marketing/content-strategy` | Medium-high now | Plan privacy/offline dictation content themes and topic clusters | 30-60 day editorial plan and topic map |
| `/marketing/seo-audit` | Medium now | Audit current web pages (README site/docs/landing) for title/meta/internal-link issues | Prioritized SEO issue list and fixes |
| `/marketing/schema-markup` | Medium now | Add structured data for app/product/FAQ/reviews on website pages | JSON-LD recommendations and validation steps |
| `/marketing/analytics-tracking` | Medium now | Define privacy-safe measurement (download clicks, install starts, docs conversions) | Event taxonomy, UTM conventions, tracking plan |
| `/marketing/ab-test-setup` | Medium later | Test hero value prop, CTA text, comparison-page structure after baseline traffic exists | Hypothesis, variants, metrics, sample-size plan |
| `/marketing/free-tool-strategy` | Medium now | Build small utilities tied to voice workflows (dictation speed estimator, privacy checklists) | Tool concept shortlist with feasibility and distribution |
| `/marketing/marketing-ideas` | High now | Generate practical low-budget growth experiments for solo/open-source distribution | Prioritized experiment backlog |
| `/marketing/marketing-psychology` | Medium now | Improve messaging with ethical principles (clarity, risk reduction, trust cues) | Messaging recommendations mapped to page sections |
| `/marketing/referral-program` | Medium later | Design "share MyVoice" loop for users/creators/open-source advocates | Referral mechanics, incentive structure, rollout plan |
| `/marketing/pricing-strategy` | Medium later | Evaluate support tiers, donation framing, or future Pro plan without harming trust | Monetization options with tradeoff analysis |
| `/marketing/paid-ads` | Low now | Only useful for tightly scoped awareness tests once conversion tracking is stable | Campaign brief, channel tests, spend guardrails |
| `/marketing/page-cro` | Medium now | Improve conversion on any landing page/README-to-download path | Page audit and prioritized conversion fixes |
| `/marketing/onboarding-cro` | Medium now | Optimize first-run setup completion (permissions + model download) to reduce drop-off | Onboarding friction audit and activation improvements |
| `/marketing/signup-flow-cro` | Low now | Relevant only if MyVoice adds account creation or waitlist signup | Signup funnel recommendations |
| `/marketing/form-cro` | Low now | Relevant if contact/waitlist/newsletter forms are introduced | Form friction analysis and field strategy |
| `/marketing/popup-cro` | Low now | Relevant only if website introduces modals/banners for capture or announcements | Trigger/copy/timing optimization plan |
| `/marketing/paywall-upgrade-cro` | Not relevant now | Not applicable until freemium/paywall model exists | N/A until paid gating is introduced |
| `/marketing/programmatic-seo` | Medium later | Scale competitor/alternative templates after proving single-page format works | Template + data model for scaled SEO pages |
| `/marketing/email-sequence` | Low-medium later | Build waitlist/onboarding/release nurture once email list exists | Email sequence map with draft emails |

## Implementation Notes

- Most marketing skills assume `.claude/product-marketing-context.md` exists. Create this first.
- For MyVoice, prioritize trust-preserving channels: transparent docs, open-source proof, and privacy claims backed by technical details.
- Delay high-funnel optimization skills (signup/paywall/form/popup heavy workflows) until those surfaces exist.

