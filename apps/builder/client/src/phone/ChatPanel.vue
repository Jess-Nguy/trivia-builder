<script setup>
import { ref, computed, watch, nextTick } from 'vue';

// Phone chat under the main card, so answer buttons stay on screen while a
// team talks. Two channels: the player's own team and everyone in the room.
// The relay (server/game.js) decides who receives each message.

const props = defineProps({
  all: { type: Array, required: true },
  team: { type: Array, required: true },
  // Highest message id already read, per channel.
  seen: { type: Object, required: true },
  teamName: { type: String, default: '' },
  error: { type: String, default: '' },
});
const emit = defineEmits(['send', 'seen']);

const open = ref(false);
const channel = ref(props.teamName ? 'team' : 'all');
const text = ref('');
const list = ref(null);

const messages = computed(() => (channel.value === 'team' ? props.team : props.all));
const unread = (ch) => {
  const msgs = ch === 'team' ? props.team : props.all;
  return msgs.filter((m) => m.id > props.seen[ch] && !m.mine).length;
};
const unreadTotal = computed(() => unread('all') + (props.teamName ? unread('team') : 0));

// Without a team there is no team channel to show.
watch(() => props.teamName, (name) => {
  if (!name) channel.value = 'all';
});

// Reading a channel marks it read and keeps the newest message in view.
watch([open, channel, () => messages.value.at(-1)?.id], async () => {
  if (!open.value) return;
  const last = messages.value.at(-1);
  if (last && last.id > props.seen[channel.value]) emit('seen', channel.value, last.id);
  await nextTick();
  if (list.value) list.value.scrollTop = list.value.scrollHeight;
}, { immediate: true });

function send() {
  const body = text.value.trim();
  if (!body) return;
  emit('send', channel.value, body);
  text.value = '';
}
</script>

<template>
  <section class="chat">
    <button type="button" class="chat-toggle" :aria-expanded="open" @click="open = !open">
      💬 Chat
      <span v-if="!open && unreadTotal" class="chat-unread">{{ unreadTotal }} new</span>
      <span class="chat-caret" aria-hidden="true">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-if="open" class="chat-body">
      <div class="chat-tabs" role="tablist">
        <button
          v-if="teamName"
          type="button"
          role="tab"
          class="chat-tab"
          :aria-selected="channel === 'team'"
          @click="channel = 'team'"
        >
          {{ teamName }}<span v-if="channel !== 'team' && unread('team')"> ({{ unread('team') }})</span>
        </button>
        <button
          type="button"
          role="tab"
          class="chat-tab"
          :aria-selected="channel === 'all'"
          @click="channel = 'all'"
        >
          Everyone<span v-if="channel !== 'all' && unread('all')"> ({{ unread('all') }})</span>
        </button>
      </div>

      <p v-if="channel === 'all'" class="hint-text chat-note">Every team can read this.</p>

      <ol ref="list" class="chat-list" aria-live="polite">
        <li v-if="!messages.length" class="hint-text chat-empty">No messages yet.</li>
        <li v-for="m in messages" :key="m.id" class="chat-msg" :class="{ 'is-mine': m.mine }">
          <span class="chat-name">{{ m.mine ? 'You' : m.name }}</span>
          <span class="chat-text">{{ m.text }}</span>
        </li>
      </ol>

      <form class="chat-form" @submit.prevent="send">
        <input
          v-model="text"
          maxlength="200"
          :placeholder="channel === 'team' ? `Message ${teamName}` : 'Message everyone'"
          autocomplete="off"
          enterkeyhint="send"
        />
        <button class="btn btn-green" :disabled="!text.trim()">SEND</button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
/* Motion: none of its own. The panel opens instantly (it sits under the
   answer buttons, so sliding would shove them around) and buttons reuse the
   global press feedback. The reveal verdict stays the phone's hero. */
.chat {
  margin-top: 16px;
  background: var(--surface);
  border: 3px solid var(--ink);
  border-radius: 18px;
  box-shadow: 0 5px 0 var(--shadow);
  overflow: hidden;
}
.chat-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 20px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.chat-unread {
  padding: 2px 10px;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 14px;
}
.chat-caret { margin-left: auto; }
.chat-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
}
.chat-tabs { display: flex; gap: 8px; }
.chat-tab {
  flex: 1;
  padding: 8px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text-muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 150ms ease-out, color 150ms ease-out;
}
.chat-tab[aria-selected='true'] {
  border-color: var(--ink);
  border-bottom-width: 5px;
  color: var(--text);
}
.chat-note { margin: 0; }
.chat-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 40dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.chat-empty { text-align: center; padding: 12px 0; }
.chat-msg {
  max-width: 85%;
  padding: 6px 10px;
  border: 2px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  overflow-wrap: anywhere;
}
.chat-msg.is-mine {
  align-self: flex-end;
  border-color: var(--ink);
}
.chat-name {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted);
}
.chat-text { font-size: 17px; }
.chat-form { display: flex; gap: 8px; }
.chat-form input { flex: 1; min-width: 0; font: inherit; font-size: 17px; padding: 10px; }
</style>
