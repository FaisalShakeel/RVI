import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import FeedList from './pages/FeedList'
import InventoryTable from './pages/InventoryTable'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<FeedList />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inventory/:feedId" element={<InventoryTable />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App