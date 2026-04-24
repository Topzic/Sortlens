import { Film, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../services/api'

interface VideoPlayerProps {
    imageId: string
    className?: string
    autoPlay?: boolean
    controls?: boolean
    muted?: boolean
    loop?: boolean
}

export default function VideoPlayer({
    imageId,
    className = '',
    autoPlay = false,
    controls = true,
    muted,
    loop = false,
}: VideoPlayerProps) {
    const [isLoading, setIsLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    const posterUrl = useMemo(() => api.getPreviewUrl(imageId), [imageId])
    const streamUrl = useMemo(() => api.getStreamUrl(imageId), [imageId])
    const effectiveMuted = muted ?? autoPlay

    useEffect(() => {
        setIsLoading(true)
        setFailed(false)

        const video = videoRef.current
        if (!video) return

        // Clear any stale buffering or playback state when switching between
        // different media items that reuse the same shared player component.
        video.pause()
        video.load()
    }, [imageId, streamUrl])

    if (failed) {
        return (
            <div className={`flex min-h-[240px] items-center justify-center rounded-lg bg-gray-900 text-gray-300 ${className}`}>
                <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                    <Film className="h-10 w-10 text-gray-500" />
                    <div>
                        <p className="text-sm font-medium">Video unavailable</p>
                        <p className="text-xs text-gray-400">Reconnect the source drive or try opening the file externally.</p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className={`relative flex items-center justify-center overflow-hidden rounded-lg bg-black ${className}`}>
            <video
                ref={videoRef}
                src={streamUrl}
                poster={posterUrl}
                className="block max-h-full max-w-full rounded-lg bg-black"
                autoPlay={autoPlay}
                controls={controls}
                muted={effectiveMuted}
                loop={loop}
                playsInline
                preload={autoPlay ? 'auto' : 'metadata'}
                onLoadedMetadata={() => setIsLoading(false)}
                onCanPlay={() => setIsLoading(false)}
                onPlaying={() => setIsLoading(false)}
                onWaiting={() => setIsLoading(true)}
                onError={() => {
                    setIsLoading(false)
                    setFailed(true)
                }}
            />
            {isLoading && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/35">
                    <Loader2 className="h-8 w-8 animate-spin text-white/80" />
                </div>
            )}
        </div>
    )
}