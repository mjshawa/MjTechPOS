import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { initStorage } from './storage';
import { useTheme } from './theme';
import AuthGate from './auth/AuthGate';
import App from './App';

function Root() {
  const [theme, toggleTheme] = useTheme();
  return (
    <AuthGate theme={theme} onToggleTheme={toggleTheme}>
      {auth => (
        // key: switching workspace or user remounts the app, so Bar and Retail never share state
        <App key={`${auth.workspace}:${auth.user.id}:${auth.user.role}`} auth={auth} user={auth.user}
             workspace={auth.workspace} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </AuthGate>
  );
}

// Open the local SQLite database FIRST, then render. The UI never waits on the network.
async function boot() {
  const root = ReactDOM.createRoot(document.getElementById('root')!);
  try {
    await initStorage();
    root.render(<Root />);
  } catch (e) {
    root.render(<pre style={{ color: '#fda4af', padding: 24 }}>Could not open local database:{'\n'}{String(e)}</pre>);
  }
}
boot();

// PWA: register the service worker only on a real website (not inside Electron / the Android app / dev server).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !(window as any).Capacitor?.isNativePlatform?.()) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
