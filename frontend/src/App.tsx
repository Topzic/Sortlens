import { useState, useCallback } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { FolderProvider } from './context/FolderContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import SplashScreen from './components/SplashScreen'
import Layout from './components/Layout'
import SwipePage from './pages/SwipePage'
import BlurryPage from './pages/BlurryPage'
import DuplicatesPage from './pages/DuplicatesPage'
import BrowsePage from './pages/BrowsePage'
import MapPage from './pages/MapPage'
import SettingsPage from './pages/SettingsPage'
import StatsPage from './pages/StatsPage'
import LibraryPage from './pages/LibraryPage'

function App() {
    const [serverReady, setServerReady] = useState(false)
    const handleReady = useCallback(() => setServerReady(true), [])

    if (!serverReady) {
        return <SplashScreen onReady={handleReady} />
    }

    return (
        <ErrorBoundary>
            <ToastProvider>
                <FolderProvider>
                    <BrowserRouter>
                        <Routes>
                            <Route path="/" element={<Layout />}>
                                <Route index element={<Navigate to="/swipe" replace />} />
                                <Route path="swipe" element={<SwipePage />} />
                                <Route path="blurry" element={<BlurryPage />} />
                                <Route path="duplicates" element={<DuplicatesPage />} />
                                <Route path="browse" element={<BrowsePage />} />
                                <Route path="map" element={<MapPage />} />
                                <Route path="stats" element={<StatsPage />} />
                                <Route path="settings" element={<SettingsPage />} />
                                <Route path="library" element={<LibraryPage />} />
                                <Route path="*" element={<Navigate to="/swipe" replace />} />
                            </Route>
                        </Routes>
                    </BrowserRouter>
                </FolderProvider>
            </ToastProvider>
        </ErrorBoundary>
    )
}

export default App
