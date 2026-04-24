import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import LibraryHealthPanel from '../components/LibraryHealthPanel'

export default function LibraryPage() {
    const navigate = useNavigate()

    return (
        <div className="mx-auto max-w-5xl p-4">
            <div className="mb-6">
                <button
                    onClick={() => navigate('/settings')}
                    className="mb-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Settings
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Library Health</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            Detect and resolve missing folders and images after moving your library.
                        </p>
                    </div>
                </div>
            </div>

            <LibraryHealthPanel />
        </div>
    )
}
