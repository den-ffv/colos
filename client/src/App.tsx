import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Routes, Route } from "react-router-dom";
import { LoginForm } from "./components/login-form";

const user = !true;

function App() {
  return (
    <SidebarProvider>
      { user ?
        <>
          <AppSidebar />
          <Routes>
            <Route path="/dashboard" element={
              <SidebarInset>
                <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
                  <div className="flex items-center gap-2 px-4">
                    <SidebarTrigger className="-ml-1" />
                  </div>
                </header>
                <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
                  <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    <div className="aspect-video rounded-xl bg-muted/50" />
                    <div className="aspect-video rounded-xl bg-muted/50" />
                    <div className="aspect-video rounded-xl bg-muted/50" />
                  </div>
                  <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min" />
                </div>
              </SidebarInset>
            } />
            <Route path="/about" element={<p> test2</p>} />
          </Routes>
        </>
        :
        <Routes>
          <Route path="/login" element={
            <>
              <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
                <div className="w-full max-w-sm">
                  <LoginForm />
                </div>
              </div>
            </>
          } />
        </Routes>
        }
    </SidebarProvider>
  )
}

export default App
