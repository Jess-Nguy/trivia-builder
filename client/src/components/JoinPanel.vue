<script setup>
import { ref, computed, watch } from 'vue';
import QRCode from 'qrcode';
import { store } from '../store.js';
import { party, joinUrl } from '../multiplayer.js';

const props = defineProps({ numTeams: { type: Number, required: true } });

const url = computed(() => joinUrl());
const qrSvg = ref('');
watch(
  url,
  async (u) => {
    // Generated locally from our own URL, so v-html below never renders outside input.
    qrSvg.value = u ? await QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';
  },
  { immediate: true },
);

const teamRows = computed(() =>
  Array.from({ length: props.numTeams }, (_, i) => ({ id: i, name: store.effectiveName(i), phones: party.phonesByTeam[i] || 0 })),
);
</script>

<template>
  <section class="join-panel" aria-live="polite">
    <p v-if="party.status === 'error'" class="error">{{ party.error }}</p>
    <p v-else-if="party.status !== 'live'" class="hint-text">Opening the room…</p>
    <p v-else-if="!party.lan.enabled" class="error">
      Phones can't reach this computer yet. Stop the app and start it with <code>npm run party</code>.
    </p>
    <p v-else-if="!party.lan.addresses.length" class="error">
      This computer isn't on a network. Join the same Wi-Fi as the phones.
    </p>
    <template v-else>
      <div class="join-qr" v-html="qrSvg"></div>
      <div class="join-info">
        <p class="join-step">Scan, or open on a phone on the same Wi-Fi:</p>
        <p class="join-url">{{ url }}</p>
        <p class="join-step">Room code</p>
        <p class="join-code">{{ party.code }}</p>
        <ul class="join-teams">
          <li v-for="t in teamRows" :key="t.id">
            <span>{{ t.name }}</span>
            <span class="join-count">📱 {{ t.phones }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
