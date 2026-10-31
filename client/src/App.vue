<script setup>
import { store } from './store.js';
import './display.js';
import GameMode from './screens/GameMode.vue';
import Builder from './screens/Builder.vue';
import Question from './screens/Question.vue';
import AnswerReveal from './screens/AnswerReveal.vue';
import Scoreboard from './screens/Scoreboard.vue';
import FinalScores from './screens/FinalScores.vue';
import Toolbar from './components/Toolbar.vue';
import ShortcutHelp from './components/ShortcutHelp.vue';
import BackgroundAudio from './components/BackgroundAudio.vue';
import StageBackdrop from './components/StageBackdrop.vue';

const screens = {
  gameMode: GameMode,
  builder: Builder,
  question: Question,
  answer: AnswerReveal,
  scoreboard: Scoreboard,
  final: FinalScores,
};
</script>

<template>
  <StageBackdrop />
  <div class="app">
    <Toolbar />
    <BackgroundAudio />
    <Transition name="screen" mode="out-in">
      <component :is="screens[store.screen]" />
    </Transition>
    <ShortcutHelp />
  </div>
</template>
