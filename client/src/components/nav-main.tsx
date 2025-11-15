import { type LucideIcon } from "lucide-react"

import { SidebarGroup, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { NavLink } from "react-router-dom"

type NavMainProps = {
  items: {
    title: string
    url: string
    icon?: LucideIcon
  }[]
}

export function NavMain({ items }: NavMainProps) {
  return (
    <SidebarGroup>
      {/* <SidebarGroupLabel>Platform</SidebarGroupLabel> */}
      <SidebarMenu>
        {items.map((item, index) => (
          <SidebarMenuItem key={index}>
            <NavLink to={item.url}>
              {({ isActive }) => (
                <SidebarMenuButton tooltip={item.title} data-active={isActive}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              )}
            </NavLink>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
