# Reel Pipeline — Post-Implementation Quality Audit & Agent Task Plan

## Purpose

The current agent reported that the video-quality roadmap is completed. I inspected the supplied project code rather than relying on that completion summary.

The implementation has real progress, but it is **not yet safe to call the roadmap fully complete**. The next work should focus on correctness, synchronization, visual quality, and production reliability.

**Important:** Do not rewrite the project from scratch. Keep the existing architecture and improve it incrementally.

---

# 1. Audit Result

## Implemented / partially implemented

- Multi-clip storyboard pipeline exists.
- Pexels caching and per-reel duplicate prevention exist.
- ASS captions exist.
- Word-highlight-style caption events exist.
- Category-specific caption presets exist.
- Basic zoom/motion logic exists.
- Music ducking exists.
- Instrumental Jamendo filtering exists.
- Localized caption background box exists.
- Watermark exists.
- Basic H.264/AAC validation exists.
- Meta retry wrapper exists.
- DEBUG_MODE artifacts exist.
- TikTok code remains separate enough to keep disabled.

## Not actually complete / needs correction

The biggest issues found in the code are:

1. **The alignment implementation is not truly word-level.**
2. **The VTT parser treats each VTT cue as one word**, even when the cue contains a complete phrase/sentence.
3. **The fallback timing is still proportional/estimated**, which directly conflicts with the original synchronization quality requirement.
4. **Pexels selection is not actually scored.** It filters uniqueness/duration, then randomly chooses a candidate.
5. **Storyboard visual queries do not use the quote-specific keyword**, even though the category resolver calculates one.
6. **Storyboard queries are mostly category-level generic queries**, so visual semantic relevance can remain weak.
7. **Storyboard motion uses random selection**, making output nondeterministic and potentially inconsistent.
8. **The FFmpeg zoompan implementation is risky for normal video clips** and can produce unnatural/repeated-frame motion because zoompan is being applied to video input with a large `d` value.
9. **Caption highlight color/style needs review.** The cinematic preset calls a dimmed color a highlight; the visual effect may be weaker than intended.
10. **Caption background box placement is only loosely inferred from `marginV`.** It is not actually derived from the ASS alignment/safe-zone layout.
11. **The watermark is hardcoded** as `@SuperNeuron`, rather than being a configurable branding setting.
12. **Validator only warns on wrong resolution** instead of failing, despite the stated production target of 1080x1920.
13. **Validator does not validate FPS, pixel format, audio sample rate, A/V duration relationship, or obvious stream timing problems.**
14. **Validator does not inspect caption timestamps**, because it receives only the final video path.
15. **Music selection is still basically random among the shortest five tracks.** It does not meaningfully score mood/energy/tempo/duration.
16. **The SoundHelix fallback needs an explicit publishing/licensing decision** before automated production publishing.
17. **Meta retrying the entire Instagram publish flow can duplicate publishing** if the API succeeds but the response is lost before the retry occurs.
18. **Facebook upload is also wrapped in a generic retry without idempotency/state recovery.**
19. **Firebase quote selection and finalization may use different document identifiers** if `quote_id` differs from the Firestore document ID.
20. **Generation state is stored, but there is no job lock/claim mechanism**, so concurrent runs can potentially select the same quote.
21. **There is no final intentional outro/end treatment.**
22. **The agent summary does not demonstrate that hooks were implemented.**
23. **The agent summary does not demonstrate a real transition system.**
24. **The agent summary does not demonstrate adaptive music/visual scoring.**
25. **No evidence was found that a real end-to-end rendered reel was inspected visually after these changes.**

---

# 2. CRITICAL TASK — Fix Real Word-Level Alignment

This is the highest-priority task.

## Current problem

`src/subtitles/alignment.js` parses a VTT cue as:

```text
one cue = one word
```

That is incorrect if the TTS provider outputs a cue containing multiple words.

