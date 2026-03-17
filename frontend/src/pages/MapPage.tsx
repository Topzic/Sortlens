import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api, MapImage } from '../services/api'
import { useFolder } from '../context/FolderContext'
import { MapPin, X, ChevronLeft, ChevronRight } from 'lucide-react'

// ── Clustering logic (pixel-space) ────────────────────────────────────────────
interface Cluster {
    lat: number
    lng: number
    images: MapImage[]
}

/** Cluster radius in screen pixels – icons won't overlap within this distance */
const CLUSTER_PX = 75

function clusterImagesOnMap(images: MapImage[], map: L.Map): Cluster[] {
    const clusters: Cluster[] = []
    const used = new Set<number>()

    // Project all points to pixel coordinates once
    const points = images.map(img => map.latLngToContainerPoint([img.latitude, img.longitude]))

    for (let i = 0; i < images.length; i++) {
        if (used.has(i)) continue
        const group: MapImage[] = [images[i]]
        used.add(i)
        let sumLat = images[i].latitude
        let sumLng = images[i].longitude

        for (let j = i + 1; j < images.length; j++) {
            if (used.has(j)) continue
            const dx = points[i].x - points[j].x
            const dy = points[i].y - points[j].y
            if (Math.sqrt(dx * dx + dy * dy) < CLUSTER_PX) {
                group.push(images[j])
                sumLat += images[j].latitude
                sumLng += images[j].longitude
                used.add(j)
            }
        }

        clusters.push({
            lat: sumLat / group.length,
            lng: sumLng / group.length,
            images: group,
        })
    }
    return clusters
}

// ── Thumbnail cluster icon ────────────────────────────────────────────────────
function createClusterIcon(cluster: Cluster): L.DivIcon {
    const img = cluster.images[0]
    const count = cluster.images.length
    const previewUrl = `/api/images/${img.id}/preview`

    const size = count > 1 ? 68 : 60

    const html = `
        <div style="
            width: ${size}px; height: ${size}px;
            border-radius: 12px;
            overflow: hidden;
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.4);
            position: relative;
            cursor: pointer;
            background: #1a1a2e;
        ">
            <img src="${previewUrl}" style="
                width: 100%; height: 100%;
                object-fit: cover;
                display: block;
            " loading="lazy" />
            ${count > 1 ? `
                <div style="
                    position: absolute; top: 4px; left: 4px;
                    background: rgba(0,0,0,0.7);
                    color: white;
                    font-size: 11px; font-weight: 700;
                    padding: 1px 6px;
                    border-radius: 10px;
                    line-height: 1.4;
                    backdrop-filter: blur(4px);
                ">${count}</div>
            ` : ''}
        </div>
    `

    return L.divIcon({
        html,
        className: 'map-cluster-icon',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    })
}

// ── Map event watcher (re-cluster on zoom/pan) ───────────────────────────────
function MapEvents({ onViewChange }: { onViewChange: () => void }) {
    useMapEvents({
        zoomend: () => onViewChange(),
        moveend: () => onViewChange(),
    })
    return null
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────
function FitBounds({ images }: { images: MapImage[] }) {
    const map = useMap()
    const fitted = useRef(false)

    useEffect(() => {
        if (images.length === 0 || fitted.current) return
        const bounds = L.latLngBounds(images.map(i => [i.latitude, i.longitude]))
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 })
        fitted.current = true
    }, [images, map])

    return null
}

