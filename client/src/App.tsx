import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
import { LoginForm } from "./components/login-form";
import { useAuth } from "./hooks/useAuth";

function App() {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--muted-foreground)]">
        Завантаження...
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginForm onSuccess={refresh} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar />
      <main className="flex-1 px-8 py-6">
        <Routes>
          <Route path="/dashboard" element={<p>dashboard</p>} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/orders" element={<p> orders </p>} />
          <Route path="/cashflow" element={<p> cashflow </p>} />
          <Route path="/unit" element={<p> unit </p>} />
          <Route path="/customers" element={<p> customers </p>} />
          <Route path="/notifications" element={<p> notifications </p>} />
          <Route path="/messages" element={<p> messages </p>} />
          <Route path="/settings" element={<p> settings </p>} />
          <Route path="/help" element={<p> help </p>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
