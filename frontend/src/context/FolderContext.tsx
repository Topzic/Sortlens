import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { api, FolderStatus, RegisteredFolder, Collection } from '../services/api'

export interface BrowseFilters {
    ratingMin?: number
    ratingMax?: number
    colorLabel?: string | null
    flag?: string | null
}

interface FolderContextType {
    // Legacy single-folder support
    folderStatus: FolderStatus | null
    isLoading: boolean
    error: string | null
    refreshStatus: () => Promise<void>
    setFolderStatus: (status: FolderStatus) => void

    // Multi-folder library
    registeredFolders: RegisteredFolder[]
    activeFolderIds: string[]
    setActiveFolderIds: (ids: string[]) => void
    refreshFolders: () => Promise<void>

    // Collections
    collections: Collection[]
    activeCollectionId: string | null
    setActiveCollectionId: (id: string | null) => void
    refreshCollections: () => Promise<void>

    // Filters
    filters: BrowseFilters
    setFilters: (f: BrowseFilters) => void
}

const FolderContext = createContext<FolderContextType | null>(null)

export function FolderProvider({ children }: { children: ReactNode }) {
    const [folderStatus, setFolderStatus] = useState<FolderStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Multi-folder
    const [registeredFolders, setRegisteredFolders] = useState<RegisteredFolder[]>([])
    const [activeFolderIds, setActiveFolderIds] = useState<string[]>([])

    // Collections
    const [collections, setCollections] = useState<Collection[]>([])
    const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)

    // Filters
    const [filters, setFilters] = useState<BrowseFilters>({})

    const refreshStatus = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const status = await api.getFolderStatus()
            setFolderStatus(status)
        } catch (err) {
            setError('Failed to connect to backend')
            console.error('Failed to get folder status:', err)
        } finally {
            setIsLoading(false)
        }
    }

    const refreshFolders = useCallback(async () => {
        try {
            const data = await api.listFolders()
            setRegisteredFolders(data.folders)
        } catch (err) {
            console.error('Failed to list folders:', err)
        }
    }, [])

    const refreshCollections = useCallback(async () => {
        try {
            const data = await api.listCollections()
            setCollections(data)
        } catch (err) {
            console.error('Failed to list collections:', err)
        }
    }, [])

    useEffect(() => {
        refreshStatus()
        refreshFolders()
        refreshCollections()
    }, [refreshFolders, refreshCollections])

    // Keep folderStatus in sync with activeFolderIds so tool pages
    // (Swipe, Blurry, Duplicates) continue to work with the selected folder.
    useEffect(() => {
        if (activeFolderIds.length === 1) {
            const folder = registeredFolders.find(f => f.id === activeFolderIds[0])
            if (folder) {
                setFolderStatus({
                    folder_id: folder.id,
                    path: folder.path,
                    image_count: folder.image_count,
                    scanned: folder.last_scanned_at !== null,
                })
            }
        } else {
            // 0 or >1 folders — tool pages need a single folder, clear so they show empty state
            setFolderStatus(null)
        }
    }, [activeFolderIds, registeredFolders])

    return (
        <FolderContext.Provider
            value={{
                folderStatus,
                isLoading,
                error,
                refreshStatus,
                setFolderStatus,
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
            }}
        >
            {children}
        </FolderContext.Provider>
    )
}

export function useFolder() {
    const context = useContext(FolderContext)
    if (!context) {
        throw new Error('useFolder must be used within a FolderProvider')
    }
    return context
}
