import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App.jsx';
import './styles.css';

const appId = import.meta.env.VITE_PRIVY_APP_ID;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={appId}
      config={{
        // Tampilkan tombol Sign in with Monad Games ID
        loginMethodsAndOrder: {
          primary: ['privy:cmd8euall0037le0my79qpz42', 'email', 'google']
        },
        embeddedWallets: { createOnLogin: true }
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>
);