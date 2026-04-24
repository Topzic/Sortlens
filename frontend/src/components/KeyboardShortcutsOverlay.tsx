import { X } from 'lucide-react'

interface ShortcutItem {
    key: string
    description: string
}

const sections: { title: string; shortcuts: ShortcutItem[] }[] = [
    {
        title: 'Navigation',
        shortcuts: [
            { key: '← →', description: 'Previous / Next image (lightbox)' },
            { key: 'Enter', description: 'Open lightbox for selected image' },
            { key: 'Escape', description: 'Close lightbox / Clear selection' },
        ],
    },
    {
        title: 'Rating & Labels',
        shortcuts: [
            { key: '0–5', description: 'Set star rating (0 = clear)' },
            { key: '6 7 8 9', description: 'Color label: Red, Yellow, Green, Blue' },
            { key: 'P', description: 'Flag as Pick' },
            { key: 'U', description: 'Flag as Unflagged' },
            { key: 'X', description: 'Flag as Reject' },
        ],
    },
    {
        title: 'Actions',
        shortcuts: [
            { key: 'Delete', description: 'Delete image(s)' },
            { key: 'E', description: 'Open in external editor' },
            { key: 'R', description: 'Reveal in file explorer' },
            { key: 'I', description: 'Toggle EXIF / Info panel (lightbox)' },
        ],
    },
    {
        title: 'Selection',
        shortcuts: [
            { key: 'Ctrl+A', description: 'Select all loaded images' },
            { key: 'Ctrl+D', description: 'Deselect all' },
            { key: 'Ctrl+Click', description: 'Toggle select image' },
            { key: 'Shift+Click', description: 'Range select' },
        ],
    },
    {
        title: 'Help',
        shortcuts: [
            { key: '?', description: 'Toggle this shortcuts panel' },
        ],
    },
]

interface KeyboardShortcutsOverlayProps {
    open: boolean
    onClose: () => void
}

export function KeyboardShortcutsOverlay({ open, onClose }: KeyboardShortcutsOverlayProps) {
    if (!open) return null

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    {sections.map((section) => (
                        <div key={section.title}>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                                {section.title}
                            </h3>
                            <div className="space-y-1">
                                {section.shortcuts.map((s) => (
                                    <div key={s.key} className="flex items-center justify-between py-1">
                                        <span className="text-sm text-gray-700 dark:text-gray-300">{s.description}</span>
                                        <kbd className="ml-4 shrink-0 rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-mono text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                                            {s.key}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
                    Press <kbd className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-xs font-mono border border-gray-200 dark:border-gray-600">?</kbd> to close
                </p>
            </div>
        </div>
    )
}
