import { useState, useEffect } from 'react'
import { BarChart, PieChart, Users, DollarSign } from 'lucide-react'
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/dashboard')
        const data = await response.json()
        setDashboardData(data)
      } catch (error) {
        console.error('Error fetching dashboard:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboard()
  }, [])

  if (loading || !dashboardData) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const { stats, activeFeeds, recentItems } = dashboardData

  const statsCards = [
    { 
      title: 'Total Units', 
      value: stats.total_units.toLocaleString(), 
      icon: Users, 
      change: `${stats.new_units} New`
    },
    { 
      title: 'Total Value', 
      value: `$${(stats.total_value / 1000000).toFixed(1)}M`, 
      icon: DollarSign, 
      change: `Avg $${Math.round(stats.avg_price).toLocaleString()}`
    },
    { 
      title: 'Active Feeds', 
      value: activeFeeds, 
      icon: BarChart, 
      change: 'Feeds'
    },
    { 
      title: 'Inventory Split', 
      value: `${Math.round((stats.new_units / stats.total_units) * 100)}% New`, 
      icon: PieChart, 
      change: `${Math.round((stats.used_units / stats.total_units) * 100)}% Used`
    }
  ]

  const chartData = [
    { name: 'New', value: stats.new_units },
    { name: 'Used', value: stats.used_units }
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard Overview</h2>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.title}</p>
                <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                <span className="text-sm text-green-500">{stat.change}</span>
              </div>
              <stat.icon className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory by Status */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Inventory by Status</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recently Added */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Recently Added Units</h3>
          <div className="space-y-4">
            {recentItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="font-medium">{item.stock_number}</p>
                  <p className="text-sm text-gray-500">{item.make} {item.model} {item.year}</p>
                </div>
                <span className="text-blue-500 font-medium">{item.sale_price}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard