# Reel Pipeline — Final Quality + Quote State / GitHub Actions Fix

## Purpose

This task addresses two separate production problems:

1. **Generated/published reel quality is not yet final-polish quality**, even though local test generation is functional.
2. **Quote selection/state is incorrect**:
   - Local test generation may intentionally reuse one quote.
   - GitHub Actions currently appears to select one quote for a whole day and reuse it, but this behavior must be made explicit, deterministic, and safe.
   - Re-running GitHub Actions must NOT silently consume a new quote.
   - A quote must never be lost/wasted simply because a generation, validation, upload, or publishing attempt failed.
   - Once a daily quote is successfully published, retries on the same day must keep the same daily assignment rather than selecting another quote.
   - The next calendar day should receive the next unused quote.

This document is the next implementation specification. Do not treat the current behavior as an accidental side effect of Firebase query ordering, random selection, or GitHub runner state.

---

# PART A — VIDEO QUALITY AUDIT

## A1. Observed issues in the supplied published reel

The supplied 9-second 720x1280 reel was inspected frame-by-frame.

### Issue A1.1 — Caption starts too late / opening is visually empty

The opening portion contains the visual and watermark but no visible caption for a noticeable period. The spoken narration/caption system should not leave an unexplained empty opening if speech has already started.

### Required behavior

- The first spoken words should have captions synchronized to the actual speech.
- Do not intentionally delay captions just because the first storyboard clip starts earlier.
- If there is a deliberate visual-only intro, it must be explicitly configured and must not overlap speech.
- Caption timing must be derived from the local Whisper alignment, not from clip boundaries.

### Acceptance test

For a generated reel:

```text
TTS starts
  ↓
first spoken word timestamp
  ↓
caption/highlight begins at approximately that timestamp
```

No unexplained caption-free speech is allowed.

---

## A2. Caption grouping is still too static

The supplied reel shows a large phrase rendered as one visual block:

> We are all just ghosts

The word highlight works, but the overall caption treatment still feels closer to subtitles than a premium short-form reel.

### Required improvement

Use the real Whisper word timestamps to create short phrase groups.

Target:

- 2–5 words per caption group where natural.
- Break on meaningful pauses.
- Break on punctuation.
- Avoid orphan words.
- Keep the currently spoken word highlighted.
- Avoid changing the whole caption position unnecessarily.

Example:

```text
We are all
just ghosts
```

rather than forcing the entire quote into one static line/block when the narration naturally supports multiple beats.

Do not blindly force 2–5 words if the phrase becomes grammatically unnatural. Meaning and speech rhythm take priority.

---

## A3. Visual transition is abrupt

The supplied reel transitions from a dark flowing-water scene to a ghost visual. The second visual is semantically relevant to the quote, but the transition feels like an asset replacement rather than intentional editing.

### Required improvement

Implement a transition policy based on visual/motion compatibility:

- hard cut when the motion/scene naturally supports it
- short crossfade when a hard cut is distracting
- very short dip/blur transition only where appropriate
- never use long decorative transitions that reduce pacing

Default transition duration:

```text
0.08s–0.20s
```

Avoid applying the same transition to every cut.

---

## A4. Visual beat timing must follow narration

Do not divide the reel into equal-duration clips merely because there are N visual beats.

Use:

```text
Whisper word timestamps
        ↓
phrase/semantic beats
        ↓
visual beat durations
        ↓
clip selection
        ↓
timeline
```

The important visual should appear around the words that give it meaning.

For example, for:

```text
We are all just ghosts
```

the ghost visual should be aligned with the semantic portion containing `ghosts`, not simply placed at a fixed percentage of the video.

---

## A5. Caption safe-zone and watermark

Current watermark is visible and readable, but it should remain safely outside platform UI areas.

### Requirements

- Keep `@SuperNeuron` subtle.
- Do not allow it to overlap caption regions.
- Keep it inside a configurable safe zone.
- Avoid placing it so close to the top edge that Instagram/Facebook UI can collide with it.
- Make opacity, scale, margin, and position configurable.

Suggested configuration:

```env
WATERMARK_ENABLED=true
WATERMARK_TEXT=@SuperNeuron
WATERMARK_OPACITY=0.65
WATERMARK_MARGIN_TOP=90
WATERMARK_MARGIN_RIGHT=50
```

Do not hardcode these values inside FFmpeg filter strings.

---

## A6. Visual darkness / color grading

