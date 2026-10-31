import { createApp } from 'vue';
import App from './App.vue';
import PhoneApp from './phone/PhoneApp.vue';
import './style.css';

// Phones open /play (from the QR code on the TV); everything else is the host.
createApp(location.pathname.startsWith('/play') ? PhoneApp : App).mount('#app');
