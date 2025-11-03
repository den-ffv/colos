'use client';
import * as React from 'react';
import { AudioWaveform, Wallet, NotepadText, Command, GalleryVerticalEnd, Truck, MapPinned, House, Users, Bell, Inbox, Settings, Headset } from 'lucide-react';

import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, SidebarTrigger } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import { useSidebar } from '@/hooks/use-sidebar';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { t } = useTranslation();
  const { open } = useSidebar();

  const data = {
    user: {
      name: 'shadcn',
      email: 'm@example.com',
      avatar: '/avatars/shadcn.jpg',
    },
    teams: [
      {
        name: 'Acme Inc',
        logo: GalleryVerticalEnd,
        plan: 'Enterprise',
      },
      {
        name: 'Acme Corp.',
        logo: AudioWaveform,
        plan: 'Startup',
      },
      {
        name: 'Evil Corp.',
        logo: Command,
        plan: 'Free',
      },
    ],
    navMain: [
      {
        title: t('Dashboard'),
        url: '/dashboard',
        icon: House,
        isActive: true,
      },
      {
        title: t('Tracking'),
        url: '#',
        icon: MapPinned,
        isActive: true,
        items: [
          {
            title: 'Road Freight',
            url: '/road_freight',
          },
        ],
      },
      {
        title: t('Orders'),
        url: '/orders',
        icon: NotepadText,
      },
      {
        title: t('Cashflow'),
        url: '/cashflow',
        icon: Wallet,
      },
      {
        title: t('Unit'),
        url: '/unit',
        icon: Truck,
      },
      {
        title: t('Customers'),
        url: '/customers',
        icon: Users,
      },
      {
        title: 'Notifications',
        url: '/notifications',
        icon: Bell,
      },
      {
        title: 'Messages',
        url: '/messages',
        icon: Inbox,
      },
      {
        title: 'Settings',
        url: '/settings',
        icon: Settings,
      },
      {
        title: 'Help & Support',
        url: '/help',
        icon: Headset,
      }
    ]
  };

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {/* <TeamSwitcher teams={data.teams} /> */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8 }}>
          <p style={{fontWeight: 'bold', fontFamily:'monospace', fontSize: 20}}>{open ? 'COLOS' : 'C'}</p>
          <SidebarTrigger className="-ml-1" />
        </div>
        <span style={{ display: 'block', background: '#dadadaff', width: '100%', height: 1 }} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
