import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw, Sparkles, Tag } from 'lucide-react'
import { api, type ImageTagOut, type SuggestionOut, type TagOut } from '../services/api'
import { TagBadge, type TagSource } from './TagBadge'

interface TagInputProps {
  imageId: string
  /** Tags currently applied to the image */
  appliedTags: ImageTagOut[]
  onTagsChange: React.Dispatch<React.SetStateAction<ImageTagOut[]>>
  /** Whether to auto-fetch suggestions when the component mounts */
  autoSuggest?: boolean
  /** Compact layout for tight spaces (Swipe EXIF panel) */
  compact?: boolean
  /** Tags from the previously viewed image — enables "Re-apply" button */
  previousTags?: ImageTagOut[]
}

function mergeTags(existingTags: ImageTagOut[], nextTags: ImageTagOut[]): ImageTagOut[] {
  if (nextTags.length === 0) return existingTags

  const merged = [...existingTags]
  const indexByName = new Map(existingTags.map((tag, index) => [tag.name.toLowerCase(), index]))

  for (const tag of nextTags) {
    const lowerName = tag.name.toLowerCase()
    const existingIndex = indexByName.get(lowerName)

    if (existingIndex == null) {
      indexByName.set(lowerName, merged.length)
      merged.push(tag)
      continue
    }

    merged[existingIndex] = tag
  }

  return merged
}

