import { useEffect, useState } from 'react'
import { BarChart3, CheckCircle, XCircle, SkipForward, Star, HardDrive, Trash2, Loader2, Image, FolderOpen, Library } from 'lucide-react'
import { api, formatBytes, type StatsResponse } from '../services/api'

function StatCard({ icon: Icon, label, value, sub, color }: { icon: typeof BarChart3; label: string; value: string; sub?: string; color: string }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                    <Icon className="h-5 w-5 text-white" />
                </div>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
            {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
    )
}

export default function StatsPage() {
    const [stats, setStats] = useState<StatsResponse | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        const load = async () => {
            setLoading(true)
            try {
                const data = await api.getStats()
                if (!cancelled) setStats(data)
            } catch {
                // silent
            } finally {
                if (!cancelled) setLoading(false)
            }
        }
        load()

        // Refetch when tab/page becomes visible (e.g. after swiping)
        const onVisible = () => {
            if (document.visibilityState === 'visible') load()
        }
        document.addEventListener('visibilitychange', onVisible)
        window.addEventListener('focus', load)
        return () => {
            cancelled = true
            document.removeEventListener('visibilitychange', onVisible)
            window.removeEventListener('focus', load)
        }
    }, [])

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        )
    }

    if (!stats) {
        return (
            <div className="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
                <p>Failed to load statistics</p>
            </div>
        )
    }

    const keepRate = stats.total_reviewed > 0
        ? Math.round(((stats.total_kept + stats.total_favorited) / stats.total_reviewed) * 100)
        : 0
    const rejectRate = stats.total_reviewed > 0
        ? Math.round((stats.total_rejected / stats.total_reviewed) * 100)
        : 0

    return (
        <div className="flex-1 overflow-auto p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

            {/* Top stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                <StatCard icon={Image} label="Total Images" value={stats.total_images.toLocaleString()} sub={formatBytes(stats.total_size)} color="bg-blue-500" />
                <StatCard icon={BarChart3} label="Reviewed" value={stats.total_reviewed.toLocaleString()} sub={stats.total_images > 0 ? `${Math.round((stats.total_reviewed / stats.total_images) * 100)}% of library` : undefined} color="bg-purple-500" />
                <StatCard icon={CheckCircle} label="Kept" value={(stats.total_kept + stats.total_favorited).toLocaleString()} sub={`${keepRate}% keep rate`} color="bg-green-500" />
                <StatCard icon={XCircle} label="Rejected" value={stats.total_rejected.toLocaleString()} sub={`${rejectRate}% reject rate`} color="bg-red-500" />
                <StatCard icon={SkipForward} label="Skipped" value={stats.total_skipped.toLocaleString()} color="bg-amber-500" />
                <StatCard icon={Star} label="Favorited" value={stats.total_favorited.toLocaleString()} color="bg-yellow-500" />
                <StatCard icon={Trash2} label="Space Freed" value={formatBytes(stats.space_freed)} sub="From applied deletions" color="bg-rose-600" />
                <StatCard icon={HardDrive} label="Rated Images" value={stats.rated_count.toLocaleString()} color="bg-indigo-500" />
            </div>

            {/* Secondary stats */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Library Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard icon={FolderOpen} label="Folders" value={stats.folders_count.toLocaleString()} color="bg-cyan-500" />
                <StatCard icon={Library} label="Collections" value={stats.collections_count.toLocaleString()} color="bg-teal-500" />
                <StatCard icon={CheckCircle} label="Flagged Pick" value={stats.flagged_pick_count.toLocaleString()} color="bg-emerald-500" />
                <StatCard icon={XCircle} label="Flagged Reject" value={stats.flagged_reject_count.toLocaleString()} color="bg-orange-500" />
            </div>

            {/* Review breakdown bar */}
            {stats.total_reviewed > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Decision Breakdown</h2>
                    <div className="h-6 w-full rounded-full overflow-hidden flex bg-gray-200 dark:bg-gray-700">
                        {stats.total_kept + stats.total_favorited > 0 && (
                            <div className="bg-green-500 h-full transition-all" style={{ width: `${((stats.total_kept + stats.total_favorited) / stats.total_reviewed) * 100}%` }}
                                title={`Kept: ${stats.total_kept + stats.total_favorited}`} />
                        )}
                        {stats.total_rejected > 0 && (
                            <div className="bg-red-500 h-full transition-all" style={{ width: `${(stats.total_rejected / stats.total_reviewed) * 100}%` }}
                                title={`Rejected: ${stats.total_rejected}`} />
                        )}
                        {stats.total_skipped > 0 && (
                            <div className="bg-amber-400 h-full transition-all" style={{ width: `${(stats.total_skipped / stats.total_reviewed) * 100}%` }}
                                title={`Skipped: ${stats.total_skipped}`} />
                        )}
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Kept {keepRate}%</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Rejected {rejectRate}%</span>
                        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> Skipped {stats.total_reviewed > 0 ? Math.round((stats.total_skipped / stats.total_reviewed) * 100) : 0}%</span>
                    </div>
                </div>
            )}
        </div>
    )
}
