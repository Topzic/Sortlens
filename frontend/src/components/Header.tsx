import { useEffect, useState, useRef } from 'react'
import { FolderOpen, Moon, Sun, MonitorDot, ChevronDown, Check } from 'lucide-react'
import { useFolder } from '../context/FolderContext'
import { useHeaderActions } from './HeaderActionsContext'
import { useLocation, useNavigate } from 'react-router-dom'

type Theme = 'light' | 'dark' | 'darkplus'

export default function Header() {
    const { folderStatus, registeredFolders, activeFolderIds, setActiveFolderIds, setActiveCollectionId } = useFolder()
    const { actions } = useHeaderActions()
    const navigate = useNavigate()
    const location = useLocation()
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const [theme, setTheme] = useState<Theme>(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('sortlens-theme') as Theme | null
            if (stored === 'dark' || stored === 'darkplus' || stored === 'light') return stored
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        }
        return 'light'
    })

    useEffect(() => {
        const root = document.documentElement
        root.classList.remove('dark', 'darkplus')
        if (theme === 'dark') root.classList.add('dark')
        else if (theme === 'darkplus') root.classList.add('dark', 'darkplus')
        localStorage.setItem('sortlens-theme', theme)
    }, [theme])

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [dropdownOpen])

    const cycleTheme = () => {
        setTheme((t) => t === 'light' ? 'dark' : t === 'dark' ? 'darkplus' : 'light')
    }

    const TOOL_PAGES = ['/swipe', '/blurry', '/duplicates']

    const handleToggleFolder = (folderId: string) => {
        setActiveCollectionId(null)
        const next = activeFolderIds.includes(folderId)
            ? activeFolderIds.filter(id => id !== folderId)
            : [...activeFolderIds, folderId]
        setActiveFolderIds(next)
        if (!TOOL_PAGES.includes(location.pathname) && location.pathname !== '/browse') navigate('/browse')
    }

    // Format the header button label
    const displayPath = (() => {
        if (activeFolderIds.length === 1) {
            const f = registeredFolders.find(f => f.id === activeFolderIds[0])
            if (f) return f.path.split(/[/\\]/).pop() || f.path
        }
        if (activeFolderIds.length > 1) return `${activeFolderIds.length} folders`
        if (folderStatus?.path) return folderStatus.path.split(/[/\\]/).pop() || folderStatus.path
        return null
    })()

    return (
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 dark:border-gray-700 dark:bg-gray-800 dp-bg-header dp-border">
            <div className="flex min-w-0 flex-1 items-center gap-4">
                {/* Folder selection dropdown */}
                <div className="relative shrink-0" ref={dropdownRef}>
                    <button
                        onClick={() => setDropdownOpen(!dropdownOpen)}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                    >
                        <FolderOpen className="h-4 w-4" />
                        {displayPath || 'Select Folder'}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {dropdownOpen && registeredFolders.length > 0 && (
                        <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                            {registeredFolders.length > 1 && (
                                <button
                                    onClick={() => {
                                        setActiveCollectionId(null)
                                        const allSelected = registeredFolders.every(f => activeFolderIds.includes(f.id))
                                        setActiveFolderIds(allSelected ? [] : registeredFolders.map(f => f.id))
                                    }}
                                    className="flex w-full items-center gap-3 px-4 py-1.5 text-left text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600"
                                >
                                    {registeredFolders.every(f => activeFolderIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                            {registeredFolders.map((folder) => {
                                const folderName = folder.path.split(/[/\\]/).pop() || folder.path
                                const isActive = activeFolderIds.includes(folder.id)
                                return (
                                    <button
                                        key={folder.id}
                                        onClick={() => handleToggleFolder(folder.id)}
                                        className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-600 ${isActive
                                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                            : 'text-gray-700 dark:text-gray-200'
                                            }`}
                                    >
                                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isActive ? 'border-primary-500 bg-primary-500' : 'border-gray-300 dark:border-gray-500'}`}>
                                            {isActive && <Check className="h-3 w-3 text-white" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{folderName}</div>
                                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">{folder.path}</div>
                                        </div>
                                        <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                                            {folder.image_count}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 overflow-visible">
                    {actions}
                </div>
            </div>

            {/* Right side actions */}
            <div className="ml-4 flex items-center gap-2">
                {/* Theme toggle */}
                <button
                    onClick={cycleTheme}
                    className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label="Cycle theme"
                    title={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Dark+'}
                >
                    {theme === 'light' ? <Sun className="h-5 w-5" /> : theme === 'dark' ? <Moon className="h-5 w-5" /> : <MonitorDot className="h-5 w-5" />}
                </button>
            </div>
        </header>
    )
}
