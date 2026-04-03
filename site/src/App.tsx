import { Navigate, Route, Routes } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { WorkshopPage } from './pages/WorkshopPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/workshop" element={<WorkshopPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
