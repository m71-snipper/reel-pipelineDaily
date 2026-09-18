# REEL PIPELINE — ANTI-GRAVITY DEVELOPMENT WORKFLOW

## 0. ROLE

You are the lead development agent for a new Node.js/JavaScript project named `Reel Pipeline`.

Build a production-oriented automated short-form reel generation pipeline from scratch.

IMPORTANT:
- Do NOT port the existing Python notebooks line-by-line.
- Use the existing Python notebooks only as functional references.
- Do NOT generate new Instagram quotes in this pipeline.
- Existing quotes already live in Firebase and are the input/content source.
- First make the reel-generation pipeline reliable.
- Instagram and TikTok publishing must be architected cleanly but implemented only after the reel engine is stable.
- Work incrementally. After every major phase, run tests and fix errors before continuing.
- Never silently invent credentials, Firebase IDs, API keys, or social API configuration.

---

# 1. EXISTING SOURCE NOTEBOOKS

Two existing Colab notebooks are the reference implementation:

1. `reelmaker_with_tts.ipynb`
   - Current Python reel maker.
   - Uses Pexels for background video.
   - Uses Jamendo with SoundHelix fallback for music.
   - Uses Edge TTS for voice.
   - Creates SRT/caption timing.
   - Creates a 1080x1920 reel.
   - Current test uses a hard-coded quote.
   - Current subtitle timing is known to be unreliable.

2. `instaquotes-firbase.ipynb`
   - Existing quote-generation/storage notebook.
   - Uses Hugging Face to generate quote JSON.
   - Stores existing quote documents in Firebase.
   - Firebase collection: `instagram_quotes`.
   - Current stored document fields include:
     - `quote_id`
     - `category`
     - `quote`
     - `author`
     - `is_posted`
     - `timestamp`
   - There are currently 166 stored quotes.
   - THIS PIPELINE MUST NOT generate new quotes.

The existing Python notebooks are references only. The new system must be JavaScript/Node.js.

---

# 2. CORE OBJECTIVE

Build this pipeline:

Firebase existing quote
        ↓
Select eligible quote
        ↓
Read its category
        ↓
Resolve category configuration
        ↓
Pexels background search
        ↓
Jamendo music search
        ↓
TTS voice generation
        ↓
Reliable word-level timing/alignment
        ↓
Smart caption generation
        ↓
1080x1920 reel composition
        ↓
Validate final video
        ↓
Save reel metadata/status
        ↓
Later: Instagram publishing
        ↓
Later: TikTok publishing

The quote itself is the source of truth.

---

# 3. NON-NEGOTIABLE DESIGN PRINCIPLES

## 3.1 No quote generation

Do not call Hugging Face from the reel pipeline.

Hugging Face belongs to a separate future/content-generation workflow.

This pipeline consumes existing Firebase content.

## 3.2 Firebase is the content source

The reel pipeline must fetch quote data from:

`instagram_quotes`

Do not hard-code production quotes.

The hard-coded quote may exist only in a temporary test script if needed.

## 3.3 One source of truth for categories

Do not hard-code category mappings independently in multiple files.

Existing categories are:

- Deep Philosophical and Aesthetic
- Sigma Stoic Mindset
- Funny Tech and Programming
- Gym and Hustle Motivation

Create one centralized category configuration.

Prefer Firebase configuration if practical; otherwise begin with a local configuration module that can later be moved to Firebase.

The category configuration should define at least:

- Pexels search terms
- Jamendo/music tags
- default visual mood
- caption style
- TTS voice/style settings where applicable

The quote's Firebase `category` must resolve to one of these profiles.

If an unknown category is encountered:
- do not crash silently
- log the category
- use an explicit safe fallback profile
- mark/log the event for review

---

# 4. TARGET PROJECT STRUCTURE

Use this structure as the target architecture:

reel-pipeline/
│
├── src/
│   ├── index.js
│   │
│   ├── config/
│   │   ├── firebase.js
│   │   ├── settings.js
│   │   └── categories.js
│   │
│   ├── firebase/
│   │   ├── quoteRepository.js
│   │   └── jobRepository.js
│   │
│   ├── providers/
│   │   ├── pexels.js
│   │   ├── jamendo.js
│   │   ├── edgeTts.js
│   │   └── googleTts.js
│   │
│   ├── subtitles/
│   │   ├── alignment.js
│   │   ├── captions.js
│   │   └── renderer.js
│   │
│   ├── video/
│   │   ├── background.js
│   │   ├── music.js
│   │   └── composer.js
│   │
│   ├── pipeline/
│   │   ├── selectQuote.js
│   │   ├── generateReel.js
│   │   └── finalize.js
│   │
│   └── social/
│       ├── instagram.js
│       └── tiktok.js
│
├── temp/
├── output/
├── tests/
├── .env.example
├── .gitignore
├── package.json
└── README.md

