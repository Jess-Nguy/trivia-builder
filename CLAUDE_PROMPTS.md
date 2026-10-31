# Initial Prompt
```
# trivia-builder

I need to build a trivia builder app that follows this kind of style of csv import. so that I can launch a local host couch party like trivia night with friends.
First read the files in "/Users/jessnguy/github/trivia-builder/import/Trivia Mix - June 2 2026.csv" to understand the style of data I need to view
Then read "Generic Scope local template document.docx" and make a scope document similar to it. There's no 2nd person review need.
Then look at the wireframes to understand the UI.
Afterwards build be a simple project timeline plan that an ai agent mode can follow along easily to build a simple web trivia build and play mode as I'll be building this app almost sololy with ai.

## In scope feautres

1. no database. only csv that either get overwritten or a new csv gets created.
2. csv has question, option 1, option 2, option 3, option 4, option 5, current answer, categories, type, attachments, points, hint 1 (future may allow multiple hint columns)
    - Required fields are: `Question`, `Current Answer`, `Type`, and `Points`
    - `Current Answer` should be an exact match to an option if it's multiple choice or `True or False`
    - each question can have multiple categories.
    - type column can only be: single choice, multiple choice, true or false, or single choice w/ media.
    - all options fields can be empty as long as the `type` isn't `Multiple Choice`.
    - If the type is `True or False`  it doesn't require options to be filled in either because the front end can hardcode those options.
    - If the type is `Single Choice` then all option columns can be empty. Only requires `Current Answer` to be filled in.
    - If the type is `Single Choice w/ Media` then treat it like `Single Choice` but with a media import image or short video (1 minute max) or short audio (1 minute max) option
3. single user controls. No storage of scoreboard.
4. Game mode has these settings:
    - user input box of type number for number of teams/users with a min of 1 and a max of 8
    - user input dropdown of available files to select csv questions file under `/import` folder structure
    - user input box of type number for number questions. default number is set to 1. Minimum number of questions is 1. Max number of questions is the max total # of questions in the csv file selected above. This fields will be disabled and uninteractable until "select csv questions" is selected.
    - user input box of type number for question timer min/default of 0 meaning no timer at all. Max of 5mins (300secs)
    - user input box of checkbox for "record points" that will enable the record points tracker during "manual scoreboard" page
    - user input box of checkbox for "record how many hints taken" that will enable the recording of hints during "manual scoreboard" page. If both "record points" & "record how many hints taken" are not checked (disabled) then "manual scoreboard" page is skipped after each question.
    - user input box of checkbox for "hints subtracts points" that will enable subtraction during "final score" page
5. Game play, question page
    - move to next question by keybinding button or mouse click on submit button somewhere.
    - each option is assigned a number for quick keybind fill in. The order of the options can be randomize during Multiple choice type questions only.
    - the page will show the categories the question belongs to
    - a hint button will appear if the hint value is not empty
6. Manual scoreboard page appears after every question to assign/award points to people.
7. Final Score page will be a table view of all the users with tallied points, number of hints taken, and the total score. It will also say the winner given the highest total score. The next button takes user back to the `Game Mode` page.

## Out of scope features

1. each question is to allow questions to have more than 1 hint.
2. points and hint subtraction can be dynamic.
3. add "multiple choice media" as a question type.
4. multi user. this is a single user app. I won't need auth or login because this for me to use personally.
5. there should be a view/page to see all the questions.
6. playlist page will let you build your play mode and select existing imported questions in that playlist or manually make new ones
7. manually making new ones in the playlist selection will be added to the all question view too.
8. play mode will read from a playlist of questions.
```

# Additional Prompts for more features:

