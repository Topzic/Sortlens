import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
    Layers,
    Focus,
    Copy,
    FolderOpen,
    Settings,
    PanelLeftClose,
    PanelLeft,
    FolderPlus,
    ChevronDown,
    ChevronRight,
    Star,
    Flag,
    X,
    Plus,
    Library,
    ImageIcon,
    RefreshCw,
    Trash2,
    BarChart3,
    MapPin,
    Heart,
    GripVertical,
    ArrowUpDown,
    Search,
    WifiOff,
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useFolder } from '../context/FolderContext'
import { api, RegisteredFolder } from '../services/api'
import { useToast } from './Toast'

const toolNavigation = [
    { name: 'Dashboard', href: '/stats', icon: BarChart3 },
    { name: 'Map', href: '/map', icon: MapPin },
    { name: 'Swipe', href: '/swipe', icon: Layers },
    { name: 'Blurry', href: '/blurry', icon: Focus },
    { name: 'Duplicates', href: '/duplicates', icon: Copy },
    { name: 'Settings', href: '/settings', icon: Settings },
]

const COLLAPSED_KEY = 'sortlens-sidebar-collapsed'
const SECTION_ORDER_KEY = 'sortlens-sidebar-section-order'
const FOLDER_SORT_KEY = 'sortlens-folder-sort-mode'
const COLLECTION_SORT_KEY = 'sortlens-collection-sort-mode'

type FolderSortMode = 'name-asc' | 'name-desc' | 'count-desc' | 'count-asc' | 'date-added' | 'date-oldest'

const FOLDER_SORT_OPTIONS: { value: FolderSortMode; label: string }[] = [
    { value: 'name-asc', label: 'Name A → Z' },
    { value: 'name-desc', label: 'Name Z → A' },
    { value: 'count-desc', label: 'Most Photos' },
    { value: 'count-asc', label: 'Fewest Photos' },
    { value: 'date-added', label: 'Newest First' },
    { value: 'date-oldest', label: 'Oldest First' },
]

const FOLDER_COLORS: { key: string; hex: string; label: string }[] = [
    { key: 'red', hex: '#EF4444', label: 'Red' },
    { key: 'orange', hex: '#F97316', label: 'Orange' },
    { key: 'yellow', hex: '#EAB308', label: 'Yellow' },
    { key: 'green', hex: '#22C55E', label: 'Green' },
    { key: 'blue', hex: '#3B82F6', label: 'Blue' },
    { key: 'purple', hex: '#A855F7', label: 'Purple' },
    { key: 'gray', hex: '#6B7280', label: 'Gray' },
]

const FOLDER_COLOR_MAP: Record<string, string> = Object.fromEntries(FOLDER_COLORS.map(c => [c.key, c.hex]))

type SectionId = 'library' | 'tools' | 'folders' | 'collections'
const DEFAULT_SECTION_ORDER: SectionId[] = ['library', 'tools', 'folders', 'collections']

