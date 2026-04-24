const API_BASE = '/api'

export interface FolderValidateResponse {
    valid: boolean
    path: string
    image_count: number
    total_size: number
    error: string | null
}

export interface FolderScanResponse {
    success: boolean
    folder_id: string
    path: string
    image_count: number
    message: string
}

export interface FolderStatus {
    folder_id: string | null
    path: string | null
    image_count: number
    scanned: boolean
}

export interface SessionResponse {
    id: string
    folder_path: string
    sort_mode: string
    cursor_position: number
    total_images: number
    reviewed_count: number
    created_at: string
}

export type MediaType = 'image' | 'video'

export interface NextImageResponse {
    id: string
    path: string
    filename: string
    folder: string
    size: number
    format: string
    media_type: MediaType
    width: number | null
    height: number | null
    duration: number | null
    fps: number | null
    video_codec: string | null
    audio_codec: string | null
    bitrate: number | null
    has_audio: boolean
    camera_make: string | null
    camera_model: string | null
    iso: number | null
    shutter_speed: string | null
    aperture: string | null
    exposure_program: string | null
    focal_length: string | null
    exif_date: string | null
    cursor_position: number
    total_images: number
    has_next: boolean
    has_previous: boolean
    tags: string[]
}

export interface SessionQueueResponse {
    images: NextImageResponse[]
}

export interface DecisionResponse {
    success: boolean
    image_id: string
    decision: string
    cursor_position: number
    remaining: number
    next_image: NextImageResponse | null
}

export interface UndoResponse {
    success: boolean
    undone_image_id: string | null
    undone_decision: string | null
    cursor_position: number
    restored_image?: NextImageResponse | null
}

export interface ActionsPreviewResponse {
    total_files: number
    total_size: number
    items: Array<{
        source_path: string
        destination_path: string | null
        size: number
    }>
}

export interface ActionsExecuteResponse {
    success: boolean
    processed: number
    failed: number
}

export interface ActionDeleteResponse {
    success: boolean
    processed: number
    failed: number
}

export interface BatchDeleteResponse {
    success: boolean
    processed: number
    failed: number
}

export interface BatchMoveResponse {
    success: boolean
    moved: number
    failed: number
}

export interface BlurScanResponse {
    scanned: number
    skipped: number
}

export interface BlurResult {
    id: string
    path: string
    filename: string
    folder: string
    blur_score: number
}

export interface BlurResultsResponse {
    results: BlurResult[]
}

export interface DupesScanResponse {
    scanned: number
    skipped: number
}

export interface DupeMember {
    id: string
    filename: string
    folder: string
    phash: string
    hamming_distance: number
}

export interface DupeGroup {
    group_id: number
    members: DupeMember[]
}

export interface DupesGroupsResponse {
    groups: DupeGroup[]
}

// --- New types for Browse, Settings, Tasks ---

export interface BrowseImage {
    id: string
    filename: string
    folder: string
    path: string
    format: string | null
    media_type: MediaType
    size: number | null
    width: number | null
    height: number | null
    duration: number | null
    fps: number | null
    video_codec: string | null
    audio_codec: string | null
    bitrate: number | null
    has_audio: boolean
    camera_make: string | null
    camera_model: string | null
    iso: number | null
    shutter_speed: string | null
    aperture: string | null
    exposure_program: string | null
    focal_length: string | null
    star_rating: number
    color_label: string | null
    flag: string
    created_at: string | null
    latitude: number | null
    longitude: number | null
    tags: string[]
}

export interface BrowseResponse {
    images: BrowseImage[]
    total: number
    page: number
    page_size: number
    total_pages: number
}

export interface TaskResponse {
    id: string
    name: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    progress: number
    total: number
    message: string
    created_at: string
    started_at: string | null
    finished_at: string | null
    error: string | null
}

export type SettingsMap = Record<string, string>

// --- Folder management types ---

export interface RegisteredFolder {
    id: string
    path: string
    label: string
    added_at: string
    last_scanned_at: string | null
    image_count: number
    is_favorite: boolean
    color: string | null
    sort_order: number
    is_accessible?: boolean
}

