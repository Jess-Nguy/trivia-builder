<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';

// A player's phone: join the host's room, pick a team, then follow the host's
// state and send answers. The host's TV shows the question and media; the
// phone only carries what a team needs to answer.

const SAVED_KEY = 'trivia-phone';
const RETRY_MS = 1500;

function loadSaved() {
  try {
    const obj = JSON.parse(localStorage.getItem(SAVED_KEY)) || {};
    return { token: obj.token || '', code: obj.code || '', team: Number.isInteger(obj.team) ? obj.team : null };
  } catch {
    return { token: '', code: '', team: null };
  }
}

// crypto.randomUUID needs a secure context, which a LAN http:// page isn't.
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const saved = reactive(loadSaved());
if (!saved.token) saved.token = newToken();
const urlCode = new URLSearchParams(location.search).get('code');
if (urlCode) saved.code = urlCode.toUpperCase();
watch(saved, () => {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable — the phone just won't rejoin its team after a reload */
  }
}, { immediate: true, deep: true });

const codeInput = ref(saved.code);
const status = ref('idle'); // idle | connecting | joined
const error = ref('');
const state = ref(null);
const typed = ref('');
// The answer this phone sent for question `n`, shown until the host confirms it.
const sent = ref(null);

let ws = null;
let wanted = false;

