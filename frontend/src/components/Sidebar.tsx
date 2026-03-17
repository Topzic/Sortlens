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
    HeartPulse,
    Heart,
    GripVertical,
} from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useFolder } from '../context/FolderContext'
import { api } from '../services/api'

const toolNavigation = [
    { name: 'Dashboard', href: '/stats', icon: BarChart3 },
    { name: 'Map', href: '/map', icon: MapPin },
    { name: 'Swipe', href: '/swipe', icon: Layers },
    { name: 'Blurry', href: '/blurry', icon: Focus },
    { name: 'Duplicates', href: '/duplicates', icon: Copy },
    { name: 'Library Health', href: '/library', icon: HeartPulse },
    { name: 'Settings', href: '/settings', icon: Settings },
]

const COLLAPSED_KEY = 'sortlens-sidebar-collapsed'
const SECTION_ORDER_KEY = 'sortlens-sidebar-section-order'

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

    const handleAddFolder = useCallback(async () => {
        setAddingFolder(true)
        try {
            // Use the native folder picker via prompt (will be replaced with a proper picker)
            const path = prompt('Enter the full path to a folder containing images:')
            if (!path) return
            await api.addFolder(path)
            await refreshFolders()
        } catch (err) {
            console.error('Failed to add folder:', err)
            alert('Failed to add folder. Check the path and try again.')
        } finally {
            setAddingFolder(false)
        }
    }, [refreshFolders])

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

    const handleRescanFolder = useCallback(async (folderId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await api.rescanFolder(folderId)
            await refreshFolders()
        } catch (err) {
            console.error('Failed to rescan folder:', err)
        }
    }, [refreshFolders])

    const TOOL_PAGES = ['/swipe', '/blurry', '/duplicates']

    const handleFolderClick = useCallback((folderId: string) => {
        setActiveCollectionId(null)
        setActiveFolderIds(
            activeFolderIds.includes(folderId)
                ? activeFolderIds.filter(id => id !== folderId)
                : [...activeFolderIds, folderId]
        )
        if (!TOOL_PAGES.includes(location.pathname) && location.pathname !== '/browse') navigate('/browse')
    }, [activeFolderIds, setActiveFolderIds, setActiveCollectionId, navigate, location.pathname])

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
        try {
            await api.rescanFolder(contextMenu.id)
            await refreshFolders()
        } catch (err) {
            console.error('Failed to rescan folder:', err)
        }
        setContextMenu(null)
    }, [contextMenu, refreshFolders])

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
                <GripVertical className="h-3 w-3 mr-2 opacity-0 group-hover/header:opacity-100 cursor-grab text-gray-300 dark:text-gray-600 transition-opacity flex-shrink-0" />
            </div>
            {foldersOpen && (
                <div className="space-y-0.5 mt-1">
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
                            {registeredFolders.length > 1 && (
                                <button
                                    onClick={() => {
                                        setActiveCollectionId(null)
                                        const allSelected = registeredFolders.every(f => activeFolderIds.includes(f.id))
                                        setActiveFolderIds(allSelected ? [] : registeredFolders.map(f => f.id))
                                    }}
                                    className="flex w-full items-center px-3 py-1 text-[10px] font-medium text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                                >
                                    {registeredFolders.every(f => activeFolderIds.includes(f.id)) ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                            {registeredFolders.map((f) => (
                                <div key={f.id}
                                    onClick={() => handleFolderClick(f.id)}
                                    onContextMenu={(e) => handleFolderContextMenu(e, f.id, f.path)}
                                    className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm cursor-pointer transition-colors ${activeFolderIds.includes(f.id)
                                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}>
                                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                                    <span className="truncate flex-1" title={f.path}>{f.label || folderName(f.path)}</span>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{f.image_count}</span>
                                    <div className="hidden group-hover:flex items-center gap-0.5">
                                        <button onClick={(e) => handleRescanFolder(f.id, e)} title="Rescan"
                                            className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
                                            <RefreshCw className="h-3 w-3" />
                                        </button>
                                        <button onClick={(e) => handleRemoveFolder(f.id, e)} title="Remove"
                                            className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500">
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
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
                <GripVertical className="h-3 w-3 mr-2 opacity-0 group-hover/header:opacity-100 cursor-grab text-gray-300 dark:text-gray-600 transition-opacity flex-shrink-0" />
            </div>
            {collectionsOpen && (
                <div className="space-y-0.5 mt-1">
                    {collections.map((c) => (
                        <div key={c.id}
                            onClick={() => handleCollectionClick(c.id)}
                            onContextMenu={(e) => handleCollectionContextMenu(e, c.id, c.name)}
                            className={`group flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm cursor-pointer transition-colors ${activeCollectionId === c.id
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700'
                                }`}>
                            <Library className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate flex-1">{c.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">{c.image_count}</span>
                            <button onClick={(e) => handleDeleteCollection(c.id, e)} title="Delete collection"
                                className="hidden group-hover:block p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500">
                                <Trash2 className="h-3 w-3" />
                            </button>
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
