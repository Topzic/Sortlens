import { FolderOpen, Grid, List, Search, ChevronLeft, ChevronRight, Loader2, X, Star, Flag, Palette, ExternalLink, ZoomIn, Library, Info, Copy, Minus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFolder } from '../context/FolderContext'
import { useToast } from '../components/Toast'
import { api, formatBytes, type BrowseImage } from '../services/api'

type SortField = 'filename' | 'size' | 'created_at' | 'width' | 'height' | 'star_rating' | 'exif_date'

const SORT_MODE_KEY = 'sortlens-browse-auto-advance'

const COLOR_LABEL_MAP: Record<string, string> = {
    red: 'bg-red-500',
    yellow: 'bg-yellow-400',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
}

const COLOR_LABEL_RING: Record<string, string> = {
    red: 'ring-red-500',
    yellow: 'ring-yellow-400',
    green: 'ring-green-500',
    blue: 'ring-blue-500',
    purple: 'ring-purple-500',
}

function formatCamera(img: BrowseImage) {
    return [img.camera_make, img.camera_model].filter(Boolean).join(' ') || '—'
}

function StarRating({ rating, onRate, size = 'sm' }: { rating: number; onRate: (r: number) => void; size?: 'sm' | 'md' }) {
    const sz = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
    return (
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
            {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={(e) => { e.stopPropagation(); onRate(rating === n ? 0 : n) }}
                    className="hover:scale-125 transition-transform">
                    <Star className={`${sz} ${n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400/60'}`} />
                </button>
            ))}
        </div>
    )
}

function FlagBadge({ flag }: { flag: string }) {
    if (flag === 'pick') return <Flag className="h-3 w-3 fill-white text-white" />
    if (flag === 'reject') return <X className="h-3 w-3 text-red-400" />
    return null
}

const RAW_FORMATS = new Set(['nef', 'cr2', 'cr3', 'arw', 'raf', 'orf', 'rw2', 'dng', 'raw'])

function getLightboxUrl(img: BrowseImage): string {
    // Browsers can't render RAW files — use the generated JPEG preview instead
    if (img.format && RAW_FORMATS.has(img.format.toLowerCase())) {
        return api.getPreviewUrl(img.id)
    }
    return api.getFullUrl(img.id)
}

