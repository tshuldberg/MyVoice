# Product Marketing Context

*Last updated: 2026-02-14*

## Product Overview
**One-liner:**  
Free, private dictation for macOS. Your voice never leaves your Mac.

**What it does:**  
MyVoice is a menu bar dictation app for macOS. Users double-tap `fn`, speak naturally, and text is typed into the currently focused text field. Speech recognition runs on-device via whisper.cpp, with no cloud transcription and no account required.

**Product category:**  
macOS dictation software; voice-to-text app; privacy-first productivity tool.

**Product type:**  
B2C desktop software (open-source utility).

**Business model:**  
Free forever software, open source (MIT), optional voluntary support via Buy Me a Coffee.

## Target Audience
**Target companies:**  
Not company-targeted by default. Primary audience is individual Mac users; secondary audience is privacy-conscious teams and developers evaluating internal tooling.

**Decision-makers:**  
Individual user (self-serve install decision). For workplace adoption: engineering/security/privacy-minded evaluators.

**Primary use case:**  
Dictate text into any Mac app quickly without sending voice data to external servers.

**Jobs to be done:**  
- Capture text faster than typing for messages, docs, notes, and code comments.  
- Dictate in sensitive contexts where cloud transcription is not acceptable.  
- Use reliable offline dictation once initial setup is complete.

**Use cases:**  
- Writing messages in Slack, iMessage, email, and notes apps.  
- Drafting in editors like VS Code and Terminal workflows.  
- Accessibility/ergonomics support to reduce typing load.  
- Travel/low-connectivity usage where internet is unavailable.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Privacy-focused Mac user (primary) | Data stays local, no account, no subscription | Existing tools send voice to cloud or charge monthly | Fully local processing, free forever |
| Busy knowledge worker | Speed and low friction | Context switching and typing overhead | Double-tap `fn`, speak, text appears in place |
| Developer/technical evaluator | Transparency and inspectability | Black-box claims are hard to trust | Open-source MIT codebase and explicit privacy model |

## Problems & Pain Points
**Core problem:**  
Mac users want fast dictation that is private, simple, and affordable.

**Why alternatives fall short:**  
- Many alternatives require cloud processing and recurring subscriptions.  
- Built-in dictation is often perceived as limited or unreliable for daily heavy use.  
- Some tools add complexity (accounts, formatting layers, extra workflow steps).

**What it costs them:**  
Recurring software spend, slower writing workflows, and privacy risk discomfort when dictating sensitive content.

**Emotional tension:**  
Users feel forced to choose between accuracy/convenience and privacy/control.

## Competitive Landscape
**Direct:** Wispr Flow, Superwhisper, macOS Dictation — fall short for privacy-first buyers when cloud dependence, pricing, or setup complexity conflicts with local-first expectations.  
**Secondary:** Generic transcription assistants and AI writing tools — solve related output goals but often require copy/paste and cloud workflows.  
**Indirect:** Manual typing and keyboard-only workflows — avoid privacy concerns but are slower and higher effort for many users.

## Differentiation
**Key differentiators:**  
- Local-only transcription via whisper.cpp (no cloud transcription path).  
- Free forever and open source (MIT).  
- No account, no login, no telemetry after model download.  
- Simple activation: double-tap `fn` to dictate anywhere.

**How we do it differently:**  
MyVoice prioritizes predictable local operation and low friction over AI-heavy post-processing features.

**Why that's better:**  
For privacy-sensitive users, this model reduces data exposure risk, recurring cost, and onboarding friction.

**Why customers choose us:**  
They want practical dictation that is private by design, transparent, and cost-free.

## Objections
| Objection | Response |
|-----------|----------|
| "Will this upload my voice?" | No. Transcription is local via whisper.cpp; after one-time dependency/model setup, normal use does not require cloud calls. |
| "Is it as accurate as cloud AI dictation?" | It optimizes for privacy and simplicity first. Accuracy is strong for many cases, but users needing maximum AI post-processing may prefer cloud-first tools. |
| "Is setup hard?" | First launch handles dependency/model setup with progress UI; after setup, usage is just double-tap `fn` and speak. |

**Anti-persona:**  
Users who primarily want AI rewriting/formatting, highest possible cloud-model accuracy, or enterprise admin controls from day one.

## Switching Dynamics
**Push:**  
Subscription fatigue, discomfort with cloud voice processing, and inconsistent built-in dictation experiences.

**Pull:**  
Clear privacy promise, open-source transparency, no-cost adoption, quick in-place dictation workflow.

**Habit:**  
Existing keyboard habits and familiarity with incumbent tools.

**Anxiety:**  
Concern about setup effort, microphone/accessibility permissions, and whether local accuracy will meet expectations.

## Customer Language
**How they describe the problem:**  
- "I just want dictation that doesn't send my voice to the cloud."  
- "I’m tired of paying monthly for basic voice typing."  
- "Mac dictation works sometimes, but not reliably enough for daily use."

**How they describe us:**  
- "Double-tap fn and talk."  
- "Your voice never leaves your Mac."  
- "Free, private dictation for macOS."

**Words to use:**  
private, on-device, local-only, offline, free forever, no account, open source, simple, reliable.

**Words to avoid:**  
AI magic, perfect accuracy, effortless setup, enterprise-grade (unless verified), best-in-class (without proof).

**Glossary:**  
| Term | Meaning |
|------|---------|
| whisper.cpp | Local speech-to-text engine used for transcription |
| on-device | Processing performed on the user’s Mac, not a remote server |
| local-only | Product design where cloud transcription is not part of core usage |
| accessibility permission | macOS permission needed to type text into other apps |

## Brand Voice
**Tone:**  
Direct, transparent, pragmatic.

**Style:**  
Short sentences, concrete claims, minimal hype, explicit tradeoffs.

**Personality:**  
Privacy-first, honest, technical, user-respecting, no-nonsense.

## Proof Points
**Metrics:**  
- Price: $0 (free forever).  
- One-time model download: ~148MB (current README claim).  
- Core runtime network behavior: no ongoing cloud transcription requirement after setup.

**Customers:**  
No named customer logos documented yet.

**Testimonials:**  
> "Double-tap fn. Start talking. Text appears where your cursor is." — Current product positioning (internal copy)

**Value themes:**  
| Theme | Proof |
|-------|-------|
| Privacy by default | Local whisper.cpp processing and no account requirement |
| Transparency | Open-source MIT repository |
| Low cost | Free forever model with optional donation support |
| Workflow simplicity | Single hotkey activation and in-place typing |

## Goals
**Business goal:**  
Grow trusted adoption of MyVoice as the default privacy-first dictation option for Mac users.

**Conversion action:**  
Primary: download/install from GitHub releases (or App Store listing when applicable).  
Secondary: star/watch the repository, share with others, optional donation support.

**Current metrics:**  
Not formally instrumented in-repo yet. Recommended initial metrics: release-download conversion, first-run completion rate (permissions + model setup), repeat weekly usage proxy, and voluntary support conversion.

## Notes for Future Updates
- Replace inferred "customer language" with verbatim user quotes from issues, reviews, support, and interviews.  
- Validate competitor/pricing/feature claims on a regular cadence before external use.  
- Update proof points when instrumentation is added.

