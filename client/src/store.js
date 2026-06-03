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

export const store = reactive({
  screen: 'gameMode', // gameMode | question | answer | scoreboard | final

  settings: {
    fileName: '',
    numPlayers: 1,
    numQuestions: 1,
    timer: 0,
    recordPoints: false,
    recordHints: false,
    hintsSubtract: false,
  },

  players: [],
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
    if (q.type === 'Multiple Choice') return q.options.some((o) => norm(o) === norm(q.currentAnswer));
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
  // Can points be awarded this question? Off when not recording points, or when
  // a gradable question was answered wrong. Open-answer types stay awardable
  // (the host judges them).
  get pointsAwardable() {
    return this.settings.recordPoints && !this.pointsLocked;
  },
  // Is there a hint to record this question?
  get hintsRecordable() {
    return this.settings.recordHints && this.hintsTakenThisQuestion > 0;
  },
  // Show the Manual Scoreboard only when there's something actionable on it.
  get shouldShowScoreboard() {
    return this.pointsAwardable || this.hintsRecordable;
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

  // --- Actions ---
  startGame(settings, allQuestions) {
    this.settings = { ...settings };
    this.players = Array.from({ length: settings.numPlayers }, (_, i) => ({
      id: i,
      name: `Team/User ${i + 1}`,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      points: 0,
      hints: 0,
    }));
    // Random sample of the requested number of questions.
    this.questions = shuffle(allQuestions).slice(0, settings.numQuestions);
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
    this.screen = 'answer';
  },

  // From the Answer Reveal screen: go to scoreboard, or skip to next question.
  // The scoreboard is skipped when there's nothing to do — e.g. a wrong gradable
  // answer with no hint taken (no points to give, no hints to record).
  afterAnswer() {
    if (this.shouldShowScoreboard) {
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
    this.index = 0;
    this.hintsTakenThisQuestion = 0;
    this.selectedAnswer = null;
    this.qPoints = {};
    this.qHints = {};
    this.screen = 'gameMode';
  },
});
