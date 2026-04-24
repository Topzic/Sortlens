import { Copy, Loader2, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useFolder } from '../context/FolderContext'
import { useToast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { api, type DupeGroup, type DupeMember } from '../services/api'

export default function DuplicatesPage() {
    const { folderStatus, activeFolderIds } = useFolder()
    const { toast } = useToast()
    const [groups, setGroups] = useState<DupeGroup[]>([])
    const [threshold, setThreshold] = useState(12)
    const [isScanning, setIsScanning] = useState(false)
    const [scanStats, setScanStats] = useState<{ scanned: number; skipped: number } | null>(null)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [lightbox, setLightbox] = useState<DupeMember | null>(null)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const debounceRef = useRef<ReturnType<typeof setTimeout>>()

    const handleScan = async () => {
        if (!folderStatus?.path) return
        setIsScanning(true)
        try {
            const stats = await api.scanDupes(folderStatus.path)
            setScanStats(stats)
            const res = await api.getDupeGroups(folderStatus.path, threshold)
            setGroups(res.groups)
            setSelected(new Set())
            toast('success', `Scanned ${stats.scanned} images`)
        } catch {
            toast('error', 'Scan failed')
        } finally {
            setIsScanning(false)
        }
    }

    const refreshGroups = useCallback(
        async (t: number) => {
            if (!folderStatus?.path || !scanStats) return
            try {
                const res = await api.getDupeGroups(folderStatus.path, t)
                setGroups(res.groups)
                setSelected(new Set())
            } catch {
                toast('error', 'Failed to refresh groups')
            }
        },
        [folderStatus?.path, scanStats, toast]
    )

    // Debounced threshold change
    const handleThresholdChange = (val: number) => {
        setThreshold(val)
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => refreshGroups(val), 400)
    }

    // Selection helpers
    const toggleSelect = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const autoSelectDuplicates = () => {
        // For each group, keep the first member (best = lowest hamming distance / first in group) and select the rest
        const toSelect = new Set<string>()
        for (const group of groups) {
            for (let i = 1; i < group.members.length; i++) {
                toSelect.add(group.members[i].id)
            }
        }
        setSelected(toSelect)
    }

    const handleDeleteSelected = async () => {
        setConfirmDelete(false)
        let success = 0
        let fail = 0
        for (const id of selected) {
            try {
                const res = await api.deleteImage(id)
                if (res.success) success++
                else fail++
            } catch {
                fail++
            }
        }
        toast(fail > 0 ? 'warning' : 'success', `Deleted ${success} images${fail > 0 ? `, ${fail} failed` : ''}`)
        setSelected(new Set())
        await refreshGroups(threshold)
    }

    // Lightbox keyboard
    useEffect(() => {
        if (!lightbox) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLightbox(null)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [lightbox])

    return (
        <div className="flex h-full flex-col -m-6">
            {/* Header + Stats — fixed at top */}
            <div className="shrink-0 px-6 pt-6 bg-gray-50 dark:bg-gray-900 dp-bg-main">
                <div className="mb-4 flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Duplicate Photos</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Find and clean up duplicate and similar images
                        </p>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        {groups.length > 0 && (
                            <button
                                onClick={autoSelectDuplicates}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                            >
                                Auto-select
                            </button>
                        )}
                        {selected.size > 0 && (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete ({selected.size})
                            </button>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600 dark:text-gray-300">Similarity:</span>
                            <input
                                type="range"
                                min={4}
                                max={20}
                                value={threshold}
                                onChange={(e) => handleThresholdChange(Number(e.target.value))}
                                className="h-2 w-32 cursor-pointer appearance-none rounded-lg bg-gray-200 dark:bg-gray-700"
                            />
                            <span className="w-8 text-sm text-gray-600 dark:text-gray-300">{threshold}</span>
                        </div>
                        <button
                            onClick={handleScan}
                            disabled={!folderStatus?.path || isScanning}
                            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                            {isScanning ? 'Scanning...' : 'Scan for Duplicates'}
                        </button>
                    </div>
                </div>

                {/* Stats */}
                {/* <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{groups.length}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Groups</div>
                    </div>
                    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{totalDupes}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Total Images</div>
                    </div>
                    <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{selected.size}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Selected</div>
                    </div>
                </div> */}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 min-h-0 overflow-auto px-6 pb-6">
                {/* Content */}
                {isScanning ? (
                    <div className="flex h-64 items-center justify-center">
                        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
                    </div>
                ) : groups.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center">
                        <div className="text-center max-w-sm">
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                                <Copy className="h-8 w-8 text-gray-400" />
                            </div>
                            <h2 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                                {activeFolderIds.length > 1
                                    ? 'Select a single folder'
                                    : activeFolderIds.length === 0
                                        ? 'Select a folder'
                                        : 'No duplicates found'}
                            </h2>
                            <p className="text-gray-500 dark:text-gray-400">
                                {activeFolderIds.length > 1
                                    ? 'Duplicate scan works with one folder at a time. Pick a single folder from the sidebar or header dropdown.'
                                    : activeFolderIds.length === 0
                                        ? 'Choose a folder from the sidebar or the dropdown above to scan for duplicates.'
                                        : 'Run a scan to find similar photos.'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 pt-0">
                        {groups.map((group) => (
                            <div key={group.group_id} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                <div className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                                    Group #{group.group_id} — {group.members.length} images
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                    {group.members.map((item) => {
                                        const isSel = selected.has(item.id)
                                        return (
                                            <div
                                                key={item.id}
                                                className={`relative overflow-hidden rounded-lg border-2 transition-colors cursor-pointer ${isSel ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'
                                                    }`}
                                            >
                                                <div className="aspect-video bg-black" onClick={() => setLightbox(item)}>
                                                    <img
                                                        src={api.getPreviewUrl(item.id)}
                                                        alt={item.filename}
                                                        className="h-full w-full object-contain"
                                                        loading="lazy"
                                                    />
                                                </div>
                                                <div className="p-2 flex items-start gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSel}
                                                        onChange={() => toggleSelect(item.id)}
                                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{item.filename}</p>
                                                        <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{item.folder}</p>
                                                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                            Distance: {item.hamming_distance}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>{/* end scrollable content */}



            {/* Lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setLightbox(null)}>
                    <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={() => setLightbox(null)}>
                        <X className="h-8 w-8" />
                    </button>
                    <img
                        src={api.getPreviewUrl(lightbox.id)}
                        alt={lightbox.filename}
                        className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}

            <ConfirmModal
                open={confirmDelete}
                title="Delete Selected"
                message={`Delete ${selected.size} selected image(s)? This will move them to the trash.`}
                variant="danger"
                confirmLabel="Delete"
                onConfirm={handleDeleteSelected}
                onCancel={() => setConfirmDelete(false)}
            />
        </div>
    )
}
