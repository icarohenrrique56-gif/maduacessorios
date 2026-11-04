import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { CartProvider } from './context/CartContext';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { StoreSettingsProvider } from './context/StoreSettingsContext';
import { SplashScreen } from './components/SplashScreen';
import { useAdminAuth } from './context/AdminAuthContext';
import { useStoreSettings } from './context/StoreSettingsContext';

function AppInitialization() {
  const { loading: authLoading } = useAdminAuth();
  const { loading: storeLoading } = useStoreSettings();
  const storeReady = !storeLoading;
  const authReady = !authLoading;

  return (
    <>
      <SplashScreen isReady={storeReady && authReady} storeReady={storeReady} authReady={authReady} />
      <App />
    </>
  );
}

if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('Não foi possível registrar o service worker da MADU:', error);
      });
    },
    { once: true },
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminAuthProvider>
        <CartProvider>
          <StoreSettingsProvider>
            <AppInitialization />
          </StoreSettingsProvider>
        </CartProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