export interface FolderListResponse {
    folders: RegisteredFolder[]
}

// --- Collection types ---

export interface Collection {
    id: string
    name: string
    description: string
    is_smart: boolean
    smart_rules: Record<string, unknown> | null
    image_count: number
    created_at: string
    updated_at: string
    is_favorite: boolean
    color: string | null
}

export type ColorLabel = 'red' | 'yellow' | 'green' | 'blue' | 'purple'
export type Flag = 'pick' | 'reject' | 'unflagged'

// --- Tag types ---
export interface TagOut {
    id: number
    name: string
    usage_count: number
}

export interface ImageTagOut {
    name: string
    source: 'manual' | 'ai' | 'ai_object' | 'ai_object_wildlife' | 'exif' | 'ai_wildlife' | 'ai_food' | 'ai_scene' | 'ai_event'
    confidence: number | null
}

export interface SuggestionOut {
    name: string
    source: 'manual' | 'ai' | 'ai_object' | 'ai_object_wildlife' | 'exif' | 'ai_wildlife' | 'ai_food' | 'ai_scene' | 'ai_event'
    confidence: number
    already_applied: boolean
}

export interface AiStatusOut {
    available: boolean
    downloading: boolean
    progress: number | null
    model_size_bytes: number | null
}

export interface TagPackOut {
    id: string
    name: string
    description: string
    source: string
    tag_count: number
    default_enabled: boolean
}

export interface StatsResponse {
    total_images: number
    total_size: number
    total_reviewed: number
    total_kept: number
    total_rejected: number
    total_skipped: number
    total_favorited: number
    space_freed: number
    rated_count: number
    flagged_pick_count: number
    flagged_reject_count: number
    collections_count: number
    folders_count: number
}

export interface CopyExportResponse {
    success: boolean
    copied: number
    failed: number
}

export type CopyExportFormat = 'original' | 'jpeg' | 'png'

export interface MoveKeptResponse {
    success: boolean
    moved: number
    failed: number
    total_size: number
}

export interface MoveKeptResponse {
    success: boolean
    moved: number
    failed: number
    total_size: number
}

export interface MapImage {
    id: string
    filename: string
    latitude: number
    longitude: number
    exif_date: string | null
    media_type: MediaType
}

export interface MapResponse {
    images: MapImage[]
    total: number
}

export interface ImportResult {
    success: boolean
    tables_imported: string[]
    rows_imported: Record<string, number>
    message: string
}

export interface MissingFolder {
    id: string
    path: string
    label: string | null
    image_count: number
}

export interface MissingFilesResponse {
    missing_folders: MissingFolder[]
    missing_images_count: number
    total_images: number
}

export interface MissingImage {
    id: string
    path: string
    filename: string
    folder: string
}

export interface MissingImagesResponse {
    images: MissingImage[]
    total: number
    page: number
    page_size: number
}

export interface RemapFolderResponse {
    success: boolean
    folder_id: string
    old_path: string
    new_path: string
    images_updated: number
    message: string
}

export interface RemoveMissingResponse {
    success: boolean
    removed_folders: number
    removed_images: number
    message: string
}

export interface UpdateCheckResponse {
    update_available: boolean
    current_version: string
    latest_version: string | null
    download_url: string | null
    release_notes: string | null
    asset_size: number | null
}

export interface UpdateApplyResponse {
    success: boolean
    message: string
}

export interface ReleaseInfo {
    version: string
    tag: string
    release_notes: string | null
    published_at: string | null
    asset_size: number | null
}

async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = 30000
): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        })
        clearTimeout(id)

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return response
    } catch (error) {
        clearTimeout(id)
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request timed out. Is the backend running?')
        }
        throw error
    }
}

