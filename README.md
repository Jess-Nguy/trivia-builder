# Trivia Builder

A localhost web app for running a couch-party trivia night from a CSV. Pick a
questions file, set up teams, and play through a host-controlled flow with manual
scoring. No database — just CSV files in `/import`.

See [SCOPE.md](SCOPE.md) for the full feature scope and [PLAN.md](PLAN.md) for the build plan.

## Requirements

- Node.js 18+ (developed on Node 24)

## Run it

```bash
npm install                   # root (Express + CSV parser)
npm --prefix client install   # client (Vue + Vite)
npm run dev                   # starts the app on http://localhost:5173
```

`npm run dev` runs the Vite dev server, which also serves the API (`/api/...`) as
middleware — a single process on one port, no separate backend to start.

### Production

```bash
npm run build          # builds the client into client/dist
npm start              # Express serves the built app + API on http://localhost:3001
```

## Adding questions

Drop a `.csv` file into the `import/` folder. It appears in the file dropdown on
the Game Mode screen automatically.

### CSV format

Columns (header row required):

```csv
Question, Option 1, Option 2, Option 3, Option 4, Option 5,
Current Answer, Categories, Type, Question Attachments, Points, Hint 1,
Option 1 Attachment, Option 2 Attachment, Option 3 Attachment,
Option 4 Attachment, Option 5 Attachment, Explanation,
question timer delay by secs
```

- **Required:** `Question`, `Current Answer`, `Type`. (`Points` is now optional —
  see *Points* below.)
- **Type** must be one of: `Single Choice`, `Multiple Choice`, `True or False`.
  The old `Single Choice w/ Media` type was retired — **any** type can now carry
  media, so a media question is just a `Single Choice` with a `Question Attachments`
  value. Legacy type names (`Single Choice w/ Media`, `Multiple Choice w/ Media`)
  are still accepted and folded into their base type for backward compatibility.
- **Options** are required only for `Multiple Choice` (at least 2). `True or False`
  hardcodes TRUE/FALSE; `Single Choice` uses no options. An option counts as
  present when **either** its `Option N` text **or** its `Option N Attachment` is
  filled — so an image-only option (no text) is still a valid, selectable choice.