The supplied reel is intentionally dark, which fits the quote, but the first visual is close to becoming underexposed.

Do not globally increase saturation/contrast for every category.

Instead use category/asset-aware profiles:

```text
stoic       → darker, restrained
motivational → brighter, higher clarity
philosophy  → cinematic, restrained
sad         → cooler, lower saturation
tech        → clean/high contrast
```

Avoid crushing shadow detail.

---

## A7. Clip relevance

The ghost visual is strongly relevant to the quote. The initial river visual is atmospheric but semantically weaker.

The clip-selection score must prioritize:

1. semantic relevance
2. emotional/mood relevance
3. portrait suitability
4. visual quality
5. composition / caption-safe region
6. motion quality
7. resolution
8. uniqueness/diversity

Do not select random Pexels results simply because they pass technical requirements.

---

## A8. Audio quality

Keep the current local audio pipeline, but validate:

- TTS loudness
- music loudness
- music ducking
- no clipping
- no sudden music jump at clip transitions
- fade-in/out
- clean ending

The narration is the master audio layer.

Music must never compete with the spoken quote.

---

## A9. Ending

Do not abruptly terminate the final frame/audio.

Use a deliberate ending:

```text
final word
→ final visual hold
→ short audio fade
→ optional subtle visual fade
→ end
```

The final visual should remain long enough to register.

---

# PART B — QUOTE SELECTION / STATE MANAGEMENT

## B1. Do NOT rely on accidental daily behavior

The current behavior suggests that GitHub Actions may be selecting one quote based on date/query ordering and then repeatedly returning that quote.

This must be replaced with an explicit **Daily Quote Assignment** system.

The behavior must be deterministic and persisted.

---

# B2. Desired behavior

## Local test mode

Local test generation may intentionally reuse the same quote.

This is useful because the developer needs to regenerate the exact same quote repeatedly while improving the video.

Example:

```env
RUN_MODE=test
TEST_QUOTE_ID=<optional>
```

If `TEST_QUOTE_ID` is supplied:

```text
always use that exact quote
```

If no test quote ID is supplied, local test mode may use a deterministic development quote.

The test mode must NOT mark the quote as consumed/published.

---

## GitHub Actions production/manual review mode

GitHub Actions must use a persisted daily assignment.

Conceptually:

```text
calendar date + pipeline slot
        ↓
DailyQuoteAssignment
        ↓
quote ID
        ↓
generate
        ↓
validate
        ↓
publish
```

The same date must resolve to the same quote until the daily run is successfully finalized.

### Important

The daily quote must be persisted in Firebase/database state, NOT in the temporary GitHub runner filesystem.

GitHub runners are ephemeral.

---

# B3. Daily assignment data model

Create a persistent document/record such as:

```js
DailyQuoteAssignment {
  dateKey: "2026-10-07",
  timezone: "Asia/Karachi",
  quoteId: "...",
  status: "assigned",
  generationAttempts: 0,
  validationAttempts: 0,
  publishAttempts: 0,
  published: false,
  instagramPublished: false,
  facebookPublished: false,
  assignedAt: Timestamp,
  finalizedAt: null,
  lastError: null,
  lastRunId: null
}
```

Use a deterministic document ID:

```text
<timezone>:<dateKey>:<slot>
```

or another collision-safe equivalent.

Do NOT create duplicate daily assignments when multiple GitHub Actions runs happen at the same time.

Use an atomic transaction/conditional create where supported.

---

# B4. Quote states

The quote lifecycle must distinguish these states:

```text
AVAILABLE
   ↓
ASSIGNED
   ↓
GENERATING
   ↓
VALIDATING
   ↓
READY
   ↓
PUBLISHING
   ↓
PUBLISHED
```

Failure states:

```text
GENERATION_FAILED
VALIDATION_FAILED
PUBLISH_FAILED
```

A failure must NOT automatically consume the quote.

Example:

```text
quote #123
assigned today
↓
generation failed
↓
retry
↓
quote #123 again
```

Never:

```text
quote #123 failed
↓
throw it away
↓
select #124
```

---

# B5. Critical rule: publish success determines consumption

A quote should be considered consumed/published only after the required publishing targets succeed.

For the current production target:

```text
Instagram success
AND
Facebook success
        ↓
PUBLISHED
```

If only one succeeds:

```text
instagramPublished=true
facebookPublished=false
status=PUBLISHING / PARTIAL
```

