import { useMemo, useState } from 'react';
import {
  DashboardSpeed02Icon,
  DeliveryTruck01Icon,
  UserGroupIcon,
  UserAccountIcon,
  TruckIcon,
  Building01Icon,
  Logout03Icon,
  Settings01Icon,
  Notification02Icon,
  ArrowDown01Icon,
} from 'hugeicons-react';
import type { AuthTokens } from '../auth/auth.storage';
import { tryGetEmailFromJwt } from './jwt';
import { Dashboard } from './Dashboard';
import { ClientsPage } from '../clients/ClientsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { DriversPage } from '../drivers/DriversPage';
import { VehiclesPage } from '../vehicles/VehiclesPage';
import { CarriersPage } from '../carriers/CarriersPage';

type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers';

const NAV_MAIN: { view: CrmView; label: string; Icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard',  Icon: DashboardSpeed02Icon },
  { view: 'orders',    label: 'Shipments',  Icon: DeliveryTruck01Icon  },
  { view: 'clients',   label: 'Customers',  Icon: UserGroupIcon        },
  { view: 'carriers',  label: 'Carriers',   Icon: Building01Icon       },
];

const NAV_FLEET: { view: CrmView; label: string; Icon: React.ElementType }[] = [
  { view: 'drivers',   label: 'Drivers',    Icon: UserAccountIcon      },
  { view: 'vehicles',  label: 'Vehicles',   Icon: TruckIcon            },
];

export function CrmShell({ tokens, onLogout }: { tokens: AuthTokens; onLogout: () => void }) {
  const [view, setView] = useState<CrmView>('dashboard');
  const email = useMemo(() => tryGetEmailFromJwt(tokens.accessToken), [tokens.accessToken]);

  const displayName = email ? email.split('@')[0] : 'User';
  const avatarLetter = displayName[0].toUpperCase();

  const allNav = [...NAV_MAIN, ...NAV_FLEET];
  const currentLabel = allNav.find((n) => n.view === view)?.label ?? '';

  function NavButton({ view: v, label, Icon }: { view: CrmView; label: string; Icon: React.ElementType }) {
    const active = v === view;
    return (
      <button
        type="button"
        className={active ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
        onClick={() => setView(v)}
      >
        <span className="crm__navIcon">
          <Icon size={18} strokeWidth={active ? 2 : 1.6} />
        </span>
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div className="crm">
      {/* ── Sidebar ───────────────────────────────────────── */}
      <aside className="crm__sidebar">
        <div className="crm__brand">
          <div className="crm__brandIcon">
            <DeliveryTruck01Icon size={17} strokeWidth={2} />
          </div>
          <span className="crm__brandName">Colos</span>
        </div>

        <nav className="crm__nav" aria-label="CRM navigation">
          <span className="crm__navLabel">Main</span>
          {NAV_MAIN.map((item) => <NavButton key={item.view} {...item} />)}

          <span className="crm__navLabel">Fleet Management</span>
          {NAV_FLEET.map((item) => <NavButton key={item.view} {...item} />)}
        </nav>

        <div className="crm__sidebarFooter">
          <button type="button" className="crm__footerNavBtn">
            <span className="crm__navIcon"><Settings01Icon size={17} strokeWidth={1.6} /></span>
            <span>Settings</span>
          </button>
          <button type="button" className="crm__footerNavBtn" onClick={onLogout}>
            <span className="crm__navIcon"><Logout03Icon size={17} strokeWidth={1.6} /></span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="crm__main">
        <header className="crm__topbar">
          <div className="crm__topbarLeft">
            <span className="crm__greeting">Welcome back, {displayName}!</span>
            <span className="crm__subtitle">{currentLabel} overview</span>
          </div>

          <div className="crm__topbarRight">
            <button type="button" className="crm__iconBtn" aria-label="Notifications">
              <Notification02Icon size={17} strokeWidth={1.6} />
            </button>
            <button type="button" className="crm__userChip" onClick={onLogout} title="Sign out">
              <div className="crm__userAvatar">{avatarLetter}</div>
              <span className="crm__userName">{displayName}</span>
              <ArrowDown01Icon size={12} strokeWidth={2} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
          </div>
        </header>

        <div className="crm__mainBody">
          {view === 'dashboard' ? (
            <Dashboard tokens={tokens} onUnauthorized={onLogout} />
          ) : view === 'orders' ? (
            <OrdersPage tokens={tokens} onUnauthorized={onLogout} />
          ) : view === 'clients' ? (
            <ClientsPage tokens={tokens} onUnauthorized={onLogout} />
          ) : view === 'drivers' ? (
            <DriversPage tokens={tokens} onUnauthorized={onLogout} />
          ) : view === 'vehicles' ? (
            <VehiclesPage tokens={tokens} onUnauthorized={onLogout} />
          ) : view === 'carriers' ? (
            <CarriersPage tokens={tokens} onUnauthorized={onLogout} />
          ) : null}
        </div>
      </main>
    </div>
  );
}
