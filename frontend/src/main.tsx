import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Catch unhandled promise rejections (e.g. failed fetches) so they
// don't surface as cryptic browser errors to end-users.
window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled rejection]', event.reason)
    event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>,
)