The code also falls back to proportional character-count timing. This should not be the normal production path.

## Required implementation

Build a provider-independent alignment interface:

```js
getWordAlignment({
  audioPath,
  text,
  ttsTimingPath,
})
```

Return:

```js
[
  {
    word: "word",
    start: 0.00,
    end: 0.42
  }
]
```

## Rules

- Do not pretend phrase-level VTT cues are word-level timestamps.
- If Edge TTS exposes true word boundaries, consume those boundaries correctly.
- If it does not, use a real audio-derived alignment/transcription method.
- The fallback estimation may remain only as an explicitly marked emergency development fallback.
- Production mode should fail or clearly mark the reel as degraded when reliable alignment is unavailable.
- Add tests for:
  - one-word cues
  - multi-word cues
  - punctuation
  - repeated words
  - pauses
  - quotes with 1, 5, 20, and 50+ words
  - timestamp monotonicity

## Acceptance criterion

For a real generated quote, the caption timing must follow the spoken words closely enough that there is no obvious voice-leading-text or text-leading-voice effect.

---

# 3. CRITICAL TASK — Fix Pexels Candidate Scoring

Current code does not truly score candidates.

It currently does roughly:

1. get 30 results
2. remove seen videos
3. prefer videos long enough
4. randomly select a candidate

That is not a quality-ranking system.

## Implement a deterministic score

Example factors:

```text
relevance to query        0–30
portrait suitability      0–15
resolution quality        0–15
duration suitability      0–10
motion/composition        0–10
visual diversity          0–10
reuse penalty             0–10
```

The exact weights can be adjusted after testing.

## Requirements

- Prefer vertical/portrait-friendly assets.
- Prefer high-resolution assets.
- Prefer clips that comfortably cover the beat duration.
- Penalize clips that are barely long enough.
- Penalize repeated visual concepts.
- Avoid selecting the same Pexels ID twice in one reel.
- Keep a deterministic score in DEBUG_MODE.
- Log the top candidates and their scores.

Do not use random selection as the primary selection method.

---

# 4. CRITICAL TASK — Make Visual Queries Quote-Aware

`categories.js` already extracts a quote keyword, but the storyboard currently uses:

```js
categoryConfig.pexelsQueries
```

without incorporating the quote-specific keyword.

## Required behavior

Generate beat-specific queries using:

```text
category visual concept + quote semantic concept + mood
```

Do not simply append the first arbitrary word from the quote.

For V1, deterministic keyword extraction is acceptable.

Example:

```text
Quote:
"Discipline is choosing between what you want now and what you want most."

Possible visual queries:
- discipline athlete training cinematic
- choice crossroads cinematic
- sacrifice solitary runner
- long term goal sunrise runner
```

The query planner should avoid generic repetition across every beat.

---

# 5. CRITICAL TASK — Replace Risky Zoompan Video Motion

The current composer uses `zoompan` on video inputs with a large frame count.

Do not assume this produces a smooth Ken Burns effect.

## Required

Use a motion method appropriate for video input, such as:

- animated crop/scale using FFmpeg expressions
- controlled scale + crop over time
- or another proven filter chain

Motion should:

- preserve natural movement
- avoid freezing/repeating frames
- avoid sudden jumps
- avoid excessive zoom
- work for both portrait and landscape source clips

Create at least:

- subtle zoom in
- subtle zoom out
- slow horizontal drift
- slow vertical drift
- no motion

Use deterministic selection based on beat/category instead of uncontrolled randomness.

---

# 6. Caption System — Make It Production Quality

Current ASS generation creates a separate dialogue event for every active word.

Keep the basic approach if it works, but improve it.

## Requirements

- Real word timestamps are the source of truth.
- Never invent a visual delay independent of speech.
- No visible gaps between words caused by rendering logic.
- Handle punctuation naturally.
- Keep phrase grouping readable.
- Respect actual pixel width, not only character count.
- Use category-specific styles.
- Keep captions inside platform-safe areas.
- Do not cover important faces/subjects when avoidable.