export default function BrowsePage() {
    const {
        folderStatus, activeFolderIds, activeCollectionId,
        filters, setFilters, collections, refreshCollections,
    } = useFolder()
    const { toast } = useToast()
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [images, setImages] = useState<BrowseImage[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [loadingMore, setLoadingMore] = useState(false)
    const [search, setSearch] = useState('')
    const [sort, setSort] = useState<SortField>('filename')
    const [order, setOrder] = useState<'asc' | 'desc'>('asc')
    const [page, setPage] = useState(1)
    const [hasMore, setHasMore] = useState(false)
    const [lightbox, setLightbox] = useState<BrowseImage | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; imageId: string } | null>(null)
    const [showCollectionMenu, setShowCollectionMenu] = useState(false)
    const [showLightboxExif, setShowLightboxExif] = useState(false)
    const [autoAdvance, setAutoAdvance] = useState(() => localStorage.getItem(SORT_MODE_KEY) === '1')
    const [showBatchRating, setShowBatchRating] = useState(false)
    const [showBatchLabel, setShowBatchLabel] = useState(false)
    const [showBatchFlag, setShowBatchFlag] = useState(false)
    const [thumbSize, setThumbSize] = useState(() => {
        const saved = localStorage.getItem('sortlens-thumb-size')
        return saved ? parseInt(saved, 10) : 180
    })
    useEffect(() => { localStorage.setItem('sortlens-thumb-size', String(thumbSize)) }, [thumbSize])
    useEffect(() => { localStorage.setItem(SORT_MODE_KEY, autoAdvance ? '1' : '0') }, [autoAdvance])
    const searchTimer = useRef<ReturnType<typeof setTimeout>>()
    const sentinelRef = useRef<HTMLDivElement>(null)
    const loadingRef = useRef(false)

    const PAGE_SIZE = 80

    const folder = folderStatus?.path || undefined

    const fetchImages = useCallback(
        async (p: number, s: string, append = false) => {
            if (loadingRef.current) return
            loadingRef.current = true
            if (append) setLoadingMore(true)
            else setLoading(true)
            try {
                const res = await api.browseImages({
                    folder: !activeFolderIds.length && !activeCollectionId ? folder : undefined,
                    folder_ids: activeFolderIds.length ? activeFolderIds.join(',') : undefined,
                    collection_id: activeCollectionId || undefined,
                    search: s || undefined,
                    sort,
                    order,
                    page: p,
                    page_size: PAGE_SIZE,
                    rating_min: filters.ratingMin,
                    rating_max: filters.ratingMax,
                    color_label: filters.colorLabel || undefined,
                    flag: filters.flag || undefined,
                })
                if (append) {
                    setImages((prev) => [...prev, ...res.images])
                } else {
                    setImages(res.images)
                }
                setTotal(res.total)
                setHasMore(res.page < res.total_pages)
                setPage(res.page)
            } catch {
                toast('error', 'Failed to load images')
            } finally {
                setLoading(false)
                setLoadingMore(false)
                loadingRef.current = false
            }
        },
        [folder, sort, order, toast, activeFolderIds, activeCollectionId, filters]
    )

    // Reset on filter/sort/folder change
    useEffect(() => {
        setPage(1)
        fetchImages(1, search)
    }, [folder, sort, order, activeFolderIds, activeCollectionId, filters]) // eslint-disable-line react-hooks/exhaustive-deps

    // Infinite scroll observer
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
                    fetchImages(page + 1, search, true)
                }
            },
            { rootMargin: '600px' }
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [hasMore, page, search, fetchImages, viewMode])

    const onSearchChange = (val: string) => {
        setSearch(val)
        clearTimeout(searchTimer.current)
        searchTimer.current = setTimeout(() => {
            setImages([])
            setPage(1)
            fetchImages(1, val)
        }, 300)
    }

    const toggleSort = (field: SortField) => {
        if (sort === field) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
        else { setSort(field); setOrder('asc') }
    }

    const handleOpenInEditor = useCallback(async (imageId: string) => {
        try {
            await api.openInEditor(imageId)
        } catch {
            toast('error', 'Failed to open in editor')
        }
    }, [toast])

    // Rating / label / flag handlers
    const advanceLightbox = useCallback(() => {
        if (!autoAdvance || !lightbox) return
        const idx = images.findIndex((i) => i.id === lightbox.id)
        if (idx < images.length - 1) setLightbox(images[idx + 1])
    }, [autoAdvance, lightbox, images])

    const handleRate = useCallback(async (imageId: string, rating: number) => {
        try {
            await api.setRating(imageId, rating)
            setImages((imgs) => imgs.map((img) => img.id === imageId ? { ...img, star_rating: rating } : img))
            if (lightbox?.id === imageId) { setLightbox((l) => l ? { ...l, star_rating: rating } : l); advanceLightbox() }
        } catch { toast('error', 'Failed to set rating') }
    }, [toast, lightbox, advanceLightbox])

    const handleLabel = useCallback(async (imageId: string, label: string | null) => {
        try {
            await api.setLabel(imageId, label)
            setImages((imgs) => imgs.map((img) => img.id === imageId ? { ...img, color_label: label } : img))
            if (lightbox?.id === imageId) { setLightbox((l) => l ? { ...l, color_label: label } : l); advanceLightbox() }
        } catch { toast('error', 'Failed to set label') }
    }, [toast, lightbox, advanceLightbox])

    const handleFlag = useCallback(async (imageId: string, flag: string) => {
        try {
            await api.setFlag(imageId, flag)
            setImages((imgs) => imgs.map((img) => img.id === imageId ? { ...img, flag } : img))
            if (lightbox?.id === imageId) { setLightbox((l) => l ? { ...l, flag } : l); advanceLightbox() }
        } catch { toast('error', 'Failed to set flag') }
    }, [toast, lightbox, advanceLightbox])

    const handleRemoveFromCollection = useCallback(async (imageId?: string) => {
        if (!activeCollectionId) return
        const ids = imageId ? [imageId] : contextMenu ? [contextMenu.imageId] : Array.from(selected)
        if (!ids.length) return
        try {
            await api.removeFromCollection(activeCollectionId, ids)
            setImages((prev) => prev.filter((img) => !ids.includes(img.id)))
            setTotal((prev) => Math.max(0, prev - ids.length))
            setSelected(new Set())
            toast('success', `Removed ${ids.length} image(s)`)
            refreshCollections()
        } catch { toast('error', 'Failed to remove from collection') }
        setContextMenu(null)
    }, [activeCollectionId, contextMenu, selected, toast, refreshCollections])

    // --- Batch action handlers ---
    const handleBatchRate = useCallback(async (rating: number) => {
        const ids = Array.from(selected)
        if (!ids.length) return
        try {
            await api.batchSetRating(ids, rating)
            setImages((imgs) => imgs.map((img) => ids.includes(img.id) ? { ...img, star_rating: rating } : img))
            toast('success', `Rated ${ids.length} image(s)`)
        } catch { toast('error', 'Failed to batch rate') }
        setShowBatchRating(false)
    }, [selected, toast])

    const handleBatchLabel = useCallback(async (label: string | null) => {
        const ids = Array.from(selected)
        if (!ids.length) return
        try {
            await api.batchSetLabel(ids, label)
            setImages((imgs) => imgs.map((img) => ids.includes(img.id) ? { ...img, color_label: label } : img))
            toast('success', `Labeled ${ids.length} image(s)`)
        } catch { toast('error', 'Failed to batch label') }
        setShowBatchLabel(false)
    }, [selected, toast])

    const handleBatchFlag = useCallback(async (flag: string) => {
        const ids = Array.from(selected)
        if (!ids.length) return
        try {
            await api.batchSetFlag(ids, flag)
            setImages((imgs) => imgs.map((img) => ids.includes(img.id) ? { ...img, flag } : img))
            toast('success', `Flagged ${ids.length} image(s)`)
        } catch { toast('error', 'Failed to batch flag') }
        setShowBatchFlag(false)
    }, [selected, toast])

    const handleCopyExport = useCallback(async () => {
        const ids = Array.from(selected)
        if (!ids.length) return
        const dest = prompt('Enter destination folder path:')
        if (!dest) return
        try {
            const result = await api.copyImages(ids, dest)
            if (result.failed > 0) {
                toast('warning', `Copied ${result.copied}, failed ${result.failed}`)
            } else {
                toast('success', `Copied ${result.copied} image(s) to ${dest}`)
            }
        } catch { toast('error', 'Failed to copy images') }
    }, [selected, toast])

    const handleAddToCollection = useCallback(async (collectionId: string, imageId?: string) => {
        const ids = imageId ? [imageId] : contextMenu ? [contextMenu.imageId] : Array.from(selected)
        if (!ids.length) return
        try {
            await api.addToCollection(collectionId, ids)
            toast('success', `Added ${ids.length} image(s) to collection`)
            refreshCollections()
        } catch { toast('error', 'Failed to add to collection') }
        setContextMenu(null)
        setShowCollectionMenu(false)
    }, [contextMenu, selected, toast, refreshCollections])

    // Selection helpers
    const toggleSelect = useCallback((imageId: string, e: React.MouseEvent) => {
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return
        e.preventDefault()
        setSelected((s) => {
            const next = new Set(s)
            if (next.has(imageId)) next.delete(imageId)
            else next.add(imageId)
            return next
        })
    }, [])

    const handleContextMenu = useCallback((e: React.MouseEvent, imageId: string) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, imageId })
    }, [])

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            // Lightbox navigation & close
            if (lightbox) {
                if (e.key === 'Escape') { setLightbox(null); return }
                if (e.key === 'ArrowRight') {
                    const idx = images.findIndex((i) => i.id === lightbox.id)
                    if (idx < images.length - 1) setLightbox(images[idx + 1])
                    return
                }
                if (e.key === 'ArrowLeft') {
                    const idx = images.findIndex((i) => i.id === lightbox.id)
                    if (idx > 0) setLightbox(images[idx - 1])
                    return
                }
            }

            // Star rating: 0-5
            const target = lightbox ? lightbox.id : selected.size === 1 ? Array.from(selected)[0] : null
            if (target && e.key >= '0' && e.key <= '5') {
                handleRate(target, parseInt(e.key))
                return
            }

            // Color labels: 6=red, 7=yellow, 8=green, 9=blue
            const labelMap: Record<string, string> = { '6': 'red', '7': 'yellow', '8': 'green', '9': 'blue' }
            if (target && labelMap[e.key]) {
                handleLabel(target, labelMap[e.key])
                return
            }

            // Flags: P=pick, U=unflagged, X=reject
            if (target) {
                if (e.key.toLowerCase() === 'p') { handleFlag(target, 'pick') }
                if (e.key.toLowerCase() === 'u') { handleFlag(target, 'unflagged') }
                if (e.key.toLowerCase() === 'x') { handleFlag(target, 'reject') }
                // Toggle EXIF in lightbox
                if (e.key.toLowerCase() === 'i' && lightbox) { setShowLightboxExif((prev) => !prev) }
            }
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [lightbox, images, selected, handleRate, handleLabel, handleFlag])

    // Close context menu on click elsewhere
    useEffect(() => {
        if (!contextMenu) return
        const close = () => setContextMenu(null)
        window.addEventListener('mousedown', close)
        return () => window.removeEventListener('mousedown', close)
    }, [contextMenu])

    // Close collection dropdown on click elsewhere
    useEffect(() => {
        if (!showCollectionMenu) return
        const close = () => setShowCollectionMenu(false)
        window.addEventListener('mousedown', close)
        return () => window.removeEventListener('mousedown', close)
    }, [showCollectionMenu])

    return (
        <div className="flex h-full flex-col p-4 gap-3">
            {/* Top bar */}
            <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white shrink-0">
                    {activeCollectionId
                        ? collections.find((c) => c.id === activeCollectionId)?.name || 'Collection'
                        : 'Browse'}
                </h1>

                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search filenames..."
                        className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400" />
                </div>

                {/* Sort */}
                <select value={sort} onChange={(e) => { setSort(e.target.value as SortField); setPage(1) }}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                    <option value="filename">Name</option>
                    <option value="size">Size</option>
                    <option value="created_at">Date</option>
                    <option value="star_rating">Rating</option>
                    <option value="width">Width</option>
                    <option value="exif_date">EXIF Date</option>
                </select>
                <button onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:text-gray-200">
                    {order === 'asc' ? '↑ Asc' : '↓ Desc'}
                </button>

                {/* View toggle */}
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600">
                    <button onClick={() => setViewMode('grid')}
                        className={`p-2 ${viewMode === 'grid' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                        <Grid className="h-4 w-4" />
                    </button>
                    <button onClick={() => setViewMode('list')}
                        className={`p-2 ${viewMode === 'list' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>
                        <List className="h-4 w-4" />
                    </button>
                </div>

                {/* Thumbnail zoom slider */}
                {viewMode === 'grid' && (
                    <div className="flex items-center gap-2">
                        <ZoomIn className="h-4 w-4 text-gray-400" />
                        <input type="range" min={100} max={400} step={10} value={thumbSize}
                            onChange={(e) => setThumbSize(Number(e.target.value))}
                            className="w-24 accent-sky-500" />
                    </div>
                )}

                {total > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 shrink-0">
                        {total.toLocaleString()} images
                    </span>
                )}
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-3 flex-wrap text-sm">
                {/* Star rating filter */}
                <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-gray-400" />
                    {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => {
                            setFilters(filters.ratingMin === n ? { ...filters, ratingMin: undefined } : { ...filters, ratingMin: n })
                        }}
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${filters.ratingMin !== undefined && n <= (filters.ratingMin || 0)
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}>
                            {n}★
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

                {/* Color label filter */}
                <div className="flex items-center gap-1">
                    <Palette className="h-4 w-4 text-gray-400" />
                    {(['red', 'yellow', 'green', 'blue', 'purple'] as const).map((c) => (
                        <button key={c} onClick={() => setFilters(filters.colorLabel === c ? { ...filters, colorLabel: undefined } : { ...filters, colorLabel: c })}
                            className={`h-4 w-4 rounded-full ${COLOR_LABEL_MAP[c]} ${filters.colorLabel === c ? 'ring-2 ring-offset-1 ring-gray-800 dark:ring-white' : 'opacity-50 hover:opacity-100'}`}
                            title={c} />
                    ))}
                </div>

                <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />

                {/* Flag filter */}
                <div className="flex items-center gap-1">
                    <Flag className="h-4 w-4 text-gray-400" />
                    {(['pick', 'unflagged', 'reject'] as const).map((f) => (
                        <button key={f} onClick={() => setFilters(filters.flag === f ? { ...filters, flag: undefined } : { ...filters, flag: f })}
                            className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${filters.flag === f
                                ? f === 'pick' ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                                    : f === 'reject' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                                        : 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200'
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                }`}>
                            {f}
                        </button>
                    ))}
                </div>

                {/* Clear filters */}
                {(filters.ratingMin || filters.colorLabel || filters.flag) && (
                    <button onClick={() => setFilters({})}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1">
                        <X className="h-3 w-3" /> Clear filters
                    </button>
                )}

                {selected.size > 0 && (
                    <div className="ml-auto flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400">
                        <span>{selected.size} selected</span>
                        {/* Batch rating */}
                        <div className="relative">
                            <button onClick={() => setShowBatchRating(!showBatchRating)}
                                className="flex items-center gap-1 rounded bg-yellow-100 px-2 py-0.5 text-yellow-700 hover:bg-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:hover:bg-yellow-800/50">
                                <Star className="h-3 w-3" /> Rate
                            </button>
                            {showBatchRating && (
                                <div className="absolute right-0 top-full mt-1 z-50 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                    {[0, 1, 2, 3, 4, 5].map((n) => (
                                        <button key={n} onClick={() => handleBatchRate(n)}
                                            className="px-2 py-1 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700">{n === 0 ? '✕' : `${n}★`}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Batch label */}
                        <div className="relative">
                            <button onClick={() => setShowBatchLabel(!showBatchLabel)}
                                className="flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-800/50">
                                <Palette className="h-3 w-3" /> Label
                            </button>
                            {showBatchLabel && (
                                <div className="absolute right-0 top-full mt-1 z-50 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                    <button onClick={() => handleBatchLabel(null)} className="px-2 py-1 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700">✕</button>
                                    {(['red', 'yellow', 'green', 'blue', 'purple'] as const).map((c) => (
                                        <button key={c} onClick={() => handleBatchLabel(c)} className={`h-5 w-5 rounded-full ${COLOR_LABEL_MAP[c]} hover:ring-2 ring-gray-800 dark:ring-white`} />
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Batch flag */}
                        <div className="relative">
                            <button onClick={() => setShowBatchFlag(!showBatchFlag)}
                                className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-green-700 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-800/50">
                                <Flag className="h-3 w-3" /> Flag
                            </button>
                            {showBatchFlag && (
                                <div className="absolute right-0 top-full mt-1 z-50 flex gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                    {(['pick', 'unflagged', 'reject'] as const).map((f) => (
                                        <button key={f} onClick={() => handleBatchFlag(f)}
                                            className="px-2 py-1 rounded text-sm capitalize hover:bg-gray-100 dark:hover:bg-gray-700">{f}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Copy/export */}
                        <button onClick={handleCopyExport}
                            className="flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-800/50">
                            <Copy className="h-3 w-3" /> Export
                        </button>
                        {/* Add to collection */}
                        {collections.length > 0 && (
                            <div className="relative">
                                <button
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={() => setShowCollectionMenu(!showCollectionMenu)}
                                    className="flex items-center gap-1 rounded bg-primary-100 px-2 py-0.5 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/50 dark:text-primary-300 dark:hover:bg-primary-800/50"
                                >
                                    <Library className="h-3 w-3" /> Collection
                                </button>
                                {showCollectionMenu && (
                                    <div onMouseDown={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-50 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                        {collections.map((c) => (
                                            <button key={c.id}
                                                onClick={() => handleAddToCollection(c.id)}
                                                className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Remove from collection */}
                        {activeCollectionId && (
                            <button onClick={() => handleRemoveFromCollection()}
                                className="flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-red-700 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-800/50">
                                <Minus className="h-3 w-3" /> Remove
                            </button>
                        )}
                        <button onClick={() => setSelected(new Set())} className="underline">clear</button>
                    </div>
                )}
            </div>

            {/* Content */}
            {loading && images.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : images.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-gray-500 dark:text-gray-400">
                    <FolderOpen className="h-12 w-12 mb-3 text-gray-300 dark:text-gray-600" />
                    <p>No images found</p>
                    <p className="text-xs mt-1">Add a folder from the sidebar or adjust filters</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="flex-1 overflow-auto">
                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbSize}px, 1fr))` }}>
                        {images.map((img) => (
                            <div key={img.id}
                                onClick={(e) => { toggleSelect(img.id, e); if (!e.ctrlKey && !e.metaKey) setLightbox(img) }}
                                onContextMenu={(e) => handleContextMenu(e, img.id)}
                                className={`group relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800 cursor-pointer transition-all ${selected.has(img.id) ? 'ring-2 ring-primary-500' : 'hover:ring-2 ring-sky-500'
                                    } ${img.color_label ? `ring-2 ${COLOR_LABEL_RING[img.color_label] || ''}` : ''}`}>
                                <img src={api.getPreviewUrl(img.id)} alt={img.filename}
                                    className="h-full w-full object-cover" loading="lazy"
                                    onError={() => { setImages(prev => prev.filter(i => i.id !== img.id)); setTotal(prev => Math.max(0, prev - 1)) }} />

                                {/* Top-left: flag badge */}
                                {img.flag !== 'unflagged' && (
                                    <div className={`absolute top-1.5 left-1.5 rounded-full p-0.5 ${img.flag === 'pick' ? 'bg-green-500' : 'bg-red-500/80'}`}>
                                        <FlagBadge flag={img.flag} />
                                    </div>
                                )}

                                {/* Top-right: color label dot */}
                                {img.color_label && (
                                    <div className={`absolute top-1.5 right-1.5 h-3 w-3 rounded-full ${COLOR_LABEL_MAP[img.color_label]}`} />
                                )}

                                {/* Bottom overlay */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <StarRating rating={img.star_rating} onRate={(r) => handleRate(img.id, r)} />
                                    <p className="text-xs text-white truncate mt-1">{img.filename}</p>
                                    {img.size && <p className="text-[10px] text-gray-300">{formatBytes(img.size)}</p>}
                                </div>

                                {/* Always-visible star dots for rated images */}
                                {img.star_rating > 0 && (
                                    <div className="absolute bottom-1.5 left-1.5 flex gap-0.5 opacity-80 group-hover:opacity-0 transition-opacity">
                                        {Array.from({ length: img.star_rating }).map((_, i) => (
                                            <div key={i} className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    {/* Infinite scroll sentinel */}
                    <div ref={sentinelRef} className="h-1" />
                    {loadingMore && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <tr>
                                <th className="text-left py-2 px-3 cursor-pointer" onClick={() => toggleSort('filename')}>
                                    Filename {sort === 'filename' && (order === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-center py-2 px-3 cursor-pointer" onClick={() => toggleSort('star_rating')}>
                                    Rating {sort === 'star_rating' && (order === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-center py-2 px-3">Label</th>
                                <th className="text-center py-2 px-3">Flag</th>
                                <th className="text-left py-2 px-3 cursor-pointer" onClick={() => toggleSort('size')}>
                                    Size {sort === 'size' && (order === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-2 px-3 cursor-pointer hidden md:table-cell" onClick={() => toggleSort('width')}>
                                    Dimensions {sort === 'width' && (order === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="text-left py-2 px-3 hidden lg:table-cell">Camera</th>
                                <th className="text-left py-2 px-3">Format</th>
                            </tr>
                        </thead>
                        <tbody>
                            {images.map((img) => (
                                <tr key={img.id}
                                    onClick={(e) => { toggleSelect(img.id, e); if (!e.ctrlKey && !e.metaKey) setLightbox(img) }}
                                    onContextMenu={(e) => handleContextMenu(e, img.id)}
                                    className={`border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer ${selected.has(img.id) ? 'bg-primary-50 dark:bg-primary-900/30' : ''
                                        }`}>
                                    <td className="py-2 px-3 flex items-center gap-3">
                                        <img src={api.getPreviewUrl(img.id)} alt="" className="h-10 w-10 rounded object-cover shrink-0" loading="lazy"
                                            onError={() => { setImages(prev => prev.filter(i => i.id !== img.id)); setTotal(prev => Math.max(0, prev - 1)) }} />
                                        <span className="truncate text-gray-900 dark:text-gray-200">{img.filename}</span>
                                    </td>
                                    <td className="py-2 px-3">
                                        <StarRating rating={img.star_rating} onRate={(r) => handleRate(img.id, r)} size="md" />
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        {img.color_label ? (
                                            <span className={`inline-block h-3 w-3 rounded-full ${COLOR_LABEL_MAP[img.color_label]}`} />
                                        ) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-center">
                                        {img.flag === 'pick' && <span className="text-green-500 text-xs font-medium">Pick</span>}
                                        {img.flag === 'reject' && <span className="text-red-500 text-xs font-medium">Reject</span>}
                                        {img.flag === 'unflagged' && <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400">{img.size ? formatBytes(img.size) : '—'}</td>
                                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                                        {img.width && img.height ? `${img.width}×${img.height}` : '—'}
                                    </td>
                                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell max-w-[200px] truncate">
                                        {formatCamera(img)}
                                    </td>
                                    <td className="py-2 px-3 text-gray-500 dark:text-gray-400 uppercase">{img.format || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {/* Infinite scroll sentinel for list view */}
                    <div ref={sentinelRef} className="h-1" />
                    {loadingMore && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                        </div>
                    )}
                </div>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white z-10" onClick={() => setLightbox(null)}>
                        <X className="h-8 w-8" />
                    </button>
                    <div className="flex-1 flex items-center justify-center min-h-0 w-full px-12 pt-4 pb-2">
                        <img src={getLightboxUrl(lightbox)} alt={lightbox.filename}
                            className="max-h-full max-w-full object-contain rounded-lg"
                            onClick={(e) => e.stopPropagation()} />
                    </div>

                    {/* Lightbox info bar — always below image */}
                    <div className="shrink-0 bg-black/60 backdrop-blur text-white px-4 py-3 rounded-lg flex items-center gap-4 mb-4" onClick={(e) => e.stopPropagation()}>
                        <StarRating rating={lightbox.star_rating} onRate={(r) => { handleRate(lightbox.id, r); setLightbox((l) => l ? { ...l, star_rating: r } : l) }} size="md" />

                        {/* Color label selector */}
                        <div className="flex gap-1">
                            {(['red', 'yellow', 'green', 'blue', 'purple'] as const).map((c) => (
                                <button key={c}
                                    onClick={(e) => { e.stopPropagation(); const newLabel = lightbox.color_label === c ? null : c; handleLabel(lightbox.id, newLabel); setLightbox((l) => l ? { ...l, color_label: newLabel } : l) }}
                                    className={`h-4 w-4 rounded-full ${COLOR_LABEL_MAP[c]} ${lightbox.color_label === c ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'}`} />
                            ))}
                        </div>

                        {/* Flag buttons */}
                        <div className="flex gap-1">
                            {(['pick', 'unflagged', 'reject'] as const).map((f) => (
                                <button key={f}
                                    onClick={(e) => { e.stopPropagation(); handleFlag(lightbox.id, f); setLightbox((l) => l ? { ...l, flag: f } : l) }}
                                    className={`px-2 py-0.5 rounded text-xs capitalize ${lightbox.flag === f
                                        ? f === 'pick' ? 'bg-green-500 text-white' : f === 'reject' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
                                        : 'text-gray-300 hover:text-white'
                                        }`}>{f}</button>
                            ))}
                        </div>

                        <div className="h-4 w-px bg-white/30" />
                        <span className="text-sm">{lightbox.filename}</span>
                        {lightbox.size && <span className="text-xs text-gray-300">{formatBytes(lightbox.size)}</span>}
                        {lightbox.width && lightbox.height && <span className="text-xs text-gray-300">{lightbox.width}×{lightbox.height}</span>}

                        <div className="h-4 w-px bg-white/30" />
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowLightboxExif(!showLightboxExif) }}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${showLightboxExif ? 'bg-primary-500/60 text-white' : 'bg-white/20 hover:bg-white/30'}`}
                            title="Toggle EXIF details (I)"
                        >
                            <Info className="h-3 w-3" /> Info
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setAutoAdvance(!autoAdvance) }}
                            className={`px-2 py-0.5 rounded text-xs transition-colors ${autoAdvance ? 'bg-sky-500/60 text-white' : 'bg-white/20 hover:bg-white/30 text-gray-300'}`}
                            title="Auto-advance after rating/label/flag"
                        >
                            Auto
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); handleOpenInEditor(lightbox.id) }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/20 hover:bg-white/30 transition-colors"
                            title="Open in external editor"
                        >
                            <ExternalLink className="h-3 w-3" /> Edit
                        </button>
                        {collections.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowCollectionMenu(!showCollectionMenu) }}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-white/20 hover:bg-white/30 transition-colors"
                                    title="Add to collection"
                                >
                                    <Library className="h-3 w-3" /> Collection
                                </button>
                                {showCollectionMenu && (
                                    <div className="absolute bottom-full mb-1 right-0 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
                                        onClick={(e) => e.stopPropagation()}>
                                        {collections.map((c) => (
                                            <button key={c.id}
                                                onClick={(e) => { e.stopPropagation(); handleAddToCollection(c.id, lightbox.id) }}
                                                className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                                                {c.name}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Lightbox EXIF details panel */}
                    {showLightboxExif && (
                        <div className="absolute top-14 right-4 bg-black/80 backdrop-blur-sm text-white text-xs p-4 rounded-lg max-w-[260px] space-y-1.5 z-10" onClick={(e) => e.stopPropagation()}>
                            <div className="font-semibold text-[10px] uppercase tracking-wider text-gray-300 mb-2">EXIF Details</div>
                            {lightbox.width && lightbox.height && <div><span className="text-gray-400">Dimensions:</span> {lightbox.width}×{lightbox.height}</div>}
                            {lightbox.camera_make && <div><span className="text-gray-400">Camera:</span> {formatCamera(lightbox)}</div>}
                            {lightbox.iso != null && <div><span className="text-gray-400">ISO:</span> {lightbox.iso}</div>}
                            {lightbox.aperture && <div><span className="text-gray-400">Aperture:</span> {lightbox.aperture}</div>}
                            {lightbox.shutter_speed && <div><span className="text-gray-400">Shutter:</span> {lightbox.shutter_speed}</div>}
                            {lightbox.size && <div><span className="text-gray-400">Size:</span> {formatBytes(lightbox.size)}</div>}
                            {lightbox.format && <div><span className="text-gray-400">Format:</span> {lightbox.format.toUpperCase()}</div>}
                            {lightbox.created_at && <div><span className="text-gray-400">Created:</span> {lightbox.created_at}</div>}
                            {lightbox.latitude != null && lightbox.longitude != null && (
                                <div><span className="text-gray-400">Location:</span> {lightbox.latitude.toFixed(6)}, {lightbox.longitude.toFixed(6)}</div>
                            )}
                            <div className="border-t border-white/10 mt-2 pt-2"><span className="text-gray-400">Path:</span> <span className="break-all">{lightbox.path}</span></div>
                        </div>
                    )}

                    {/* Lightbox nav arrows */}
                    {(() => {
                        const idx = images.findIndex((i) => i.id === lightbox.id)
                        return (
                            <>
                                {idx > 0 && (
                                    <button className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
                                        onClick={(e) => { e.stopPropagation(); setLightbox(images[idx - 1]) }}>
                                        <ChevronLeft className="h-6 w-6" />
                                    </button>
                                )}
                                {idx < images.length - 1 && (
                                    <button className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2"
                                        onClick={(e) => { e.stopPropagation(); setLightbox(images[idx + 1]) }}>
                                        <ChevronRight className="h-6 w-6" />
                                    </button>
                                )}
                            </>
                        )
                    })()}
                </div>
            )}

            {/* Context menu (right-click → add to collection) */}
            {contextMenu && collections.length > 0 && (
                <div onMouseDown={(e) => e.stopPropagation()} className="fixed z-[60] bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}>
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
    )
}
