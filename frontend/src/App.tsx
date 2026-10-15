import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ImageAnalysis } from './pages/ImageAnalysis';
import { VideoAnalysis } from './pages/VideoAnalysis';
import { HistoryPage } from './pages/History';
import { HistoryDetail } from './pages/HistoryDetail';
import { Reports } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { LiveMonitor } from './pages/LiveMonitor';
import { AlertsPage } from './pages/Alerts';
import { NotFound } from './pages/NotFound';
import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="live" element={<LiveMonitor />} />
              <Route path="alerts" element={<AlertsPage />} />
              <Route path="analysis" element={<ImageAnalysis />} />
              <Route path="video" element={<VideoAnalysis />} />
              <Route path="history" element={<HistoryPage />} />
              <Route path="history/:id" element={<HistoryDetail />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