## Expanding Attachments and cleaning up question types
```
First read `import/Official JUNE 5th - 213q - Trivia Mix w_ hints.csv` to find the column header has changed against the code. Note that `Attachments` was changed to `Question Attachements`, 5 new columns were added `Option 1 Attachment`, `Option 2 Attachment`, `Option 3 Attachment`, `Option 4 Attachment`, and `Option 5 Attachment`

I need you to add a new feature and update the existing feature. I've refactored the types of questions to only be `Single Choice`, `Multiple Choice` and `True or False` because if there's an attachment for the question then it should just grab it and add it no matter the type of question it is. There for `Single Choice w/ Media` was removed. This means that this is a `multiple choice`  and `true and false` questions now should have the ability to add attachments to it's questions.

Another feature needs to added to use `Option 1 Attachment`, `Option 2 Attachment`, `Option 3 Attachment`, `Option 4 Attachment`, and `Option 5 Attachment` which is, when there's a value in there each option, given it's a `true or false` or `multiple choice` question that it should add the attachment near the options to give visuals. They do not need to have the correspondent option # filled in to make it work. as long as `Option #` and/or `Option # Attachment` is fille that makes a valid question.
```

# Notes:
## Additional features for in scope

1. early exit button to end the game prematurely during any point of the game play. APPLED.
2. to announce if the answer selected was wrong or not in the answer yellow page. if it was wrong and not hints were taken then skip the manual scoreboard page because no one gets points and no one needs to get subtractions/add a counter for hints. if it's wrong but a hint was used then still go to manual scoreboard but no points should be allotted to be distributed. APPLIED.

- Is it possible to have the app remember which questions that have already been played and not play them again for each app load session? For example say I set up a game to load "import/Official JUNE 5th - 217q - Trivia Mix w_ hints.csv" and I do 20 questions for 1 game mode. I finish them but then I do another 20 questions. I don't want the game to give me the same questions again. If needed a new feature could be added where there's a proper shutdown button that would clear the cache out. Or maybe this data can be stored in a csv copy of the import file under. `session/Copy <now's timestamp>- Official JUNE 5th - 217q - Trivia Mix w_ hints.csv` Ask me any question for clarification.

- I need you to add new feature where there's a button to properly shutdown the game and clear the cache out for it.

- bug fix: on the Answer Reveal screen the BACK and NEXT buttons sat too close together. Wrapped them in a `.reveal-nav` flex container with a gap so they keep clear spacing regardless of button width. APPLIED.

- theme: colour tokens with light + dark values (`light-dark()`, follows the OS, `data-theme` override), contrast-checked; screen-change fade, Answer Reveal and Final Scores hero animations, 150ms press feedback; all movement respects `prefers-reduced-motion`. Motion inventory lives at the top of `client/src/style.css`. APPLIED.

- restyle: make it creative in a cartoony game-show way (reference: neon quiz boards with lettered option pills), animate the hover highlight, and add UX features for playing locally. Added the game-show theme, A–E option pills with hover lift, a toolbar (text size, theme, `?` shortcuts, fullscreen), question progress, a draining timer bar with a Hurry! state, a Scoreboard leader tag, and ranked Final Scores. APPLIED.

- restyle round 2 (references: cartoon game-show stage with numbered contestant podiums and score displays, an ocean quiz screen with a title plaque and pause button, a quiz-night stage): added a static stage backdrop, a title plaque on every screen, Scoreboard contestant podiums with lit score displays, a rising 1-2-3 podium on Final Scores, and a P / Pause control for the answer timer. APPLIED.

- take a look at how https://halloween-heist.vais-mahendran.workers.dev/ does its animation and flair, and its modes for games. Add the UI now; add the modes to PLAN.md for now. UI: verdict stamp with quips, wrong-answer shake, correct-option pulse, streak badge, Final Scores room title, missed-question list, confetti. APPLIED. Modes (hard/type-it mode with override, put-in-order type, study mode, length presets) planned in PLAN.md Phase 10.

- theme the animation and flair like the Halloween Heist site but in a neon game-night trivia style (references: a "TRIVIA GAME NIGHT" neon sign on a brick wall with ✓/✗ circles, and a synthwave "TRIVIA night" grid). Reskinned to neon: brick wall + mountain ridge + grid floor backdrop, a lit "TRIVIA builder" sign plaque that flickers on at Game Mode, glowing tube outlines in dark mode (yellow accent, cyan ✓, pink ✗), the verdict stamp as a neon sign that slams and flickers on, neon confetti. APPLIED.