You may add sensible supporting files, but preserve separation of responsibilities.

---

# 5. PHASE 0 — INSPECT BEFORE CODING

Before implementing anything:

1. Inspect the current repository.
2. Confirm the existing folder structure.
3. Inspect available files.
4. Identify Node.js version.
5. Check whether FFmpeg is available.
6. Check whether ImageMagick is available if the chosen renderer requires it.
7. Determine the best practical Node-compatible video rendering approach.
8. Read this workflow fully before making architectural changes.
9. Do not overwrite unrelated files.

Create a short `IMPLEMENTATION_PLAN.md` describing:
- current environment
- planned dependencies
- architecture
- major phases
- known risks
- test strategy

Then begin implementation.

---

# 6. PHASE 1 — PROJECT FOUNDATION

Create:

- `package.json`
- `.gitignore`
- `.env.example`
- `README.md`
- configuration modules
- structured logger
- basic error handling

Use environment variables for secrets.

Expected environment variables will include placeholders such as:

- `PEXELS_API_KEY`
- `JAMENDO_CLIENT_ID`
- `FIREBASE_PROJECT_ID`
- Firebase credential configuration
- optional TTS credentials
- later Instagram/TikTok credentials

Never commit real secrets.

---

# 7. PHASE 2 — FIREBASE QUOTE REPOSITORY

Implement:

`src/firebase/quoteRepository.js`

Responsibilities:

- connect to Firebase Admin SDK
- read from `instagram_quotes`
- select an eligible quote
- avoid already-used/post-completed quotes
- return:
  - quote_id
  - category
  - quote
  - author
  - is_posted
  - timestamp

Initial selection rule:

`is_posted == false`

Prefer deterministic/transaction-safe selection logic so two pipeline runs do not accidentally process the same quote simultaneously.

Do not mark a quote as posted before reel generation succeeds.

---

# 8. PHASE 3 — JOB / STATUS MODEL

Create a job/status layer.

Do NOT rely only on `is_posted`.

Recommended conceptual lifecycle:

PENDING
→ GENERATING
→ GENERATED
→ POSTING
→ POSTED

Failure states:

GENERATION_FAILED
INSTAGRAM_FAILED
TIKTOK_FAILED

Keep platform statuses separate.

A quote can have:
- generated reel = success
- Instagram = failed
- TikTok = pending

In that situation, do NOT regenerate the video unnecessarily.

The status model should support retries.

---

# 9. PHASE 4 — CATEGORY ENGINE

Implement:

`src/config/categories.js`

Create a single source of truth for the four existing categories.

Example conceptual structure:

{
  "Deep Philosophical and Aesthetic": {
    "pexels": [...],
    "music": [...],
    "visualMood": "...",
    "captionStyle": "...",
    "tts": {...}
  }
}

Do not blindly use exactly the same search query for every quote in a category.

Build a query from:

category profile
+
quote meaning where useful
+
visual keywords/profile

For V1, quote meaning extraction can be simple and deterministic.

Do not introduce an unnecessary AI call just for query generation unless it is clearly justified.

---

# 10. PHASE 5 — PEXELS PROVIDER

Implement:

`src/providers/pexels.js`

Requirements:

- category-aware search
- configurable fallback queries
- portrait-friendly video preference
- select suitable resolution
- download video safely
- timeout handling
- retries
- validate downloaded file
- avoid obvious duplicate reuse when possible
- clean temporary files

Do not permanently depend on one exact Pexels result.

The same category should produce visual variety.

---

# 11. PHASE 6 — JAMENDO MUSIC PROVIDER

Implement:

`src/providers/jamendo.js`

Requirements:

- category-aware music tags
- search multiple candidates
- choose suitable track
- download safely
- validate audio
- timeout/retry
- fallback mechanism

Retain the concept from the old Python notebook:
Jamendo first, fallback music second.

However, make the fallback configurable and clearly licensed/appropriate for automated social publishing.

Do not blindly reuse random external tracks if licensing is unclear.

Track used music where practical to reduce repetition.

---

# 12. PHASE 7 — TTS PROVIDER ABSTRACTION

Create a provider interface.

At minimum:

`src/providers/edgeTts.js`

Keep:

`src/providers/googleTts.js`

as an optional future/alternate provider.

The pipeline should call something conceptually like:

generateSpeech({
  text,
  provider,
  voice,
  outputPath
})

Do not hard-code the rest of the pipeline to Edge TTS.

V1 default provider:
Edge TTS.

Do not switch to Google merely because it is available.

The current synchronization problem is primarily an alignment/rendering problem.

---

# 13. PHASE 8 — CRITICAL: WORD-LEVEL ALIGNMENT