function send(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function connect() {
  status.value = 'connecting';
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/game`);
  ws = sock;
  sock.onopen = () => send({ t: 'join', code: saved.code, token: saved.token, team: saved.team });
  sock.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'joined') {
      status.value = 'joined';
      error.value = '';
    } else if (msg.t === 'state') {
      state.value = msg.state;
    } else if (msg.t === 'error') {
      // A bad code won't fix itself by retrying; go back to the code screen.
      error.value = msg.error;
      wanted = false;
      sock.close();
    }
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (!wanted) return (status.value = 'idle');
    status.value = 'connecting';
    setTimeout(() => wanted && !ws && connect(), RETRY_MS);
  };
}

function join() {
  saved.code = codeInput.value.trim().toUpperCase();
  if (!saved.code) return;
  error.value = '';
  wanted = true;
  connect();
}

function pickTeam(id) {
  saved.team = id;
  send({ t: 'team', team: id });
}
function switchTeam() {
  saved.team = null;
  send({ t: 'team', team: null });
}

const teams = computed(() => state.value?.teams ?? []);
const myTeam = computed(() => teams.value.find((t) => t.id === saved.team) || null);
const phase = computed(() => state.value?.phase ?? 'waiting');
const question = computed(() => state.value?.question ?? null);
const mine = computed(() => state.value?.mine ?? null);
const isTyped = computed(() => question.value && question.value.options.length === 0);

// A new question clears what this phone sent for the last one.
watch(() => question.value?.n, () => {
  sent.value = null;
  typed.value = '';
});

function answerChoice(i, label) {
  if (mine.value || sent.value) return;
  sent.value = { n: question.value.n, label };
  send({ t: 'answer', n: question.value.n, choice: i });
}
function answerTyped() {
  const text = typed.value.trim();
  if (!text || mine.value || sent.value) return;
  sent.value = { n: question.value.n, label: text };
  send({ t: 'answer', n: question.value.n, text });
}

const myStanding = computed(() => {
  const list = state.value?.standings ?? [];
  const i = list.findIndex((s) => s.id === saved.team);
  return i === -1 ? null : { place: i + 1, ...list[i] };
});
const isWinner = computed(() => (state.value?.winners ?? []).includes(saved.team));

onMounted(() => {
  // Rejoin straight away after a reload or a phone waking up.
  if (saved.code) join();
});
onUnmounted(() => {
  wanted = false;
  ws?.close();
});
</script>

<template>
  <main class="phone" :style="myTeam ? { '--team': myTeam.color } : null">
    <header class="phone-head">
      <span class="plaque-main">Trivia</span> <span class="plaque-script">builder</span>
      <span v-if="myTeam" class="phone-team-tag">{{ myTeam.name }}</span>
    </header>

    <!-- Join -->
    <form v-if="status === 'idle'" class="phone-card" @submit.prevent="join">
      <h1 class="phone-title">Join the game</h1>
      <label class="phone-label" for="code">Room code from the TV</label>
      <input
        id="code"
        v-model="codeInput"
        class="phone-code-input"
        maxlength="4"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
      />
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn btn-green btn-big phone-wide" :disabled="!codeInput.trim()">JOIN</button>
    </form>

    <p v-else-if="status === 'connecting'" class="phone-card phone-wait">Connecting…</p>

    <p v-else-if="!state" class="phone-card phone-wait">Waiting for the host…</p>

    <!-- Pick a team -->
    <section v-else-if="!myTeam" class="phone-card">
      <h1 class="phone-title">Pick your team</h1>
      <button
        v-for="t in teams"
        :key="t.id"
        type="button"
        class="phone-team-btn"
        :style="{ '--team': t.color }"
        @click="pickTeam(t.id)"
      >{{ t.name }}</button>
    </section>

    <!-- Lobby -->
    <section v-else-if="phase === 'lobby'" class="phone-card phone-wait">
      <p>You're on <strong>{{ myTeam.name }}</strong>.</p>
      <p class="hint-text">Waiting for the host to start…</p>
      <button type="button" class="btn-link" @click="switchTeam">Switch team</button>
    </section>

    <!-- Question -->
    <section v-else-if="phase === 'question'" class="phone-card">
      <p class="hint-text">Question {{ question.n + 1 }} of {{ question.total }}</p>
      <p class="phone-question">{{ question.text }}</p>

      <p v-if="mine" class="phone-locked" role="status">🔒 Locked in: <strong>{{ mine.label }}</strong></p>
      <p v-else-if="sent" class="phone-locked" role="status">Sending {{ sent.label }}…</p>
      <p v-else-if="!state.open" class="phone-wait">👀 Eyes on the TV…</p>

      <form v-else-if="isTyped" class="phone-typed" @submit.prevent="answerTyped">
        <input v-model="typed" maxlength="80" placeholder="Your team's answer" autocomplete="off" />
        <button class="btn btn-green phone-wide" :disabled="!typed.trim()">LOCK IN</button>
      </form>

      <div v-else class="phone-options">
        <button
          v-for="(o, i) in question.options"
          :key="i"
          type="button"
          class="option phone-option"
          @click="answerChoice(i, o.label)"
        >
          <span class="badge">{{ o.label }}</span>
          <span class="option-text">{{ o.text || '🖼 Picture on the TV' }}</span>
        </button>
      </div>
      <p v-if="!mine" class="hint-text phone-foot">First answer from your team counts.</p>
    </section>

    <!-- Reveal -->
    <section v-else-if="phase === 'reveal'" class="phone-card">
      <div
        class="phone-verdict"
        :class="!mine ? 'is-none' : mine.correct ? 'is-right' : 'is-wrong'"
        role="status"
      >
        {{ !mine ? '🤷 No answer' : mine.correct ? '✓ Correct!' : '✗ Wrong' }}
      </div>
      <p v-if="mine" class="hint-text">You said: {{ mine.label }}</p>
      <p class="phone-answer">Answer: <strong>{{ question.answer }}</strong></p>
    </section>

    <!-- Scores / final -->
    <section v-else class="phone-card">
      <h1 class="phone-title">{{ phase === 'final' ? (isWinner ? '👑 You win!' : 'Final scores') : 'Scores' }}</h1>
      <ol class="phone-standings">
        <li v-for="s in state.standings" :key="s.id" :class="{ 'is-mine': s.id === saved.team }">
          <span>{{ s.name }}</span><span class="phone-points">{{ s.total }}</span>
        </li>
      </ol>
      <p v-if="myStanding && phase !== 'final'" class="hint-text">You're in place {{ myStanding.place }}.</p>
    </section>
  </main>
</template>

<style scoped>
/* Motion: the reveal verdict is this screen's hero (fades and scales in once,
   400ms). Buttons reuse the global press feedback. Nothing else moves. */
.phone {
  max-width: 480px;
  margin: 0 auto;
  padding: 16px;
  min-height: 100dvh;
  color: var(--text);
  font-family: var(--font-display);
}
.phone-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 22px;
}
.phone-team-tag {
  margin-left: auto;
  padding: 4px 12px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--team, var(--surface));
  color: var(--on-accent);
  font-size: 15px;
  font-weight: 700;
}
.phone-card {
  background: var(--surface);
  border: 3px solid var(--ink);
  border-radius: 18px;
  box-shadow: 0 5px 0 var(--shadow);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.phone-title { margin: 0; font-size: 26px; text-align: center; }
.phone-wait { text-align: center; font-size: 20px; }
.phone-label { font-weight: 600; }
.phone-code-input {
  font: inherit;
  font-size: 40px;
  letter-spacing: 0.3em;
  text-align: center;
  text-transform: uppercase;
  padding: 8px;
}
.phone-wide { width: 100%; }
.phone-team-btn {
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  padding: 16px;
  border: 3px solid var(--ink);
  border-left: 14px solid var(--team);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: transform 120ms var(--ease-out, ease-out);
}
.phone-team-btn:active { transform: scale(0.97); }
.phone-question { font-size: 20px; font-weight: 600; margin: 0; }
.phone-options { display: flex; flex-direction: column; gap: 10px; }
.phone-option { width: 100%; min-height: 64px; font-size: 20px; }
.phone-typed { display: flex; flex-direction: column; gap: 10px; }
.phone-typed input { font: inherit; font-size: 20px; padding: 12px; }
.phone-locked { font-size: 22px; text-align: center; margin: 12px 0; }
.phone-foot { text-align: center; }
.phone-verdict {
  font-size: 40px;
  font-weight: 700;
  text-align: center;
  padding: 24px 8px;
  border-radius: 14px;
  border: 3px solid var(--ink);
  animation: verdict-in 400ms ease-out both;
}
.phone-verdict.is-right { background: var(--success); color: var(--on-success); }
.phone-verdict.is-wrong { background: var(--danger); color: var(--on-danger); }
.phone-verdict.is-none { background: var(--panel); }
.phone-answer { font-size: 20px; text-align: center; margin: 0; }
.phone-standings { margin: 0; padding-left: 28px; font-size: 20px; }
.phone-standings li { padding: 6px 0; }
.phone-standings li > * { display: inline-block; }
.phone-standings .is-mine { font-weight: 700; }
.phone-points { float: right; font-variant-numeric: tabular-nums; }

@keyframes verdict-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: no-preference) {
  @keyframes verdict-in {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: none; }
  }
}
</style>
