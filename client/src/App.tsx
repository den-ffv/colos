import { Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
// import { useAuth } from "./hooks/useAuth";

function App() {
  // Тимчасово відключаємо authentication для тестування
  // const { user, loading } = useAuth()
  const user = { id: 'test', type: 'test' }; // Тестовий користувач
  const loading = false;

  if (loading) return null

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginFormWrapper />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar />
      <main className="flex-1 px-8 py-6">
        <Routes>
          <Route path="/dashboard" element={<p>dashboard</p>} />
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

function LoginFormWrapper() {
  return (
    <>
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          {/* <LoginForm /> */}
        </div>
      </div>
    </>
  )
}

export default App
