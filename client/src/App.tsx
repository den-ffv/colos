import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Routes, Route, Navigate } from "react-router-dom";
import { LoginForm } from "./components/login-form";
import ContractForm from "./components/contract-form";
import ContractsList from "./components/contracts-list";
import LogisticsContractForm from "./components/logistics-contract-form";
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
    <SidebarProvider>
      <AppSidebar />
      <Routes>
        <Route path="/dashboard" element={
          <SidebarInset>
            <div className="container mx-auto p-6">
              <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-blue-100 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-2">Всього договорів</h2>
                  <p className="text-3xl font-bold text-blue-600">25</p>
                </div>
                <div className="bg-green-100 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-2">Активні</h2>
                  <p className="text-3xl font-bold text-green-600">12</p>
                </div>
                <div className="bg-yellow-100 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-2">Очікують</h2>
                  <p className="text-3xl font-bold text-yellow-600">8</p>
                </div>
              </div>
            </div>
          </SidebarInset>
        } />

        <Route path="/contract" element={
          <SidebarInset>
            <ContractForm />
          </SidebarInset>
        } />

        <Route path="/logistics" element={
          <SidebarInset>
            <LogisticsContractForm />
          </SidebarInset>
        } />

        <Route path="/road_freight" element={
          <SidebarInset>
            <ContractsList />
          </SidebarInset>
        } />
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
    </SidebarProvider>
  )
}

function LoginFormWrapper() {
  return (
    <>
      <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-sm">
          <LoginForm />
        </div>
      </div>
    </>
  )
}

export default App
