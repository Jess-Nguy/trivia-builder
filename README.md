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
Current Answer, Categories, Type, Attachments, Points, Hint 1, Explanation
```

- **Required:** `Question`, `Current Answer`, `Type`, `Points`.
- **Type** must be one of: `Single Choice`, `Multiple Choice`, `True or False`, `Single Choice w/ Media`.
- **Options** are required only for `Multiple Choice` (at least 2). `True or False`
  hardcodes TRUE/FALSE; `Single Choice` and `Single Choice w/ Media` use no options.
- **Categories** may be comma-separated for multiple categories.
- **Attachments** (for `Single Choice w/ Media`) is an image/video/audio URL. Keep
  video/audio to ~1 minute.
- **Hint 1** is optional; a HINT button appears only when it's filled in.
- **Explanation** (optional) is prose shown on the Answer Reveal page. Keep it
  separate so `Current Answer` can stay an *exact* answer.

Rows that fail validation are skipped and reported on the Game Mode screen; they
don't crash the app.

### Answer grading (auto)

For `Multiple Choice` and `True or False`, if `Current Answer` exactly matches one
of the options (or is `TRUE`/`FALSE`), the app grades the selected answer and
announces correct/wrong on the Answer Reveal page. A wrong answer with no hint
taken skips the Manual Scoreboard; a wrong answer where a hint was used shows the
scoreboard with points locked (hint counter only). Rows whose `Current Answer`
isn't an exact match (and all open-answer types) aren't graded — they go to the
manual scoreboard as usual. So keeping `Current Answer` exact (with prose in
`Explanation`) is what unlocks grading.

## How a game flows

Game Mode → Question → Answer Reveal → Manual Scoreboard (loops) → Final Scores.

- **Timer:** set per-question seconds (0 = none, max 300). At 0 the question
  auto-advances to the answer.
- **Manual Scoreboard** appears after each question to award points/hints. It's
  skipped entirely if neither "record points" nor "record how many hints taken"
  is enabled. Keyboard: `1`–`8` select a player, `+`/`-` adjust points, `]`/`[`
  adjust hints, `Enter` = next.
- **Final Scores** tallies points, hints, and total (total subtracts hints when
  "hints subtracts points" is on), names the winner, and `Next` returns to Game Mode.
