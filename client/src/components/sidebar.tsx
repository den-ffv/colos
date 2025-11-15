import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Boxes,
  Users,
  Bell,
  MessageSquare,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react"

type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Orders", to: "/orders", icon: ClipboardList },
  { label: "Cashflow", to: "/cashflow", icon: Wallet },
  { label: "Units", to: "/unit", icon: Boxes },
  { label: "Customers", to: "/customers", icon: Users },
  { label: "Notifications", to: "/notifications", icon: Bell },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Help", to: "/help", icon: LifeBuoy },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="px-6 py-6 text-2xl font-bold tracking-tight">COLOS</div>
      <nav className="flex-1 space-y-1 px-3 pb-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--sidebar-primary)] text-[var(--sidebar-primary-foreground)]"
                  : "text-[var(--sidebar-foreground)]/80 hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)]",
              ].join(" ")
            }
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
