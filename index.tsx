import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { registerSW } from 'virtual:pwa-register';

// =============================
// REGISTRO DO SERVICE WORKER
// =============================

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('🔄 Nova versão disponível. Atualizando...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('✅ App pronto para funcionar offline');
  },
});

// =============================
// RENDERIZAÇÃO DO APP
// =============================

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
