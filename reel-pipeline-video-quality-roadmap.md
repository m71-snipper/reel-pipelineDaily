# Reel Pipeline — Video Quality Upgrade & Meta-First Development Roadmap

## 1. Project Goal

Build an automated quote-to-reel pipeline that produces polished, engaging vertical videos for Instagram and Facebook, while keeping TikTok code isolated and disabled until API/account approval is obtained.

The system should prioritize deterministic, testable editing logic and use AI only where it provides clear value.

## 2. Current Direction

- **Active platforms:** Instagram + Facebook
- **Paused platform:** TikTok
- Do **not** delete TikTok integration code.
- TikTok must never block generation, validation, storage, or Meta publishing.
- Enable TikTok again only after the account/API is approved and the integration is revalidated.

## 3. Target Pipeline

```text
QUOTE
  ↓
CONTENT ANALYSIS
  ↓
HOOK
  ↓
STORYBOARD / VISUAL BEATS
  ↓
VISUAL CLIP SEARCH + SCORING
  ↓
TIMELINE / EDIT PLAN
  ↓
VOICE + WORD ALIGNMENT
  ↓
MUSIC + AUDIO MIX
  ↓
DYNAMIC CAPTIONS
  ↓
MOTION + TRANSITIONS + COLOR
  ↓
AUTHOR / BRANDING
  ↓
FFMPEG RENDER
  ↓
QUALITY VALIDATION
  ↓
STORE
  ↓
INSTAGRAM + FACEBOOK
```

## 4. Highest-Priority Improvements

1. Multi-clip visual editing
2. Better visual candidate scoring
3. Narration-driven timeline editing
4. Dynamic word-synchronized captions
5. Better hooks
6. Audio normalization and ducking
7. Subtle motion effects
8. Better music selection
9. Color grading and adaptive overlays
10. Better endings, author treatment, and branding
11. Social safe zones
12. Expanded quality validation
13. Asset caching and debug artifacts
14. Meta publishing hardening

---

# 5. Content Intelligence

## 5.1 Quote Analyzer

Create a deterministic content-analysis stage that extracts:

- category
- topic
- sentiment
- mood
- intensity
- key concepts
- important words/phrases
- likely visual concepts
- pacing suggestion
- hook opportunity
- ending opportunity

Example categories:

- motivational
- stoic
- philosophy
- relationships
- success
- discipline
- mindset
- technology
- leadership
- life

The analyzer should return structured JSON so later stages do not need to reinterpret the quote.

## 5.2 Hook System

Support three hook modes:

- `NONE`
- `SUBTLE`
- `STRONG`

Hooks should be generated from the quote's actual idea rather than generic clickbait.

Possible hook patterns:

- provocative statement
- short question
- contradiction
- curiosity gap
- direct challenge

Hook duration should be short and should not unnecessarily extend the reel.

---

# 6. Storyboard System

Create a storyboard planner that converts the quote/narration into visual beats.

Each beat should contain fields similar to:

```json
{
  "text": "...",
  "start": 0,
  "end": 2.8,
  "visualQuery": "...",
  "mood": "...",
  "energy": 0.6,
  "transition": "cut"
}
```

The storyboard should be the bridge between content analysis and video editing.

Do not force every sentence to use exactly one clip. A beat may contain multiple clips when useful.

---

# 7. Visual Selection

## 7.1 Multi-Clip Editing

Replace the current one-background-video approach with multiple visual clips.

A typical reel should use several clips with different visual compositions while maintaining a coherent mood.

Avoid excessive cutting. The edit should feel intentional rather than random.

## 7.2 Pexels Candidate Scoring

Do not randomly select the first suitable Pexels result.

Score candidates using factors such as:

- semantic relevance
- portrait suitability
- resolution
- aspect ratio
- duration
- motion level
- composition
- category match
- duplicate/similarity penalty
- visual quality

Use a weighted deterministic score.

## 7.3 Visual Diversity

Prevent consecutive clips from being visually repetitive.

Track recent clip characteristics such as:

- dominant subject
- camera movement
- composition
- location type
- color family
- query/topic

Apply a diversity penalty when candidates are too similar.

## 7.4 Asset Caching

Cache downloaded visual assets so repeated generation does not repeatedly hit external providers.

Cache keys should account for the source/provider and asset identity.

---

# 8. Timeline / Editing Engine

The narration timeline should be the master timeline.

All visual, caption, music, and transition decisions should align to it.

Avoid independently calculating durations for each subsystem because this creates drift and A/V synchronization problems.

## 8.1 Clip Duration Rules

Clip duration should depend on:

- narration density
- beat duration
- visual complexity
- music energy
- transition type

Very short clips should be avoided unless intentionally used for emphasis.

## 8.2 Transitions