## Highlighting

The active word should be visually distinct but not distracting.

Use:

- color change
- optional subtle scale
- optional opacity emphasis

Do not use large bouncing effects.

---

# 7. Caption Placement Must Be Explicit

Do not infer safe-zone placement from `marginV < 500`.

Define an explicit layout configuration:

```js
captionLayout: {
  position: "center", // top | center | bottom
  marginTop: 240,
  marginBottom: 420,
  maxWidth: 900
}
```

The ASS alignment and margins should derive from this configuration.

The caption background box must use the same layout definition.

Create category profiles intentionally:

- philosophy: center/lower-center
- stoic: center
- motivation: center/lower-center
- tech: upper-center or center

Keep the actual values configurable.

---

# 8. Branding Must Be Configurable

Replace hardcoded:

```text
@SuperNeuron
```

with configuration:

```js
branding: {
  enabled: true,
  handle: "@SuperNeuron",
  position: "top-right",
  opacity: 0.6,
  fontSize: 40
}
```

Do not hardcode branding inside the FFmpeg composer.

---

# 9. Improve Video Validation

`src/pipeline/validate.js` currently validates only a small subset of requirements.

## Must validate

### File
- exists
- non-zero
- reasonable file size
- MP4 container

### Video
- H.264
- 1080x1920
- 30 FPS target
- yuv420p
- valid duration
- exactly one expected video stream

### Audio
- AAC
- expected sample rate, preferably 44.1kHz or 48kHz
- expected channel configuration
- valid duration
- no missing audio

### Timeline
- audio duration should be consistent with video duration
- no obviously invalid timestamps
- no NaN/infinite values

Wrong resolution should be a **FAIL**, not only a warning, in production mode.

Allow a relaxed development mode if necessary, but make the mode explicit.

---

# 10. Add Pre-Render Validation

Before FFmpeg rendering, validate:

- every clip exists
- every clip duration > 0
- every beat has valid start/end
- beats are ordered
- no beat overlaps unexpectedly
- total timeline covers voice duration
- caption timings are valid
- output duration is sufficient

Fail early rather than generating a broken MP4.

---

# 11. Add Post-Render A/V Validation

After rendering:

- compare TTS duration with final duration
- confirm voice begins at the expected time
- confirm final audio is not unintentionally truncated
- inspect stream start times
- reject major A/V duration mismatch

A simple duration check is not enough to prove synchronization, but it catches obvious failures.

---

# 12. Music Selection Upgrade

Current Jamendo selection is mostly:

```text
filter instrumental
sort by duration
random top 5
```

Improve it to use a music profile:

```js
musicProfile: {
  mood: "dark",
  energy: "low",
  tempo: "slow",
  instrumental: true,
  preferredDuration: 30
}
```

Then score candidates where metadata permits.

Also track recently used track IDs to reduce repetition.

## Licensing

Before automated production publishing, explicitly verify that the selected Jamendo usage/licensing is appropriate for the intended social publishing workflow.

The fallback audio source must also have a documented licensing decision. Do not assume "free" automatically means unrestricted commercial/social use.

---

# 13. Meta Publishing — Fix Retry Safety

The current generic retry wrapper can retry a whole publish operation after an ambiguous network failure.

That can create duplicates if the first operation actually succeeded.

## Instagram

Track:

- creation ID
- publish attempt
- final media ID

If a request times out after creation, do not blindly create another container without checking whether the first operation exists.

## Facebook

Track:

- upload video ID
- upload phase
- finish result

Retry individual recoverable stages where possible.

Never blindly restart a successful upload because the final HTTP response was lost.

---

# 14. Firebase — Fix Quote Document Identity

`selectEligibleQuote()` uses:

```js
quote_id: data.quote_id || doc.id
```

but finalization later uses:

```js
.collection(COLLECTION_NAME).doc(quoteId)
```

These are only equivalent if `quote_id === doc.id`.

## Required

Carry the actual Firestore document ID separately:

```js
{
  firestoreDocId,
  quote_id,
  category,
  quote,
  author,
  ...
}
```

Always update Firebase using the actual document ID.

---

# 15. Add Job Lock / Claim

Prevent two pipeline instances from selecting the same quote simultaneously.

Implement a lightweight Firestore claim if practical:

```text
ELIGIBLE
  ↓
CLAIMED
  ↓
GENERATING
  ↓
GENERATED
```

A claim should contain:

- job ID
- claimed_at
- worker/run ID

If generation fails, release/mark the job appropriately.

Do not allow a stale claim to permanently block a quote.

---

# 16. Implement an Intentional Ending

Current duration logic mainly pads the final beat.

That is not the same as an intentional outro.

Add a subtle ending strategy:

- final visual hold
- slight fade or dip
- author attribution
- optional short brand treatment
- music fade-out

Do not add an unnecessary long outro.

Target roughly 0.5–1.5 seconds depending on reel length.

---

# 17. Hook System — Verify and Implement If Missing

The original roadmap required a hook system, but current inspected code does not demonstrate one.

Implement only where it improves the quote.

Modes:

```text
NONE
SUBTLE
STRONG
```

Examples of subtle hooks:

- short opening phrase
- visual cold-open
- emphasized first sentence

Do not turn every quote into clickbait.

The quote itself should remain the primary content.

---

# 18. Transition System — Verify and Implement

Current storyboard always sets:

```js
transition: "cut"
```

That means the claimed transition roadmap is not implemented.

Implement a small controlled set:

- hard cut
- short crossfade
- dip to black
- motion-compatible cut

Do not use transitions on every beat.

Prefer hard cuts when visual motion already provides energy.

---

# 19. Visual Diversity

Current `seenVideoIds` prevents duplicate Pexels IDs inside a reel, which is good, but it does not prevent semantic repetition.

Add lightweight diversity tracking:

```js
usedVisualTypes = [
  "person",
  "architecture",
  "nature",
  "city",
  "abstract"
]
```

Avoid selecting five visually similar clips just because they have different IDs.

Do not over-engineer computer vision for V1.

---

# 20. DEBUG Artifacts

DEBUG_MODE should preserve enough information to diagnose a bad reel.

Add/ensure:

```text
output/debug_<quoteId>/
  storyboard.json
  alignment.json
  captions.ass
  metadata.json
  selected-clips.json
  music.json
```

If practical, generate a contact sheet or thumbnail strip of selected clips.

The debug output should make it possible to answer:

> Why did this exact reel look bad?

without rerunning the entire pipeline.

---

# 21. Determinism

Remove uncontrolled `Math.random()` from quality-critical decisions.

Use a seeded/deterministic selection strategy based on:

```text
quote_id + beat_index
```

Randomness can still be used for variety, but it must be reproducible in DEBUG_MODE.

This is important because a bad reel must be reproducible for debugging.

---

# 22. Tests To Add

Add unit tests for:

1. VTT phrase parsing
2. word alignment output
3. monotonic timestamps
4. caption grouping
5. safe-zone layout
6. storyboard timing
7. Pexels scoring
8. visual diversity
9. motion selection
10. duration calculation
11. validation failure cases
12. Firebase document ID handling
13. job claim/release
14. Meta retry behavior
15. duplicate publish protection

Also keep the existing category/Firebase/reel/publish tests.

---

# 23. Real End-to-End Acceptance Test

After implementation, run one real quote through:

```text
Firebase
→ TTS
→ alignment
→ storyboard
→ Pexels
→ music
→ captions
→ FFmpeg
→ validation
→ Firebase finalization
```

Do not publish automatically during this test.

Then inspect the actual MP4 visually and listen to it.

