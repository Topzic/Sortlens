import { Save, Loader2, Download, Upload, AlertTriangle, RefreshCw } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type SettingsMap, type UpdateCheckResponse } from '../services/api'
import { useToast } from '../components/Toast'

const DEFAULTS: Record<string, string> = {
    deletion_mode: 'trash',
    include_sidecars: 'true',
    preview_max_size: '1920',
    prefetch_count: '3',
    undo_depth: '20',
    scan_batch_size: '100',
    theme: 'system',
    editor_command: 'default',
}

export default function SettingsPage() {
    const { toast } = useToast()
    const navigate = useNavigate()
    const [settings, setSettings] = useState<SettingsMap>(DEFAULTS)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [importing, setImporting] = useState(false)
    const [missingCount, setMissingCount] = useState<number | null>(null)
    const [updateInfo, setUpdateInfo] = useState<UpdateCheckResponse | null>(null)
    const [updateChecking, setUpdateChecking] = useState(false)
    const [updateApplying, setUpdateApplying] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const remote = await api.getSettings()
                setSettings({ ...DEFAULTS, ...remote })
            } catch {
                toast('error', 'Failed to load settings')
            } finally {
                setLoading(false)
            }
        }
        load()
        // Check missing files in background
        api.checkMissingFiles().then((res) => {
            setMissingCount(res.missing_folders.length + res.missing_images_count)
        }).catch(() => { })
        // Check for updates in background
        api.checkForUpdate().then(setUpdateInfo).catch(() => { })
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
                toast('success', 'Installer launched — Sortlens will close shortly.')
            } else {
                toast('error', result.message)
                setUpdateApplying(false)
            }
        } catch {
            toast('error', 'Update failed. Please try downloading manually from GitHub.')
            setUpdateApplying(false)
        }
    }

    const set = (key: string, value: string) => {
        setSettings((prev) => ({ ...prev, [key]: value }))
        setDirty(true)
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
                theme: settings.theme,
                editor_command: settings.editor_command || 'default',
            })
            setDirty(false)

            // Apply theme to DOM immediately
            const themeVal = settings.theme
            let resolved = themeVal
            if (themeVal === 'system') {
                resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
            }
            localStorage.setItem('sortlens-theme', resolved)
            const root = document.documentElement
            root.classList.remove('dark', 'darkplus')
            if (resolved === 'dark') root.classList.add('dark')

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

    return (
        <div className="mx-auto max-w-2xl p-4">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Configure Sortlens preferences
                </p>
            </div>

            <div className="space-y-6">
                {/* Deletion Behavior */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                        Deletion Behavior
                    </h2>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                When rejecting photos:
                            </label>
                            <select
                                value={settings.deletion_mode}
                                onChange={(e) => set('deletion_mode', e.target.value)}
                                className={`w-full ${inputCls}`}
                            >
                                <option value="trash">Move to system Trash (Recommended)</option>
                                <option value="rejected_folder">Move to "Rejected" folder</option>
                                <option value="permanent">Delete permanently</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="sidecars"
                                checked={settings.include_sidecars === 'true'}
                                onChange={(e) => set('include_sidecars', String(e.target.checked))}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            <label htmlFor="sidecars" className="text-sm text-gray-700 dark:text-gray-300">
                                Include sidecar files (.xmp, .json) when deleting
                            </label>
                        </div>
                    </div>
                </section>

                {/* Performance */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Performance</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Preview max size (px)
                            </label>
                            <input
                                type="number"
                                value={settings.preview_max_size}
                                onChange={(e) => set('preview_max_size', e.target.value)}
                                min={800}
                                max={4096}
                                className={`w-32 ${inputCls}`}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Prefetch count
                            </label>
                            <input
                                type="number"
                                value={settings.prefetch_count}
                                onChange={(e) => set('prefetch_count', e.target.value)}
                                min={0}
                                max={10}
                                className={`w-32 ${inputCls}`}
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Undo history depth
                            </label>
                            <input
                                type="number"
                                value={settings.undo_depth}
                                onChange={(e) => set('undo_depth', e.target.value)}
                                min={5}
                                max={100}
                                className={`w-32 ${inputCls}`}
                            />
                        </div>
                    </div>
                </section>

                {/* Appearance */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Appearance</h2>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Theme</label>
                        <select
                            value={settings.theme}
                            onChange={(e) => set('theme', e.target.value)}
                            className={`w-full ${inputCls}`}
                        >
                            <option value="system">System default</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </div>
                </section>

                {/* External Editor */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">External Editor</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Photo editor application
                            </label>
                            <select
                                value={['default', 'affinity', 'darktable', 'rawtherapee', 'gimp', 'photoshop'].includes(settings.editor_command) ? settings.editor_command : 'custom'}
                                onChange={(e) => {
                                    const val = e.target.value
                                    if (val === 'custom') set('editor_command', '')
                                    else set('editor_command', val)
                                }}
                                className={`w-full ${inputCls}`}
                            >
                                <option value="default">System default</option>
                                <option value="affinity">Affinity Photo</option>
                                <option value="darktable">Darktable</option>
                                <option value="rawtherapee">RawTherapee</option>
                                <option value="gimp">GIMP</option>
                                <option value="photoshop">Adobe Photoshop</option>
                                <option value="custom">Custom path…</option>
                            </select>
                        </div>
                        {!['default', 'affinity', 'darktable', 'rawtherapee', 'gimp', 'photoshop'].includes(settings.editor_command) && (
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Editor executable path
                                </label>
                                <input
                                    type="text"
                                    value={settings.editor_command}
                                    onChange={(e) => set('editor_command', e.target.value)}
                                    placeholder='e.g. C:\Program Files\Photo Editor\editor.exe'
                                    className={`w-full ${inputCls}`}
                                />
                                <p className="mt-1 text-xs text-gray-400">Full path to the editor executable</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* Library Management */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Library Management</h2>
                    <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                        Export your database to transfer to another computer, or import a previously exported database.
                    </p>
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <a
                                href={api.getExportUrl()}
                                download
                                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
                            >
                                <Download className="h-4 w-4" />
                                Export Database
                            </a>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={importing}
                                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                            >
                                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {importing ? 'Importing…' : 'Import Database'}
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
                                            // Re-check missing after import
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

                        {missingCount !== null && missingCount > 0 && (
                            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/30">
                                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                        {missingCount} missing file{missingCount > 1 ? 's' : ''} detected
                                    </p>
                                    <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                                        Some folders or images in your library can't be found. You can remap, restore, or remove them.
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate('/library')}
                                    className="flex-shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                                >
                                    Resolve
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                {/* Updates */}
                <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Updates</h2>
                    <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                        Check for new versions of Sortlens from GitHub.
                    </p>

                    <div className="space-y-4">
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

                        {updateInfo?.update_available && (
                            <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-900/30">
                                <Download className="h-5 w-5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
                                        Version {updateInfo.latest_version} is available!
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
                                    className="flex flex-shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                    {updateApplying ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Downloading...
                                        </>
                                    ) : (
                                        <>
                                            <Download className="h-4 w-4" />
                                            Download &amp; Install
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* {updateInfo && !updateInfo.update_available && updateInfo.latest_version && (
                            <p className="text-sm text-green-600 dark:text-green-400">
                                ✓ You're up to date
                            </p>
                        )} */}

                        {updateInfo?.release_notes && updateInfo.update_available && (
                            <details className="rounded-lg border border-gray-200 dark:border-gray-700">
                                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Release notes
                                </summary>
                                <div className="whitespace-pre-wrap px-4 pb-3 text-xs text-gray-500 dark:text-gray-400">
                                    {updateInfo.release_notes}
                                </div>
                            </details>
                        )}

                        <button
                            onClick={handleCheckUpdate}
                            disabled={updateChecking || updateApplying}
                            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        >
                            {updateChecking ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="h-4 w-4" />
                            )}
                            {updateChecking ? 'Checking...' : 'Check for Updates'}
                        </button>
                    </div>
                </section>

                {/* Save */}
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={saving || !dirty}
                        className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {saving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    )
}