This is the highest-priority technical problem.

The old Python notebook attempted Edge TTS `WordBoundary` events, but its actual test returned:

`WordBoundary events: 0`

and therefore used estimated timings based on total audio duration and character counts.

Do NOT copy that fallback as the primary synchronization system.

The new pipeline must aim for real audio-derived timing.

Priority:

1. Test whether the chosen Edge TTS implementation exposes reliable word-level timing.
2. If reliable word timings are unavailable, use a robust audio alignment/transcription method.
3. Prefer actual timestamps derived from the generated audio.
4. Keep alignment provider-independent.

Desired architecture:

TTS audio
    ↓
word alignment
    ↓
[
  {
    word: "...",
    start: 0.00,
    end: 0.31
  },
  ...
]
    ↓
caption grouping
    ↓
caption animation

Do not make artificial word timing such as:

`line_start + i * stagger`

the source of truth.

Animation may use a short visual effect, but the actual word start/end must follow the audio timing.

---

# 14. PHASE 9 — SMART CAPTION ENGINE

Implement:

`src/subtitles/captions.js`

Requirements:

- use real word timestamps
- group words intelligently
- maximum visual width
- avoid ugly line breaks
- support short/medium/long quotes
- preserve punctuation
- avoid splitting important phrases unnecessarily
- keep captions inside safe vertical area
- support category-specific caption styling

Do not blindly force 5 words per line.

Grouping should consider:
- pixel width
- word count
- timing
- punctuation
- readability

---

# 15. PHASE 10 — CAPTION RENDERER

Implement:

`src/subtitles/renderer.js`

Target style:

premium cinematic social-media captions.

Possible animation:
- subtle word reveal
- karaoke emphasis
- short opacity/scale effect

BUT:

Animation must not shift the actual spoken timing.

Avoid:
- large bouncing text
- excessive sliding
- random delays
- artificial stagger that causes voice/text drift

The user specifically reported:
- voice sometimes leads the text
- subtitle appears late
- current animation does not feel synchronized

This must be solved before production integration.

---

# 16. PHASE 11 — VIDEO COMPOSER

Implement:

`src/video/composer.js`

Target:

- 1080 × 1920
- 30 FPS
- H.264
- AAC
- portrait
- social-media-ready MP4

Composition layers:

1. background video
2. dark/gradient overlay
3. captions
4. author
5. voiceover
6. background music

Voice must remain clearly understandable.

Music should normally be significantly quieter than voice.

The old notebook used approximately 0.12 music volume; treat this only as a starting reference, not a fixed requirement.

Voice should start at the same timing reference used by captions.

Do not create an unexplained 0.5-second voice offset unless captions are offset by exactly the same amount.

---

# 17. PHASE 12 — AUTHOR DISPLAY

The quote author is visual metadata.

Do not include the author in the TTS text unless explicitly configured.

The old notebook intentionally spoke only the quote and displayed the author visually.

Keep this behavior for V1.

Do not automatically claim that an AI-generated quote is genuinely authored by a real person.

Preserve the Firebase author field as supplied, but do not create new attribution.

---

# 18. PHASE 13 — VALIDATION

Before a reel is considered successfully generated, validate:

- file exists
- MP4 opens
- duration is valid
- resolution is 1080x1920
- audio exists
- voiceover exists
- captions exist when expected
- video is not zero bytes
- no NaN/infinite timing values
- caption timestamps stay within video duration
- no major audio/video drift
- temporary assets are cleaned safely

If validation fails:
- mark generation as failed
- preserve useful logs
- do not mark quote as posted

---

# 19. PHASE 14 — FIREBASE FINALIZATION

After successful reel generation:

store/update metadata such as:

- reel_id
- quote_id
- category
- generated_at
- video_path / storage reference
- generation status
- TTS provider
- music reference if available
- visual reference/query if available

Only after successful finalization should the quote become ineligible for another normal generation.

Do NOT use `is_posted=true` to mean "video successfully generated".

Keep generation and publishing states separate.

---

# 20. PHASE 15 — TEST MODE

Create a test mode that does NOT publish anything.

Example:

`npm run test:reel`

or equivalent.

Test mode should:
- select one Firebase quote
- generate one reel
- save it to `output/`
- print the quote ID
- print category
- print Pexels query
- print music query
- print TTS provider
- print audio duration
- print word alignment count
- print caption count
- print output path

This is the main development workflow.

Do not require Instagram/TikTok credentials to generate a reel.

---

# 21. PHASE 16 — SOCIAL PUBLISHING ARCHITECTURE

Only after V1 reel generation is stable.

Create:

`src/social/instagram.js`

`src/social/tiktok.js`

Use a clean interface such as:

publish(video, metadata)