export const api = {
    // Health check
    async health(): Promise<{ status: string }> {
        const res = await fetchWithTimeout('/health')
        return res.json()
    },

    // Version info
    async version(): Promise<{ name: string; version: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/version`)
        return res.json()
    },

    // Validate a folder path
    async validateFolder(path: string): Promise<FolderValidateResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
        })
        return res.json()
    },

    // Scan and index a folder
    async scanFolder(path: string): Promise<FolderScanResponse> {
        const res = await fetchWithTimeout(
            `${API_BASE}/folders/scan`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path }),
            },
            120000 // 2 minute timeout for scanning large folders
        )
        return res.json()
    },

    // Get current folder status
    async getFolderStatus(): Promise<FolderStatus> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/current`)
        return res.json()
    },

    // Start or resume a session
    async startSession(folderPath: string, sortMode = 'path'): Promise<SessionResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: folderPath, sort_mode: sortMode }),
        })
        return res.json()
    },

    // Get session status
    async getSession(sessionId: string): Promise<SessionResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}`)
        return res.json()
    },

    // Get next image in session
    async getNextImage(sessionId: string): Promise<NextImageResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}/next`)
        return res.json()
    },

    async getSessionQueue(sessionId: string, limit = 4): Promise<SessionQueueResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}/queue?limit=${limit}`)
        return res.json()
    },

    // Record a decision
    async recordDecision(
        sessionId: string,
        imageId: string,
        decision: 'keep' | 'reject' | 'skip' | 'favorite'
    ): Promise<DecisionResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_id: imageId, decision }),
        })
        return res.json()
    },

    // Undo last decision
    async undoDecision(sessionId: string): Promise<UndoResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}/undo`, {
            method: 'POST',
        })
        return res.json()
    },

    // Reset session
    async resetSession(sessionId: string): Promise<{ success: boolean }> {
        const res = await fetchWithTimeout(`${API_BASE}/session/${sessionId}/reset`, {
            method: 'POST',
        })
        return res.json()
    },

    // Preview actions (rejects)
    async previewActions(folderPath?: string): Promise<ActionsPreviewResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'reject', folder_path: folderPath || null }),
        })
        return res.json()
    },

    // Execute actions (rejects)
    async executeActions(folderPath?: string): Promise<ActionsExecuteResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'reject', folder_path: folderPath || null }),
        })
        return res.json()
    },

    async deleteImage(imageId: string): Promise<ActionDeleteResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_id: imageId }),
        })
        return res.json()
    },

    async batchDeleteImages(imageIds: string[]): Promise<BatchDeleteResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/batch-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds }),
        }, 120000)
        return res.json()
    },

    async batchMoveImages(imageIds: string[], destination: string): Promise<BatchMoveResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/batch-move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, destination }),
        }, 120000)
        return res.json()
    },

    // Blur scan (async – returns task_id for polling)
    async scanBlur(folderPath?: string, force = false): Promise<{ task_id: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/quality/blur/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: folderPath || null, force }),
        })
        return res.json()
    },

    // Blur results
    async getBlurResults(folderPath?: string, threshold?: number): Promise<BlurResultsResponse> {
        const params = new URLSearchParams()
        if (folderPath) params.set('folder_path', folderPath)
        if (threshold !== undefined) params.set('threshold', String(threshold))
        const res = await fetchWithTimeout(`${API_BASE}/quality/blur/results?${params.toString()}`)
        return res.json()
    },

    async scanDupes(folderPath?: string, force = false): Promise<DupesScanResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/dupes/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: folderPath || null, force }),
        })
        return res.json()
    },

    async getDupeGroups(folderPath?: string, threshold = 8): Promise<DupesGroupsResponse> {
        const params = new URLSearchParams()
        if (folderPath) params.set('folder_path', folderPath)
        params.set('threshold', String(threshold))
        const res = await fetchWithTimeout(`${API_BASE}/dupes/groups?${params.toString()}`)
        return res.json()
    },

    // Get image preview URL
    getPreviewUrl(imageId: string): string {
        return `${API_BASE}/images/${imageId}/preview`
    },

    // Get full image URL
    getFullUrl(imageId: string): string {
        return `${API_BASE}/images/${imageId}/full`
    },

    // Get stream URL for video playback
    getStreamUrl(imageId: string): string {
        return `${API_BASE}/images/${imageId}/stream`
    },

    // Reveal image in file explorer (opens folder with file selected)
    async revealInExplorer(imageId: string): Promise<{ success: boolean; path: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/reveal`, {
            method: 'POST',
        })
        return res.json()
    },

    // --- Registered Folders ---
    async listFolders(): Promise<FolderListResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/folders`)
        return res.json()
    },

    async addFolder(path: string, label?: string): Promise<RegisteredFolder> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, label }),
        }, 120000)
        return res.json()
    },

    async getCollectionImpact(folderId: string): Promise<{ collection_image_count: number }> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}/collection-impact`)
        return res.json()
    },

    async removeFolder(folderId: string): Promise<{ deleted: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}`, {
            method: 'DELETE',
        })
        return res.json()
    },

    async rescanFolder(folderId: string): Promise<RegisteredFolder> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}/rescan`, {
            method: 'POST',
        }, 120000)
        return res.json()
    },

    async renameFolder(folderId: string, label: string): Promise<RegisteredFolder> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label }),
        })
        return res.json()
    },

    async updateFolder(folderId: string, updates: { label?: string; is_favorite?: boolean; color?: string | null }): Promise<RegisteredFolder> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        })
        return res.json()
    },

    // --- Rating / Label / Flag ---
    async setRating(imageId: string, rating: number): Promise<{ image_id: string; star_rating: number }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/rating`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating }),
        })
        return res.json()
    },

    async setLabel(imageId: string, label: string | null): Promise<{ image_id: string; color_label: string | null }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/label`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label }),
        })
        return res.json()
    },

    async setFlag(imageId: string, flag: string): Promise<{ image_id: string; flag: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/flag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flag }),
        })
        return res.json()
    },

    async batchSetRating(imageIds: string[], rating: number) {
        const res = await fetchWithTimeout(`${API_BASE}/images/batch/rating`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, rating }),
        })
        return res.json()
    },

    async batchSetLabel(imageIds: string[], label: string | null) {
        const res = await fetchWithTimeout(`${API_BASE}/images/batch/label`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, label }),
        })
        return res.json()
    },

    async batchSetFlag(imageIds: string[], flag: string) {
        const res = await fetchWithTimeout(`${API_BASE}/images/batch/flag`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, flag }),
        })
        return res.json()
    },

    // --- Collections ---
    async listCollections(): Promise<Collection[]> {
        const res = await fetchWithTimeout(`${API_BASE}/collections`)
        return res.json()
    },

    async createCollection(name: string, description = '', isSmart = false, smartRules?: Record<string, unknown>): Promise<Collection> {
        const res = await fetchWithTimeout(`${API_BASE}/collections`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, is_smart: isSmart, smart_rules: smartRules }),
        })
        return res.json()
    },

    async getCollection(collectionId: string): Promise<Collection> {
        const res = await fetchWithTimeout(`${API_BASE}/collections/${collectionId}`)
        return res.json()
    },

    async updateCollection(collectionId: string, data: { name?: string; description?: string; smart_rules?: Record<string, unknown>; is_favorite?: boolean; color?: string | null }): Promise<Collection> {
        const res = await fetchWithTimeout(`${API_BASE}/collections/${collectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })
        return res.json()
    },

    async deleteCollection(collectionId: string): Promise<{ deleted: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/collections/${collectionId}`, {
            method: 'DELETE',
        })
        return res.json()
    },

    async addToCollection(collectionId: string, imageIds: string[]): Promise<{ added: number }> {
        const res = await fetchWithTimeout(`${API_BASE}/collections/${collectionId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds }),
        })
        return res.json()
    },

    async removeFromCollection(collectionId: string, imageIds: string[]): Promise<{ removed: number }> {
        const res = await fetchWithTimeout(`${API_BASE}/collections/${collectionId}/images`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds }),
        })
        return res.json()
    },

    // --- Browse ---
    async browseImages(params: {
        folder?: string
        folder_ids?: string
        search?: string
        sort?: string
        order?: string
        page?: number
        page_size?: number
        rating_min?: number
        rating_max?: number
        color_label?: string
        flag?: string
        collection_id?: string
        tags_filter?: string
        tags_mode?: 'any' | 'all'
    } = {}): Promise<BrowseResponse> {
        const qs = new URLSearchParams()
        if (params.folder) qs.set('folder', params.folder)
        if (params.folder_ids) qs.set('folder_ids', params.folder_ids)
        if (params.search) qs.set('search', params.search)
        if (params.sort) qs.set('sort', params.sort)
        if (params.order) qs.set('order', params.order)
        if (params.page) qs.set('page', String(params.page))
        if (params.page_size) qs.set('page_size', String(params.page_size))
        if (params.rating_min !== undefined) qs.set('rating_min', String(params.rating_min))
        if (params.rating_max !== undefined) qs.set('rating_max', String(params.rating_max))
        if (params.color_label) qs.set('color_label', params.color_label)
        if (params.flag) qs.set('flag', params.flag)
        if (params.collection_id) qs.set('collection_id', params.collection_id)
        if (params.tags_filter) qs.set('tags_filter', params.tags_filter)
        if (params.tags_mode) qs.set('tags_mode', params.tags_mode)
        const res = await fetchWithTimeout(`${API_BASE}/browse?${qs.toString()}`)
        return res.json()
    },

    // --- Settings ---
    async getSettings(): Promise<SettingsMap> {
        const res = await fetchWithTimeout(`${API_BASE}/settings`)
        return res.json()
    },

    async updateSettings(settings: Record<string, unknown>): Promise<SettingsMap> {
        const res = await fetchWithTimeout(`${API_BASE}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings),
        })
        return res.json()
    },

    // --- Tasks ---
    async getTasks(): Promise<TaskResponse[]> {
        const res = await fetchWithTimeout(`${API_BASE}/tasks`)
        return res.json()
    },

    async getTask(taskId: string): Promise<TaskResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/tasks/${taskId}`)
        return res.json()
    },

    // --- Open in external editor ---
    async openInEditor(imageId: string, editor?: string): Promise<{ success: boolean; path: string; editor: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/open-editor`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ editor: editor || undefined }),
        })
        return res.json()
    },

    // --- Stats ---
    async getStats(): Promise<StatsResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/stats`)
        return res.json()
    },

    // --- Copy/export ---
    async copyImages(
        imageIds: string[],
        destination: string,
        format: CopyExportFormat = 'original'
    ): Promise<CopyExportResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, destination, format }),
        })
        return res.json()
    },

    // --- Open folder in OS file explorer ---
    async openFolderInExplorer(folderId: string): Promise<{ success: boolean; path: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/folders/${folderId}/open`, {
            method: 'POST',
        })
        return res.json()
    },

    // --- Move kept/favorite images to a destination ---
    async moveKeptImages(destination: string, folderPath?: string): Promise<MoveKeptResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/actions/move-kept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ destination, folder_path: folderPath || null }),
        }, 120000)
        return res.json()
    },

    // --- Map ---
    async getMapImages(params: { folder_ids?: string; collection_id?: string } = {}): Promise<MapResponse> {
        const qs = new URLSearchParams()
        if (params.folder_ids) qs.set('folder_ids', params.folder_ids)
        if (params.collection_id) qs.set('collection_id', params.collection_id)
        const res = await fetchWithTimeout(`${API_BASE}/map/images?${qs.toString()}`)
        return res.json()
    },

    // --- Library export/import ---
    getExportUrl(): string {
        return `${API_BASE}/library/export`
    },

    async importDatabase(file: File): Promise<ImportResult> {
        const form = new FormData()
        form.append('file', file)
        const res = await fetchWithTimeout(`${API_BASE}/library/import`, {
            method: 'POST',
            body: form,
        }, 120000)
        return res.json()
    },

    async checkMissingFiles(): Promise<MissingFilesResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/library/missing`)
        return res.json()
    },

    async getMissingImages(page = 1, pageSize = 100): Promise<MissingImagesResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/library/missing/images?page=${page}&page_size=${pageSize}`)
        return res.json()
    },

    async remapFolder(folderId: string, newPath: string): Promise<RemapFolderResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/library/remap-folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_id: folderId, new_path: newPath }),
        })
        return res.json()
    },

    async removeMissingFolder(folderId?: string): Promise<RemoveMissingResponse> {
        const qs = folderId ? `?folder_id=${folderId}` : ''
        const res = await fetchWithTimeout(`${API_BASE}/library/remove-missing${qs}`, {
            method: 'POST',
        })
        return res.json()
    },

    async removeMissingImages(): Promise<{ success: boolean; removed: number; message: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/library/remove-missing-images`, {
            method: 'POST',
        }, 120000)
        return res.json()
    },

    // --- Tags ---
    async getImageTags(imageId: string): Promise<ImageTagOut[]> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/tags`)
        return res.json()
    },

    async addImageTag(
        imageId: string,
        tag: { name: string; source?: string; confidence?: number }
    ): Promise<ImageTagOut> {
        const res = await fetchWithTimeout(`${API_BASE}/images/${imageId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: tag.name, source: tag.source || 'manual', confidence: tag.confidence }),
        })
        return res.json()
    },

    async removeImageTag(imageId: string, tagName: string): Promise<void> {
        await fetchWithTimeout(`${API_BASE}/images/${imageId}/tags/${encodeURIComponent(tagName)}`, {
            method: 'DELETE',
        })
    },

    async listTags(params: { q?: string; limit?: number } = {}): Promise<TagOut[]> {
        const qs = new URLSearchParams()
        if (params.q) qs.set('q', params.q)
        if (params.limit !== undefined) qs.set('limit', String(params.limit))
        const res = await fetchWithTimeout(`${API_BASE}/tags?${qs.toString()}`)
        return res.json()
    },

    async getTagSuggestions(imageId: string): Promise<SuggestionOut[]> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/suggestions/${imageId}`)
        return res.json()
    },

    async getAiStatus(): Promise<AiStatusOut> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/ai-status`)
        return res.json()
    },

    async triggerAiDownload(): Promise<{ status: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/ai-download`, { method: 'POST' })
        return res.json()
    },

    async deleteAiModel(): Promise<{ status: string }> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/ai-model`, { method: 'DELETE' })
        return res.json()
    },

    async listTagPacks(): Promise<TagPackOut[]> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/packs`)
        return res.json()
    },

    async batchAddTags(imageIds: string[], tags: string[]): Promise<{ updated: number; tags: string[] }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/batch/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, tags }),
        })
        return res.json()
    },

    async batchRemoveTags(imageIds: string[], tags: string[]): Promise<{ updated: number; tags: string[] }> {
        const res = await fetchWithTimeout(`${API_BASE}/images/batch/tags`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_ids: imageIds, tags }),
        })
        return res.json()
    },

    async renameTag(tagId: number, name: string): Promise<TagOut> {
        const res = await fetchWithTimeout(`${API_BASE}/tags/${tagId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        })
        return res.json()
    },

    async deleteTag(tagId: number): Promise<void> {
        await fetchWithTimeout(`${API_BASE}/tags/${tagId}`, { method: 'DELETE' })
    },

    // --- Updates ---
    async checkForUpdate(): Promise<UpdateCheckResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/update/check`, {}, 20000)
        return res.json()
    },

    async applyUpdate(): Promise<UpdateApplyResponse> {
        const res = await fetchWithTimeout(`${API_BASE}/update/apply`, {
            method: 'POST',
        }, 300000) // 5 min timeout for download + extract
        return res.json()
    },

    async getUpdateHistory(): Promise<ReleaseInfo[]> {
        const res = await fetchWithTimeout(`${API_BASE}/update/history`, {}, 20000)
        return res.json()
    },
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
