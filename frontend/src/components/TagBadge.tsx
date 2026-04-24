import { X } from 'lucide-react'

export type TagSource = 'manual' | 'ai' | 'ai_object' | 'ai_object_wildlife' | 'exif' | 'ai_wildlife' | 'ai_food' | 'ai_scene' | 'ai_event'

interface TagBadgeProps {
  tag: string
  source?: TagSource
  onRemove?: () => void
  onClick?: () => void
  /** Show as a suggestion (lighter style, no remove, click to apply) */
  isSuggestion?: boolean
  compact?: boolean
}

const SOURCE_STYLES: Record<TagSource, string> = {
  manual: 'bg-violet-600/90 text-white border-violet-500',
  ai: 'bg-sky-600/80 text-white border-sky-500',
  ai_object: 'bg-teal-600/80 text-white border-teal-500',
  ai_object_wildlife: 'bg-lime-600/80 text-white border-lime-500',
  exif: 'bg-zinc-600/80 text-zinc-100 border-zinc-500',
  ai_wildlife: 'bg-emerald-600/80 text-white border-emerald-500',
  ai_food: 'bg-amber-600/80 text-white border-amber-500',
  ai_scene: 'bg-indigo-600/80 text-white border-indigo-500',
  ai_event: 'bg-rose-600/80 text-white border-rose-500',
}

const SUGGESTION_STYLES: Record<TagSource, string> = {
  manual: 'bg-violet-500/20 text-violet-300 border-violet-500/50 hover:bg-violet-500/30',
  ai: 'bg-sky-500/20 text-sky-300 border-sky-500/50 hover:bg-sky-500/30',
  ai_object: 'bg-teal-500/20 text-teal-300 border-teal-500/50 hover:bg-teal-500/30',
  ai_object_wildlife: 'bg-lime-500/20 text-lime-300 border-lime-500/50 hover:bg-lime-500/30',
  exif: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40 hover:bg-zinc-500/30',
  ai_wildlife: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30',
  ai_food: 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30',
  ai_scene: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 hover:bg-indigo-500/30',
  ai_event: 'bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30',
}

const SOURCE_LABEL: Record<TagSource, string> = {
  manual: '',
  ai: ' ✦',
  ai_object: ' ◎',
  ai_object_wildlife: ' ◎',
  exif: ' ⊕',
  ai_wildlife: ' ✦',
  ai_food: ' ✦',
  ai_scene: ' ✦',
  ai_event: ' ✦',
}

export function TagBadge({
  tag,
  source = 'manual',
  onRemove,
  onClick,
  isSuggestion = false,
  compact = false,
}: TagBadgeProps) {
  const baseStyle = isSuggestion ? SUGGESTION_STYLES[source] : SOURCE_STYLES[source]
  const isClickable = !!onClick || !!onRemove
  const suffix = SOURCE_LABEL[source]

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border font-medium leading-none select-none',
        compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1',
        baseStyle,
        isClickable ? 'cursor-pointer' : '',
        isSuggestion ? 'transition-colors' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      title={isSuggestion ? `Suggested (${source})` : source !== 'manual' ? source : undefined}
    >
      <span className="truncate max-w-[120px]">
        {tag}
        {suffix && <span className="opacity-60 ml-0.5 text-[9px]">{suffix}</span>}
      </span>
      {onRemove && (
        <button
          type="button"
          className="ml-0.5 -mr-0.5 rounded-full opacity-70 hover:opacity-100 hover:bg-white/20 p-0.5 transition-opacity"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label={`Remove tag ${tag}`}
        >
          <X size={10} strokeWidth={2.5} />
        </button>
      )}
    </span>
  )
}
