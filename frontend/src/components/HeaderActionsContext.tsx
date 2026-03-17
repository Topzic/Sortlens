import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type HeaderActionsContextValue = {
    actions: ReactNode
    setActions: (actions: ReactNode) => void
}

const HeaderActionsContext = createContext<HeaderActionsContextValue | null>(null)

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
    const [actions, setActions] = useState<ReactNode>(null)
    const value = useMemo(() => ({ actions, setActions }), [actions])
    return <HeaderActionsContext.Provider value={value}>{children}</HeaderActionsContext.Provider>
}

export function useHeaderActions() {
    const context = useContext(HeaderActionsContext)
    if (!context) {
        throw new Error('useHeaderActions must be used within HeaderActionsProvider')
    }
    return context
}