import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { initStorage } from './storage';
import { useTheme } from './theme';
import AuthGate from './auth/AuthGate';
import App from './App';
import PwaPrompts from './pwa/PwaPrompts';
import DesktopUpdate from './pwa/DesktopUpdate';
import { startPwa } from './pwa/pwa';
import { claimSingleInstance } from './singleInstance';

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
    if (!(await claimSingleInstance())) {
      root.render(
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <div style={{ maxWidth: 360 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>MjTech POS is already open</h1>
            <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>It is running in another window or tab on this device. Using two at once can lose sales, so please use the other one and close this.</p>
            <button onClick={() => location.reload()} style={{ background: '#f59e0b', color: '#020617', fontWeight: 800, padding: '10px 18px', borderRadius: 12, border: 0 }}>Try again</button>
          </div>
        </div>
      );
      return;
    }
    await initStorage();
    root.render(<><Root /><PwaPrompts /><DesktopUpdate /></>);
  } catch (e) {
    root.render(<pre style={{ color: '#fda4af', padding: 24 }}>Could not open local database:{'\n'}{String(e)}</pre>);
  }
}
boot();
startPwa(); // installable + offline when served over https (no-op in the Android / Windows apps and in dev)
