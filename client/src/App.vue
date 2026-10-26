<script setup>
import { store } from './store.js';
import './display.js';
import GameMode from './screens/GameMode.vue';
import Question from './screens/Question.vue';
import AnswerReveal from './screens/AnswerReveal.vue';
import Scoreboard from './screens/Scoreboard.vue';
import FinalScores from './screens/FinalScores.vue';
import Toolbar from './components/Toolbar.vue';
import ShortcutHelp from './components/ShortcutHelp.vue';
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
    <Toolbar />
    <BackgroundAudio />
    <Transition name="screen" mode="out-in">
      <component :is="screens[store.screen]" />
    </Transition>
    <ShortcutHelp />
  </div>
</template>
