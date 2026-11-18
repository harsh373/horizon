import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!clerkKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is missing in frontend/.env.local')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkKey} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </StrictMode>,
)

// Registers the service worker Chrome needs to offer the "Install app" prompt.
// Runs after the page has fully loaded so it never competes with first paint.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Installability just won't be offered; the app itself still works fine.
    });
  });
}