function loadSectionOrder(): SectionId[] {
    try {
        const stored = localStorage.getItem(SECTION_ORDER_KEY)
        if (stored) {
            const parsed = JSON.parse(stored) as string[]
            // Validate: must contain exactly the same sections
            if (parsed.length === DEFAULT_SECTION_ORDER.length && DEFAULT_SECTION_ORDER.every(s => parsed.includes(s))) {
                return parsed as SectionId[]
            }
        }
    } catch { /* ignore */ }
    return DEFAULT_SECTION_ORDER
}

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1')
    const [foldersOpen, setFoldersOpen] = useState(true)
    const [collectionsOpen, setCollectionsOpen] = useState(true)
    const [addingFolder, setAddingFolder] = useState(false)
    const [creatingCollection, setCreatingCollection] = useState(false)
    const [newCollectionName, setNewCollectionName] = useState('')
    const [sectionOrder, setSectionOrder] = useState<SectionId[]>(loadSectionOrder)
    const [draggedSection, setDraggedSection] = useState<SectionId | null>(null)
    const [dragOverSection, setDragOverSection] = useState<SectionId | null>(null)
    const [contextMenu, setContextMenu] = useState<{
        x: number; y: number;
        type: 'folder' | 'collection';
        id: string;
        path?: string;
        name?: string;
    } | null>(null)
    const contextMenuRef = useRef<HTMLDivElement>(null)
    const [appVersion, setAppVersion] = useState('...')

    // Folder sort & search state
    const [folderSortMode, setFolderSortMode] = useState<FolderSortMode>(
        () => (localStorage.getItem(FOLDER_SORT_KEY) as FolderSortMode) || 'name-asc'
    )
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [folderSearchOpen, setFolderSearchOpen] = useState(false)
    const [folderSearchQuery, setFolderSearchQuery] = useState('')
    const sortDropdownRef = useRef<HTMLDivElement>(null)
    const folderSearchRef = useRef<HTMLInputElement>(null)

    // Collection sort & search state
    const [collectionSortMode, setCollectionSortMode] = useState<FolderSortMode>(
        () => (localStorage.getItem(COLLECTION_SORT_KEY) as FolderSortMode) || 'name-asc'
    )
    const [showCollectionSortDropdown, setShowCollectionSortDropdown] = useState(false)
    const [collectionSearchOpen, setCollectionSearchOpen] = useState(false)
    const [collectionSearchQuery, setCollectionSearchQuery] = useState('')
    const collectionSortDropdownRef = useRef<HTMLDivElement>(null)
    const collectionSearchRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        api.version().then(v => setAppVersion(v.version)).catch(() => { })
    }, [])

    const {
        registeredFolders,
        activeFolderIds,
        setActiveFolderIds,
        refreshFolders,
        collections,
        activeCollectionId,
        setActiveCollectionId,
        refreshCollections,
        filters,
        setFilters,
    } = useFolder()

    const navigate = useNavigate()
    const location = useLocation()

    const toggle = () => {
        const next = !collapsed
        setCollapsed(next)
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
    }

    const { toast } = useToast()

    const handleAddFolder = useCallback(async () => {
        setAddingFolder(true)
        try {
            // Use the native folder picker via prompt (will be replaced with a proper picker)
            const path = prompt('Enter the full path to a folder containing images:')
            if (!path) return
            toast('info', 'Adding folder and scanning for images\u2026')
            const result = await api.addFolder(path)
            await refreshFolders()
            toast('success', `Added "${result.label}" \u2014 ${result.image_count} image${result.image_count !== 1 ? 's' : ''} found`)
        } catch (err) {
            console.error('Failed to add folder:', err)
            toast('error', 'Failed to add folder. Check the path and try again.')
        } finally {
            setAddingFolder(false)
        }
    }, [refreshFolders, toast])

    const handleRemoveFolder = useCallback(async (folderId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            const impact = await api.getCollectionImpact(folderId)
            const warning = impact.collection_image_count > 0
                ? `\n\n⚠️ ${impact.collection_image_count} image(s) in this folder are part of collections and will be removed from them.`
                : ''
            if (!confirm(`Remove this folder from the library? Images will be unindexed.${warning}`)) return
            await api.removeFolder(folderId)
            setActiveFolderIds(activeFolderIds.filter(id => id !== folderId))
            await refreshFolders()
            await refreshCollections()
        } catch (err) {
            console.error('Failed to remove folder:', err)
        }
    }, [activeFolderIds, refreshFolders, refreshCollections, setActiveFolderIds])

    const [rescanning, setRescanning] = useState<Set<string>>(new Set())

    const handleRescanFolder = useCallback(async (folderId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (rescanning.has(folderId)) return
        const folder = registeredFolders.find(f => f.id === folderId)
        const folderName = folder?.label || 'folder'
        setRescanning(prev => new Set(prev).add(folderId))
        toast('info', `Scanning "${folderName}"… This may take a moment.`)
        try {
            const result = await api.rescanFolder(folderId)
            await refreshFolders()
            toast('success', `Scan complete — ${result.image_count} image${result.image_count !== 1 ? 's' : ''} found in "${folderName}"`)
        } catch (err) {
            console.error('Failed to rescan folder:', err)
            toast('error', `Failed to scan "${folderName}". Please try again.`)
        } finally {
            setRescanning(prev => { const s = new Set(prev); s.delete(folderId); return s })
        }
    }, [refreshFolders, rescanning, toast, registeredFolders])

    const TOOL_PAGES = ['/swipe', '/blurry', '/duplicates']
    const lastClickedFolderRef = useRef<string | null>(null)

    const handleFolderClick = useCallback((folderId: string, e: React.MouseEvent) => {
        setActiveCollectionId(null)

        if (e.ctrlKey || e.metaKey) {
            // Ctrl+click: select range of folders between last clicked and current
            const lastId = lastClickedFolderRef.current
            if (lastId && lastId !== folderId) {
                const folderIds = registeredFolders.map(f => f.id)
                const fromIdx = folderIds.indexOf(lastId)
                const toIdx = folderIds.indexOf(folderId)
                if (fromIdx !== -1 && toIdx !== -1) {
                    const start = Math.min(fromIdx, toIdx)
                    const end = Math.max(fromIdx, toIdx)
                    const rangeIds = folderIds.slice(start, end + 1)
                    // Merge range into current selection (add all in range)
                    const merged = new Set([...activeFolderIds, ...rangeIds])
                    setActiveFolderIds(Array.from(merged))
                    lastClickedFolderRef.current = folderId
                    if (!TOOL_PAGES.includes(location.pathname) && location.pathname !== '/browse') navigate('/browse')
                    return
                }
            }
        }

        // Normal click: toggle single folder
        lastClickedFolderRef.current = folderId
        setActiveFolderIds(
            activeFolderIds.includes(folderId)
                ? activeFolderIds.filter(id => id !== folderId)
                : [...activeFolderIds, folderId]
        )
        if (!TOOL_PAGES.includes(location.pathname) && location.pathname !== '/browse') navigate('/browse')
    }, [activeFolderIds, setActiveFolderIds, setActiveCollectionId, navigate, location.pathname, registeredFolders])

    const handleAllPhotos = useCallback(() => {
        setActiveFolderIds([])
        setActiveCollectionId(null)
        setFilters({})
        if (location.pathname !== '/browse') navigate('/browse')
    }, [setActiveFolderIds, setActiveCollectionId, setFilters, navigate, location.pathname])

    const handleFilterPicks = useCallback(() => {
        setActiveCollectionId(null)
        setFilters({ flag: 'pick' })
        if (location.pathname !== '/browse') navigate('/browse')
    }, [setActiveCollectionId, setFilters, navigate, location.pathname])

    const handleFilterRated = useCallback(() => {
        setActiveCollectionId(null)
        setFilters({ ratingMin: 1 })
        if (location.pathname !== '/browse') navigate('/browse')
    }, [setActiveCollectionId, setFilters, navigate, location.pathname])

    const handleCollectionClick = useCallback((collectionId: string) => {
        setActiveFolderIds([])
        setActiveCollectionId(collectionId)
        setFilters({})
        if (location.pathname !== '/browse') navigate('/browse')
    }, [setActiveFolderIds, setActiveCollectionId, setFilters, navigate, location.pathname])

    const handleCreateCollection = useCallback(async () => {
        if (!newCollectionName.trim()) return
        try {
            await api.createCollection(newCollectionName.trim())
            setNewCollectionName('')
            setCreatingCollection(false)
            await refreshCollections()
        } catch (err) {
            console.error('Failed to create collection:', err)
        }
    }, [newCollectionName, refreshCollections])

    const handleDeleteCollection = useCallback(async (collectionId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm('Delete this collection?')) return
        try {
            await api.deleteCollection(collectionId)
            if (activeCollectionId === collectionId) setActiveCollectionId(null)
            await refreshCollections()
        } catch (err) {
            console.error('Failed to delete collection:', err)
        }
    }, [activeCollectionId, setActiveCollectionId, refreshCollections])

    const handleFolderContextMenu = useCallback((e: React.MouseEvent, folderId: string, folderPath: string) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'folder', id: folderId, path: folderPath })
    }, [])

    const handleCollectionContextMenu = useCallback((e: React.MouseEvent, collectionId: string, collectionName: string) => {
        e.preventDefault()
        e.stopPropagation()
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'collection', id: collectionId, name: collectionName })
    }, [])

    const handleOpenInExplorer = useCallback(async () => {
        if (!contextMenu) return
        try {
            await api.openFolderInExplorer(contextMenu.id)
        } catch (err) {
            console.error('Failed to open in explorer:', err)
        }
        setContextMenu(null)
    }, [contextMenu])

    const handleContextRescan = useCallback(async () => {
        if (!contextMenu) return
        const folderId = contextMenu.id
        const folder = registeredFolders.find(f => f.id === folderId)
        const folderName = folder?.label || 'folder'
        if (folder?.is_accessible === false) {
            toast('warning', `"${folderName}" is offline. Reconnect the device to rescan.`)
            setContextMenu(null)
            return
        }
        setContextMenu(null)
        if (rescanning.has(folderId)) return
        setRescanning(prev => new Set(prev).add(folderId))
        toast('info', `Scanning "${folderName}"… This may take a moment.`)
        try {
            const result = await api.rescanFolder(folderId)
            await refreshFolders()
            toast('success', `Scan complete — ${result.image_count} image${result.image_count !== 1 ? 's' : ''} found in "${folderName}"`)
        } catch (err) {
            console.error('Failed to rescan folder:', err)
            toast('error', `Failed to scan "${folderName}". Please try again.`)
        } finally {
            setRescanning(prev => { const s = new Set(prev); s.delete(folderId); return s })
        }
    }, [contextMenu, refreshFolders, rescanning, toast, registeredFolders])

    const handleContextRemove = useCallback(async () => {
        if (!contextMenu) return
        try {
            const impact = await api.getCollectionImpact(contextMenu.id)
            const warning = impact.collection_image_count > 0
                ? `\n\n⚠️ ${impact.collection_image_count} image(s) in this folder are part of collections and will be removed from them.`
                : ''
            if (!confirm(`Remove this folder from the library? Images will be unindexed.${warning}`)) {
                setContextMenu(null)
                return
            }
            await api.removeFolder(contextMenu.id)
            setActiveFolderIds(activeFolderIds.filter(id => id !== contextMenu.id))
            await refreshFolders()
            await refreshCollections()
        } catch (err) {
            console.error('Failed to remove folder:', err)
        }
        setContextMenu(null)
    }, [contextMenu, activeFolderIds, refreshFolders, refreshCollections, setActiveFolderIds])

    const handleContextDeleteCollection = useCallback(async () => {
        if (!contextMenu) return
        if (!confirm('Delete this collection?')) {
            setContextMenu(null)
            return
        }
        try {
            await api.deleteCollection(contextMenu.id)
            if (activeCollectionId === contextMenu.id) setActiveCollectionId(null)
            await refreshCollections()
        } catch (err) {
            console.error('Failed to delete collection:', err)
        }
        setContextMenu(null)
    }, [contextMenu, activeCollectionId, setActiveCollectionId, refreshCollections])

    // Drag-to-reorder handlers
    const handleDragStart = useCallback((sectionId: SectionId) => {
        setDraggedSection(sectionId)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, sectionId: SectionId) => {
        e.preventDefault()
        if (draggedSection && draggedSection !== sectionId) {
            setDragOverSection(sectionId)
        }
    }, [draggedSection])

    const handleDrop = useCallback((e: React.DragEvent, targetId: SectionId) => {
        e.preventDefault()
        if (!draggedSection || draggedSection === targetId) return
        setSectionOrder(prev => {
            const newOrder = [...prev]
            const fromIdx = newOrder.indexOf(draggedSection)
            const toIdx = newOrder.indexOf(targetId)
            newOrder.splice(fromIdx, 1)
            newOrder.splice(toIdx, 0, draggedSection)
            localStorage.setItem(SECTION_ORDER_KEY, JSON.stringify(newOrder))
            return newOrder
        })
        setDraggedSection(null)
        setDragOverSection(null)
    }, [draggedSection])

    const handleDragEnd = useCallback(() => {
        setDraggedSection(null)
        setDragOverSection(null)
    }, [])

    // Close context menu on click outside
    useEffect(() => {
        if (!contextMenu) return
        const handleClick = () => setContextMenu(null)
        window.addEventListener('click', handleClick)
        return () => window.removeEventListener('click', handleClick)
    }, [contextMenu])

    const folderName = (path: string) => {
        const parts = path.replace(/\\/g, '/').split('/')
        return parts[parts.length - 1] || path
    }

    // Sort & filter folders
    const sortedFolders = useMemo(() => {
        let list = [...registeredFolders]

        // Filter by search query
        if (folderSearchQuery.trim()) {
            const q = folderSearchQuery.toLowerCase()
            list = list.filter(f => {
                const name = (f.label || folderName(f.path)).toLowerCase()
                return name.includes(q)
            })
        }

        // Sort (favorites always first as a layer on top)
        const getName = (f: RegisteredFolder) => (f.label || folderName(f.path)).toLowerCase()

        list.sort((a, b) => {
            // Favorites pin to top
            if (a.is_favorite && !b.is_favorite) return -1
            if (!a.is_favorite && b.is_favorite) return 1

            switch (folderSortMode) {
                case 'name-asc':
                    return getName(a).localeCompare(getName(b))
                case 'name-desc':
                    return getName(b).localeCompare(getName(a))
                case 'count-desc':
                    return b.image_count - a.image_count
                case 'count-asc':
                    return a.image_count - b.image_count
                case 'date-added':
                    return (b.added_at || '').localeCompare(a.added_at || '')
                case 'date-oldest':
                    return (a.added_at || '').localeCompare(b.added_at || '')
                default:
                    return 0
            }
        })

        return list
    }, [registeredFolders, folderSortMode, folderSearchQuery])

    const handleSortChange = useCallback((mode: FolderSortMode) => {
        setFolderSortMode(mode)
        localStorage.setItem(FOLDER_SORT_KEY, mode)
        setShowSortDropdown(false)
    }, [])

    const handleToggleFavorite = useCallback(async (folderId: string, currentFav: boolean, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await api.updateFolder(folderId, { is_favorite: !currentFav })
            await refreshFolders()
        } catch (err) {
            console.error('Failed to toggle favorite:', err)
        }
    }, [refreshFolders])

    const handleSetColor = useCallback(async (folderId: string, color: string | null) => {
        try {
            await api.updateFolder(folderId, { color: color || 'none' })
            await refreshFolders()
        } catch (err) {
            console.error('Failed to set folder color:', err)
        }
        setContextMenu(null)
    }, [refreshFolders])

    // Sort & filter collections
    const sortedCollections = useMemo(() => {
        let list = [...collections]

        if (collectionSearchQuery.trim()) {
            const q = collectionSearchQuery.toLowerCase()
            list = list.filter(c => c.name.toLowerCase().includes(q))
        }

        list.sort((a, b) => {
            if (a.is_favorite && !b.is_favorite) return -1
            if (!a.is_favorite && b.is_favorite) return 1

            switch (collectionSortMode) {
                case 'name-asc':
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase())
                case 'name-desc':
                    return b.name.toLowerCase().localeCompare(a.name.toLowerCase())
                case 'count-desc':
                    return b.image_count - a.image_count
                case 'count-asc':
                    return a.image_count - b.image_count
                case 'date-added':
                    return (b.created_at || '').localeCompare(a.created_at || '')
                case 'date-oldest':
                    return (a.created_at || '').localeCompare(b.created_at || '')
                default:
                    return 0
            }
        })

        return list
    }, [collections, collectionSortMode, collectionSearchQuery])

    const handleCollectionSortChange = useCallback((mode: FolderSortMode) => {
        setCollectionSortMode(mode)
        localStorage.setItem(COLLECTION_SORT_KEY, mode)
        setShowCollectionSortDropdown(false)
    }, [])

    const handleCollectionToggleFavorite = useCallback(async (collectionId: string, currentFav: boolean, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await api.updateCollection(collectionId, { is_favorite: !currentFav })
            await refreshCollections()
        } catch (err) {
            console.error('Failed to toggle collection favorite:', err)
        }
    }, [refreshCollections])

    const handleCollectionSetColor = useCallback(async (collectionId: string, color: string | null) => {
        try {
            await api.updateCollection(collectionId, { color: color || 'none' })
            await refreshCollections()
        } catch (err) {
            console.error('Failed to set collection color:', err)
        }
        setContextMenu(null)
    }, [refreshCollections])

    // Close sort dropdown on outside click
    useEffect(() => {
        if (!showSortDropdown) return
        const handleClick = (e: MouseEvent) => {
            if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
                setShowSortDropdown(false)
            }
        }
        window.addEventListener('mousedown', handleClick)
        return () => window.removeEventListener('mousedown', handleClick)
    }, [showSortDropdown])

    // Auto-focus search input when opened
    useEffect(() => {
        if (folderSearchOpen && folderSearchRef.current) {
            folderSearchRef.current.focus()
        }
    }, [folderSearchOpen])

    // Close collection sort dropdown on outside click
    useEffect(() => {
        if (!showCollectionSortDropdown) return
        const handleClick = (e: MouseEvent) => {
            if (collectionSortDropdownRef.current && !collectionSortDropdownRef.current.contains(e.target as Node)) {
                setShowCollectionSortDropdown(false)
            }
        }
        window.addEventListener('mousedown', handleClick)
        return () => window.removeEventListener('mousedown', handleClick)
    }, [showCollectionSortDropdown])

    // Auto-focus collection search input when opened
    useEffect(() => {
        if (collectionSearchOpen && collectionSearchRef.current) {
            collectionSearchRef.current.focus()
        }
    }, [collectionSearchOpen])

    if (collapsed) {
        return (
            <div className="flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 w-16 dp-bg-sidebar dp-border">
                <div className="flex h-16 items-center justify-center border-b border-gray-200 dark:border-gray-700">
                    <img src="/sortlens.png" alt="Sortlens" className="h-8 w-8" />
                </div>
                <nav className="flex-1 space-y-1 p-2">
                    <button onClick={handleAllPhotos} title="All Photos"
                        className="flex items-center justify-center rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 w-full">
                        <ImageIcon className="h-5 w-5" />
                    </button>
                    {toolNavigation.map((item) => (
                        <NavLink key={item.name} to={item.href} title={item.name}
                            className={({ isActive }) =>
                                `flex items-center justify-center rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive
                                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                }`
                            }>
                            <item.icon className="h-5 w-5" />
                        </NavLink>
                    ))}
                </nav>
                <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                    <a href="https://www.paypal.com/donate/?hosted_button_id=A9Z63NG8496L8" target="_blank" rel="noopener noreferrer" title="Support the developer"
                        className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 transition-colors">
                        <Heart className="h-4 w-4" />
                    </a>
                    <button onClick={toggle} title="Expand sidebar"
                        className="flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700">
                        <PanelLeft className="h-4 w-4" />
                    </button>
                </div>
            </div>
        )
    }

    // Section renderers
    const renderLibrarySection = () => (
        <>
            <button onClick={handleAllPhotos}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full ${location.pathname === '/browse' && activeFolderIds.length === 0 && !activeCollectionId && !filters.flag && !filters.ratingMin
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}>
                <ImageIcon className="h-5 w-5 flex-shrink-0" />
                All Photos
            </button>
            <button onClick={handleFilterPicks}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full ${filters.flag === 'pick'
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}>
                <Flag className="h-5 w-5 flex-shrink-0" />
                Picks
            </button>
            <button onClick={handleFilterRated}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full ${filters.ratingMin && filters.ratingMin >= 1 && !filters.flag
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}>
                <Star className="h-5 w-5 flex-shrink-0" />
                Rated
            </button>
        </>
    )

    const renderToolsSection = () => (
        <nav className="space-y-0.5">
            {toolNavigation.map((item) => (
                <NavLink key={item.name} to={item.href} title={item.name}
                    className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                        }`
                    }>
                    <item.icon className="h-5 w-5 flex-shrink-0" />
                    {item.name}
                </NavLink>
            ))}
        </nav>
    )

    const renderFoldersSection = () => (
        <>
            <div className="group/header flex items-center">
                <button onClick={() => setFoldersOpen(!foldersOpen)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-1 hover:text-gray-600 dark:hover:text-gray-300"
                    style={{ pointerEvents: 'auto' }}>
                    {foldersOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span className="flex-1 text-left">Folders</span>
                </button>
                <div className="flex items-center gap-0.5 mr-1">
                    {registeredFolders.length > 1 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setActiveCollectionId(null)
                                const allSelected = registeredFolders.every(f => activeFolderIds.includes(f.id))
                                setActiveFolderIds(allSelected ? [] : registeredFolders.map(f => f.id))
                            }}
                            title={registeredFolders.every(f => activeFolderIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                            className="px-1 py-0.5 rounded text-[10px] font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:text-gray-500 dark:hover:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            {registeredFolders.every(f => activeFolderIds.includes(f.id)) ? 'Deselect' : 'Select All'}
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); setFolderSearchOpen(!folderSearchOpen); if (folderSearchOpen) setFolderSearchQuery('') }}
                        title="Search folders"
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 transition-colors"
                    >
                        <Search className="h-3 w-3" />
                    </button>
                    <div className="relative" ref={sortDropdownRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowSortDropdown(!showSortDropdown) }}
                            title="Sort folders"
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 transition-colors"
                        >
                            <ArrowUpDown className="h-3 w-3" />
                        </button>
                        {showSortDropdown && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                {FOLDER_SORT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => handleSortChange(opt.value)}
                                        className={`flex w-full items-center px-3 py-1.5 text-xs transition-colors ${folderSortMode === opt.value
                                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 font-medium'
                                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <GripVertical className="h-3 w-3 cursor-grab text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </div>
            </div>
            {foldersOpen && (
                <div className="space-y-0.5 mt-1">
                    {folderSearchOpen && (
                        <div className="px-3 pb-1">
                            <input
                                ref={folderSearchRef}
                                value={folderSearchQuery}
                                onChange={(e) => setFolderSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setFolderSearchOpen(false); setFolderSearchQuery('') } }}
                                placeholder="Filter folders..."
                                className="w-full text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                        </div>
                    )}
                    {registeredFolders.length === 0 ? (
                        <div className="mx-3 my-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-3 text-center">
                            <FolderPlus className="h-5 w-5 mx-auto mb-1 text-gray-400 dark:text-gray-500" />
                            <p className="text-xs text-gray-500 dark:text-gray-400">No folders yet</p>
                            <button onClick={handleAddFolder} disabled={addingFolder}
                                className="mt-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300">
                                {addingFolder ? 'Adding...' : 'Add a folder to get started'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {sortedFolders.map((f) => (
                                <div key={f.id}
                                    onClick={(e) => handleFolderClick(f.id, e)}
                                    onContextMenu={(e) => handleFolderContextMenu(e, f.id, f.path)}
                                    className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm cursor-pointer transition-colors ${activeFolderIds.includes(f.id)
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                        : f.is_accessible === false
                                            ? 'text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-gray-700'
                                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}>
                                    {f.is_accessible === false
                                        ? <WifiOff className="h-4 w-4 flex-shrink-0 text-amber-500/70" />
                                        : <FolderOpen className="h-4 w-4 flex-shrink-0" style={f.color && FOLDER_COLOR_MAP[f.color] ? { color: FOLDER_COLOR_MAP[f.color] } : undefined} />
                                    }
                                    <span
                                        className="truncate flex-1"
                                        title={f.is_accessible === false ? `${f.path}\nDevice not connected — images saved in library` : f.path}
                                    >
                                        {f.label || folderName(f.path)}
                                    </span>
                                    {f.is_accessible === false && (
                                        <span className="text-[9px] font-medium text-amber-500/80 flex-shrink-0">offline</span>
                                    )}
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{f.image_count}</span>
                                    {rescanning.has(f.id) ? (
                                        <RefreshCw className="h-3 w-3 animate-spin text-primary-500 flex-shrink-0" />
                                    ) : (
                                        <div className="hidden group-hover:flex items-center gap-0.5">
                                            <button
                                                onClick={(e) => handleToggleFavorite(f.id, f.is_favorite, e)}
                                                title={f.is_favorite ? 'Unfavorite' : 'Favorite'}
                                                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                            >
                                                <Star className={`h-3 w-3 ${f.is_favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                                            </button>
                                            {f.is_accessible === false ? (
                                                <span title="Reconnect the device to rescan">
                                                    <RefreshCw className="h-3 w-3 opacity-30 cursor-not-allowed" />
                                                </span>
                                            ) : (
                                                <button onClick={(e) => handleRescanFolder(f.id, e)} title="Rescan"
                                                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                                    <RefreshCw className="h-3 w-3" />
                                                </button>
                                            )}
                                            <button onClick={(e) => handleRemoveFolder(f.id, e)} title="Remove"
                                                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500">
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        </div>
                                    )}
                                    {f.is_favorite && (
                                        <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0 group-hover:hidden" />
                                    )}
                                </div>
                            ))}
                            <button onClick={handleAddFolder} disabled={addingFolder}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 w-full">
                                <FolderPlus className="h-4 w-4" />
                                {addingFolder ? 'Adding...' : 'Add Folder'}
                            </button>
                        </>
                    )}
                </div>
            )}
        </>
    )

    const renderCollectionsSection = () => (
        <>
            <div className="group/header flex items-center">
                <button onClick={() => setCollectionsOpen(!collectionsOpen)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-1 hover:text-gray-600 dark:hover:text-gray-300"
                    style={{ pointerEvents: 'auto' }}>
                    {collectionsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span className="flex-1 text-left">Collections</span>
                </button>
                <div className="flex items-center gap-0.5 mr-1">
                    <button
                        onClick={(e) => { e.stopPropagation(); setCollectionSearchOpen(!collectionSearchOpen); if (collectionSearchOpen) setCollectionSearchQuery('') }}
                        title="Search collections"
                        className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 transition-colors"
                    >
                        <Search className="h-3 w-3" />
                    </button>
                    <div className="relative" ref={collectionSortDropdownRef}>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowCollectionSortDropdown(!showCollectionSortDropdown) }}
                            title="Sort collections"
                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 transition-colors"
                        >
                            <ArrowUpDown className="h-3 w-3" />
                        </button>
                        {showCollectionSortDropdown && (
                            <div className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                {FOLDER_SORT_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => handleCollectionSortChange(opt.value)}
                                        className={`flex w-full items-center px-3 py-1.5 text-xs transition-colors ${collectionSortMode === opt.value
                                            ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300 font-medium'
                                            : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <GripVertical className="h-3 w-3 cursor-grab text-gray-300 dark:text-gray-600 flex-shrink-0" />
                </div>
            </div>
            {collectionsOpen && (
                <div className="space-y-0.5 mt-1">
                    {collectionSearchOpen && (
                        <div className="px-3 pb-1">
                            <input
                                ref={collectionSearchRef}
                                value={collectionSearchQuery}
                                onChange={(e) => setCollectionSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setCollectionSearchOpen(false); setCollectionSearchQuery('') } }}
                                placeholder="Filter collections..."
                                className="w-full text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                        </div>
                    )}
                    {sortedCollections.map((c) => (
                        <div key={c.id}
                            onClick={() => handleCollectionClick(c.id)}
                            onContextMenu={(e) => handleCollectionContextMenu(e, c.id, c.name)}
                            className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm cursor-pointer transition-colors ${activeCollectionId === c.id
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}>
                            <Library className="h-4 w-4 flex-shrink-0" style={c.color && FOLDER_COLOR_MAP[c.color] ? { color: FOLDER_COLOR_MAP[c.color] } : undefined} />
                            <span className="truncate flex-1">{c.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{c.image_count}</span>
                            <div className="hidden group-hover:flex items-center gap-0.5">
                                <button
                                    onClick={(e) => handleCollectionToggleFavorite(c.id, c.is_favorite, e)}
                                    title={c.is_favorite ? 'Unfavorite' : 'Favorite'}
                                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    <Star className={`h-3 w-3 ${c.is_favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                                </button>
                                <button onClick={(e) => handleDeleteCollection(c.id, e)} title="Delete collection"
                                    className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500">
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </div>
                            {c.is_favorite && (
                                <Star className="h-3 w-3 text-amber-400 fill-amber-400 flex-shrink-0 group-hover:hidden" />
                            )}
                        </div>
                    ))}
                    {creatingCollection ? (
                        <div className="flex items-center gap-1 px-3 py-1">
                            <input autoFocus value={newCollectionName}
                                onChange={(e) => setNewCollectionName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCollection(); if (e.key === 'Escape') setCreatingCollection(false) }}
                                placeholder="Collection name"
                                className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-transparent dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500" />
                            <button onClick={handleCreateCollection} className="p-1 text-primary-600 hover:bg-primary-50 rounded dark:hover:bg-primary-900/50">
                                <Plus className="h-4 w-4" />
                            </button>
                            <button onClick={() => setCreatingCollection(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded dark:hover:bg-gray-700">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => setCreatingCollection(true)}
                            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 w-full">
                            <Plus className="h-4 w-4" />
                            New Collection
                        </button>
                    )}
                </div>
            )}
        </>
    )

    const sectionRenderers: Record<SectionId, { label: string; render: () => React.ReactNode }> = {
        library: { label: 'Library', render: renderLibrarySection },
        tools: { label: 'Tools', render: renderToolsSection },
        folders: { label: 'Folders', render: renderFoldersSection },
        collections: { label: 'Collections', render: renderCollectionsSection },
    }

    // Sections that have their own toggle headers with built-in grip icons
    const sectionsWithOwnHeader = new Set<SectionId>(['folders', 'collections'])

    return (
        <div className="flex flex-col bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 w-64 dp-bg-sidebar dp-border">
            {/* Logo */}
            <div className="flex h-16 items-center gap-2 px-4 border-b border-gray-200 dark:border-gray-700">
                <img src="/sortlens.png" alt="Sortlens" className="h-8 w-8 flex-shrink-0" />
                <span className="text-xl font-bold text-gray-900 dark:text-white">Sortlens</span>
            </div>

            <div className="flex-1 overflow-y-auto">
                {sectionOrder.map((sectionId) => {
                    const section = sectionRenderers[sectionId]
                    const isDragging = draggedSection === sectionId
                    const isDragOver = dragOverSection === sectionId

                    return (
                        <div
                            key={sectionId}
                            draggable
                            onDragStart={() => handleDragStart(sectionId)}
                            onDragOver={(e) => handleDragOver(e, sectionId)}
                            onDrop={(e) => handleDrop(e, sectionId)}
                            onDragEnd={handleDragEnd}
                            className={`p-2 transition-all ${isDragging ? 'opacity-40' : ''} ${isDragOver ? 'border-t-2 border-primary-400' : ''}`}
                        >
                            {!sectionsWithOwnHeader.has(sectionId) && (
                                <div className="group/header flex items-center px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                    <span className="flex-1">{section.label}</span>
                                    <GripVertical className="h-3 w-3 opacity-0 group-hover/header:opacity-100 cursor-grab text-gray-300 dark:text-gray-600 transition-opacity" />
                                </div>
                            )}
                            {section.render()}
                        </div>
                    )
                })}
            </div>

            {/* Collapse toggle + footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                <button onClick={toggle}
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    title="Collapse sidebar">
                    <PanelLeftClose className="h-4 w-4" />
                    <span>Collapse</span>
                </button>
                <a href="https://www.paypal.com/donate/?hosted_button_id=A9Z63NG8496L8" target="_blank" rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/30 transition-colors">
                    <Heart className="h-4 w-4" />
                    <span>Support the Developer</span>
                </a>
                <div className="mt-1 px-3 text-[10px] text-gray-400 dark:text-gray-500 text-center">v{appVersion} by Ian Cunningham</div>
            </div>

            {/* Context menu */}
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="fixed z-[9999] min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-800"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.type === 'folder' && (
                        <>
                            {/* Favorite toggle */}
                            <button
                                onClick={() => {
                                    const folder = registeredFolders.find(f => f.id === contextMenu.id)
                                    if (folder) handleToggleFavorite(folder.id, folder.is_favorite, { stopPropagation: () => { } } as React.MouseEvent)
                                    setContextMenu(null)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <Star className={`h-4 w-4 ${registeredFolders.find(f => f.id === contextMenu.id)?.is_favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                                {registeredFolders.find(f => f.id === contextMenu.id)?.is_favorite ? 'Unfavorite' : 'Favorite'}
                            </button>
                            {/* Color picker */}
                            <div className="px-3 py-2">
                                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wider">Folder Color</div>
                                <div className="flex items-center gap-1.5">
                                    {FOLDER_COLORS.map((c) => (
                                        <button
                                            key={c.key}
                                            onClick={() => handleSetColor(contextMenu.id, c.key)}
                                            title={c.label}
                                            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                                            style={{
                                                backgroundColor: c.hex,
                                                borderColor: registeredFolders.find(f => f.id === contextMenu.id)?.color === c.key ? 'white' : 'transparent',
                                            }}
                                        />
                                    ))}
                                    <button
                                        onClick={() => handleSetColor(contextMenu.id, null)}
                                        title="Clear color"
                                        className="h-5 w-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-transform hover:scale-110"
                                    >
                                        <X className="h-3 w-3 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            <button
                                onClick={handleOpenInExplorer}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <FolderOpen className="h-4 w-4" />
                                Open in File Explorer
                            </button>
                            <button
                                onClick={handleContextRescan}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Rescan Folder
                            </button>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            <button
                                onClick={handleContextRemove}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                                <Trash2 className="h-4 w-4" />
                                Remove Folder
                            </button>
                        </>
                    )}
                    {contextMenu.type === 'collection' && (
                        <>
                            {/* Favorite toggle */}
                            <button
                                onClick={() => {
                                    const coll = collections.find(c => c.id === contextMenu.id)
                                    if (coll) handleCollectionToggleFavorite(coll.id, coll.is_favorite, { stopPropagation: () => { } } as React.MouseEvent)
                                    setContextMenu(null)
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                            >
                                <Star className={`h-4 w-4 ${collections.find(c => c.id === contextMenu.id)?.is_favorite ? 'text-amber-400 fill-amber-400' : ''}`} />
                                {collections.find(c => c.id === contextMenu.id)?.is_favorite ? 'Unfavorite' : 'Favorite'}
                            </button>
                            {/* Color picker */}
                            <div className="px-3 py-2">
                                <div className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1.5 uppercase tracking-wider">Collection Color</div>
                                <div className="flex items-center gap-1.5">
                                    {FOLDER_COLORS.map((c) => (
                                        <button
                                            key={c.key}
                                            onClick={() => handleCollectionSetColor(contextMenu.id, c.key)}
                                            title={c.label}
                                            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
                                            style={{
                                                backgroundColor: c.hex,
                                                borderColor: collections.find(col => col.id === contextMenu.id)?.color === c.key ? 'white' : 'transparent',
                                            }}
                                        />
                                    ))}
                                    <button
                                        onClick={() => handleCollectionSetColor(contextMenu.id, null)}
                                        title="Clear color"
                                        className="h-5 w-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-transform hover:scale-110"
                                    >
                                        <X className="h-3 w-3 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
                            <button
                                onClick={handleContextDeleteCollection}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete Collection
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