Support a small set of tasteful transitions:

- hard cut
- crossfade
- dip to black
- subtle blur transition
- motion-based cut

Do not use transitions simply because they are available.

---

# 9. Motion and Visual Effects

Use subtle movement to make still-feeling footage more dynamic.

Possible effects:

- slow zoom in
- slow zoom out
- horizontal pan
- vertical pan
- gentle crop movement
- very small rotation where appropriate

Effects should be deterministic and category-aware.

Avoid excessive effects that make the reel look like a template.

---

# 10. Captions

## 10.1 Phrase-Aware Captions

Use word alignment to create phrase-aware caption groups instead of one large subtitle block.

Caption groups should be:

- easy to read
- short enough for mobile viewing
- synchronized with speech
- visually consistent

## 10.2 Word Highlighting

Use word-level alignment to emphasize the currently spoken word or important words.

Highlighting should remain readable and should not create excessive visual noise.

## 10.3 Caption Styles

Create reusable presets:

- cinematic
- motivational
- stoic
- philosophy
- tech
- minimal

Each preset can define:

- font
- size
- weight
- line spacing
- shadow/stroke
- highlight treatment
- animation
- maximum lines
- safe-zone position

## 10.4 Dynamic Caption Placement

Initially support:

- top
- center
- bottom

Later, add visual-region detection so captions avoid important subjects/faces.

## 10.5 Safe Zones

Keep important captions away from Instagram/Facebook UI regions.

Define reusable vertical safe-zone constants rather than hard-coding positions in multiple places.

---

# 11. Visual Overlay and Color

Avoid using one global heavy black overlay for every reel.

Replace it with adaptive techniques such as:

- localized darkening behind captions
- gradients
- edge darkening
- adaptive contrast
- subtle vignette

Create category-aware color grading presets.

Examples:

- motivational: clean, energetic contrast
- stoic: restrained, darker tone
- philosophy: cinematic and muted
- tech: crisp/high-contrast treatment

Do not over-grade footage.

---

# 12. Audio System

## 12.1 Voice

Voice narration should remain the primary audio element.

Normalize narration consistently across generated reels.

## 12.2 Music Ducking

Automatically reduce music volume during narration.

Implement sidechain-style or envelope-based ducking with configurable attack/release.

Music should support the voice rather than compete with it.

## 12.3 Headroom

Maintain adequate headroom and avoid clipping.

Apply appropriate fades at the beginning and end.

## 12.4 Music Selection

Score music using:

- mood
- category
- energy
- tempo
- instrumentation
- voice density
- reel duration
- pacing

Avoid purely random music selection.

## 12.5 Beat-Aware Editing

Beat detection may be used as a secondary editing signal.

Priority should remain:

```text
Narration / meaning > storyboard timing > visual pacing > music beats
```

Do not force narration to fit the beat.

## 12.6 Sound Effects

Optionally add subtle SFX for:

- opening hook
- important emphasis
- transitions
- closing moment

Use sparingly.

---

# 13. Ending Design

Do not allow reels to simply stop when the narration ends.

Create intentional endings such as:

- short visual hold
- author reveal
- subtle fade
- final phrase emphasis
- branded end frame

The ending should feel like part of the edit.

---

# 14. Author and Branding

Author information should generally be subtle.

Possible placement:

- near the end
- lower safe zone
- small supporting text

Optional channel branding can include:

- handle
- small logo
- consistent typography

Branding must not overpower the quote.

---

# 15. Quality Validation

Expand validation beyond basic file existence.

Validate:

- file exists
- valid MP4/container
- codec
- pixel format
- resolution
- portrait aspect ratio
- FPS
- duration
- audio codec
- sample rate
- audio presence
- A/V synchronization
- caption presence
- black/frozen frames where measurable
- suspiciously low file size
- audio clipping where measurable
- expected narration duration

Return structured validation results instead of a single boolean.

Example:

```json
{
  "valid": true,
  "checks": {
    "resolution": true,
    "fps": true,
    "audio": true,
    "sync": true,
    "captions": true
  },
  "warnings": []
}
```

Quality reports should contain measurable facts, not arbitrary subjective AI scores.

---

# 16. Debug Artifacts

For failed or debug generations, optionally save:

- `storyboard.json`
- `alignment.json`
- `metadata.json`
- generated subtitle file
- contact sheet of selected clips
- final FFmpeg command/log
- validation report

These artifacts should make failed renders diagnosable without rerunning the entire pipeline.

---

# 17. Suggested Architecture

Use a modular structure similar to:

```text
src/
├── config/
│   ├── categories.js
│   ├── social.js
│   └── quality.js
├── firebase/
│   ├── quoteRepository.js
│   └── jobRepository.js
├── pipeline/
│   ├── generateReel.js
│   ├── validate.js
│   └── storyboard.js
├── content/
│   ├── analyzer.js
│   └── hooks.js
├── providers/
│   ├── pexels.js
│   ├── jamendo.js
│   ├── edgeTts.js
│   └── googleTts.js
├── video/
│   ├── composer.js
│   ├── clipSelector.js
│   ├── transitions.js
│   ├── effects.js
│   ├── colorGrade.js
│   └── audioMixer.js
├── subtitles/
│   ├── alignment.js
│   ├── captions.js
│   ├── renderer.js
│   └── styles/
│       ├── cinematic.js
│       ├── motivational.js
│       ├── stoic.js
│       └── tech.js
├── social/
│   ├── instagram.js
│   ├── facebook.js
│   ├── tiktok.js
│   └── publisher.js
└── quality/
    ├── validator.js
    ├── audio.js
    └── timing.js
```

This is an architectural direction. Do not create every file at once if the current codebase already has equivalent modules.

Refactor incrementally around existing functionality.

---

# 18. Social Provider Architecture

Separate generation from publishing.

```text
GENERATE
   ↓
VALIDATE
   ↓
STORE
   ↓
PUBLISH
```

Use a common publisher interface where practical.

Example conceptual structure:

```text
publisher
 ├── instagram
 ├── facebook
 └── tiktok
```

Each provider should handle its own authentication, upload, polling, retries, and API-specific requirements.

## TikTok

- Keep implementation isolated.
- Set active TikTok publishing to disabled.
- Do not let TikTok failure stop Meta publishing.
- Do not spend additional development time on TikTok unless required for shared architecture.
- Re-enable after approval and re-test the complete flow.

## Instagram + Facebook

Treat these as the active production targets.

Harden:

- authentication
- upload handling
- retries
- idempotency
- status polling
- error reporting
- media hosting
- publishing logs

For production Meta publishing, prefer project-controlled Firebase/Cloud Storage or another reliable production hosting mechanism over temporary public file hosts.

---

# 19. Category Creative Profiles

Upgrade category configuration from simple visual/music/voice settings to full creative profiles.

A profile can define:

```text
category
mood
visual style
visual search terms
clip pacing
caption preset
caption position
font treatment
music mood
music energy
voice profile
color grade
overlay strength
transition preference
motion preference
hook preference
ending preference
```

This allows the same editing engine to produce different creative identities without duplicating code.

---

# 20. Editor Brain

The long-term architecture should resemble:

```text
Quote
 ↓
Quote Analysis
 ↓
Storyboard
 ↓
Visual Planner
 ↓
Clip Selection
 ↓
Editing Plan
 ↓
Voice + Word Timing
 ↓
Music + Audio Plan
 ↓
Captions
 ↓
Effects / Transitions / Color
 ↓
Render
 ↓
Validate
 ↓
Publish
```

The “Editor Brain” should output an explicit edit plan rather than directly rendering everything in one function.

This makes the pipeline easier to test, debug, and improve.

---

# 21. Implementation Phases

## Q1 — Multi-Clip Storyboard

- Build storyboard data structure.
- Split narration into visual beats.
- Support multiple clips per reel.
- Align clip timing to narration.

## Q2 — Visual Candidate Scoring

- Fetch multiple candidates.
- Score candidates.
- Penalize duplicates.
- Prefer portrait/high-resolution assets.
- Add caching.

## Q3 — Narration-Driven Timeline

- Make word/phrase timing authoritative.
- Generate one master timeline.
- Make clips, captions, effects, and music consume the same timeline.

## Q4 — Dynamic Captions

- Phrase-aware grouping.
- Word highlighting.
- Caption style presets.
- Safe-zone placement.

## Q5 — Motion + Transitions

- Add subtle zoom/pan/crop movement.
- Add a small transition library.
- Make effects deterministic.

## Q6 — Audio Mixing

- Normalize narration.
- Normalize/level music.
- Add ducking.
- Add fades.
- Validate audio presence and sync.

## Q7 — Music Intelligence

- Score tracks by mood/energy/tempo.
- Add optional beat-aware cuts.
- Keep narration priority.

## Q8 — Color + Overlay

- Add category color profiles.
- Replace heavy global overlay.
- Add adaptive caption backgrounds.

## Q9 — Hooks + Endings + Branding

- Implement hook modes.
- Improve final moments.
- Add subtle author/handle treatment.

## Q10 — Platform Safety + Validation

- Define Meta safe zones.
- Expand technical validation.
- Add A/V sync checks.

## Q11 — Debugging + Caching

- Cache provider assets.
- Save debug artifacts.
- Generate contact sheets.
- Improve failure diagnostics.

## Q12 — Meta Publishing Hardening

