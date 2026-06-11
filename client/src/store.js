import { reactive } from 'vue';

// Eight default player colors (matching the wireframe palette).
const PLAYER_COLORS = [
  '#5b9bd5', '#ffd966', '#f4a6b0', '#92d36e',
  '#b39ddb', '#f48fb1', '#4db6ac', '#ffb74d',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Normalize a string for exact-match comparison (trim + lowercase).
const norm = (s) => String(s ?? '').trim().toLowerCase();

// localStorage key for custom team/user names, so they survive page reloads
// and carry across rounds.
const NAMES_KEY = 'trivia-player-names';

// localStorage key for the set of questions already played, so a question isn't
// served twice across games/reloads. Shape: { [fileName]: string[] } where each
// string is a question's content key (see questionKey). Keyed per file so each
// CSV has its own independent pool. Cleared only via the Clear button.
const PLAYED_KEY = 'trivia-played-questions';

// A stable per-question identity within a file. Uses the normalized question
// text rather than the row index so it survives the CSV being edited/reordered.
const questionKey = (q) => norm(q?.question);

function loadPlayed() {
  try {
    const obj = JSON.parse(localStorage.getItem(PLAYED_KEY));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

// localStorage key for background-audio preferences (selected track + volume +
// mute), so the host's music choice survives reloads and carries across rounds.
const AUDIO_KEY = 'trivia-audio';

const DEFAULT_AUDIO = { link: '', title: '', volume: 30, muted: false };

function loadAudio() {
  try {
    const obj = JSON.parse(localStorage.getItem(AUDIO_KEY));
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_AUDIO };
    return {
      link: String(obj.link ?? ''),
      title: String(obj.title ?? ''),
      volume: Number.isFinite(obj.volume) ? Math.min(100, Math.max(0, obj.volume)) : 30,
      muted: !!obj.muted,
    };
  } catch {
    return { ...DEFAULT_AUDIO };
  }
}

// localStorage key for the Game Mode form settings, so the host's last choices
// (file, team count, question count, timer, points/hints toggles) are restored
// as the defaults for the next game instead of resetting every time.
const SETTINGS_KEY = 'trivia-settings';

const DEFAULT_SETTINGS = {
  fileName: '',
  numPlayers: 1,
  numQuestions: 1,
  timer: 0,
  recordPoints: false,
  recordHints: false,
  hintsSubtract: false,
};

function loadSettings() {
  try {
    const obj = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      fileName: String(obj.fileName ?? ''),
      numPlayers: Number.isFinite(obj.numPlayers) ? Math.min(8, Math.max(1, obj.numPlayers)) : 1,
      numQuestions: Number.isFinite(obj.numQuestions) ? Math.max(1, obj.numQuestions) : 1,
      timer: Number.isFinite(obj.timer) ? Math.min(300, Math.max(0, obj.timer)) : 0,
      recordPoints: !!obj.recordPoints,
      recordHints: !!obj.recordHints,
      hintsSubtract: !!obj.hintsSubtract,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// The default numbered name shown when a player's custom name is blank.
const defaultName = (i) => `Team/User ${i + 1}`;

function loadNames() {
  try {
    const arr = JSON.parse(localStorage.getItem(NAMES_KEY));
    return Array.isArray(arr) ? arr.map((n) => String(n ?? '')) : [];
  } catch {
    return [];
  }
}

export const store = reactive({
  screen: 'gameMode', // gameMode | question | answer | scoreboard | final

  // Game Mode settings. Seeded from localStorage so the previous game's choices
  // become the defaults for the next one (see loadSettings / persistSettings).
  settings: loadSettings(),

  players: [],

  // Custom team/user names by slot index. A blank entry means "use the default
  // numbered name". Persisted to localStorage and kept across rounds so a name
  // typed for one game is still there for the next.
  playerNames: loadNames(),

  // Played-question history by file name: { [fileName]: string[] of question
  // keys }. Persisted to localStorage; a question is added the moment its Answer
  // Reveal screen shows (see submitQuestion), and excluded from future games.
  playedByFile: loadPlayed(),

  // Background music: the selected YouTube track plus playback preferences.
  // `link` empty means "None" (no music). Persisted to localStorage. The
  // persistent BackgroundAudio component plays/loops this across all screens.
  audio: loadAudio(),

  // Count of sound-producing question media (YouTube/video/audio) currently on
  // screen. While > 0 the background player pauses so the two don't clash; it
  // resumes when this returns to 0. A counter (not a boolean) so overlapping
  // media — e.g. several option videos — pause the music correctly.
  mediaSoundCount: 0,

  // Notice set by startGame when the unplayed pool was smaller than requested,
  // so the UI can warn that only the remaining questions were served. Holds
  // { requested, served } or null.
  exhaustedNotice: null,

  questions: [],
  index: 0,
  hintsTakenThisQuestion: 0,
  selectedAnswer: null, // text of the option chosen this question (null if none)

  // Per-question working totals (reset every question) so we can cap how much
  // can be awarded this question. playerId -> amount awarded this question.
  qPoints: {},
  qHints: {},

  // --- Derived ---
  get currentQuestion() {
    return this.questions[this.index] || null;
  },
  // Whether the current question can be auto-graded. True only when the answer
  // is an exact option match (Multiple Choice) or TRUE/FALSE (True or False) —
  // messy rows whose `Current Answer` holds prose fall back to manual scoring.
  get isGradable() {
    const q = this.currentQuestion;
    if (!q) return false;
    if (q.type === 'True or False') return ['true', 'false'].includes(norm(q.currentAnswer));
    if (q.type === 'Multiple Choice') return q.options.some((o) => norm(o.text) === norm(q.currentAnswer));
    return false;
  },
  // For gradable questions: was the selected option correct? null when not gradable.
  get isCorrect() {
    if (!this.isGradable) return null;
    if (!this.selectedAnswer) return false;
    return norm(this.selectedAnswer) === norm(this.currentQuestion.currentAnswer);
  },
  // No points may be awarded this question (a gradable question answered wrong).
  get pointsLocked() {
    return this.isGradable && this.isCorrect === false;
  },
  // Max points awardable to a single player this question (the question's value).
  get pointCap() {
    return this.currentQuestion?.points ?? 0;
  },
  // Hints still available to distribute this question (taken minus already assigned).
  get hintsRemaining() {
    const assigned = Object.values(this.qHints).reduce((a, b) => a + b, 0);
    return this.hintsTakenThisQuestion - assigned;
  },
  get scoreboardEnabled() {
    return this.settings.recordPoints || this.settings.recordHints;
  },
  get totals() {
    return this.players.map((p) => ({
      ...p,
      total: p.points - (this.settings.hintsSubtract ? p.hints : 0),
    }));
  },
  get winners() {
    const totals = this.totals;
    if (totals.length === 0) return [];
    const max = Math.max(...totals.map((t) => t.total));
    return totals.filter((t) => t.total === max);
  },

  // The name to use for a player slot: their trimmed custom name, or the
  // default numbered name when blank.
  effectiveName(i) {
    return String(this.playerNames[i] ?? '').trim() || defaultName(i);
  },

  // Read-only default for placeholders in the UI.
  defaultName,

  // --- Actions ---

  // Set the custom name for a slot and persist. Resizing keeps only the names
  // for slots that are currently visible (count-driven), discarding any beyond.
  setPlayerName(i, name) {
    this.playerNames[i] = name;
    this.persistNames();
  },

  // Trim the stored names to `count` slots, padding with blanks as needed, so
  // lowering the team count drops names for the now-hidden slots.
  resizeNames(count) {
    const next = Array.from({ length: count }, (_, i) => this.playerNames[i] ?? '');
    this.playerNames = next;
    this.persistNames();
  },

  persistNames() {
    try {
      localStorage.setItem(NAMES_KEY, JSON.stringify(this.playerNames));
    } catch {
      /* storage unavailable (private mode, quota) — names just won't persist */
    }
  },

  // --- Background audio ---

  // Select a track (or pass a falsy link / null to turn music off). Accepts a
  // { link, title } object; missing title falls back to the link.
  setAudioTrack(track) {
    this.audio.link = String(track?.link ?? '');
    this.audio.title = String(track?.title ?? track?.link ?? '');
    this.persistAudio();
  },
  setAudioVolume(v) {
    this.audio.volume = Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
    this.persistAudio();
  },
  setAudioMuted(muted) {
    this.audio.muted = !!muted;
    this.persistAudio();
  },

  persistAudio() {
    try {
      localStorage.setItem(AUDIO_KEY, JSON.stringify(this.audio));
    } catch {
      /* storage unavailable — audio prefs just won't persist this session */
    }
  },

  persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* storage unavailable — game settings just won't persist this session */
    }
  },

  // A sound-producing question media appeared / went away. The background player
  // watches mediaSoundCount and pauses while it's above zero.
  mediaSoundOn() {
    this.mediaSoundCount += 1;
  },
  mediaSoundOff() {
    this.mediaSoundCount = Math.max(0, this.mediaSoundCount - 1);
  },

  persistPlayed() {
    try {
      localStorage.setItem(PLAYED_KEY, JSON.stringify(this.playedByFile));
    } catch {
      /* storage unavailable — played history just won't persist this session */
    }
  },

  // The set of question keys already played for a file, for filtering/counting.
  playedKeysForFile(fileName) {
    return new Set(this.playedByFile[fileName] || []);
  },

  // How many of the given questions are still unplayed for a file.
  unplayedCount(fileName, questions) {
    const played = this.playedKeysForFile(fileName);
    return questions.reduce((n, q) => n + (played.has(questionKey(q)) ? 0 : 1), 0);
  },

  // Record a question as played for its file (idempotent) and persist.
  markPlayed(fileName, question) {
    if (!fileName || !question) return;
    const key = questionKey(question);
    const list = this.playedByFile[fileName] || (this.playedByFile[fileName] = []);
    if (!list.includes(key)) {
      list.push(key);
      this.persistPlayed();
    }
  },

  // Wipe the played history for a single file and persist.
  clearPlayed(fileName) {
    if (this.playedByFile[fileName]) {
      delete this.playedByFile[fileName];
      this.persistPlayed();
    }
  },

  startGame(settings, allQuestions) {
    this.settings = { ...settings };
    // Remember these choices as the defaults for the next game.
    this.persistSettings();
    this.players = Array.from({ length: settings.numPlayers }, (_, i) => ({
      id: i,
      name: this.effectiveName(i),
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      points: 0,
      hints: 0,
    }));
    // Exclude questions already played for this file, then take a random sample
    // of the requested size. If fewer unplayed remain than requested, serve
    // what's left and flag the shortfall so the UI can warn.
    const played = this.playedKeysForFile(settings.fileName);
    const unplayed = allQuestions.filter((q) => !played.has(questionKey(q)));
    this.questions = shuffle(unplayed).slice(0, settings.numQuestions);
    this.exhaustedNotice =
      this.questions.length < settings.numQuestions
        ? { requested: settings.numQuestions, served: this.questions.length }
        : null;
    this.index = 0;
    this.hintsTakenThisQuestion = 0;
    this.selectedAnswer = null;
    this.qPoints = {};
    this.qHints = {};
    this.screen = 'question';
  },

  takeHint() {
    this.hintsTakenThisQuestion += 1;
  },

  submitQuestion(selectedAnswer = null) {
    this.selectedAnswer = selectedAnswer;
    // The Answer Reveal screen is now showing this question — record it as
    // played so it won't be served in future games.
    this.markPlayed(this.settings.fileName, this.currentQuestion);
    this.screen = 'answer';
  },

  // From the Answer Reveal screen: go to scoreboard, or skip to next question.
  afterAnswer() {
    if (this.scoreboardEnabled) {
      this.screen = 'scoreboard';
    } else {
      this.nextQuestion();
    }
  },

  awardPoints(playerId, delta) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    const cur = this.qPoints[playerId] || 0;
    // This question's award per player is bounded to [0, pointCap].
    const next = Math.min(this.pointCap, Math.max(0, cur + delta));
    p.points += next - cur;
    this.qPoints[playerId] = next;
  },
  awardHints(playerId, delta) {
    const p = this.players.find((x) => x.id === playerId);
    if (!p) return;
    const cur = this.qHints[playerId] || 0;
    // Can't assign more hints than were taken this question, nor go below 0.
    if (delta > 0 && this.hintsRemaining <= 0) return;
    const next = Math.max(0, cur + delta);
    p.hints += next - cur;
    this.qHints[playerId] = next;
  },

  // End the game early — jump to Final Scores with the tally so far.
  endGame() {
    this.screen = 'final';
  },

  nextQuestion() {
    if (this.index + 1 < this.questions.length) {
      this.index += 1;
      this.hintsTakenThisQuestion = 0;
      this.selectedAnswer = null;
      this.qPoints = {};
      this.qHints = {};
      this.screen = 'question';
    } else {
      this.screen = 'final';
    }
  },

  reset() {
    this.players = [];
    this.questions = [];
    this.exhaustedNotice = null;
    this.index = 0;
    this.hintsTakenThisQuestion = 0;
    this.selectedAnswer = null;
    this.qPoints = {};
    this.qHints = {};
    this.screen = 'gameMode';
  },
});