The acceptance test must explicitly check:

- first spoken word timing
- every caption segment
- active-word highlighting
- clip changes
- no frozen/repeated motion
- music level
- voice clarity
- caption readability
- author placement
- watermark placement
- ending
- overall pacing

A generated file existing on disk is **not** sufficient evidence of completion.

---

# 24. Production Rules

Until the above quality audit passes:

- TikTok remains disabled.
- Do not delete TikTok code.
- Instagram/Facebook publishing should remain behind explicit production controls.
- Do not automatically publish newly generated reels during development tests.
- Never mark a quote as successfully posted merely because video generation succeeded.
- Never publish a reel that failed validation.

Recommended configuration:

```env
ENABLE_INSTAGRAM=false
ENABLE_FACEBOOK=false
ENABLE_TIKTOK=false
DEBUG_MODE=true
```

Switch publishing on only after a human has inspected representative output.

---

# 25. Implementation Order

Follow this order:

## P0 — Must Fix First

1. Real word-level alignment
2. Caption timing correctness
3. Pexels candidate scoring
4. Quote-aware visual queries
5. Replace risky zoompan implementation
6. Pre-render/post-render validation

## P1 — Quality

7. Explicit caption safe zones
8. Music scoring
9. Visual diversity
10. deterministic selection
11. intentional ending
12. transition system
13. hook system
14. configurable branding

## P2 — Reliability

15. Firebase document ID correctness
16. Firestore job locking/claiming
17. Meta retry/idempotency hardening
18. richer debug artifacts
19. expanded automated tests

## P3 — Production

20. Real end-to-end visual inspection
21. production publishing controls
22. Instagram production test
23. Facebook production test
24. TikTok remains disabled until approval is obtained

---

# 26. Agent Working Rules

- Inspect existing code before modifying it.
- Do not rewrite functioning modules unnecessarily.
- Make one coherent change at a time.
- Run tests after each major change.
- Do not fake successful provider/API results.
- Do not silently use estimated timing in production and call it word-level alignment.
- Keep development/test mode separate from publishing mode.
- Do not expose secrets in logs.
- Preserve DEBUG_MODE artifacts when diagnosing problems.
- Prefer deterministic behavior for debugging.
- If a requirement cannot be fully implemented because a dependency/API is unavailable, state exactly what is missing and add a safe adapter/test path rather than pretending it works.

---

# Definition of Done

The quality upgrade is complete only when all of the following are true:

- [ ] Real word-level alignment is used for normal production generation.
- [ ] Captions visibly track speech.
- [ ] Pexels clips are ranked rather than randomly selected.
- [ ] Visual queries reflect the quote meaning.
- [ ] Motion is smooth and does not freeze/repeat source video unexpectedly.
- [ ] Captions use explicit safe-zone configuration.
- [ ] Music is instrumental and appropriately mixed.
- [ ] Music selection has meaningful relevance/variety logic.
- [ ] Video validation checks the actual production requirements.
- [ ] Firebase updates the correct quote document.
- [ ] Concurrent workers cannot claim the same quote accidentally.
- [ ] Meta retries cannot casually duplicate a successful publish.
- [ ] Hook/transition/ending behavior is intentionally implemented or explicitly disabled where inappropriate.
- [ ] DEBUG_MODE produces enough artifacts to reproduce/debug a bad reel.
- [ ] Tests cover the new critical behavior.
- [ ] At least one real reel has been visually and audibly inspected.
- [ ] Instagram/Facebook publishing is not enabled until the generated reel quality passes human inspection.
- [ ] TikTok remains disabled pending approval.

---

# Final Instruction to Agent

The previous roadmap should be treated as **partially completed, not automatically complete**.

Do not create another high-level roadmap. Execute this audit as the next engineering phase.

Start with **P0.1 Real Word-Level Alignment** and prove it with tests and a real generated reel before moving to the lower-priority polish tasks.