- make the background identical to one of the synthwave "Trivia Night" references; the background palette is too plain. Replaced the brick-wall backdrop with the sunset scene (starry sky, large gradient sun, skyline, glowing grid floor), the same in light and dark. APPLIED.

- make the neon lights changes be the dark theme and have the light be what it was previously. Dark keeps the neon look and synthwave scene; light returns to the cartoon game-show stage (stage backdrop, purple plaque, amber accent, Fredoka, plain stamp slam, no flicker). APPLIED.

- animation like the Halloween Heist site: make the background move (building lights, flying things across the moon) and make the buildings look drawn, not code rectangles. Dark scene now has a two-layer skyline (Art Deco, spire, slant, dome, water-tower and parapet silhouettes), ~24 flickering windows, 3 blinking beacons, twinkling stars and 3 birds flying across the sun; all loops stop under reduced motion. The grid floor stays still on purpose. APPLIED.

- the image for the question is hard to read in dark mode; the leaderboard's lead wording is small, make text and things bigger. Images now sit on a white backing card in dark mode; Scoreboard names, LED scores, podium numbers, +/− buttons and the award/keys lines are larger, the leader tag is a yellow "👑 LEADING" pill, and the podiums lay out in one centred row. APPLIED.

- make the corner buttons larger when in game mode selection. The top-right toolbar (text size, theme, keys, fullscreen) is enlarged on the Game Mode screen only. APPLIED.

- make the winning screen more animated: a floating crown above the winner, dead last as losers with RIP gravestones or something funny; be creative. Added a crown that drops onto each winner and floats, a graveyard of crooked tombstones (epitaphs, bobbing ghosts) for dead last instead of a podium, superlative title chips (Champion, No Hints Needed, So Close, Six Feet Under, Hint Goblin, Goose Egg Club), and fixed tied last-place teams being shown on the silver podium. APPLIED.

- so far this isn't a trivia builder but a trivia player. Build a page that lets users build the imports themselves in the app (reference: a Google Sheet with Question, Option 1–5, Current Answer, Explanation, Categories chips, Type, Attachments, Points, Hint 1). Have known categories but let users make their own. Let users make many playlists and add a question to any number of them by reference. Decisions asked and answered: JSON bank + playlists (not SQLite, not one CSV per playlist); import CSVs on demand; library + editor layout; each playlist chooses shuffled or ordered play. Added the Question Builder screen, `data/questions.json` + `data/playlists.json`, CSV import/export, and playlists in the Game Mode dropdown. APPLIED.

