import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { CartProvider } from './context/CartContext.tsx';

// @ts-ignore
import { registerSW } from 'virtual:pwa-register';

// Register service worker and force instant reload when a new deployment is detected
const updateSW = registerSW({
  onNeedRefresh() {
    console.log("New update detected. Reloading page...");
    updateSW(true);
  },
  onOfflineReady() {
    console.log("KRP Creation is ready to work offline.");
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <App />
      </CartProvider>
    </AuthProvider>
  </StrictMode>
);