Each provider should:
- validate credentials
- upload/publish
- return platform post ID
- update only its own status
- support retry
- never force regeneration of the video

Publishing should happen AFTER validation.

Do not publish an unvalidated video.

---

# 22. AUTOMATION DESIGN

Future automated run:

Firebase
 ↓
find eligible quote
 ↓
lock/claim job
 ↓
generate reel
 ↓
validate
 ↓
store metadata
 ↓
publish Instagram
 ↓
publish TikTok
 ↓
update individual statuses

If Instagram fails:
- keep video
- mark Instagram failed
- allow retry

If TikTok fails:
- keep video
- mark TikTok failed
- allow retry

If both succeed:
- mark overall post completed

Never regenerate simply because one social platform failed.

---

# 23. ERROR HANDLING

Every external provider must have:

- timeout
- retry with backoff
- useful error messages
- cleanup
- no secret leakage in logs

External providers:
- Firebase
- Pexels
- Jamendo
- TTS
- alignment engine
- FFmpeg/video renderer
- Instagram
- TikTok

A provider failure must identify the provider and operation.

---

# 24. LOGGING

Use structured logs.

Example:

[PIPELINE] Quote selected: abc123
[PIPELINE] Category: Sigma Stoic Mindset
[PEXELS] Query: stoic discipline cinematic
[PEXELS] Video downloaded
[JAMENDO] Tags: dark motivational
[TTS] Provider: edge
[TTS] Duration: 14.9s
[ALIGN] Words: 43
[CAPTIONS] Segments: 9
[RENDER] 1080x1920 / 30fps
[VALIDATE] PASS
[FIREBASE] Reel finalized

Never log:
- API keys
- Firebase private keys
- social tokens

---

# 25. TESTING REQUIREMENTS

At minimum create tests for:

1. category resolution
2. Firebase quote mapping
3. unknown category fallback
4. caption grouping
5. timestamp validation
6. duration calculations
7. filename/path safety
8. provider failure handling

Then perform one end-to-end test with a real Firebase quote.

Do not consider the project complete until one real quote successfully produces a playable reel.

---

# 26. DEVELOPMENT ORDER

Follow this exact order unless a technical dependency requires a justified change:

PHASE A
Project inspection + plan

PHASE B
Node project + configuration

PHASE C
Firebase connection + quote selection

PHASE D
Category engine

PHASE E
Pexels

PHASE F
Jamendo

PHASE G
TTS

PHASE H
WORD ALIGNMENT — highest priority

PHASE I
Captions

PHASE J
Video composition

PHASE K
Validation

PHASE L
Firebase finalization

PHASE M
End-to-end test

PHASE N
Instagram

PHASE O
TikTok

PHASE P
Automation/retry system

---

# 27. IMPORTANT: DO NOT OVER-ENGINEER V1

Do not add:
- unnecessary AI calls
- microservices
- Docker unless needed
- queues unless needed
- database migration complexity
- unnecessary frontend
- quote generation
- scheduling UI

First make this reliable:

Firebase quote
→ good background
→ good music
→ good voice
→ perfectly synchronized captions
→ excellent 1080x1920 MP4

Then expand.

---

# 28. QUALITY BAR

The final reel should feel like a deliberately designed social-media reel, not a programmer-generated slideshow.

Priorities in order:

1. Audio/caption synchronization
2. Readability
3. Voice clarity
4. Visual quality
5. Category relevance
6. Music relevance
7. Smooth animation
8. Reliability
9. No duplicates
10. Automation

---

# 29. AGENT BEHAVIOR

When working:

- Do not ask for permission for every small step.
- Inspect, implement, test, fix.
- If blocked by credentials, create a safe mock/test adapter and continue where possible.
- If a real API cannot be tested without credentials, clearly mark it and continue with mocked tests.
- Do not fake successful API calls.
- Do not silently downgrade functionality.
- When a technical choice has multiple options, choose the simplest production-appropriate option and document it.
- Keep the repository runnable after each phase.
- Do not delete the existing Python notebooks unless explicitly instructed.

---

# 30. FIRST TASK

Start NOW with:

1. Inspect the `Reel Pipeline` folder.
2. Inspect available project files.
3. Check Node/npm/FFmpeg availability.
4. Create `IMPLEMENTATION_PLAN.md`.
5. Create the Node.js project foundation.
6. Create `.env.example` and `.gitignore`.
7. Implement Firebase configuration and quote repository.
8. Implement a `test:firebase` command that reads and prints ONE eligible quote safely.
9. Do NOT generate a reel yet.
10. Do NOT implement Instagram/TikTok yet.

After that, report:
- files created
- dependencies installed
- Firebase connection status
- sample quote structure detected
- next phase

Then continue phase-by-phase only after the current phase passes its tests.
