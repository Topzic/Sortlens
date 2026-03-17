import { useEffect, useState } from 'react'

const STATUS_MESSAGES = [
    'Starting server...',
    'Initializing database...',
    'Loading modules...',
    'Almost ready...',
]

export default function SplashScreen({ onReady }: { onReady: () => void }) {
    const [statusIdx, setStatusIdx] = useState(0)
    const [dots, setDots] = useState('')
    const [failed, setFailed] = useState(false)
    const [attempts, setAttempts] = useState(0)

    // Rotate status messages every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIdx((prev) => Math.min(prev + 1, STATUS_MESSAGES.length - 1))
        }, 3000)
        return () => clearInterval(interval)
    }, [])

    // Animate dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
        }, 500)
        return () => clearInterval(interval)
    }, [])

    // Poll health endpoint with exponential backoff (300ms → 1500ms)
    useEffect(() => {
        let cancelled = false
        let timeout: ReturnType<typeof setTimeout>
        let delay = 300

        const poll = async () => {
            try {
                const res = await fetch('/health', { signal: AbortSignal.timeout(2000) })
                if (res.ok && !cancelled) {
                    // Small delay so splash doesn't flash
                    setTimeout(() => {
                        if (!cancelled) onReady()
                    }, 400)
                    return
                }
            } catch {
                // Server not ready yet
            }
            if (!cancelled) {
                setAttempts((prev) => {
                    const next = prev + 1
                    if (next >= 60) setFailed(true)
                    return next
                })
                timeout = setTimeout(poll, delay)
                delay = Math.min(delay * 1.5, 1500)
            }
        }

        poll()
        return () => {
            cancelled = true
            clearTimeout(timeout)
        }
    }, [onReady])

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#1e1e1e]">
            <div className="flex flex-col items-center">
                {/* Logo */}
                <h1 className="mb-6 text-4xl font-bold text-sky-500">Sortlens</h1>

                {/* Spinner */}
                {!failed && (
                    <div className="mb-6 h-10 w-10 animate-spin rounded-full border-4 border-gray-700 border-t-sky-500" />
                )}

                {/* Status */}
                <p className="mb-2 text-base text-gray-300">
                    {failed
                        ? 'Server failed to start'
                        : `${STATUS_MESSAGES[statusIdx]}${dots}`}
                </p>

                {/* Subtle progress hint */}
                {!failed && (
                    <p className="text-xs text-gray-600">
                        Connecting to backend{attempts > 5 ? ` (attempt ${attempts})` : ''}
                    </p>
                )}

                {/* Error state */}
                {failed && (
                    <div className="mt-4 max-w-md rounded-lg bg-red-900/30 p-4 text-center">
                        <p className="text-sm text-red-300">
                            The backend did not respond after {attempts} attempts.
                        </p>
                        <p className="mt-2 text-xs text-red-400">
                            Make sure the backend server is running on port 8000.
                        </p>
                        <button
                            onClick={() => {
                                setFailed(false)
                                setAttempts(0)
                                setStatusIdx(0)
                            }}
                            className="mt-3 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                        >
                            Retry
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
