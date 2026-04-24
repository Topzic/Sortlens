import {
    AlertTriangle,
    Brain,
    ChevronDown,
    Database,
    Download,
    HeartPulse,
    Loader2,
    Palette,
    RefreshCw,
    Save,
    SlidersHorizontal,
    Trash2,
    Upload,
    type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import LibraryHealthPanel from '../components/LibraryHealthPanel'
import { useToast } from '../components/Toast'
import { api, type ReleaseInfo, type SettingsMap, type TagPackOut, type UpdateCheckResponse } from '../services/api'

const DEFAULTS: Record<string, string> = {
    deletion_mode: 'trash',
    include_sidecars: 'true',
    preview_max_size: '1920',
    prefetch_count: '3',
    undo_depth: '20',
    scan_batch_size: '100',
    enable_yolo: 'true',
    theme: 'system',
    editor_command: 'default',
    enabled_tag_packs: 'photography,wildlife,food,scene,event',
}

const PACK_COLORS: Record<string, { border: string; bg: string; dot: string; text: string }> = {
    ai: { border: 'border-sky-200 dark:border-sky-800', bg: 'bg-sky-50 dark:bg-sky-900/20', dot: 'bg-sky-500', text: 'text-sky-700 dark:text-sky-300' },
    ai_wildlife: { border: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-900/20', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300' },
    ai_food: { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
    ai_scene: { border: 'border-indigo-200 dark:border-indigo-800', bg: 'bg-indigo-50 dark:bg-indigo-900/20', dot: 'bg-indigo-500', text: 'text-indigo-700 dark:text-indigo-300' },
    ai_event: { border: 'border-rose-200 dark:border-rose-800', bg: 'bg-rose-50 dark:bg-rose-900/20', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
}

const PRESET_EDITORS = ['default', 'affinity', 'darktable', 'rawtherapee', 'gimp', 'photoshop']

const SETTINGS_SECTIONS = [
    {
        id: 'review',
        title: 'Review',
        description: 'Reject behavior, preview performance, and undo depth.',
        icon: SlidersHorizontal,
    },
    {
        id: 'appearance',
        title: 'Appearance',
        description: 'Theme and external editor preferences.',
        icon: Palette,
    },
    {
        id: 'ai-tagging',
        title: 'AI & Tagging',
        description: 'Model downloads, YOLO controls, and tag packs.',
        icon: Brain,
    },
    {
        id: 'library-health',
        title: 'Library Health',
        description: 'Fix moved folders and missing image records.',
        icon: HeartPulse,
    },
    {
        id: 'library-data',
        title: 'Library Data',
        description: 'Export, import, and recovery actions.',
        icon: Database,
    },
    {
        id: 'updates',
        title: 'Updates',
        description: 'Version details, update checks, and release history.',
        icon: RefreshCw,
    },
] as const

type SectionId = (typeof SETTINGS_SECTIONS)[number]['id']

interface SectionPanelProps {
    title: string
    description: string
    summary: string
    icon: LucideIcon
    children: ReactNode
}

interface SettingRowProps {
    label: string
    description: string
    status?: string
    children: ReactNode
}

function classNames(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(' ')
}

function getSectionFromHash(hash: string): SectionId | null {
    const value = hash.replace(/^#/, '')
    const match = SETTINGS_SECTIONS.find((section) => section.id === value)
    return match ? match.id : null
}

function formatDeletionMode(value: string) {
    switch (value) {
        case 'rejected_folder':
            return 'Move to Rejected folder'
        case 'permanent':
            return 'Delete permanently'
        default:
            return 'Move to system Trash'
    }
}

function formatTheme(value: string) {
    switch (value) {
        case 'light':
            return 'Light'
        case 'dark':
            return 'Dark'
        default:
            return 'Match system'
    }
}

function formatEditor(value: string) {
    switch (value) {
        case 'affinity':
            return 'Affinity Photo'
        case 'darktable':
            return 'Darktable'
        case 'rawtherapee':
            return 'RawTherapee'
        case 'gimp':
            return 'GIMP'
        case 'photoshop':
            return 'Adobe Photoshop'
        case 'default':
            return 'System default'
        default:
            return 'Custom executable'
    }
}

function SectionPanel({ title: _title, description: _description, summary: _summary, icon: _Icon, children }: SectionPanelProps) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            {/* <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-5 dark:border-gray-700 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 dark:bg-gray-900/70 dark:text-gray-300">
                        <Icon className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
                    </div>
                </div>
                <div className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
                    {summary}
                </div>
            </div> */}

            {children}
        </section>
    )
}

function SettingRow({ label, description, status, children }: SettingRowProps) {
    return (
        <div className="grid gap-4 py-5 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr),minmax(260px,320px)] lg:items-start">
            <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{label}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
                {status && <p className="mt-2 text-xs font-medium text-gray-400 dark:text-gray-500">{status}</p>}
            </div>
            <div className="lg:justify-self-end lg:w-full">{children}</div>
        </div>
    )
}

export default function SettingsPage() {
    const { toast } = useToast()
    const location = useLocation()
    const initialThemeRef = useRef<string | null>(null)
    const [activeSection, setActiveSection] = useState<SectionId>('review')
    const [settings, setSettings] = useState<SettingsMap>(DEFAULTS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [importing, setImporting] = useState(false)
    const [missingCount, setMissingCount] = useState<number | null>(null)
    const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null)
    const [updateChecking, setUpdateChecking] = useState(false)
    const [updateApplying, setUpdateApplying] = useState(false)
    const [versionHistory, setVersionHistory] = useState<ReleaseInfo[]>([])
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoaded, setHistoryLoaded] = useState(false)
    const [aiStatus, setAiStatus] = useState<import('../services/api').AiStatusOut | null>(null)
    const [aiDeleting, setAiDeleting] = useState(false)
    const [tagPacks, setTagPacks] = useState<TagPackOut[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const initialSection = getSectionFromHash(location.hash)
        if (initialSection) {
            setActiveSection(initialSection)
        }
    }, [location.hash])

    useEffect(() => {
        const load = async () => {
            try {
                const remote = await api.getSettings()
                const merged = { ...DEFAULTS, ...remote }
                setSettings(merged)
                initialThemeRef.current = merged.theme
            } catch {
                toast('error', 'Failed to load settings')
            } finally {
                setLoading(false)
            }
        }

        load()
        api.checkMissingFiles().then((res) => {
            setMissingCount(res.missing_folders.length + res.missing_images_count)
        }).catch(() => { })
        api.checkForUpdate().then(setUpdateInfo).catch(() => { })
        api.getAiStatus().then(setAiStatus).catch(() => { })
        api.listTagPacks().then(setTagPacks).catch(() => { })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!aiStatus?.downloading) return
        const id = setInterval(() => {
            api.getAiStatus().then(setAiStatus).catch(() => { })
        }, 2000)
        return () => clearInterval(id)
    }, [aiStatus?.downloading])

    const handleCheckUpdate = async () => {
        setUpdateChecking(true)
        try {
            const info = await api.checkForUpdate()
            setUpdateInfo(info)
            if (!info.update_available) {
                toast('success', `You're on the latest version (${info.current_version})`)
            }
        } catch {
            toast('error', 'Failed to check for updates')
        } finally {
            setUpdateChecking(false)
        }
    }

    const handleApplyUpdate = async () => {
        if (!confirm('This will download and launch the Sortlens installer. The app will close during the update. Continue?')) {
            return
        }

        setUpdateApplying(true)
        try {
            const result = await api.applyUpdate()
            if (result.success) {
                toast('success', 'Installer launched - Sortlens will close shortly.')
            } else {
                toast('error', result.message)
                setUpdateApplying(false)
            }
        } catch {
            toast('error', 'Update failed. Please try downloading manually from GitHub.')
            setUpdateApplying(false)
        }
    }

    const handleLoadHistory = async () => {
        if (historyLoaded) return
        setHistoryLoading(true)
        try {
            const releases = await api.getUpdateHistory()
            setVersionHistory(releases)
            setHistoryLoaded(true)
        } catch {
            toast('error', 'Failed to load version history')
        } finally {
            setHistoryLoading(false)
        }
    }

    const set = (key: string, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
        setDirty(true)
    }

    const handleSelectSection = (sectionId: SectionId) => {
        setActiveSection(sectionId)
        const url = new URL(window.location.href)
        url.hash = sectionId
        window.history.replaceState(null, '', url)
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await api.updateSettings({
                deletion_mode: settings.deletion_mode,
                include_sidecars: settings.include_sidecars === 'true',
                preview_max_size: parseInt(settings.preview_max_size) || 1920,
                prefetch_count: parseInt(settings.prefetch_count) || 3,
                undo_depth: parseInt(settings.undo_depth) || 20,
                scan_batch_size: parseInt(settings.scan_batch_size) || 100,
                enable_yolo: settings.enable_yolo !== 'false',
                theme: settings.theme,
                editor_command: settings.editor_command || 'default',
                enabled_tag_packs: settings.enabled_tag_packs || 'photography,wildlife,food,scene,event',
            })
            setDirty(false)

            if (settings.theme !== initialThemeRef.current) {
                const themeVal = settings.theme
                let resolved = themeVal
                if (themeVal === 'system') {
                    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
                }
                localStorage.setItem('sortlens-theme', resolved)
                const root = document.documentElement
                root.classList.remove('dark', 'darkplus')
                if (resolved === 'dark') root.classList.add('dark')
                initialThemeRef.current = settings.theme
            }

            toast('success', 'Settings saved')
        } catch {
            toast('error', 'Failed to save settings')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    const inputCls =
        'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
    const deletionModeLabel = formatDeletionMode(settings.deletion_mode)
    const themeLabel = formatTheme(settings.theme)
    const selectedEditorOption = PRESET_EDITORS.includes(settings.editor_command) ? settings.editor_command : 'custom'
    const editorLabel = formatEditor(settings.editor_command)
    const enabledTagPackIds = new Set((settings.enabled_tag_packs || DEFAULTS.enabled_tag_packs).split(',').filter(Boolean))
    const healthSummary = missingCount === null
        ? 'Scanning library'
        : missingCount === 0
            ? 'All clear'
            : `${missingCount} item${missingCount === 1 ? '' : 's'} need attention`
    const aiSummary = aiStatus === null
        ? 'Checking model'
        : aiStatus.downloading
            ? 'Downloading model'
            : aiStatus.available
                ? 'Model installed'
                : 'Model not installed'
    const updateSummary = updateInfo === null
        ? 'Checking releases'
        : updateInfo.update_available
            ? `Version ${updateInfo.latest_version} available`
            : 'Up to date'
    const sectionSummaries: Record<SectionId, string> = {
        review: deletionModeLabel,
        appearance: `${themeLabel} theme`,
        'ai-tagging': aiSummary,
        'library-health': healthSummary,
        'library-data': 'Export and import database',
        updates: updateSummary,
    }
    const activeSectionMeta = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0]
    const showSaveFooter = activeSection === 'review' || activeSection === 'appearance' || activeSection === 'ai-tagging'

    const renderSection = () => {
        switch (activeSection) {
            case 'review':
                return (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        <SettingRow
                            label="Rejected photos"
                            description="Choose what happens when you reject an image."
                            status={deletionModeLabel}
                        >
                            <select
                                value={settings.deletion_mode}
                                onChange={(e) => set('deletion_mode', e.target.value)}
                                className={`w-full lg:max-w-xs ${inputCls}`}
                            >
                                <option value="trash">Move to system Trash</option>
                                <option value="rejected_folder">Move to Rejected folder</option>
                                <option value="permanent">Delete permanently</option>
                            </select>
                        </SettingRow>

                        <SettingRow
                            label="Sidecar cleanup"
                            description="Also remove matching sidecar files when a photo is rejected."
                            status={settings.include_sidecars === 'true' ? 'Sidecars included' : 'Sidecars kept'}
                        >
                            <label className="inline-flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/50 lg:max-w-xs">
                                <input
                                    type="checkbox"
                                    checked={settings.include_sidecars === 'true'}
                                    onChange={(e) => set('include_sidecars', String(e.target.checked))}
                                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {settings.include_sidecars === 'true' ? 'Delete sidecars too' : 'Keep sidecars'}
                                </span>
                            </label>
                        </SettingRow>

                        <SettingRow
                            label="Preview resolution"
                            description="Maximum size used for generated previews."
                            status={`${settings.preview_max_size || DEFAULTS.preview_max_size} px`}
                        >
                            <div className="flex items-center gap-2 lg:justify-end">
                                <input
                                    type="number"
                                    value={settings.preview_max_size}
                                    onChange={(e) => set('preview_max_size', e.target.value)}
                                    min={800}
                                    max={4096}
                                    className={`w-24 ${inputCls}`}
                                />
                                <span className="text-xs text-gray-400">px</span>
                            </div>
                        </SettingRow>

                        <SettingRow
                            label="Preview queue"
                            description="How many images Sortlens prepares ahead of the current photo."
                            status={`${settings.prefetch_count || DEFAULTS.prefetch_count} image${settings.prefetch_count === '1' ? '' : 's'} ahead`}
                        >
                            <input
                                type="number"
                                value={settings.prefetch_count}
                                onChange={(e) => set('prefetch_count', e.target.value)}
                                min={0}
                                max={10}
                                className={`w-24 lg:ml-auto ${inputCls}`}
                            />
                        </SettingRow>

                        <SettingRow
                            label="Undo history"
                            description="How many recent decisions you can undo in a review session."
                            status={`${settings.undo_depth || DEFAULTS.undo_depth} steps`}
                        >
                            <input
                                type="number"
                                value={settings.undo_depth}
                                onChange={(e) => set('undo_depth', e.target.value)}
                                min={5}
                                max={100}
                                className={`w-24 lg:ml-auto ${inputCls}`}
                            />
                        </SettingRow>

                        <SettingRow
                            label="Library scan batch size"
                            description="Files processed per batch when Sortlens scans folders."
                            status={`${settings.scan_batch_size || DEFAULTS.scan_batch_size} files per batch`}
                        >
                            <input
                                type="number"
                                value={settings.scan_batch_size}
                                onChange={(e) => set('scan_batch_size', e.target.value)}
                                min={25}
                                max={1000}
                                className={`w-28 lg:ml-auto ${inputCls}`}
                            />
                        </SettingRow>
                    </div>
                )
            case 'appearance':
                return (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        <SettingRow
                            label="Theme"
                            description="Use the app theme directly or follow your system preference."
                            status={themeLabel}
                        >
                            <select
                                value={settings.theme}
                                onChange={(e) => set('theme', e.target.value)}
                                className={`w-full lg:max-w-xs ${inputCls}`}
                            >
                                <option value="system">System default</option>
                                <option value="light">Light</option>
                                <option value="dark">Dark</option>
                            </select>
                        </SettingRow>

                        <SettingRow
                            label="External editor"
                            description="Choose the editor Sortlens should launch for deeper edits."
                            status={editorLabel}
                        >
                            <div className="space-y-3 lg:w-72 lg:ml-auto">
                                <select
                                    value={selectedEditorOption}
                                    onChange={(e) => {
                                        const value = e.target.value
                                        if (value === 'custom') set('editor_command', '')
                                        else set('editor_command', value)
                                    }}
                                    className={`w-full ${inputCls}`}
                                >
                                    <option value="default">System default</option>
                                    <option value="affinity">Affinity Photo</option>
                                    <option value="darktable">Darktable</option>
                                    <option value="rawtherapee">RawTherapee</option>
                                    <option value="gimp">GIMP</option>
                                    <option value="photoshop">Adobe Photoshop</option>
                                    <option value="custom">Custom path...</option>
                                </select>
                                {selectedEditorOption === 'custom' && (
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={settings.editor_command}
                                            onChange={(e) => set('editor_command', e.target.value)}
                                            placeholder="e.g. C:\Program Files\Photo Editor\editor.exe"
                                            className={`w-full ${inputCls}`}
                                        />
                                        <p className="text-xs text-gray-400">Enter the full path to the editor executable.</p>
                                    </div>
                                )}
                            </div>
                        </SettingRow>
                    </div>
                )
            case 'ai-tagging':
                return (
                    <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Shared AI model</p>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Download CLIP once and reuse it for Browse and Swipe suggestions.
                                </p>

                                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                    {aiStatus === null ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-400">
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Checking model status...
                                        </div>
                                    ) : aiStatus.downloading ? (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Downloading model
                                                {aiStatus.progress !== null && (
                                                    <span className="font-mono">{Math.round(aiStatus.progress * 100)}%</span>
                                                )}
                                            </div>
                                            {aiStatus.progress !== null && (
                                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                                    <div
                                                        className="h-full rounded-full bg-primary-500 transition-all duration-500"
                                                        style={{ width: `${Math.round(aiStatus.progress * 100)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : aiStatus.available ? (
                                        <div className="flex flex-wrap items-center gap-3">
                                            <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                                Installed
                                                {aiStatus.model_size_bytes && (
                                                    <span className="text-xs font-normal text-gray-400">
                                                        ({(aiStatus.model_size_bytes / 1024 / 1024).toFixed(0)} MB)
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    if (!confirm('Remove the AI model file? You can re-download it at any time.')) return
                                                    setAiDeleting(true)
                                                    try {
                                                        await api.deleteAiModel()
                                                        setAiStatus(await api.getAiStatus())
                                                        toast('success', 'AI model removed')
                                                    } catch {
                                                        toast('error', 'Failed to remove AI model')
                                                    } finally {
                                                        setAiDeleting(false)
                                                    }
                                                }}
                                                disabled={aiDeleting}
                                                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                                            >
                                                {aiDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await api.triggerAiDownload()
                                                    setAiStatus(await api.getAiStatus())
                                                } catch {
                                                    toast('error', 'Failed to start download')
                                                }
                                            }}
                                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
                                        >
                                            <Download className="h-4 w-4" />
                                            Download AI model (~170 MB)
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">YOLO object detection</p>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Toggle background object tags like bird, tree, and car.
                                </p>

                                <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                                    <input
                                        type="checkbox"
                                        checked={settings.enable_yolo !== 'false'}
                                        onChange={(e) => set('enable_yolo', String(e.target.checked))}
                                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    />
                                    <div>
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {settings.enable_yolo !== 'false' ? 'YOLO tags enabled' : 'YOLO tags disabled'}
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                            The model loads on demand, so turning this off removes object-based suggestions without affecting the rest of tagging.
                                        </div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {tagPacks.length > 0 && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <div className="mb-4">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Tag packs</p>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Enable the suggestion packs you want available while tagging.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    {tagPacks.map((pack) => {
                                        const colors = PACK_COLORS[pack.source] ?? PACK_COLORS.ai
                                        const enabled = enabledTagPackIds.has(pack.id)
                                        return (
                                            <label
                                                key={pack.id}
                                                className={classNames(
                                                    'flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors select-none',
                                                    colors.border,
                                                    enabled ? colors.bg : 'opacity-55',
                                                )}
                                            >
                                                <span className={classNames('h-3 w-3 flex-shrink-0 rounded-full', colors.dot)} />
                                                <div className="min-w-0 flex-1">
                                                    <div className={classNames('text-sm font-medium', colors.text)}>{pack.name}</div>
                                                    <div className="truncate text-xs text-gray-400">{pack.description} - {pack.tag_count} tags</div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={enabled}
                                                    onChange={() => {
                                                        const current = new Set((settings.enabled_tag_packs || DEFAULTS.enabled_tag_packs).split(',').filter(Boolean))
                                                        if (current.has(pack.id)) current.delete(pack.id)
                                                        else current.add(pack.id)
                                                        set('enabled_tag_packs', Array.from(current).join(','))
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 accent-primary-600"
                                                />
                                            </label>
                                        )
                                    })}
                                </div>
                                {!aiStatus?.available && (
                                    <p className="mt-3 text-xs text-gray-400">Download the AI model above to enable tag packs.</p>
                                )}
                            </div>
                        )}
                    </div>
                )
            case 'library-health':
                return <LibraryHealthPanel onMissingCountChange={(count) => setMissingCount(count)} />
            case 'library-data':
                return (
                    <div className="space-y-4">
                        <div className="grid gap-4 xl:grid-cols-2">
                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Export database</p>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Create a portable backup before moving machines or making broader library changes.
                                </p>
                                <a
                                    href={api.getExportUrl()}
                                    download
                                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                                >
                                    <Download className="h-4 w-4" />
                                    Export database
                                </a>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">Import database</p>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    Replace the current database with a backup file. A safety backup is created before import.
                                </p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={importing}
                                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    {importing ? 'Importing...' : 'Import database'}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".json"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        if (!confirm('Importing will replace your current database. A backup will be created automatically. Continue?')) {
                                            e.target.value = ''
                                            return
                                        }
                                        setImporting(true)
                                        try {
                                            const result = await api.importDatabase(file)
                                            if (result.success) {
                                                toast('success', result.message)
                                                const missing = await api.checkMissingFiles()
                                                setMissingCount(missing.missing_folders.length + missing.missing_images_count)
                                            } else {
                                                toast('error', result.message)
                                            }
                                        } catch {
                                            toast('error', 'Failed to import database')
                                        } finally {
                                            setImporting(false)
                                            e.target.value = ''
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        {missingCount !== null && missingCount > 0 && (
                            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30 lg:flex-row lg:items-center">
                                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                        {missingCount} missing file{missingCount === 1 ? '' : 's'} detected
                                    </p>
                                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                                        Open Library Health to repair moved folders or remove broken records.
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleSelectSection('library-health')}
                                    className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
                                >
                                    Open library health
                                </button>
                            </div>
                        )}
                    </div>
                )
            case 'updates':
                return (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div className="space-y-1">
                                    <p className="text-sm text-gray-600 dark:text-gray-300">
                                        Current version: <span className="font-mono font-medium">{updateInfo?.current_version ?? '...'}</span>
                                    </p>
                                    {updateInfo?.latest_version && (
                                        <p className="text-sm text-gray-600 dark:text-gray-300">
                                            Latest version: <span className="font-mono font-medium">{updateInfo.latest_version}</span>
                                        </p>
                                    )}
                                </div>

                                <button
                                    onClick={handleCheckUpdate}
                                    disabled={updateChecking || updateApplying}
                                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                                >
                                    {updateChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    {updateChecking ? 'Checking...' : 'Check for updates'}
                                </button>
                            </div>
                        </div>

                        {updateInfo?.update_available && (
                            <div className="flex flex-col gap-4 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-900/30 xl:flex-row xl:items-center">
                                <Download className="h-5 w-5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
                                        Version {updateInfo.latest_version} is available
                                    </p>
                                    {updateInfo.asset_size && (
                                        <p className="mt-0.5 text-xs text-sky-600 dark:text-sky-400">
                                            Download size: {(updateInfo.asset_size / 1024 / 1024).toFixed(1)} MB
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={handleApplyUpdate}
                                    disabled={updateApplying}
                                    className="inline-flex flex-shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {updateApplying ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-4 w-4" />
                                            Download and install
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {updateInfo?.release_notes && updateInfo.update_available && (
                            <details className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Release notes
                                </summary>
                                <div className="whitespace-pre-wrap border-t border-gray-200 px-4 pb-4 pt-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                    {updateInfo.release_notes}
                                </div>
                            </details>
                        )}

                        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-5 dark:border-gray-700 dark:bg-gray-900/40">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">Version history</h3>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        Load previous releases when you need the full changelog.
                                    </p>
                                </div>
                                {!historyLoaded && (
                                    <button
                                        onClick={handleLoadHistory}
                                        disabled={historyLoading}
                                        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                                    >
                                        {historyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                        {historyLoading ? 'Loading...' : 'Load history'}
                                    </button>
                                )}
                            </div>

                            {historyLoaded && versionHistory.length === 0 && (
                                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No releases found.</p>
                            )}

                            {versionHistory.length > 0 && (
                                <div className="mt-4 space-y-2">
                                    {versionHistory.map((release) => (
                                        <details key={release.tag} className="group rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                                            <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                                                <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
                                                <span className="font-mono font-semibold">v{release.version}</span>
                                                {release.published_at && (
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(release.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                                {release.version === updateInfo?.current_version && (
                                                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                                                        current
                                                    </span>
                                                )}
                                                {release.asset_size && (
                                                    <span className="ml-auto text-xs text-gray-400">
                                                        {(release.asset_size / 1024 / 1024).toFixed(1)} MB
                                                    </span>
                                                )}
                                            </summary>
                                            <div className="border-t border-gray-200 px-4 pb-4 pt-3 dark:border-gray-700">
                                                {release.release_notes ? (
                                                    <div className="whitespace-pre-wrap text-xs text-gray-500 dark:text-gray-400">
                                                        {release.release_notes}
                                                    </div>
                                                ) : (
                                                    <p className="text-xs italic text-gray-400">No release notes.</p>
                                                )}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
        }
    }

    return (
        <div className="mx-auto max-w-6xl space-y-5 p-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Everything is grouped into a few categories so the common settings stay easy to find.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className={classNames(
                            'rounded-full border px-3 py-1 text-xs font-medium',
                            dirty
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-600 dark:bg-gray-900/50 dark:text-gray-300',
                        )}>
                            {dirty ? 'Unsaved changes' : 'All changes saved'}
                        </div>
                        <button
                            onClick={handleSave}
                            disabled={saving || !dirty}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? 'Saving...' : 'Save settings'}
                        </button>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {SETTINGS_SECTIONS.map((section) => {
                        const Icon = section.icon
                        const badge = section.id === 'library-health' && missingCount && missingCount > 0
                            ? String(missingCount)
                            : section.id === 'updates' && updateInfo?.update_available
                                ? 'New'
                                : undefined

                        return (
                            <button
                                key={section.id}
                                onClick={() => handleSelectSection(section.id)}
                                className={classNames(
                                    'inline-flex min-w-fit items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
                                    activeSection === section.id
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                        : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/60',
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                <span>{section.title}</span>
                                {badge && (
                                    <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-900/70 dark:text-gray-300">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>

            <SectionPanel
                title={activeSectionMeta.title}
                description={activeSectionMeta.description}
                summary={sectionSummaries[activeSection]}
                icon={activeSectionMeta.icon}
            >
                {renderSection()}

                {showSaveFooter && (
                    <div className="mt-6 flex justify-end border-t border-gray-200 pt-5 dark:border-gray-700">
                        <button
                            onClick={handleSave}
                            disabled={saving || !dirty}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {saving ? 'Saving...' : 'Save settings'}
                        </button>
                    </div>
                )}
            </SectionPanel>
        </div>
    )
}