- write tests for the question builder to match the existing working import `import/316 - Total Trivia Mix w_ hints - ALL.csv`. Added `npm test` (node:test) with 22 tests: the import lands all 316 rows unchanged and dedupes on re-import, every row passes builder validation unchanged, a playlist CSV export parses back identical, playlist references and ordered play behave. `TRIVIA_DATA_DIR` points the bank at a temp folder for tests. APPLIED.
- remove the minus and adding points limit per round. Each player should be able to get the question's points (several players can each get +2), and several players who saw the hint can each get -1. Points were already capped per player; hints were a shared pool (one hint taken could only go to one player). Hints are now capped per player at the number taken this question. APPLIED.
- toggle "show hint"/"hide hint" during the game questions page. The HINT button is now a SHOW HINT / HIDE HINT toggle (`H` too); the hint counts once per question, the first time it's shown. APPLIED.
- let's discuss ways to make this trivia game multiplayer interactive; let's do it like the Kahoot and Jackbox way. Decisions asked and answered: answer pads (tap A–E / TRUE/FALSE, each team graded separately), many phones per team with the first answer locking in, a text box with host approval for Single Choice. Added a WebSocket relay (`server/game.js`) with a room code, a phone app at `/play`, a QR join panel on Game Mode, lock-in chips on the Question screen, per-team verdicts with host override on the Answer Reveal, pre-filled Scoreboard points, `npm run party`, and a 403 on `/api/...` for non-host devices. APPLIED.
- let's discuss a way for multiple people to help build questions: players on the same Wi-Fi create questions and playlists on their phones, tagged public to tell them apart from the host's. Decisions asked and answered: straight into the bank tagged public and unread (no approval step); phones may browse the bank without answers behind a host setting; phone flow over a shared sheet, so players can stump each other as a mode and in regular games; strict duplicate check; attachments must preview before submit; submissions only in the lobby, between questions and on the final scores; Stump the room scoring as planned. Planned all four steps in PLAN.md Phase 13 and built step 1: nicknames, the `submit` socket message, public/unread bank fields, Builder unread badge and filters, *Written by* on the reveal. APPLIED (step 1).
- add this trivia icon to places like the browser page icon, and beside the app name. `client/src/trivia-icon.png` is now the favicon and apple-touch-icon, and sits beside "Trivia builder" on every screen plaque and the phone header through a shared `AppName.vue`. APPLIED.
- make light mode be themed family friendly and comic, like a pixel quiz-game screenshot, with bright blue, red, white, green and yellow, similar to VS Code themes. Light is now a pixel arcade: Pixelify Sans, square corners, a still pixel-art day backdrop (sun, clouds, hills, flowers, brick ground), a white question box, blue bevelled answer buttons (yellow picked, green right, red wrong), a blue title sign. Dark neon is unchanged. All new colour pairs pass WCAG AA. APPLIED.
- be more natural like this background (pixel platformer with castle, clouds, coins) and make animations like you are in a pixel game like Mario. Rebuilt the light backdrop as `PixelBackdrop.vue` (banded dithered sky, glowing sun, shaded clouds, far hills, castle, trees, floating platform, dirt-block ground, gold blocks, mushroom, coins, slime). Light motion is frame-stepped: clouds drift, coins spin, sparkles twinkle, the slime hops, a picked answer and the ✓ block bump, and a correct reveal pops a coin. All loops stop under reduced motion. APPLIED.
- the font is a bit hard to read in light mode, and the glow on dark-mode text is like a blur; both are hard to read. Light: Pixelify Sans now only on headings (plaque, screen titles, stamp); everything else is Fredoka, which also fixes B/C reading as 8/0 on answer badges. Dark: removed every text glow; outlines keep their glow and only the plaque sign keeps a soft halo. APPLIED.
- make the dark mode background more like these images (neon synthwave cities: grid sky, striped sun, neon-outlined skyline, reflections, grid floor, palms, pixel city) and animate it like the game Neon City. Rebuilt the dark scene in `StageBackdrop.vue`: sky grid, moon, sparkles, striped sun behind a spire, low-poly mountains, neon-outlined skyline with strips and QUIZ/OPEN/24H signs, floor reflection, neon palms. Loops: floor grid rolls toward the viewer, sun stripes slide, hover cars cross, signs flicker, strips pulse, a shooting star every 11s; birds cut. All still under reduced motion. APPLIED.
- make the front buildings more game-like (reference: a 3D neon street with cyan and pink glowing window panes); the building lines and neon palms were bland and stick-like, be more 3D. Added two 3D foreground towers flanking the board (side walls receding to the vanishing point, glowing panes, ledges, dotted panels, QUIZ BAR / ARCADE signs, curbs) and rebuilt the palms with segmented tapering trunks, layered filled fronds and glow pools. Moved the horizon line behind the towers. APPLIED.
- clean up the lines a bit (tower corners and palm trunks). Towers: one outline path so the shared corner edge draws once, roof ledge flush with the walls, a drop-shadow glow instead of the blur filter, no stroke on the curb. Palms: wider fronds with thinner strokes, softer ribs. APPLIED.
- the palm trunk was fine before, revert that. Restored the original stepped trunk segments and stroke; the frond changes stay. APPLIED.
- make the middle buildings more 3D too, they look stiff. The near row and the spire in front of the sun are now corner-on towers: a lit face and a shaded face meeting at a front corner, rooflines and window rows sloping toward the horizon, neon strips down the corner, spire roofs with two faces. The far row stays flat haze. APPLIED.
