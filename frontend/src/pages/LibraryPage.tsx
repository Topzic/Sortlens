import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    AlertTriangle,
    FolderSearch,
    Trash2,
    ArrowRight,
    Loader2,
    CheckCircle,
    RefreshCw,
    ImageIcon,
    ArrowLeft,
} from 'lucide-react'
import { api, type MissingFolder, type MissingImage } from '../services/api'
import { useToast } from '../components/Toast'
import { useFolder } from '../context/FolderContext'

type Tab = 'folders' | 'images'

export default function LibraryPage() {
    const { toast } = useToast()
    const navigate = useNavigate()
    const { refreshFolders } = useFolder()

    const [loading, setLoading] = useState(true)
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

    const refresh = useCallback(async () => {
        setLoading(true)
        try {
            const res = await api.checkMissingFiles()
            setMissingFolders(res.missing_folders)
            setMissingImagesCount(res.missing_images_count)
            setTotalImages(res.total_images)
        } catch {
            toast('error', 'Failed to check missing files')
        } finally {
            setLoading(false)
        }
    }, [toast])

    useEffect(() => {
        refresh()
    }, [refresh])

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
                await refresh()
                await refreshFolders()
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
        if (!confirm('Remove ALL missing folders and their images from the database? This cannot be undone.')) return
        setRemoving('all')
        try {
            const res = await api.removeMissingFolder()
            if (res.success) {
                toast('success', res.message)
                await refresh()
                await refreshFolders()
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
                await refresh()
                await refreshFolders()
                if (tab === 'images') await loadMissingImages(1)
            }
        } catch {
            toast('error', 'Failed to remove missing images')
        } finally {
            setRemovingAllImages(false)
        }
    }

    const allClear = missingFolders.length === 0 && missingImagesCount === 0

    const inputCls =
        'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white'

    return (
        <div className="mx-auto max-w-3xl p-4">
            <div className="mb-6">
                <button
                    onClick={() => navigate('/settings')}
                    className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Settings
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Library Health</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Detect and resolve missing folders and images after moving your library.
                        </p>
                    </div>
                    <button
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Re-scan
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
            ) : allClear ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-green-200 bg-green-50 py-12 dark:border-green-800 dark:bg-green-900/20">
                    <CheckCircle className="h-12 w-12 text-green-500" />
                    <p className="mt-3 text-lg font-medium text-green-700 dark:text-green-300">
                        All clear
                    </p>
                    <p className="mt-1 text-sm text-green-600 dark:text-green-400">
                        All {totalImages} images and their folders are accessible.
                    </p>
                </div>
            ) : (
                <>
                    {/* Summary */}
                    <div className="mb-6 flex gap-4">
                        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{missingFolders.length}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Missing Folders</div>
                        </div>
                        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{missingImagesCount}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Missing Images</div>
                        </div>
                        <div className="flex-1 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalImages}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">Total Images</div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-700">
                        <button
                            onClick={() => setTab('folders')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === 'folders'
                                ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                                }`}
                        >
                            Missing Folders ({missingFolders.length})
                        </button>
                        <button
                            onClick={() => setTab('images')}
                            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === 'images'
                                ? 'bg-white text-gray-900 shadow dark:bg-gray-600 dark:text-white'
                                : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                                }`}
                        >
                            Missing Images ({missingImagesCount})
                        </button>
                    </div>

                    {/* Folders tab */}
                    {tab === 'folders' && (
                        <div className="space-y-3">
                            {missingFolders.length > 1 && (
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleRemoveAllMissing}
                                        disabled={removing === 'all'}
                                        className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {removing === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Remove All Missing
                                    </button>
                                </div>
                            )}

                            {missingFolders.map((folder) => (
                                <div
                                    key={folder.id}
                                    className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <div className="flex items-start gap-3">
                                        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={folder.path}>
                                                {folder.label || folder.path}
                                            </p>
                                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{folder.path}</p>
                                            <p className="mt-0.5 text-xs text-gray-400">{folder.image_count} images</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => {
                                                    setRemapFolder(remapFolder === folder.id ? null : folder.id)
                                                    setRemapPath('')
                                                }}
                                                className="flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-900/30"
                                            >
                                                <FolderSearch className="h-3.5 w-3.5" />
                                                Find New Path
                                            </button>
                                            <button
                                                onClick={() => handleRemoveFolder(folder.id)}
                                                disabled={removing === folder.id}
                                                className="flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/30 disabled:opacity-50"
                                            >
                                                {removing === folder.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {remapFolder === folder.id && (
                                        <div className="mt-3 rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                                            <label className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">
                                                Enter the new location of this folder:
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={remapPath}
                                                    onChange={(e) => setRemapPath(e.target.value)}
                                                    placeholder="e.g. D:\Photos\Vacation"
                                                    className={`flex-1 ${inputCls}`}
                                                    autoFocus
                                                    onKeyDown={(e) => { if (e.key === 'Enter') handleRemap(folder.id) }}
                                                />
                                                <button
                                                    onClick={() => handleRemap(folder.id)}
                                                    disabled={remapping || !remapPath.trim()}
                                                    className="flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    {remapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                                                    Remap
                                                </button>
                                            </div>
                                            <p className="mt-1.5 text-[10px] text-gray-400">
                                                All image paths under <span className="font-mono">{folder.path}</span> will be updated to the new location.
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

                    {/* Images tab */}
                    {tab === 'images' && (
                        <div className="space-y-3">
                            {missingImagesCount > 0 && (
                                <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        {missingImagesCount} image{missingImagesCount !== 1 ? 's' : ''} can't be found on disk.
                                    </p>
                                    <button
                                        onClick={handleRemoveMissingImages}
                                        disabled={removingAllImages}
                                        className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {removingAllImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                        Remove All Missing Images
                                    </button>
                                </div>
                            )}

                            {missingImages.map((img) => (
                                <div
                                    key={img.id}
                                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
                                >
                                    <ImageIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{img.filename}</p>
                                        <p className="text-xs text-gray-400 truncate" title={img.path}>{img.path}</p>
                                    </div>
                                </div>
                            ))}

                            {missingImages.length === 0 && missingImagesCount === 0 && (
                                <p className="py-8 text-center text-sm text-gray-400">No missing images.</p>
                            )}

                            {/* Pagination */}
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
