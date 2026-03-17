import { useState, useEffect, useRef, useCallback } from 'react'
import { X, FolderOpen, AlertCircle, Loader2, CheckCircle, Clock } from 'lucide-react'
import { api, formatBytes } from '../services/api'
import { useFolder } from '../context/FolderContext'

const RECENT_KEY = 'sortlens-recent-folders'
const MAX_RECENT = 5

function getRecentFolders(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY)
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

function addRecentFolder(path: string) {
    const recent = getRecentFolders().filter((p) => p !== path)
    recent.unshift(path)
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

interface FolderPickerModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function FolderPickerModal({ isOpen, onClose }: FolderPickerModalProps) {
    const { refreshStatus } = useFolder()
    const [folderPath, setFolderPath] = useState('')
    const [isValidating, setIsValidating] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const [validationResult, setValidationResult] = useState<{
        valid: boolean
        imageCount: number
        totalSize: number
        error?: string
    } | null>(null)
    const [recentFolders] = useState(getRecentFolders)
    const inputRef = useRef<HTMLInputElement>(null)

    // Auto-focus input when modal opens
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 50)
    }, [isOpen])

    // Escape key closes modal
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [isOpen, onClose])

    const handleValidate = useCallback(async () => {
        if (!folderPath.trim()) return
        setIsValidating(true)
        setValidationResult(null)
        try {
            const result = await api.validateFolder(folderPath.trim())
            setValidationResult({
                valid: result.valid,
                imageCount: result.image_count,
                totalSize: result.total_size,
                error: result.error || undefined,
            })
        } catch {
            setValidationResult({
                valid: false,
                imageCount: 0,
                totalSize: 0,
                error: 'Failed to validate folder. Is the backend running?',
            })
        } finally {
            setIsValidating(false)
        }
    }, [folderPath])

    const handleScan = async () => {
        if (!validationResult?.valid) return
        setIsScanning(true)
        try {
            await api.scanFolder(folderPath.trim())
            addRecentFolder(folderPath.trim())
            await refreshStatus()
            onClose()
        } catch {
            setValidationResult({
                ...validationResult,
                error: 'Failed to scan folder',
            })
        } finally {
            setIsScanning(false)
        }
    }

    const pickRecent = (path: string) => {
        setFolderPath(path)
        setValidationResult(null)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !isValidating && !isScanning) {
            if (validationResult?.valid) {
                handleScan()
            } else {
                handleValidate()
            }
        }
    }

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl dark:bg-gray-800 animate-slide-up">
                {/* Header */}
                <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Select Folder
                    </h2>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Folder path input */}
                <div className="mb-4">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Folder Path
                    </label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <FolderOpen className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={folderPath}
                                onChange={(e) => {
                                    setFolderPath(e.target.value)
                                    setValidationResult(null)
                                }}
                                onKeyDown={handleKeyDown}
                                placeholder="C:\Users\Photos or /home/user/photos"
                                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500"
                            />
                        </div>
                        <button
                            onClick={handleValidate}
                            disabled={!folderPath.trim() || isValidating}
                            className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                            {isValidating ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                'Check'
                            )}
                        </button>
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Enter the full path to your photos folder
                    </p>
                </div>

                {/* Recent folders */}
                {recentFolders.length > 0 && !validationResult && (
                    <div className="mb-4">
                        <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                            <Clock className="h-3 w-3" /> Recent
                        </p>
                        <div className="flex flex-col gap-1">
                            {recentFolders.map((p) => (
                                <button
                                    key={p}
                                    onClick={() => pickRecent(p)}
                                    className="truncate rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Validation result */}
                {validationResult && (
                    <div
                        className={`mb-4 rounded-lg p-4 ${validationResult.valid
                            ? 'bg-green-50 dark:bg-green-900/20'
                            : 'bg-red-50 dark:bg-red-900/20'
                            }`}
                    >
                        {validationResult.valid ? (
                            <div className="flex items-start gap-3">
                                <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                                <div>
                                    <p className="font-medium text-green-800 dark:text-green-200">
                                        Found {validationResult.imageCount.toLocaleString()} images
                                    </p>
                                    <p className="text-sm text-green-600 dark:text-green-400">
                                        Total size: {formatBytes(validationResult.totalSize)}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
                                <div>
                                    <p className="font-medium text-red-800 dark:text-red-200">
                                        Invalid folder
                                    </p>
                                    <p className="text-sm text-red-600 dark:text-red-400">
                                        {validationResult.error}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleScan}
                        disabled={!validationResult?.valid || isScanning}
                        className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                        {isScanning ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Scanning...
                            </>
                        ) : (
                            'Start Session'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
