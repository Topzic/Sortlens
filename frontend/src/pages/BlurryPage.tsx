import { Focus, SlidersHorizontal, Loader2, CheckCircle, Trash2, X } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useFolder } from '../context/FolderContext'
import { api, BlurResult } from '../services/api'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'

// Persist active task ID across navigations so we can resume polling
let _activeBlurTaskId: string | null = null

export default function BlurryPage() {
    const { folderStatus, activeFolderIds } = useFolder()
    const { toast: addToast } = useToast()
    const [results, setResults] = useState<BlurResult[]>([])
    const [threshold, setThreshold] = useState(100)
    const [isScanning, setIsScanning] = useState(false)
    const [selectedImage, setSelectedImage] = useState<BlurResult | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const [hasScanned, setHasScanned] = useState(false)
    const [, setKept] = useState<Set<string>>(new Set())

    // Progress state
    const [scanProgress, setScanProgress] = useState(0)
    const [scanTotal, setScanTotal] = useState(0)
    const [scanMessage, setScanMessage] = useState('')

    // Confirm modal state
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

    // Debounced threshold refresh
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const refreshResults = useCallback(async (th: number) => {
        if (!folderStatus?.path || !hasScanned) return
        try {
            const res = await api.getBlurResults(folderStatus.path, th)
            setResults(res.results)
        } catch {
            addToast('error', 'Failed to refresh results')
        }
    }, [folderStatus?.path, hasScanned, addToast])

    useEffect(() => {
        if (!hasScanned) return
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => refreshResults(threshold), 400)
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
    }, [threshold, hasScanned, refreshResults])

    // Escape key closes lightbox
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && selectedImage) { setSelectedImage(null) }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [selectedImage])

    // Poll a running task (resumes if navigated away and back)
    const pollTaskRef = useRef(false)
    const pollTask = useCallback(async (taskId: string) => {
        if (pollTaskRef.current) return // already polling
        pollTaskRef.current = true
        setIsScanning(true)

        const poll = async () => {
            try {
                const task = await api.getTask(taskId)
                setScanProgress(task.progress)
                setScanTotal(task.total)
                setScanMessage(task.message)

                if (task.status === 'completed') {
                    _activeBlurTaskId = null
                    pollTaskRef.current = false
                    setIsScanning(false)
                    setHasScanned(true)
                    if (folderStatus?.path) {
                        const res = await api.getBlurResults(folderStatus.path, threshold)
                        setResults(res.results)
                        addToast('success', `Scan complete — ${res.results.length} blurry image(s) found`)
                    }
                    return
                }

                if (task.status === 'failed') {
                    _activeBlurTaskId = null
                    pollTaskRef.current = false
                    setIsScanning(false)
                    addToast('error', task.error || 'Blur scan failed')
                    // Still show any partial results
                    if (folderStatus?.path) {
                        const res = await api.getBlurResults(folderStatus.path, threshold)
                        if (res.results.length > 0) {
                            setResults(res.results)
                            setHasScanned(true)
                        }
                    }
                    return
                }

                // Still running — fetch partial results periodically and continue polling
                if (task.progress > 0 && task.progress % 20 < 5 && folderStatus?.path) {
                    const res = await api.getBlurResults(folderStatus.path, threshold)
                    if (res.results.length > 0) {
                        setResults(res.results)
                        setHasScanned(true)
                    }
                }

                setTimeout(poll, 1000)
            } catch {
                // Network hiccup — retry
                setTimeout(poll, 2000)
            }
        }

        poll()
    }, [folderStatus?.path, threshold, addToast])

    // On mount: if there's an active task, resume polling
    useEffect(() => {
        if (_activeBlurTaskId) {
            pollTask(_activeBlurTaskId)
        } else if (folderStatus?.path) {
            // Check if there are existing results from a previous scan
            api.getBlurResults(folderStatus.path, threshold).then((res) => {
                if (res.results.length > 0) {
                    setResults(res.results)
                    setHasScanned(true)
                }
            }).catch(() => { })
        }
        return () => { pollTaskRef.current = false }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleScan = async () => {
        if (!folderStatus?.path) return
        setIsScanning(true)
        setScanProgress(0)
        setScanTotal(0)
        setScanMessage('Starting scan…')
        try {
            const { task_id } = await api.scanBlur(folderStatus.path)
            _activeBlurTaskId = task_id
            setKept(new Set())
            pollTask(task_id)
        } catch {
            addToast('error', 'Failed to start blur scan')
            setIsScanning(false)
        }
    }

    const requestDelete = (imageId: string) => {
        if (isDeleting) return
        setPendingDeleteId(imageId)
        setConfirmOpen(true)
    }

    const confirmDelete = async () => {
        if (!pendingDeleteId) return
        setConfirmOpen(false)
        setIsDeleting(true)
        try {
            const res = await api.deleteImage(pendingDeleteId)
            if (!res.success) {
                addToast('error', 'Failed to delete image')
                return
            }
            setResults((prev) => prev.filter((item) => item.id !== pendingDeleteId))
            if (selectedImage?.id === pendingDeleteId) setSelectedImage(null)
            addToast('success', 'Image deleted')
        } catch {
            addToast('error', 'Delete request failed')
        } finally {
            setIsDeleting(false)
            setPendingDeleteId(null)
        }
    }

    const handleKeep = (imageId: string) => {
        setKept((prev) => new Set(prev).add(imageId))
        setResults((prev) => prev.filter((item) => item.id !== imageId))
        if (selectedImage?.id === imageId) setSelectedImage(null)
        addToast('info', 'Marked as sharp — removed from list')
    }

    const openImage = (item: BlurResult) => {
        setSelectedImage(item)
    }

    const blurryCount = results.length

    return (
        <div className="flex h-full flex-col -m-6">
            {/* Header — fixed at top */}
            <div className="shrink-0 px-6 pt-6 bg-gray-50 dark:bg-gray-900 dp-bg-main">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-2 dark:border-gray-700">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                            Blurry Photos
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Detect and review out-of-focus images
                            {hasScanned && ` — ${blurryCount} result(s)`}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        {/* Threshold slider */}
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600 dark:text-gray-300">
                                Threshold:
                            </span>
                            <input
                                type="range"
                                min="0"
                                max="300"
                                value={threshold}
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                className="h-2 w-32 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                            />
                            <span className="w-8 text-right text-sm font-medium text-gray-700 dark:text-gray-200">
                                {threshold}
                            </span>
                        </div>

                        <button
                            onClick={handleScan}
                            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                            disabled={!folderStatus?.path || isScanning}
                        >
                            {isScanning ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
                                </span>
                            ) : 'Scan for Blurry'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
                {/* Scanning with no results yet — centered spinner + progress */}
                {isScanning && results.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center gap-3">
                        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">Analysing images…</p>
                        {scanTotal > 0 && (
                            <div className="w-64 space-y-1">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                    <div
                                        className="h-full rounded-full bg-primary-500 transition-all duration-300"
                                        style={{ width: `${Math.round((scanProgress / scanTotal) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-center text-xs text-gray-400">
                                    {scanMessage || `${scanProgress} / ${scanTotal}`}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Empty state */}
                {!isScanning && results.length === 0 && (
                    <div className="flex h-full flex-col items-center justify-center">
                        <div className="text-center max-w-sm">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                                <Focus className="h-8 w-8 text-gray-400" />
                            </div>
                            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                                {activeFolderIds.length > 1
                                    ? 'Select a single folder'
                                    : activeFolderIds.length === 0
                                        ? 'Select a folder'
                                        : hasScanned
                                            ? 'All clear!'
                                            : 'No scan results'}
                            </h2>
                            <p className="mb-6 text-gray-500 dark:text-gray-400">
                                {activeFolderIds.length > 1
                                    ? 'Blur scan works with one folder at a time. Pick a single folder from the sidebar or header dropdown.'
                                    : activeFolderIds.length === 0
                                        ? 'Choose a folder from the sidebar or the dropdown above to scan for blurry photos.'
                                        : hasScanned
                                            ? 'No blurry images found at this threshold. Try increasing it.'
                                            : 'Run a blur scan to find out-of-focus photos.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Results grid (shown even while scanning once partial results arrive) */}
                {results.length > 0 && (
                    <div className="flex flex-col">
                        {/* Progress banner while scanning */}
                        {isScanning && scanTotal > 0 && (
                            <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 p-3 dark:border-primary-800 dark:bg-primary-900/30">
                                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary-500" />
                                <div className="min-w-0 flex-1">
                                    <div className="mb-1 flex items-center justify-between text-xs text-primary-700 dark:text-primary-300">
                                        <span>{scanMessage || 'Scanning…'}</span>
                                        <span>{Math.round((scanProgress / scanTotal) * 100)}%</span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-200 dark:bg-primary-800">
                                        <div
                                            className="h-full rounded-full bg-primary-500 transition-all duration-300"
                                            style={{ width: `${Math.round((scanProgress / scanTotal) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                            {results.map((item) => (
                                <div
                                    key={item.id}
                                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <div
                                        className="relative aspect-video cursor-pointer bg-black"
                                        onClick={() => openImage(item)}
                                    >
                                        <img
                                            src={api.getPreviewUrl(item.id)}
                                            alt={item.filename}
                                            loading="lazy"
                                            className="h-full w-full object-contain"
                                        />
                                        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                            {item.blur_score.toFixed(1)}
                                        </span>
                                    </div>
                                    <div className="p-3">
                                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                                            {item.filename}
                                        </p>
                                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                            {item.folder}
                                        </p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                onClick={() => handleKeep(item.id)}
                                                className="flex items-center gap-1 rounded-md border border-green-600 px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-400 dark:hover:bg-green-900/30"
                                            >
                                                <CheckCircle className="h-3 w-3" /> Keep
                                            </button>
                                            <button
                                                onClick={() => requestDelete(item.id)}
                                                disabled={isDeleting}
                                                className="flex items-center gap-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                            >
                                                <Trash2 className="h-3 w-3" /> Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>{/* end scrollable content */}

            {/* Lightbox */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                    onClick={() => setSelectedImage(null)}
                >
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10" onClick={() => setSelectedImage(null)}>
                        <X className="h-8 w-8" />
                    </button>
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={api.getPreviewUrl(selectedImage.id)}
                            alt={selectedImage.filename}
                            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
                        />
                        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between rounded-b-lg bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                            <div className="text-white min-w-0">
                                <p className="text-sm font-semibold truncate">{selectedImage.filename}</p>
                                <p className="text-xs text-white/70 truncate">{selectedImage.folder} · Blur score: {selectedImage.blur_score.toFixed(1)}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 ml-4">
                                <button
                                    onClick={() => handleKeep(selectedImage.id)}
                                    className="rounded-md border border-green-500 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-900/40"
                                >Keep</button>
                                <button
                                    onClick={() => requestDelete(selectedImage.id)}
                                    disabled={isDeleting}
                                    className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm delete modal */}
            <ConfirmModal
                open={confirmOpen}
                title="Delete Image"
                message="This image will be sent to the recycle bin. Continue?"
                confirmLabel="Delete"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => { setConfirmOpen(false); setPendingDeleteId(null) }}
            />
        </div>
    )
}
