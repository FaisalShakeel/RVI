import { Link, Outlet, useLocation } from 'react-router-dom'
import { LayoutDashboard, Database, List } from 'lucide-react'

const Layout = () => {
  const location = useLocation()

  const isActive = (path) => {
    return location.pathname === path
  }

  const links = [
    { path: '/', label: 'Feed List', icon: List },
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/inventory/all', label: 'All Inventory', icon: Database },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-gray-900">Inventory Feed</h1>
              </div>
              <nav className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {links.map(({ path, label, icon: Icon }) => (
                  <Link
                    key={path}
                    to={path}
                    className={
                      isActive(path)
                        ? 'border-blue-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium'
                    }
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-4 sm:px-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Layout