export function TagInput({
  imageId,
  appliedTags,
  onTagsChange,
  autoSuggest = true,
  compact = false,
  previousTags,
}: TagInputProps) {
  const collapsedSuggestionCount = 8
  const [inputValue, setInputValue] = useState('')
  const [dropdownItems, setDropdownItems] = useState<TagOut[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [suggestions, setSuggestions] = useState<SuggestionOut[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [showAllSuggestions, setShowAllSuggestions] = useState(false)
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [aiDownloading, setAiDownloading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestImageIdRef = useRef(imageId)

  useEffect(() => {
    latestImageIdRef.current = imageId
    setInputValue('')
    setDropdownOpen(false)
    setHighlightIndex(-1)
    setSaving(null)
  }, [imageId])

  const appliedNames = new Set(appliedTags.map((t) => t.name.toLowerCase()))

  // Filter previous tags to only those not already applied
  const reapplyableTags = previousTags?.filter(
    (t) => !appliedNames.has(t.name.toLowerCase())
  ) ?? []

  const handleReapplyPrevious = useCallback(async () => {
    const added: ImageTagOut[] = []
    for (const tag of reapplyableTags) {
      try {
        const newTag = await api.addImageTag(imageId, {
          name: tag.name,
          source: tag.source,
          confidence: tag.confidence ?? undefined,
        })
        if (latestImageIdRef.current !== imageId) return
        added.push(newTag)
      } catch {
        // skip failed tags
      }
    }
    if (added.length > 0 && latestImageIdRef.current === imageId) {
      onTagsChange((prev) => mergeTags(prev, added))
    }
  }, [reapplyableTags, imageId, onTagsChange])

  const isClipSuggestion = (suggestion: SuggestionOut) =>
    suggestion.source.startsWith('ai') &&
    suggestion.source !== 'ai_object' &&
    suggestion.source !== 'ai_object_wildlife'

  // ---------------------------------------------------------------------------
  // Suggestions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!imageId || !autoSuggest) return
    let cancelled = false
    setShowAllSuggestions(false)
    setSuggestionsLoading(true)
    api
      .getTagSuggestions(imageId)
      .then((data) => {
        if (!cancelled) setSuggestions(data)
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setSuggestionsLoading(false)
      })

    api
      .getAiStatus()
      .then((s) => {
        if (cancelled) return
        setAiAvailable(s.available)
        setAiDownloading(s.downloading)
      })
      .catch(() => { })

    return () => {
      cancelled = true
    }
  }, [imageId, autoSuggest])

  // ---------------------------------------------------------------------------
  // Autocomplete debounce
  // ---------------------------------------------------------------------------
  const searchTags = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setDropdownItems([])
      setDropdownOpen(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.listTags({ q: q.trim(), limit: 12 })
        setDropdownItems(results)
        setDropdownOpen(true)
        setHighlightIndex(-1)
      } catch {
        setDropdownItems([])
      }
    }, 200)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // Ignore commas as separators by immediately adding
    if (val.endsWith(',')) {
      const tagName = val.slice(0, -1).trim()
      if (tagName) addTag(tagName)
      setInputValue('')
      setDropdownOpen(false)
      return
    }
    setInputValue(val)
    searchTags(val)
  }

  // ---------------------------------------------------------------------------
  // Add / remove
  // ---------------------------------------------------------------------------
  const addTag = useCallback(
    async (name: string, source: TagSource = 'manual', confidence?: number) => {
      const cleanName = name.trim()
      if (!cleanName || appliedNames.has(cleanName.toLowerCase())) return

      setSaving(cleanName)
      try {
        const newTag = await api.addImageTag(imageId, { name: cleanName, source, confidence })
        if (latestImageIdRef.current !== imageId) return
        onTagsChange((prev) => mergeTags(prev, [newTag]))
        // Refresh suggestions to mark this one as applied
        setSuggestions((prev) =>
          prev.map((s) =>
            s.name.toLowerCase() === cleanName.toLowerCase() ? { ...s, already_applied: true } : s
          )
        )
      } catch {
        // silently ignore – could surface a toast here if desired
      } finally {
        if (latestImageIdRef.current === imageId) {
          setSaving(null)
        }
      }
      if (latestImageIdRef.current === imageId) {
        setInputValue('')
        setDropdownOpen(false)
      }
    },
    [imageId, appliedNames, onTagsChange]
  )

  const removeTag = useCallback(
    async (tagName: string) => {
      try {
        await api.removeImageTag(imageId, tagName)
        if (latestImageIdRef.current !== imageId) return
        onTagsChange((prev) => prev.filter((t) => t.name.toLowerCase() !== tagName.toLowerCase()))
        setSuggestions((prev) =>
          prev.map((s) =>
            s.name.toLowerCase() === tagName.toLowerCase()
              ? { ...s, already_applied: false }
              : s
          )
        )
      } catch {
        // silently ignore
      }
    },
    [imageId, onTagsChange]
  )

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  const dropdownCount = dropdownOpen
    ? dropdownItems.length + (inputValue.trim() && !dropdownItems.some((d) => d.name.toLowerCase() === inputValue.trim().toLowerCase()) ? 1 : 0)
    : 0

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => Math.min(i + 1, dropdownCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (dropdownOpen && highlightIndex >= 0) {
        e.preventDefault()
        const isCreateNew = highlightIndex === dropdownItems.length
        if (isCreateNew) {
          addTag(inputValue.trim())
        } else {
          addTag(dropdownItems[highlightIndex].name)
        }
      } else if (e.key === 'Enter' && inputValue.trim()) {
        e.preventDefault()
        addTag(inputValue.trim())
      }
    } else if (e.key === 'Escape') {
      setDropdownOpen(false)
      setInputValue('')
    } else if (e.key === 'Backspace' && !inputValue && appliedTags.length > 0) {
      removeTag(appliedTags[appliedTags.length - 1].name)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ---------------------------------------------------------------------------
  // AI download — poll while downloading until available
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!aiDownloading) return
    const id = setInterval(async () => {
      try {
        const s = await api.getAiStatus()
        setAiAvailable(s.available)
        setAiDownloading(s.downloading)
      } catch {
        // ignore transient errors
      }
    }, 2000)
    return () => clearInterval(id)
  }, [aiDownloading])

  const handleDownloadAi = async () => {
    setAiDownloading(true)
    try {
      await api.triggerAiDownload()
    } catch {
      // ignore
    }
  }

  const showCreateNew =
    dropdownOpen &&
    inputValue.trim() &&
    !dropdownItems.some((d) => d.name.toLowerCase() === inputValue.trim().toLowerCase())

  const expandedSuggestions = suggestions.filter((s) => !s.already_applied)
  const prioritizedClipSuggestions = expandedSuggestions.filter(isClipSuggestion).slice(0, 3)
  const collapsedSuggestionNames = new Set(prioritizedClipSuggestions.map((s) => s.name.toLowerCase()))
  const collapsedSuggestions = [
    ...prioritizedClipSuggestions,
    ...expandedSuggestions.filter((s) => !collapsedSuggestionNames.has(s.name.toLowerCase())),
  ].slice(0, collapsedSuggestionCount)
  const visibleSuggestions = showAllSuggestions ? expandedSuggestions : collapsedSuggestions
  const hasMoreSuggestions = expandedSuggestions.length > collapsedSuggestions.length

  return (
    <div className="space-y-2">
      {/* Applied tags */}
      {appliedTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {appliedTags.map((tag) => (
            <TagBadge
              key={tag.name}
              tag={tag.name}
              source={tag.source as TagSource}
              onRemove={() => removeTag(tag.name)}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Re-apply previous tags */}
      {reapplyableTags.length > 0 && (
        <button
          type="button"
          onClick={handleReapplyPrevious}
          className={[
            'flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10',
            'text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer w-full',
            compact ? 'text-[10px] px-2 py-1' : 'text-xs px-2.5 py-1.5',
          ].join(' ')}
        >
          <RotateCcw size={compact ? 10 : 12} />
          Re-apply last tags ({reapplyableTags.length})
        </button>
      )}

      {/* Input */}
      <div className="relative">
        <div
          className={[
            'flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5',
            'focus-within:border-violet-500/60 focus-within:bg-white/8 transition-colors',
            compact ? 'px-2 py-1' : 'px-2.5 py-1.5',
          ].join(' ')}
        >
          <Tag
            size={compact ? 10 : 12}
            className="text-zinc-500 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => inputValue.trim() && setDropdownOpen(true)}
            placeholder={appliedTags.length === 0 ? 'Add tag…' : 'Add another…'}
            className={[
              'flex-1 bg-transparent outline-none text-zinc-200 placeholder-zinc-600 min-w-0',
              compact ? 'text-[11px]' : 'text-xs',
            ].join(' ')}
            autoComplete="off"
            spellCheck={false}
          />
          {saving && <Loader2 size={10} className="animate-spin text-violet-400 shrink-0" />}
        </div>

        {/* Dropdown */}
        {dropdownOpen && (dropdownItems.length > 0 || showCreateNew) && (
          <div
            ref={dropdownRef}
            className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-white/10 bg-zinc-900 shadow-xl overflow-hidden"
          >
            {dropdownItems.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  addTag(item.name)
                }}
                className={[
                  'w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors',
                  highlightIndex === i
                    ? 'bg-violet-600/40 text-white'
                    : 'text-zinc-300 hover:bg-white/5',
                  appliedNames.has(item.name.toLowerCase())
                    ? 'opacity-40 pointer-events-none'
                    : '',
                ].join(' ')}
              >
                <span className="truncate">{item.name}</span>
                <span className="text-zinc-600 ml-2 shrink-0">{item.usage_count}</span>
              </button>
            ))}
            {showCreateNew && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  addTag(inputValue.trim())
                }}
                className={[
                  'w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-xs transition-colors',
                  'border-t border-white/5',
                  highlightIndex === dropdownItems.length
                    ? 'bg-violet-600/40 text-white'
                    : 'text-violet-300 hover:bg-white/5',
                ].join(' ')}
              >
                <span className="text-zinc-500">Create:</span>
                <span className="font-medium">"{inputValue.trim()}"</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Suggestions */}
      {suggestionsLoading ? (
        <div className="flex items-center gap-1.5 text-zinc-600 text-[10px]">
          <Loader2 size={9} className="animate-spin" />
          Loading suggestions…
        </div>
      ) : visibleSuggestions.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-zinc-600 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>Suggestions</p>
            {(hasMoreSuggestions || showAllSuggestions) && (
              <button
                type="button"
                onClick={() => setShowAllSuggestions((prev) => !prev)}
                className={`text-zinc-500 hover:text-zinc-300 transition-colors ${compact ? 'text-[9px]' : 'text-[10px]'}`}
              >
                {showAllSuggestions ? 'Show less' : `Show more (${expandedSuggestions.length - collapsedSuggestions.length})`}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {visibleSuggestions.map((s) => (
              <TagBadge
                key={s.name}
                tag={s.name}
                source={s.source as TagSource}
                isSuggestion
                compact={compact}
                onClick={() => addTag(s.name, s.source as TagSource, s.confidence)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* AI model CTA */}
      {aiAvailable === false && !aiDownloading && (
        <button
          type="button"
          onClick={handleDownloadAi}
          className={[
            'flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10',
            'text-sky-400 hover:bg-sky-500/20 transition-colors cursor-pointer',
            compact ? 'text-[10px] px-2 py-1' : 'text-xs px-2.5 py-1.5',
          ].join(' ')}
        >
          <Sparkles size={compact ? 10 : 12} />
          Enable AI tag suggestions (~170 MB)
        </button>
      )}
      {aiDownloading && (
        <div className={`flex items-center gap-1.5 text-sky-400 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <Loader2 size={compact ? 10 : 12} className="animate-spin" />
          Downloading AI model…
        </div>
      )}
    </div>
  )
}