The next retry must resume the missing target instead of selecting a new quote.

This prevents quote loss and duplicate content.

---

# B6. Multiple GitHub Actions runs on the same day

If the developer runs the workflow 10 times on the same date:

### Expected behavior

```text
Run 1 → quote A
Run 2 → quote A
Run 3 → quote A
...
Run 10 → quote A
```

No new quote should be selected merely because the workflow was manually triggered again.

However, publishing must also be idempotent.

Do NOT create 10 duplicate Facebook/Instagram posts.

---

# B7. Separate generation/review from final publishing

Because the developer needs to repeatedly run GitHub Actions while tuning the reel, add an explicit workflow mode:

```env
RUN_MODE=preview
```

or

```env
PUBLISH_ENABLED=false
```

### Preview mode

```text
select daily quote
→ generate
→ validate
→ save artifact
→ DO NOT publish
```

This allows unlimited regeneration of the same day's quote without polluting Facebook/Instagram.

### Publish mode

```env
RUN_MODE=publish
```

Then:

```text
select existing daily assignment
→ generate
→ validate
→ publish
→ persist provider IDs
```

This is strongly recommended for manual GitHub Actions testing.

---

# B8. Publishing idempotency

Before publishing, check whether the current DailyQuoteAssignment already has provider IDs:

```js
instagramMediaId
facebookPostId
```

If the target already succeeded:

```text
DO NOT publish again
```

Only retry missing/failed targets.

Example:

```text
Instagram = success
Facebook = failed

retry
↓
skip Instagram
publish Facebook only
```

This is mandatory.

---

# B9. Quote selection algorithm

When creating a new daily assignment:

1. Find eligible quotes.
2. Exclude quotes already successfully published.
3. Exclude quotes already assigned to another active daily slot.
4. Prefer the oldest unused quote first, unless the project already has a different intentional ranking strategy.
5. Persist the assignment atomically.
6. Never use `Math.random()` as the only selection mechanism.
7. Never depend on Firestore's implicit document ordering.

Recommended initial strategy:

```text
oldest AVAILABLE quote
→ deterministic assignment
→ persist
```

This guarantees quotes are not wasted.

---

# B10. Quote queue / FIFO behavior

If there are 100 unused quotes:

```text
Day 1 → quote 1
Day 2 → quote 2
Day 3 → quote 3
...
```

If quote 3 fails generation:

```text
Day 3 retry → quote 3
```

If quote 3 finally publishes:

```text
Day 4 → quote 4
```

Do not skip quote 3 because of temporary errors.

---

# B11. Timezone

Daily assignment must use an explicit timezone.

Default for this project should be configurable, for example:

```env
PIPELINE_TIMEZONE=Asia/Karachi
```

Do not use GitHub runner UTC implicitly when the intended daily cycle is local time.

Create:

```text
2026-10-07
```

using the configured timezone.

---

# PART C — WORKFLOW CHANGES

## C1. Manual GitHub Actions input

Add workflow inputs such as:

```yaml
run_mode:
  description: "preview or publish"
  required: true
  default: "preview"

date_key:
  description: "Optional daily assignment date"
  required: false
  default: ""

force_quote_id:
  description: "Optional quote ID for controlled testing"
  required: false
  default: ""
```

Do NOT let `force_quote_id` modify production consumed/published state unless explicitly requested.

---

# C2. Preview workflow

For repeated quality testing:

```text
GitHub Actions
→ resolve today's daily quote
→ generate
→ validate
→ upload/save artifact
→ no social publishing
```

This is the mode to use while tuning the reel.

---

# C3. Publish workflow

Once the reel is approved:

```text
GitHub Actions
→ resolve today's assignment
→ generate final
→ validate
→ publish missing social targets
→ persist IDs
→ finalize assignment
```

---

# PART D — QUALITY GATE

A reel must not be published unless all of these pass:

- correct 9:16 resolution
- H264 video
- AAC audio
- audio exists
- narration exists
- narration/caption alignment coverage is acceptable
- no invalid timestamps
- first spoken words are captioned correctly
- no major caption clipping
- safe-zone compliance
- visual clip exists for every planned beat
- no accidental black/frozen frames
- no missing final beat
- music does not overpower TTS
- output duration is valid
- final frame/ending is intentional

Add an explicit quality result:

```js
{
  passed: true,
  score: 0-100,
  blockingIssues: [],
  warnings: []
}
```