- **Categories** may be comma-separated for multiple categories.
- **Question Attachments** is an image/video/audio URL shown with the question,
  regardless of type. Keep video/audio short (~1 minute). YouTube URLs
  (`watch`, `youtu.be`, `embed`, `shorts`, `music.youtube.com`, with optional start
  time) are detected and embedded automatically; everything else is treated as
  image/video/audio by its file extension. *(Older files that still use an
  `Attachments` column header keep working — it's read as a fallback.)*
- **Audio-only YouTube ("name this song" questions):** a YouTube embed always shows
  the video, whose thumbnail or on-screen title can give the answer away. To play a
  YouTube link as **audio only**, add `#audio` to the end of the URL (e.g.
  `https://youtu.be/9bZkp7q19f0#audio`, or with a start time
  `…?t=30#audio`; `&audio=1` also works). The question then renders a compact audio
  player — play/pause button, progress bar, and elapsed/total time — while the video
  plays hidden, so nothing on screen spoils the answer. Works for option attachments
  too. Notes: the track tries to autoplay on landing, but if the browser blocks
  autoplay-with-sound the **play button always works** (it's a direct user action);
  this needs the YouTube IFrame API, so an ad/tracker blocker that blocks
  `youtube.com/iframe_api` will stop it (the same dependency as background music).
- **Option N Attachment** (`Option 1 Attachment`…`Option 5 Attachment`) is an
  optional per-option image/video/audio URL, rendered next to that option for
  `Multiple Choice` and `True or False` questions.
- **Points** (optional): when blank, it's defaulted by hint presence — a question
  *with* a hint is worth `2`, one *without* is worth `1` — and the defaulted value
  is **written back into the CSV** so it persists next time. When present it must
  be a number.
- **Hint 1** is optional; a HINT button appears only when it's filled in.
- **Explanation** (optional) is prose shown on the Answer Reveal page. Keep it
  separate so `Current Answer` can stay an *exact* answer.
- **question timer delay by secs** (optional): a non-negative number of seconds to
  pause *before* the question goes live. During the delay the question (and its
  media) shows while options/buttons stay hidden, so the host can read it aloud;
  the answer timer only starts once the delay ends or is skipped. Blank/0 = none.

Rows that fail validation are skipped and reported on the Game Mode screen; they
don't crash the app.

### Background music

`import/background audio.csv` holds the optional background-music playlist. It has
just two columns:

```csv
link,title
https://www.youtube.com/watch?v=hmKq26RO8n8,Pico Park Theme
https://www.youtube.com/watch?v=lI_C1Bjdqn4,Animal Crossing Theme
```

- **link** is a YouTube URL (same formats as question media — `watch`, `youtu.be`,
  `embed`, `shorts`). **title** is the label shown in the picker.
- This file is **not** a questions file — it's filtered out of the questions-file
  dropdown and read separately for the **Background music** picker on the Game Mode
  screen. Rows with a blank `link` are ignored; if the file is missing, the picker
  just offers *None*.

### Answer grading (auto)

For `Multiple Choice` and `True or False`, if `Current Answer` exactly matches one
of the options (or is `TRUE`/`FALSE`), the app grades the selected answer and
announces correct/wrong on the Answer Reveal page. A wrong answer with no hint
taken skips the Manual Scoreboard; a wrong answer where a hint was used shows the
scoreboard with points locked (hint counter only). Rows whose `Current Answer`
isn't an exact match (and all open-answer types) aren't graded — they go to the
manual scoreboard as usual. So keeping `Current Answer` exact (with prose in
`Explanation`) is what unlocks grading.

## Setting up a game (Game Mode screen)

- **Teams/users:** 1–8. Each slot has an editable name (blank = a default
  `Team/User N`). Names are saved to the browser's localStorage so they survive
  reloads and carry across rounds; two teams can't share a name (case-insensitive).
- **Questions file:** dropdown of every `.csv` in `/import`.
- **Category filter:** once a file loads, its categories appear as checkboxes
  (with a "Select all"). Pick one or more to narrow the pool to questions in those
  categories; questions with no category fall into an `Uncategorized` bucket so they
  stay playable. The question-count field clamps to the size of the filtered pool.
- **Background music:** a dropdown of the tracks in `import/background audio.csv`
  (plus *None*). Picking one starts it immediately — looping the single song — and
  it keeps playing through the whole game, including across screen changes. The
  choice, volume, and mute state are saved to localStorage. A small control sits in
  the bottom-right corner of every screen with a **mute toggle** and a **volume
  slider**.
- **Number of questions, timer, and the record/subtract checkboxes** work as before.

## How a game flows

Game Mode → Question → Answer Reveal → Manual Scoreboard (loops) → Final Scores.

- **Reading delay:** if a question has a `question timer delay by secs` value, it
  opens in a reading phase (question + media visible, options hidden) counting down
  that many seconds. Press `Space` to skip straight to answering.
- **Timer:** set per-question seconds (0 = none, max 300). At 0 the question
  auto-advances to the answer.
- **Question screen keys:** `1`–`5` select an option, `H` reveals the hint (when
  one exists), `Enter` submits.
- **Manual Scoreboard** appears after each question to award points/hints. It's
  skipped entirely if neither "record points" nor "record how many hints taken"
  is enabled. Keyboard: `1`–`8` select a player, `+`/`-` adjust points, `]`/`[`
  adjust hints, `Enter` = next.
- **Final Scores** tallies points, hints, and total (total subtracts hints when
  "hints subtracts points" is on), names the winner, and `Next` returns to Game Mode.

A **fullscreen toggle** sits in the corner on every screen (great for casting the
game to a TV). The screen always autoplays video/YouTube media — and masks the
YouTube title bar — so a paused thumbnail or title can't give the answer away. For
"name this song" questions where even the video would spoil it, tag the YouTube link
with `#audio` to play it as audio only with the video fully hidden (see
*Question Attachments* above).

**Background music auto-pause:** when a question (or one of its options) has its own
YouTube/video/audio media on screen, the background music **pauses automatically**
so the two don't clash, and resumes once that media is gone. The corner control
shows a ⏸ marker while it's paused for this reason. (Images don't pause the music.)
