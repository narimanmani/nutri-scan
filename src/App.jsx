import './App.css';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext.jsx';
import { Toaster } from '@/components/ui/toaster';
import AuthPage from '@/pages/Auth.jsx';
import ProtectedRoutes from '@/pages/index.jsx';
import { Loader2 } from 'lucide-react';

function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-emerald-50 text-emerald-700">
      <Loader2 className="h-8 w-8 animate-spin mb-3" />
      <p className="text-sm font-medium">Preparing your personalised dashboard…</p>
    </div>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <Routes>
      <Route path="/auth" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/*" element={user ? <ProtectedRoutes /> : <Navigate to="/auth" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppRouter />
      <Toaster />
    </Router>
  );
}

export default App;