Do not publish when `passed=false`.

---

# PART E — DEBUG ARTIFACTS

When:

```env
DEBUG_MODE=true
```

save:

```text
storyboard.json
alignment.json
raw-whisper.json
captions.ass
selected-clips.json
quote.json
quality-report.json
render-metadata.json
```

Also save the final MP4.

This makes repeated GitHub Actions testing diagnosable instead of requiring guesswork.

---

# PART F — REQUIRED LOGGING

Every workflow run must log:

```text
dateKey
runMode
quoteId
quoteStatus
assignmentId
runId
selected clips
alignment coverage
quality score
validation result
instagram status
facebook status
```

Example:

```text
[QUOTE] date=2026-10-07 quoteId=q123 status=ASSIGNED
[RENDER] quoteId=q123 attempt=4
[ALIGN] coverage=100%
[QUALITY] score=91 passed=true
[PUBLISH] Instagram already published → SKIP
[PUBLISH] Facebook not published → publishing
[QUOTE] status=PUBLISHED
```

---

# PART G — DO NOT BREAK THESE EXISTING REQUIREMENTS

- No paid transcription APIs.
- Local whisper.cpp remains the alignment engine.
- No fake word timestamps in production.
- Edge TTS remains allowed.
- FFmpeg remains the video/audio engine.
- TikTok remains disabled until approval.
- Instagram + Facebook remain active targets.
- Do not remove useful debug functionality.
- Do not introduce random quote selection as a shortcut.

---

# PART H — IMPLEMENTATION ORDER

Implement in this order:

## P1 — Quote state / daily assignment

1. Inspect current quote repository/selection code.
2. Identify why GitHub Actions currently returns the same quote per day.
3. Replace accidental behavior with explicit DailyQuoteAssignment state.
4. Implement atomic assignment creation.
5. Implement FIFO/oldest-unused selection.
6. Implement failure-safe retry behavior.
7. Implement publish state and provider IDs.
8. Implement idempotent publishing.

## P2 — Preview/publish separation

1. Add `RUN_MODE=preview|publish`.
2. Default manual workflow to `preview`.
3. Ensure preview never marks quotes published.
4. Ensure publish mode resumes the existing daily assignment.

## P3 — Reel visual polish

1. Fix first-caption timing.
2. Improve phrase grouping.
3. Align visual beats to narration semantics.
4. Improve transition handling.
5. Improve visual relevance scoring.
6. Improve ending.
7. Verify watermark safe zone.

## P4 — Validation

1. Add blocking caption/alignment checks.
2. Add visual-beat validation.
3. Add audio checks.
4. Add safe-zone checks.
5. Produce quality-report.json.

## P5 — Manual verification

Generate the same daily quote repeatedly in preview mode and compare outputs.

Then publish exactly once in publish mode.

---

# Definition of Done

The implementation is complete only when all of these are true:

### Quote behavior

- Local test can intentionally reuse a quote.
- GitHub Actions has an explicit persisted daily assignment.
- Multiple runs on the same day resolve to the same quote.
- Failed generation does not consume the quote.
- Failed validation does not consume the quote.
- Failed publishing does not consume the quote.
- Partial publishing resumes missing targets.
- Successful publishing marks the quote as published.
- Next day selects the next eligible unused quote.
- No quote is silently skipped or wasted.

### Publishing

- Re-running a published workflow does not create duplicate posts.
- Existing Instagram/Facebook provider IDs are respected.
- Preview mode never publishes.

### Video

- First spoken words have correctly timed captions.
- Word highlighting follows local Whisper timestamps.
- Caption groups follow speech rhythm.
- Visual changes support semantic beats.
- Transitions are intentional.
- Watermark is safe and subtle.
- Audio mix is clean.
- Ending is intentional.
- Quality gate blocks bad reels.

### Testing

The agent must demonstrate:

```text
Run A (preview) → quote X
Run B (preview) → quote X
Run C (preview) → quote X

Publish → quote X

Retry publish → no duplicate post

Next day → quote Y
```

And for failure recovery:

```text
quote X assigned
→ generation failure
→ retry
→ still quote X
→ validation failure
→ retry
→ still quote X
→ Instagram success / Facebook failure
→ retry
→ Instagram skipped / Facebook retried
→ quote X finalized
```

Do not mark this task complete until these behaviors are demonstrated in logs/tests.
