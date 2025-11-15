import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Truck,
  Users,
  Bell,
  MessageSquare,
  Settings,
  LifeBuoy,
  type LucideIcon,
  MapPin,
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
  { label: "Units", to: "/unit", icon: Truck },
  { label: "Customers", to: "/customers", icon: Users },
  { label: "Notifications", to: "/notifications", icon: Bell },
  { label: "Messages", to: "/messages", icon: MessageSquare },
  { label: "Settings", to: "/settings", icon: Settings },
  { label: "Help", to: "/help", icon: LifeBuoy },
]

export function Sidebar() {
  return (
    <aside className="flex h-screen w-15 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)] text-[var(--sidebar-foreground)]">
      <div className="flex items-center justify-center py-6 text-2xl font-bold tracking-tight"><MapPin /></div>
      <nav className="flex-1  px-2 pb-6">
        {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}
            className={({ isActive }) =>
              [
              "flex items-center justify-center rounded-lg px-2 py-2 text-sm transition-colors",
              isActive
              ? "text-[var(--chart-6)] "
              : "hover:bg-[var(--input)] ",
              ].join(" ")
            }
            >
            <div className="tooltip tooltip-right" data-tip={item.label}>
              <item.icon className="h-5 w-5" />
            </div>
            {/* <span>{item.label}</span> */}
            </NavLink>
        ))}
      </nav>
    </aside>
  )
}
