<script setup>
import { store } from './store.js';
import GameMode from './screens/GameMode.vue';
import Question from './screens/Question.vue';
import AnswerReveal from './screens/AnswerReveal.vue';
import Scoreboard from './screens/Scoreboard.vue';
import FinalScores from './screens/FinalScores.vue';
import FullscreenButton from './components/FullscreenButton.vue';
import BackgroundAudio from './components/BackgroundAudio.vue';

const screens = {
  gameMode: GameMode,
  question: Question,
  answer: AnswerReveal,
  scoreboard: Scoreboard,
  final: FinalScores,
};
</script>

<template>
  <div class="app">
    <FullscreenButton />
    <BackgroundAudio />
    <component :is="screens[store.screen]" />
  </div>
</template>
