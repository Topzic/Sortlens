import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { HeaderActionsProvider } from './HeaderActionsContext'

export default function Layout() {
    return (
        <div className="flex h-screen bg-gray-50 dark:bg-gray-900 dp-bg-main">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content */}
            <HeaderActionsProvider>
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-auto p-6">
                        <Outlet />
                    </main>
                </div>
            </HeaderActionsProvider>
        </div>
    )
}
