import { useState, useEffect, useCallback, useRef, type SetStateAction } from 'react'
import {
    Keyboard,
    Layers,
    FolderOpen,
    Loader2,
    RotateCcw,
    CheckCircle,
    Minus,
    Plus,
    X,
    Star,
    Library,
    Info,
    ArrowDownUp,
    FolderOutput,
    ChevronDown,
    WifiOff,
    ImageOff,
    Film,
} from 'lucide-react'
import { useFolder } from '../context/FolderContext'
import { useHeaderActions } from '../components/HeaderActionsContext'
import { useToast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { api, formatBytes, type SessionResponse, type NextImageResponse, type ImageTagOut } from '../services/api'
import { TagInput } from '../components/TagInput'
import VideoPlayer from '../components/VideoPlayer'

const ZOOM_LEVELS = [1, 1.5, 2, 3, 4] as const
const MOVE_DEST_KEY = 'sortlens-move-kept-destination'
type Decision = 'keep' | 'reject' | 'skip' | 'favorite'

function formatDuration(seconds: number | null | undefined) {
    if (seconds == null || Number.isNaN(seconds)) return '—'
    const rounded = Math.max(0, Math.round(seconds))
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    const remainingSeconds = rounded % 60
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function UpNextThumbnail({ src, alt, isVideo = false }: { src: string; alt: string; isVideo?: boolean }) {
    const [failed, setFailed] = useState(false)
    if (failed) {
        return (
            <div className="h-28 w-full rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <ImageOff className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
        )
    }
    return (
        <div className="relative">
            <img
                src={src}
                alt={alt}
                className="h-28 w-full rounded-lg object-cover"
                loading="lazy"
                draggable={false}
                onError={() => setFailed(true)}
            />
            {isVideo && (
                <div className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1 py-0.5 text-white">
                    <Film className="h-3 w-3" />
                </div>
            )}
        </div>
    )
}

export default function SwipePage() {
    const { folderStatus, activeFolderIds, setActiveFolderIds, collections, refreshCollections, refreshFolders, registeredFolders } = useFolder()
    const { setActions } = useHeaderActions()
    const { toast } = useToast()
    const [session, setSession] = useState<SessionResponse | null>(null)
    const [currentImage, setCurrentImage] = useState<NextImageResponse | null>(null)
    const [upcomingImages, setUpcomingImages] = useState<NextImageResponse[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [zoomLevel, setZoomLevel] = useState(1)
    const [swipeAnimation, setSwipeAnimation] = useState<'left' | 'right' | 'down' | 'fav' | null>(null)
    const [swipePhase, setSwipePhase] = useState<'label' | 'slide' | null>(null)
    const [isComplete, setIsComplete] = useState(false)
    const [isImageLoading, setIsImageLoading] = useState(false)
    const [isApplyingActions, setIsApplyingActions] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)
    const [confirmApply, setConfirmApply] = useState<{ total: number; size: number } | null>(null)
    const [showShortcuts, setShowShortcuts] = useState(false)
    const [showCollections, setShowCollections] = useState(false)
    const [showExif, setShowExif] = useState(false)
    const [showExifDetails, setShowExifDetails] = useState(false)
    const [sortMode, setSortMode] = useState<string>('path')
    const [showSortMenu, setShowSortMenu] = useState(false)
    const [, setDecisionCounts] = useState({ keep: 0, reject: 0, skip: 0, favorite: 0 })
    const [moveDestination, setMoveDestination] = useState<string>(() => localStorage.getItem(MOVE_DEST_KEY) || '')
    const [showApplyMenu, setShowApplyMenu] = useState(false)
    const [confirmMoveKept, setConfirmMoveKept] = useState(false)
    const [isMovingKept, setIsMovingKept] = useState(false)
    const [currentImageTags, setCurrentImageTags] = useState<ImageTagOut[]>([])
    const currentImageTagMutationVersionRef = useRef(0)

    // Overlay measurement
    const imgRef = useRef<HTMLImageElement>(null)
    const [overlaySize, setOverlaySize] = useState<{ width: number; height: number } | null>(null)
    const [imageLoadFailed, setImageLoadFailed] = useState(false)

    // Detect if active folder is offline
    const activeFolder = activeFolderIds.length === 1 ? registeredFolders.find(f => f.id === activeFolderIds[0]) : null
    const isFolderOffline = activeFolder?.is_accessible === false

    // Swipe gesture state
    const touchStartRef = useRef<{ x: number; y: number } | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const hasImages = folderStatus?.scanned && folderStatus.image_count > 0
    const multipleSelected = activeFolderIds.length > 1
    const currentIsVideo = currentImage?.media_type === 'video'

    // Measure the rendered image bounds so overlays can exactly cover the image
    const measureOverlay = useCallback(() => {
        const img = imgRef.current
        if (!img || !img.naturalWidth || !img.naturalHeight) return
        const container = img.parentElement
        if (!container) return
        const scale = Math.min(
            container.offsetWidth / img.naturalWidth,
            container.offsetHeight / img.naturalHeight
        )
        setOverlaySize({
            width: Math.round(img.naturalWidth * scale),
            height: Math.round(img.naturalHeight * scale),
        })
    }, [])

    // Reset overlay size when image changes
    useEffect(() => {
        setOverlaySize(null)
        setImageLoadFailed(false)
    }, [currentImage?.id])

    useEffect(() => {
        if (currentImage?.media_type === 'video') {
            setIsImageLoading(false)
        }
    }, [currentImage?.id, currentImage?.media_type])

    const handleCurrentImageTagsChange = useCallback((value: SetStateAction<ImageTagOut[]>) => {
        currentImageTagMutationVersionRef.current += 1
        setCurrentImageTags(value)
    }, [])

    // Fetch tags for the current image
    useEffect(() => {
        if (!currentImage) { setCurrentImageTags([]); return }
        let cancelled = false
        const requestVersion = currentImageTagMutationVersionRef.current
        setCurrentImageTags([])
        api.getImageTags(currentImage.id).then((tags) => {
            if (!cancelled && currentImageTagMutationVersionRef.current === requestVersion) {
                setCurrentImageTags(tags)
            }
        }).catch(() => { })
        return () => { cancelled = true }
    }, [currentImage?.id]) // eslint-disable-line react-hooks/exhaustive-deps

    // Re-measure on window resize
    useEffect(() => {
        window.addEventListener('resize', measureOverlay)
        return () => window.removeEventListener('resize', measureOverlay)
    }, [measureOverlay])

    // Preload an image into the browser cache
    const preloadImage = useCallback((url: string) => {
        const img = new window.Image()
        img.src = url
    }, [])

    // Reset all state
    const resetState = useCallback(() => {
        setSession(null)
        setCurrentImage(null)
        setUpcomingImages([])
        setError(null)
        setIsComplete(false)
        setZoomLevel(1)
        setSwipeAnimation(null)
    }, [])

    const loadQueue = useCallback(
        async (sessionId: string, preferredCurrent?: NextImageResponse | null) => {
            try {
                const queue = await api.getSessionQueue(sessionId, 4)
                const images = queue.images
                const current = preferredCurrent ?? images[0] ?? null

                if (!current) {
                    setIsComplete(true)
                    setCurrentImage(null)
                    setUpcomingImages([])
                    return
                }

                setCurrentImage(current)
                setIsImageLoading(true)

                const upcoming = images.filter((img) => img.id !== current.id).slice(0, 3)
                setUpcomingImages(upcoming)

                preloadImage(api.getPreviewUrl(current.id))
                upcoming.forEach((img) => preloadImage(api.getPreviewUrl(img.id)))
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : ''
                if (msg.includes('404')) {
                    setIsComplete(true)
                    setCurrentImage(null)
                    setUpcomingImages([])
                } else {
                    throw err
                }
            }
        },
        [preloadImage]
    )

    // Start / resume session
    useEffect(() => {
        if (!folderStatus?.path || !folderStatus.scanned || !folderStatus.folder_id) {
            resetState()
            return
        }

        let cancelled = false
        const init = async () => {
            resetState()
            setIsLoading(true)
            try {
                const sess = await api.startSession(folderStatus.path!, sortMode)
                if (cancelled) return
                setSession(sess)
                setDecisionCounts({ keep: 0, reject: 0, skip: 0, favorite: 0 })
                await loadQueue(sess.id)
            } catch {
                if (!cancelled) setError('Failed to start session')
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        init()
        return () => { cancelled = true }
    }, [folderStatus?.folder_id, folderStatus?.path, folderStatus?.scanned, resetState, loadQueue, sortMode])

    // --- Decisions ---
    const handleDecision = useCallback(
        async (decision: Decision) => {
            if (!session || !currentImage || isLoading) return

            const animMap: Record<Decision, typeof swipeAnimation> = {
                reject: 'left',
                keep: 'right',
                skip: 'down',
                favorite: 'fav',
            }
            setSwipeAnimation(animMap[decision])
            setSwipePhase('label')
            setIsLoading(true)
            setDecisionCounts((prev) => ({ ...prev, [decision]: prev[decision] + 1 }))

            try {
                const res = await api.recordDecision(session.id, currentImage.id, decision)

                // Show label overlay, then slide out
                await new Promise((r) => setTimeout(r, 400))
                setSwipePhase('slide')
                await new Promise((r) => setTimeout(r, 300))
                setSwipeAnimation(null)
                setSwipePhase(null)
                setZoomLevel(1)

                // Update reviewed count locally to avoid extra fetch
                setSession((prev) =>
                    prev
                        ? { ...prev, reviewed_count: prev.total_images - res.remaining }
                        : prev
                )

                if (res.next_image) {
                    await loadQueue(session.id, res.next_image)
                } else if (res.remaining === 0) {
                    setIsComplete(true)
                    setCurrentImage(null)
                    setUpcomingImages([])
                } else {
                    await loadQueue(session.id)
                }
            } catch {
                toast('error', 'Failed to record decision')
                setSwipeAnimation(null)
            } finally {
                setIsLoading(false)
            }
        },
        [session, currentImage, isLoading, loadQueue, toast]
    )

    const handleUndo = useCallback(async () => {
        if (!session || isLoading) return
        setIsLoading(true)
        try {
            const result = await api.undoDecision(session.id)
            if (result.success) {
                setSession((prev) =>
                    prev
                        ? {
                            ...prev,
                            reviewed_count: Math.max(0, prev.reviewed_count - 1),
                            cursor_position: result.cursor_position,
                        }
                        : prev
                )
                setIsComplete(false)
                await loadQueue(session.id, result.restored_image)
                toast('info', 'Decision undone')
            }
        } catch {
            toast('error', 'Failed to undo')
        } finally {
            setIsLoading(false)
        }
    }, [session, isLoading, loadQueue, toast])

    const handleRateAndKeep = useCallback(
        async (rating: number) => {
            if (!currentImage || isLoading) return
            try {
                await api.setRating(currentImage.id, rating)
            } catch { /* continue to keep even if rating fails */ }
            handleDecision('favorite')
        },
        [currentImage, isLoading, handleDecision]
    )

    const handleAddToCollection = useCallback(
        async (collectionId: string) => {
            if (!currentImage) return
            try {
                await api.addToCollection(collectionId, [currentImage.id])
                toast('success', 'Added to collection')
                setShowCollections(false)
                refreshCollections()
            } catch {
                toast('error', 'Failed to add to collection')
            }
        },
        [currentImage, toast, refreshCollections]
    )

    const handleReset = async () => {
        if (!session) return
        setConfirmReset(false)
        setIsLoading(true)
        try {
            await api.resetSession(session.id)
            const sess = await api.startSession(folderStatus!.path!, sortMode)
            setSession(sess)
            setIsComplete(false)
            setDecisionCounts({ keep: 0, reject: 0, skip: 0, favorite: 0 })
            await loadQueue(sess.id)
            toast('success', 'Session reset')
        } catch {
            toast('error', 'Failed to reset session')
        } finally {
            setIsLoading(false)
        }
    }

    const handleApplyRejections = async () => {
        if (!folderStatus?.path) return
        try {
            const preview = await api.previewActions(folderStatus.path)
            if (preview.total_files === 0) {
                toast('info', 'No rejected files to apply')
                return
            }
            setConfirmApply({ total: preview.total_files, size: preview.total_size })
        } catch {
            toast('error', 'Failed to preview actions')
        }
    }

    const doApplyRejections = async () => {
        if (!folderStatus?.path) return
        setConfirmApply(null)
        setIsApplyingActions(true)
        try {
            const result = await api.executeActions(folderStatus.path)
            if (result.failed > 0) {
                toast('warning', `Applied ${result.processed} files, ${result.failed} failed`)
            } else {
                toast('success', `Applied ${result.processed} files`)
            }
            await refreshFolders()
        } catch {
            toast('error', 'Failed to apply actions')
        } finally {
            setIsApplyingActions(false)
        }
    }

    const handleSetMoveDestination = useCallback(() => {
        const path = prompt('Enter destination folder path for kept/favorite media:', moveDestination)
        if (path !== null) {
            setMoveDestination(path)
            localStorage.setItem(MOVE_DEST_KEY, path)
            if (path) toast('success', `Destination set: ${path}`)
            else toast('info', 'Move destination cleared')
        }
    }, [moveDestination, toast])

    const handleMoveKept = useCallback(async () => {
        if (!moveDestination) {
            handleSetMoveDestination()
            return
        }
        setConfirmMoveKept(true)
    }, [moveDestination, handleSetMoveDestination])

    const doMoveKept = async () => {
        setConfirmMoveKept(false)
        setIsMovingKept(true)
        try {
            const result = await api.moveKeptImages(moveDestination, folderStatus?.path || undefined)
            if (result.moved === 0) {
                toast('info', 'No kept/favorite images to move')
            } else if (result.failed > 0) {
                toast('warning', `Moved ${result.moved} files (${formatBytes(result.total_size)}), ${result.failed} failed`)
            } else {
                toast('success', `Moved ${result.moved} files (${formatBytes(result.total_size)}) to ${moveDestination}`)
            }
            await refreshFolders()
        } catch {
            toast('error', 'Failed to move kept images')
        } finally {
            setIsMovingKept(false)
        }
    }

    // --- Zoom ---
    const zoomIn = useCallback(() => {
        setZoomLevel((prev) => {
            const idx = ZOOM_LEVELS.indexOf(prev as (typeof ZOOM_LEVELS)[number])
            if (idx === -1) return ZOOM_LEVELS[1]
            return ZOOM_LEVELS[Math.min(idx + 1, ZOOM_LEVELS.length - 1)]
        })
    }, [])

    const zoomOut = useCallback(() => {
        setZoomLevel((prev) => {
            const idx = ZOOM_LEVELS.indexOf(prev as (typeof ZOOM_LEVELS)[number])
            if (idx === -1) return 1
            return ZOOM_LEVELS[Math.max(idx - 1, 0)]
        })
    }, [])

    const resetZoom = useCallback(() => setZoomLevel(1), [])

    const openOriginalImage = useCallback(async () => {
        if (!currentImage) return
        try {
            await api.revealInExplorer(currentImage.id)
        } catch {
            toast('error', 'Failed to reveal in explorer')
        }
    }, [currentImage, toast])

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            switch (e.key) {
                case 'ArrowRight':
                case 'k':
                case 'K':
                    e.preventDefault()
                    handleDecision('keep')
                    break
                case 'ArrowLeft':
                case 'x':
                case 'X':
                    e.preventDefault()
                    handleDecision('reject')
                    break
                case 'ArrowDown':
                case 's':
                case 'S':
                    e.preventDefault()
                    handleDecision('skip')
                    break
                case '1': case '2': case '3': case '4': case '5':
                    e.preventDefault()
                    handleRateAndKeep(parseInt(e.key))
                    break
                case 'Backspace':
                    e.preventDefault()
                    handleUndo()
                    break
                case 'z':
                case 'Z':
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault()
                        handleUndo()
                    }
                    break
                case ' ':
                    e.preventDefault()
                    setZoomLevel((prev) => (prev === 1 ? 2 : 1))
                    break
                case '+':
                case '=':
                    e.preventDefault()
                    zoomIn()
                    break
                case '-':
                case '_':
                    e.preventDefault()
                    zoomOut()
                    break
                case '0':
                    e.preventDefault()
                    resetZoom()
                    break
                case 'o':
                case 'O':
                    e.preventDefault()
                    openOriginalImage()
                    break
                case 'i':
                case 'I':
                    e.preventDefault()
                    setShowExif((prev) => !prev)
                    break
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleDecision, handleUndo, handleRateAndKeep, zoomIn, zoomOut, resetZoom, openOriginalImage])

    // --- Touch / swipe gestures ---
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        if (e.touches.length !== 1) return
        touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }, [])

    const onTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStartRef.current || e.changedTouches.length !== 1) return
            const dx = e.changedTouches[0].clientX - touchStartRef.current.x
            const dy = e.changedTouches[0].clientY - touchStartRef.current.y
            touchStartRef.current = null

            const MIN_SWIPE = 60
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > MIN_SWIPE) {
                handleDecision(dx > 0 ? 'keep' : 'reject')
            } else if (dy > MIN_SWIPE) {
                handleDecision('skip')
            }
        },
        [handleDecision]
    )

    const animClass =
        swipePhase === 'slide'
            ? swipeAnimation === 'left'
                ? '-translate-x-[120%] opacity-0'
                : swipeAnimation === 'right'
                    ? 'translate-x-[120%] opacity-0'
                    : swipeAnimation === 'down'
                        ? 'translate-y-[120%] opacity-0'
                        : swipeAnimation === 'fav'
                            ? '-translate-y-[120%] opacity-0'
                            : ''
            : ''

    useEffect(() => {
        setActions(null)
        return () => setActions(null)
    }, [setActions])

    return (
        <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
            {!hasImages ? (
                /* Empty state */
                <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="text-center max-w-sm">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                            <Layers className="h-8 w-8 text-gray-400" />
                        </div>
                        <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                            {multipleSelected
                                ? 'Select a single folder'
                                : activeFolderIds.length === 0
                                    ? 'Select a folder to swipe'
                                    : 'No media found'}
                        </h2>
                        <p className="text-gray-500 dark:text-gray-400">
                            {multipleSelected
                                ? 'Swipe works with one folder at a time. Pick a single folder from the sidebar or header dropdown.'
                                : activeFolderIds.length === 0
                                    ? 'Choose a folder from the sidebar or the dropdown above to start reviewing media.'
                                    : 'This folder has no scanned media yet. Try rescanning it from the sidebar.'}
                        </p>
                    </div>
                </div>
            ) : isComplete ? (
                /* Completion state */
                <div className="flex flex-1 flex-col items-center justify-center bg-gray-100 dark:bg-gray-900">
                    <div className="text-center">
                        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                            <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">All Done!</h2>
                        <p className="mb-4 text-lg text-gray-600 dark:text-gray-300">
                            You've reviewed all {session?.total_images.toLocaleString()} items
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => setConfirmReset(true)}
                                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <RotateCcw className="h-4 w-4" />
                                Start Over
                            </button>
                            <button
                                onClick={() => {
                                    setActiveFolderIds([])
                                }}
                                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                            >
                                Select New Folder
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                /* Image viewer */
                <>
                    {isFolderOffline && (
                        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-700 px-4 py-2 text-sm text-amber-800 dark:text-amber-300">
                            <WifiOff className="h-4 w-4 flex-shrink-0" />
                            <span>
                                <strong>{activeFolder?.label || 'This folder'}</strong> is offline — the device or drive is not connected.
                                Media is saved in your library and decisions will be recorded, but previews are unavailable.
                                Reconnect to see previews and playback again.
                            </span>
                        </div>
                    )}
                    <div
                        ref={containerRef}
                        className="relative flex min-h-0 flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900 dp-bg-main"
                        onTouchStart={onTouchStart}
                        onTouchEnd={onTouchEnd}
                    >
                        <div className="flex h-full w-full gap-6 px-4 py-4 lg:px-8">
                            {/* Media column: preview + action bar, centered together */}
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center overflow-hidden">
                                <div className="relative flex h-0 flex-1 items-center justify-center w-full overflow-hidden p-2">
                                    {(isLoading && !currentImage) || (isImageLoading && !currentImage) ? (
                                        <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
                                    ) : currentImage ? (
                                        /* Outer: animation + centering */
                                        <div
                                            className={`relative h-full w-full flex items-center justify-center transition-all duration-300 ease-out ${animClass}`}
                                            style={{ transform: swipeAnimation || currentIsVideo ? undefined : `scale(${zoomLevel})` }}
                                        >
                                            {imageLoadFailed ? (
                                                <div className="flex flex-col items-center justify-center gap-3 rounded-xl bg-gray-100 dark:bg-gray-800 px-8 py-10 text-center max-w-xs">
                                                    <ImageOff className="h-12 w-12 text-gray-400 dark:text-gray-500" />
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{currentImage.filename}</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        Preview unavailable — reconnect the device to load this item.
                                                    </p>
                                                </div>
                                            ) : currentIsVideo ? (
                                                <div className="relative flex max-h-full max-w-full items-center justify-center">
                                                    <VideoPlayer
                                                        key={currentImage.id}
                                                        imageId={currentImage.id}
                                                        className="max-h-full max-w-full"
                                                        autoPlay
                                                        loop
                                                    />
                                                    {swipeAnimation === 'left' && (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-red-500/20 pointer-events-none">
                                                            <span className="text-6xl font-bold text-red-500 rotate-[-20deg]">REJECT</span>
                                                        </div>
                                                    )}
                                                    {swipeAnimation === 'right' && (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-green-500/20 pointer-events-none">
                                                            <span className="text-6xl font-bold text-green-500 rotate-[20deg]">KEEP</span>
                                                        </div>
                                                    )}
                                                    {swipeAnimation === 'fav' && (
                                                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-yellow-500/20 pointer-events-none">
                                                            <span className="text-6xl font-bold text-yellow-400">★ RATED</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <img
                                                    ref={imgRef}
                                                    src={api.getPreviewUrl(currentImage.id)}
                                                    alt={currentImage.filename}
                                                    className={`block max-h-full max-w-full object-contain rounded-lg transition-transform ${zoomLevel > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}
                                                    onLoad={() => { setIsImageLoading(false); measureOverlay() }}
                                                    onError={() => { setIsImageLoading(false); setImageLoadFailed(true) }}
                                                    onClick={() => setZoomLevel((prev) => (prev === 1 ? 2 : 1))}
                                                    draggable={false}
                                                />
                                            )}
                                            {isImageLoading && (
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
                                                </div>
                                            )}
                                            {/* Decision overlays — positioned and sized to exactly match the rendered image */}
                                            {overlaySize && swipeAnimation === 'left' && (
                                                <div
                                                    style={{ position: 'absolute', width: overlaySize.width, height: overlaySize.height, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '0.5rem' }}
                                                    className="flex items-center justify-center bg-red-500/20 pointer-events-none"
                                                >
                                                    <span className="text-6xl font-bold text-red-500 rotate-[-20deg]">REJECT</span>
                                                </div>
                                            )}
                                            {overlaySize && swipeAnimation === 'right' && (
                                                <div
                                                    style={{ position: 'absolute', width: overlaySize.width, height: overlaySize.height, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '0.5rem' }}
                                                    className="flex items-center justify-center bg-green-500/20 pointer-events-none"
                                                >
                                                    <span className="text-6xl font-bold text-green-500 rotate-[20deg]">KEEP</span>
                                                </div>
                                            )}
                                            {overlaySize && swipeAnimation === 'fav' && (
                                                <div
                                                    style={{ position: 'absolute', width: overlaySize.width, height: overlaySize.height, left: '50%', top: '50%', transform: 'translate(-50%, -50%)', borderRadius: '0.5rem' }}
                                                    className="flex items-center justify-center bg-yellow-500/20 pointer-events-none"
                                                >
                                                    <span className="text-6xl font-bold text-yellow-400">★ RATED</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>

                                {/* Action bar */}
                                <div className="flex shrink-0 justify-center pb-2">
                                    <div className="flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 shadow-lg backdrop-blur-md dark:bg-gray-800/90 dp-bg-surface">
                                        <button
                                            onClick={() => handleDecision('reject')}
                                            disabled={!currentImage || isLoading}
                                            className="rounded-full px-3 py-1 text-sm font-semibold text-red-500 transition hover:bg-red-50 active:scale-95 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-900/30"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            onClick={() => handleDecision('skip')}
                                            disabled={!currentImage || isLoading}
                                            className="rounded-full px-3 py-1 text-sm font-semibold text-amber-500 transition hover:bg-amber-50 active:scale-95 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-900/30"
                                        >
                                            Skip
                                        </button>
                                        <button
                                            onClick={handleUndo}
                                            disabled={!session || session.reviewed_count === 0 || isLoading}
                                            className="rounded-full px-3 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 active:scale-95 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
                                        >
                                            Undo
                                        </button>
                                        <button
                                            onClick={() => handleDecision('keep')}
                                            disabled={!currentImage || isLoading}
                                            className="rounded-full px-3 py-1 text-sm font-semibold text-green-600 transition hover:bg-green-50 active:scale-95 disabled:opacity-40 dark:text-green-400 dark:hover:bg-green-900/30"
                                        >
                                            Keep
                                        </button>

                                        <div className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-600" />

                                        <div className="flex items-center gap-0.5">
                                            {[1, 2, 3, 4, 5].map((n) => (
                                                <button
                                                    key={n}
                                                    onClick={() => handleRateAndKeep(n)}
                                                    disabled={!currentImage || isLoading}
                                                    className="p-0.5 transition hover:scale-125 disabled:opacity-40"
                                                    title={`${n}★ & keep`}
                                                >
                                                    <Star className="h-3.5 w-3.5 text-yellow-400" />
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-600" />

                                        <div className="flex items-center gap-0.5">
                                            <button
                                                onClick={zoomOut}
                                                disabled={currentIsVideo || zoomLevel <= 1}
                                                className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
                                                title="Zoom out (-)"
                                            >
                                                <Minus className="h-3.5 w-3.5" />
                                            </button>
                                            <span className="min-w-[2.5rem] text-center text-xs text-gray-500 dark:text-gray-400">
                                                {Math.round(zoomLevel * 100)}%
                                            </span>
                                            <button
                                                onClick={zoomIn}
                                                disabled={currentIsVideo || zoomLevel >= 4}
                                                className="rounded-full p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
                                                title="Zoom in (+)"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                            </button>
                                        </div>

                                        <div className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-600" />

                                        <button
                                            onClick={openOriginalImage}
                                            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                            title="Show in folder (O)"
                                        >
                                            <FolderOpen className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => setShowShortcuts(true)}
                                            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                            title="Keyboard shortcuts"
                                        >
                                            <Keyboard className="h-3.5 w-3.5" />
                                        </button>

                                        <div className="mx-0.5 h-5 w-px bg-gray-300 dark:bg-gray-600" />

                                        {/* Sort */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowSortMenu(!showSortMenu)}
                                                className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                                                title={`Sort: ${sortMode}`}
                                            >
                                                <ArrowDownUp className="h-3.5 w-3.5" />
                                            </button>
                                            {showSortMenu && (
                                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 min-w-[140px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                                    <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Sort Order</div>
                                                    {(['path', 'date', 'size', 'filename', 'random'] as const).map((m) => (
                                                        <button key={m} onClick={() => { setSortMode(m); setShowSortMenu(false) }}
                                                            className={`block w-full text-left px-3 py-1.5 text-sm capitalize ${sortMode === m ? 'text-primary-600 bg-primary-50 dark:bg-primary-900/50 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                                            {m}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* EXIF */}
                                        <button
                                            onClick={() => setShowExif(!showExif)}
                                            className={`rounded-full p-1.5 transition ${showExif ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/50' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'}`}
                                            title="Toggle EXIF info (I)"
                                        >
                                            <Info className="h-3.5 w-3.5" />
                                        </button>

                                        {/* Collections */}
                                        {collections.length > 0 && (
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowCollections(!showCollections)}
                                                    disabled={!currentImage}
                                                    className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
                                                    title="Add to collection"
                                                >
                                                    <Library className="h-3.5 w-3.5" />
                                                </button>
                                                {showCollections && (
                                                    <div className="absolute bottom-full mb-2 right-0 z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                                        <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Add to Collection</div>
                                                        {collections.map((c) => (
                                                            <button key={c.id} onClick={() => handleAddToCollection(c.id)}
                                                                className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                                                {c.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Apply dropdown */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowApplyMenu(!showApplyMenu)}
                                                disabled={isApplyingActions || isMovingKept || !session}
                                                className="flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-700"
                                            >
                                                {isApplyingActions || isMovingKept ? 'Applying…' : 'Apply'}
                                                <ChevronDown className="h-3 w-3" />
                                            </button>
                                            {showApplyMenu && (
                                                <div className="absolute bottom-full mb-2 right-0 z-50 min-w-[220px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                                    <div className="px-3 py-1 text-[10px] font-semibold uppercase text-gray-400">Apply Actions</div>
                                                    <button
                                                        onClick={() => { setShowApplyMenu(false); handleApplyRejections() }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <X className="h-4 w-4 text-red-500" />
                                                        Delete Rejected
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowApplyMenu(false); handleMoveKept() }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <FolderOutput className="h-4 w-4 text-green-500" />
                                                        Move Kept to Folder
                                                    </button>
                                                    <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                                    <button
                                                        onClick={() => { setShowApplyMenu(false); handleSetMoveDestination() }}
                                                        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                    >
                                                        <FolderOpen className="h-3.5 w-3.5" />
                                                        {moveDestination
                                                            ? <span className="truncate">Dest: {moveDestination.split(/[\\/]/).pop()}</span>
                                                            : 'Set Destination Folder'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* EXIF side panel */}
                            {showExif && currentImage && (
                                <div className="w-[240px] shrink-0 bg-black/70 backdrop-blur-sm text-white text-xs p-3 rounded-lg space-y-1 self-start overflow-y-auto max-h-full">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-semibold text-[10px] uppercase tracking-wider text-gray-300">EXIF Info</span>
                                        <button onClick={() => setShowExifDetails(!showExifDetails)}
                                            className={`text-[10px] px-1.5 py-0.5 rounded ${showExifDetails ? 'bg-primary-500/50 text-white' : 'bg-white/10 text-gray-400 hover:text-white'}`}>
                                            {showExifDetails ? 'Less' : 'More'}
                                        </button>
                                    </div>
                                    <div><span className="text-gray-400">Size:</span> {formatBytes(currentImage.size)}</div>
                                    {currentImage.format && <div><span className="text-gray-400">Format:</span> {currentImage.format.toUpperCase()}</div>}
                                    {currentImage.width && currentImage.height && <div><span className="text-gray-400">Dimensions:</span> {currentImage.width}×{currentImage.height}</div>}
                                    {currentImage.media_type === 'video' && currentImage.duration != null && <div><span className="text-gray-400">Duration:</span> {formatDuration(currentImage.duration)}</div>}
                                    {currentImage.media_type === 'video' && currentImage.fps != null && <div><span className="text-gray-400">Frame Rate:</span> {currentImage.fps.toFixed(2)} fps</div>}
                                    {showExifDetails && (
                                        <>
                                            <div className="border-t border-white/10 my-1 pt-1" />
                                            {currentImage.video_codec && <div><span className="text-gray-400">Video Codec:</span> {currentImage.video_codec}</div>}
                                            {currentImage.audio_codec && <div><span className="text-gray-400">Audio Codec:</span> {currentImage.audio_codec}</div>}
                                            {currentImage.camera_make && <div><span className="text-gray-400">Camera:</span> {[currentImage.camera_make, currentImage.camera_model].filter(Boolean).join(' ')}</div>}
                                            {currentImage.iso && <div><span className="text-gray-400">ISO:</span> {currentImage.iso}</div>}
                                            {currentImage.aperture && <div><span className="text-gray-400">Aperture:</span> {currentImage.aperture}</div>}
                                            {currentImage.shutter_speed && <div><span className="text-gray-400">Shutter:</span> {currentImage.shutter_speed}</div>}
                                            {currentImage.exposure_program && <div><span className="text-gray-400">Exposure Program:</span> {currentImage.exposure_program}</div>}
                                            {currentImage.focal_length && <div><span className="text-gray-400">Focal Length:</span> {currentImage.focal_length}</div>}
                                            {currentImage.exif_date && <div><span className="text-gray-400">Date:</span> {currentImage.exif_date}</div>}
                                            <div><span className="text-gray-400">Path:</span> <span className="break-all">{currentImage.folder}</span></div>
                                        </>
                                    )}
                                    <div className="border-t border-white/10 mt-2 pt-2">
                                        <div className="text-gray-300 text-[10px] uppercase tracking-wider mb-2">Tags</div>
                                        <TagInput
                                            imageId={currentImage.id}
                                            appliedTags={currentImageTags}
                                            onTagsChange={handleCurrentImageTagsChange}
                                            autoSuggest
                                            compact
                                        />
                                    </div>
                                </div>
                            )}

                            {upcomingImages.length > 0 && (
                                <div className="hidden w-44 shrink-0 lg:flex lg:flex-col lg:gap-3">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">Up next</div>
                                    {upcomingImages.map((img, idx) => (
                                        <div key={img.id} className="group" style={{ opacity: 1 - idx * 0.15 }}>
                                            <UpNextThumbnail src={api.getPreviewUrl(img.id)} alt={img.filename} isVideo={img.media_type === 'video'} />
                                            <div className="mt-1.5 text-xs text-gray-700 dark:text-white truncate" title={img.filename}>
                                                {img.filename}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Error display */}
                        {error && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-sm px-4 py-2 rounded-lg">
                                {error}
                            </div>
                        )}
                    </div>
                </>
            )}

            {showShortcuts && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowShortcuts(false)}>
                    <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard shortcuts</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Quick controls for reviewing media</p>
                            </div>
                            <button
                                onClick={() => setShowShortcuts(false)}
                                className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Reject</span><div className="text-gray-500">← or X</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Keep</span><div className="text-gray-500">→ or K</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Skip</span><div className="text-gray-500">↓ or S</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Rate & Keep</span><div className="text-gray-500">1–5</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Undo</span><div className="text-gray-500">Ctrl+Z / Backspace</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Show folder</span><div className="text-gray-500">O</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Zoom</span><div className="text-gray-500">Space / + / -</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Reset zoom</span><div className="text-gray-500">0</div></div>
                            <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"><span className="font-semibold">Toggle EXIF</span><div className="text-gray-500">I</div></div>
                        </div>
                    </div>
                </div>
            )}



            <ConfirmModal
                open={confirmReset}
                title="Reset Session"
                message="This will clear all your decisions for this folder. Are you sure?"
                variant="danger"
                confirmLabel="Reset"
                onConfirm={handleReset}
                onCancel={() => setConfirmReset(false)}
            />

            <ConfirmModal
                open={!!confirmApply}
                title="Apply Rejections"
                message={
                    confirmApply
                        ? `Move ${confirmApply.total} file(s) (${formatBytes(confirmApply.size)}) to trash?`
                        : ''
                }
                variant="danger"
                confirmLabel="Apply"
                onConfirm={doApplyRejections}
                onCancel={() => setConfirmApply(null)}
            />

            <ConfirmModal
                open={confirmMoveKept}
                title="Move Kept Media"
                message={`Move all kept/favorite media to:\n${moveDestination}\n\nThis will CUT (move) the files to the destination folder.`}
                confirmLabel="Move Files"
                onConfirm={doMoveKept}
                onCancel={() => setConfirmMoveKept(false)}
            />
        </div>
    )
}
