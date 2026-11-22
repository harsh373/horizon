import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import App from './App.tsx'

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (!clerkKey) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is missing in frontend/.env.local')

// After a new deploy, an open PWA may still ask for script files that no longer exist.
// Reload once to pick up the new version. The timestamp stops it from looping.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  try {
    const last = Number(sessionStorage.getItem('chunk-reload-at') ?? 0)
    if (Date.now() - last < 30_000) return
    sessionStorage.setItem('chunk-reload-at', String(Date.now()))
  } catch {
    // Storage unavailable: reload anyway.
  }
  window.location.reload()
})

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
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        // Look for a new version whenever the app is reopened or comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined)
        })
      })
      .catch(() => {
        // Installability just won't be offered; the app itself still works fine.
      })
  })
}