- Production media hosting.
- Retry logic.
- Idempotency.
- Upload/status handling.
- Structured publishing logs.

## Q13 — Production Automation

- Queue processing.
- Scheduled generation.
- Retry failed jobs.
- Monitor provider/API failures.
- Store generation metadata.

## Q14 — TikTok Reactivation

Only after approval:

- verify current API requirements
- re-enable provider
- test upload flow
- test publishing flow
- add provider-specific validation

---

# 22. Testing Strategy

Each major module should have deterministic tests.

Test at least:

- quote analysis
- storyboard timing
- clip selection
- diversity logic
- caption grouping
- word highlighting
- transition timing
- audio duration
- ducking behavior
- final duration
- A/V synchronization
- safe zones
- validation failures
- provider failure isolation

Create small fixture quotes representing different lengths and categories.

Examples:

- very short quote
- medium quote
- long quote
- punctuation-heavy quote
- quote with unusual words
- quote with multiple ideas

---

# 23. Logging

Every generation should have a job ID.

Log structured events such as:

```text
job_created
quote_loaded
analysis_complete
storyboard_created
visual_candidates_fetched
visual_selected
audio_generated
alignment_complete
render_started
render_complete
validation_complete
stored
instagram_publish_started
instagram_publish_complete
facebook_publish_started
facebook_publish_complete
```

Provider errors should include enough context to diagnose the problem without exposing secrets.

Never log API keys, access tokens, or other credentials.

---

# 24. Failure Handling

A single provider failure should not unnecessarily destroy the entire workflow.

Examples:

- One Pexels candidate fails → try another candidate.
- One music asset fails → use another suitable track.
- TikTok fails → Meta publishing continues.
- Instagram fails → Facebook can still publish when independent.
- Validation fails → do not publish the invalid render.

Use bounded retries and clear terminal failure states.

---

# 25. Performance

Avoid unnecessary repeated work.

Use caching for:

- video assets
- music assets
- TTS output
- alignment data where safe
- metadata

Prefer generating the storyboard and edit plan once, then render from those deterministic inputs.

---

# 26. Security

Keep all secrets in environment/configuration management.

Never place secrets in generated JSON, debug artifacts, logs, or source control.

Validate external URLs and provider responses.

Do not trust downloaded media metadata blindly.

---

# 27. Definition of Done for a High-Quality Reel

A reel should not be considered production-ready unless:

- visuals are relevant
- multiple visuals are used when appropriate
- visual changes align with narration
- captions are readable
- captions are synchronized
- key words can be emphasized
- visuals are not overly repetitive
- motion is subtle
- transitions are intentional
- narration is clear
- music does not overpower narration
- audio has reasonable headroom
- ending feels intentional
- author/branding is subtle
- output is portrait/mobile-friendly
- Meta safe zones are respected
- file passes technical validation
- A/V synchronization is acceptable
- no invalid/black/frozen render is published

---

# 28. Agent Operating Instructions

When implementing this roadmap:

1. First inspect the existing codebase.
2. Reuse existing modules where they already solve part of the problem.
3. Do not blindly create duplicate modules.
4. Make incremental changes.
5. Keep each change testable.
6. Preserve currently working Instagram/Facebook functionality.
7. Do not remove TikTok code; isolate and disable it.
8. Do not make TikTok a dependency of the pipeline.
9. Prefer deterministic rules over unnecessary AI calls.
10. Keep API credentials out of logs/source control.
11. Validate every generated video before publishing.
12. Do not publish a render that fails validation.
13. Add structured logging around each pipeline stage.
14. Preserve debug artifacts when diagnosing failures.
15. Update the project MD/memory after meaningful architectural changes.

---

# 29. Immediate Implementation Order

Start with the highest-impact changes rather than implementing the entire roadmap at once:

```text
1. Inspect current pipeline
2. Introduce storyboard structure
3. Implement multi-clip timeline
4. Improve Pexels candidate selection/scoring
5. Make narration timing the master timeline
6. Upgrade captions with phrase + word timing
7. Add subtle motion
8. Add audio normalization + ducking
9. Improve music selection
10. Improve overlays/color
11. Improve hooks/endings/branding
12. Expand validation
13. Add caching/debug artifacts
14. Harden Instagram/Facebook publishing
15. Leave TikTok disabled until approval
```

After each phase, generate sample reels and compare the output visually and technically before moving on.

---

# 30. Project Status

**Current priority:** Instagram + Facebook video quality and publishing reliability.

**TikTok status:** paused pending API/account approval.

**Primary objective:** turn the current quote-to-reel renderer into a modular editing pipeline that behaves more like a real short-form video editor: better visual storytelling, better timing, better captions, better audio, better pacing, and stronger technical validation.

**Guiding principle:** improve the edit itself, not just add more effects.
