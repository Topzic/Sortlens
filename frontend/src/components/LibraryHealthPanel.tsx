import { useCallback, useEffect, useState } from 'react'
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle,
    FolderSearch,
    ImageIcon,
    Loader2,
    RefreshCw,
    Trash2,
} from 'lucide-react'
import { useFolder } from '../context/FolderContext'
import { api, type MissingFolder, type MissingImage } from '../services/api'
import { useToast } from './Toast'

type Tab = 'folders' | 'images'

interface LibraryHealthPanelProps {
    onMissingCountChange?: (count: number) => void
}

export default function LibraryHealthPanel({ onMissingCountChange }: LibraryHealthPanelProps) {
    const { toast } = useToast()
    const { refreshFolders } = useFolder()

    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [missingFolders, setMissingFolders] = useState<MissingFolder[]>([])
    const [missingImagesCount, setMissingImagesCount] = useState(0)
    const [totalImages, setTotalImages] = useState(0)
    const [missingImages, setMissingImages] = useState<MissingImage[]>([])
    const [imagesPage, setImagesPage] = useState(1)
    const [imagesTotal, setImagesTotal] = useState(0)
    const [tab, setTab] = useState<Tab>('folders')
    const [remapFolder, setRemapFolder] = useState<string | null>(null)
    const [remapPath, setRemapPath] = useState('')
    const [remapping, setRemapping] = useState(false)
    const [removing, setRemoving] = useState<string | null>(null)
    const [removingAllImages, setRemovingAllImages] = useState(false)

    const inputCls =
        'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white'

    const refresh = useCallback(async (mode: 'initial' | 'manual' = 'manual') => {
        if (mode === 'initial') setLoading(true)
        else setRefreshing(true)

        try {
            const res = await api.checkMissingFiles()
            setMissingFolders(res.missing_folders)
            setMissingImagesCount(res.missing_images_count)
            setTotalImages(res.total_images)
            onMissingCountChange?.(res.missing_folders.length + res.missing_images_count)
        } catch {
            toast('error', 'Failed to check missing files')
        } finally {
            if (mode === 'initial') setLoading(false)
            else setRefreshing(false)
        }
    }, [onMissingCountChange, toast])

    const loadMissingImages = useCallback(async (page = 1) => {
        try {
            const res = await api.getMissingImages(page, 50)
            setMissingImages(res.images)
            setImagesTotal(res.total)
            setImagesPage(res.page)
        } catch {
            toast('error', 'Failed to load missing images')
        }
    }, [toast])

    useEffect(() => {
        refresh('initial')
    }, [refresh])

    useEffect(() => {
        if (tab === 'images') {
            loadMissingImages(1)
        }
    }, [tab, loadMissingImages])

    const handleRemap = async (folderId: string) => {
        if (!remapPath.trim()) {
            toast('error', 'Please enter a new path')
            return
        }

        setRemapping(true)
        try {
            const res = await api.remapFolder(folderId, remapPath.trim())
            if (res.success) {
                toast('success', res.message)
                setRemapFolder(null)
                setRemapPath('')
                await refreshFolders()
                await refresh()
            } else {
                toast('error', res.message)
            }
        } catch {
            toast('error', 'Failed to remap folder')
        } finally {
            setRemapping(false)
        }
    }

    const handleRemoveFolder = async (folderId: string) => {
        if (!confirm('Remove this folder and all its images from the database? This cannot be undone.')) return

        setRemoving(folderId)
        try {
            const res = await api.removeMissingFolder(folderId)
            if (res.success) {
                toast('success', res.message)
                await refreshFolders()
                await refresh()
            } else {
                toast('error', res.message)
            }
        } catch {
            toast('error', 'Failed to remove folder')
        } finally {
            setRemoving(null)
        }
    }

    const handleRemoveAllMissing = async () => {
        if (!confirm('Remove all missing folders and their images from the database? This cannot be undone.')) return

        setRemoving('all')
        try {
            const res = await api.removeMissingFolder()
            if (res.success) {
                toast('success', res.message)
                await refreshFolders()
                await refresh()
            } else {
                toast('error', res.message)
            }
        } catch {
            toast('error', 'Failed to remove missing folders')
        } finally {
            setRemoving(null)
        }
    }

    const handleRemoveMissingImages = async () => {
        if (!confirm('Remove all missing image records from the database? This cannot be undone.')) return

        setRemovingAllImages(true)
        try {
            const res = await api.removeMissingImages()
            if (res.success) {
                toast('success', res.message)
                await refreshFolders()
                await refresh()
                if (tab === 'images') await loadMissingImages(1)
            }
        } catch {
            toast('error', 'Failed to remove missing images')
        } finally {
            setRemovingAllImages(false)
        }
    }

    const allClear = missingFolders.length === 0 && missingImagesCount === 0

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-900/40 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Health Scan</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                        Find moved folders, clean broken image records, and rescan after reorganizing your library.
                    </p>
                </div>
                <button
                    onClick={() => refresh()}
                    disabled={refreshing || loading}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                    <RefreshCw className={`h-4 w-4 ${(refreshing || loading) ? 'animate-spin' : ''}`} />
                    {refreshing ? 'Rescanning...' : 'Re-scan'}
                </button>
            </div>

            {loading ? (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : allClear ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-green-200 bg-green-50 py-12 text-center dark:border-green-800 dark:bg-green-900/20">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <p className="mt-3 text-lg font-semibold text-green-700 dark:text-green-300">Library looks healthy</p>
                    <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                        All {totalImages} image{totalImages === 1 ? '' : 's'} and their folders are available.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{missingFolders.length}</div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Missing folders</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{missingImagesCount}</div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Missing images</div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalImages}</div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">Tracked images</div>
                        </div>
                    </div>

                    <div className="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/80">
                        <button
                            onClick={() => setTab('folders')}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'folders'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                                }`}
                        >
                            Missing folders ({missingFolders.length})
                        </button>
                        <button
                            onClick={() => setTab('images')}
                            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${tab === 'images'
                                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-800 dark:text-white'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                                }`}
                        >
                            Missing images ({missingImagesCount})
                        </button>
                    </div>

                    {tab === 'folders' && (
                        <div className="space-y-3">
                            {missingFolders.length > 1 && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleRemoveAllMissing}
                                        disabled={removing === 'all'}
                                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {removing === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Remove all missing folders
                                    </button>
                                </div>
                            )}

                            {missingFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                                        <div className="flex min-w-0 flex-1 gap-3">
                                            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={folder.path}>
                                                    {folder.label || folder.path}
                                                </p>
                                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" title={folder.path}>{folder.path}</p>
                                                <p className="mt-1 text-xs text-gray-400">{folder.image_count} image{folder.image_count === 1 ? '' : 's'}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 lg:justify-end">
                                            <button
                                                onClick={() => {
                                                    setRemapFolder(remapFolder === folder.id ? null : folder.id)
                                                    setRemapPath('')
                                                }}
                                                className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                            >
                                                <FolderSearch className="h-3.5 w-3.5" />
                                                Find new path
                                            </button>
                                            <button
                                                onClick={() => handleRemoveFolder(folder.id)}
                                                disabled={removing === folder.id}
                                                className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/30"
                                            >
                                                {removing === folder.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {remapFolder === folder.id && (
                                        <div className="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50">
                                            <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                                Enter the new location for this folder
                                            </label>
                                            <div className="flex flex-col gap-2 md:flex-row">
                                                <input
                                                    type="text"
                                                    value={remapPath}
                                                    onChange={(e) => setRemapPath(e.target.value)}
                                                    placeholder="e.g. D:\Photos\Vacation"
                                                    className={`flex-1 ${inputCls}`}
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRemap(folder.id)
                                                    }}
                                                />
                                                <button
                                                    onClick={() => handleRemap(folder.id)}
                                                    disabled={remapping || !remapPath.trim()}
                                                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {remapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                                    Remap
                                                </button>
                                            </div>
                                            <p className="mt-2 text-[11px] text-gray-400">
                                                All image paths under {folder.path} will be updated to the new location.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {missingFolders.length === 0 && (
                                <p className="py-8 text-center text-sm text-gray-400">No missing folders.</p>
                            )}
                        </div>
                    )}

                    {tab === 'images' && (
                        <div className="space-y-3">
                            {missingImagesCount > 0 && (
                                <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-900/50 lg:flex-row lg:items-center lg:justify-between">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        {missingImagesCount} image{missingImagesCount === 1 ? '' : 's'} cannot be found on disk.
                                    </p>
                                    <button
                                        onClick={handleRemoveMissingImages}
                                        disabled={removingAllImages}
                                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {removingAllImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Remove all missing images
                                    </button>
                                </div>
                            )}

                            {missingImages.map((img) => (
                                <div
                                    key={img.id}
                                    className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <ImageIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{img.filename}</p>
                                        <p className="truncate text-xs text-gray-400" title={img.path}>{img.path}</p>
                                    </div>
                                </div>
                            ))}

                            {missingImages.length === 0 && missingImagesCount === 0 && (
                                <p className="py-8 text-center text-sm text-gray-400">No missing images.</p>
                            )}

                            {imagesTotal > 50 && (
                                <div className="flex items-center justify-center gap-3 pt-2">
                                    <button
                                        onClick={() => loadMissingImages(imagesPage - 1)}
                                        disabled={imagesPage <= 1}
                                        className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-sm text-gray-500">
                                        Page {imagesPage} of {Math.ceil(imagesTotal / 50)}
                                    </span>
                                    <button
                                        onClick={() => loadMissingImages(imagesPage + 1)}
                                        disabled={imagesPage >= Math.ceil(imagesTotal / 50)}
                                        className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}