// ── Lightbox popup ────────────────────────────────────────────────────────────
function ImageLightbox({
    images,
    initialIndex,
    onClose,
}: {
    images: MapImage[]
    initialIndex: number
    onClose: () => void
}) {
    const [index, setIndex] = useState(initialIndex)
    const img = images[index]

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowRight' && index < images.length - 1) setIndex(i => i + 1)
            if (e.key === 'ArrowLeft' && index > 0) setIndex(i => i - 1)
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [index, images.length, onClose])

    return (
        <div className="fixed inset-0 z-[10000] bg-black/90 flex items-center justify-center"
            onClick={onClose}>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <img
                    src={`/api/images/${img.id}/preview`}
                    alt={img.filename}
                    className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
                />
                {/* Info bar */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
                    <p className="text-white text-sm font-medium truncate">{img.filename}</p>
                    <p className="text-white/60 text-xs">
                        {img.exif_date || 'No date'} &middot; {img.latitude.toFixed(4)}, {img.longitude.toFixed(4)}
                    </p>
                </div>

                {/* Close */}
                <button onClick={onClose}
                    className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur">
                    <X className="w-5 h-5" />
                </button>

                {/* Navigation arrows */}
                {index > 0 && (
                    <button onClick={() => setIndex(i => i - 1)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur">
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}
                {index < images.length - 1 && (
                    <button onClick={() => setIndex(i => i + 1)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur">
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}

                {/* Counter */}
                {images.length > 1 && (
                    <div className="absolute top-3 left-3 bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur">
                        {index + 1} / {images.length}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Cluster popup (grid of thumbnails) ────────────────────────────────────────
function ClusterPopup({
    cluster,
    onClose,
    onImageClick,
}: {
    cluster: Cluster
    onClose: () => void
    onImageClick: (images: MapImage[], index: number) => void
}) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[70vh] overflow-hidden"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                            {cluster.images.length} Photo{cluster.images.length !== 1 ? 's' : ''}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {cluster.lat.toFixed(4)}, {cluster.lng.toFixed(4)}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="p-3 overflow-y-auto max-h-[55vh]">
                    <div className="grid grid-cols-3 gap-1.5">
                        {cluster.images.map((img, idx) => (
                            <button
                                key={img.id}
                                onClick={() => onImageClick(cluster.images, idx)}
                                className="aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all"
                            >
                                <img
                                    src={`/api/images/${img.id}/preview`}
                                    alt={img.filename}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Map markers layer (has access to map instance for pixel clustering) ───────
function MapMarkers({
    images,
    onClusterClick,
}: {
    images: MapImage[]
    onClusterClick: (cluster: Cluster) => void
}) {
    const map = useMap()
    const [version, setVersion] = useState(0)

    const recluster = useCallback(() => setVersion(v => v + 1), [])

    const clusters = useMemo(
        () => clusterImagesOnMap(images, map),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [images, version]
    )

    return (
        <>
            <MapEvents onViewChange={recluster} />
            <FitBounds images={images} />
            {clusters.map((cluster, i) => (
                <Marker
                    key={`${i}-${cluster.lat}-${cluster.lng}-${cluster.images.length}-${version}`}
                    position={[cluster.lat, cluster.lng]}
                    icon={createClusterIcon(cluster)}
                    eventHandlers={{
                        click: () => onClusterClick(cluster),
                    }}
                />
            ))}
        </>
    )
}

// ── Main MapPage ──────────────────────────────────────────────────────────────
export default function MapPage() {
    const { activeFolderIds, activeCollectionId } = useFolder()
    const [images, setImages] = useState<MapImage[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
    const [lightbox, setLightbox] = useState<{ images: MapImage[]; index: number } | null>(null)

    // Fetch geotagged images
    useEffect(() => {
        let cancelled = false
        setLoading(true)
        api.getMapImages({
            folder_ids: activeFolderIds.length > 0 ? activeFolderIds.join(',') : undefined,
            collection_id: activeCollectionId || undefined,
        }).then(res => {
            if (!cancelled) {
                setImages(res.images)
                setLoading(false)
            }
        }).catch(() => {
            if (!cancelled) setLoading(false)
        })
        return () => { cancelled = true }
    }, [activeFolderIds, activeCollectionId])

    const handleClusterClick = useCallback((cluster: Cluster) => {
        if (cluster.images.length === 1) {
            setLightbox({ images: cluster.images, index: 0 })
        } else {
            setSelectedCluster(cluster)
        }
    }, [])

    const handleImageClick = useCallback((imgs: MapImage[], index: number) => {
        setSelectedCluster(null)
        setLightbox({ images: imgs, index })
    }, [])

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading map...</p>
                </div>
            </div>
        )
    }

    if (images.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-md px-6">
                    <MapPin className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No Geotagged Photos</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        None of the photos in the selected folders contain GPS location data.
                        Photos taken with a smartphone or GPS-enabled camera will appear here.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 relative -m-6" style={{ height: 'calc(100vh - 4rem)' }}>
            {/* Stats overlay */}
            <div className="absolute top-3 right-3 z-[1000] bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    <MapPin className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                    {images.length} geotagged photo{images.length !== 1 ? 's' : ''}
                </span>
            </div>

            <MapContainer
                center={[images[0].latitude, images[0].longitude]}
                zoom={5}
                className="w-full h-full"
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapMarkers images={images} onClusterClick={handleClusterClick} />
            </MapContainer>

            {/* Cluster popup */}
            {selectedCluster && (
                <ClusterPopup
                    cluster={selectedCluster}
                    onClose={() => setSelectedCluster(null)}
                    onImageClick={handleImageClick}
                />
            )}

            {/* Lightbox */}
            {lightbox && (
                <ImageLightbox
                    images={lightbox.images}
                    initialIndex={lightbox.index}
                    onClose={() => setLightbox(null)}
                />
            )}
        </div>
    )
}
