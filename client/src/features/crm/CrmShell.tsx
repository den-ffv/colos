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
  StreeringWheelIcon,
} from 'hugeicons-react';
import type { AuthTokens } from '../auth/auth.storage';
import { tryGetEmailFromJwt, tryGetRolesFromJwt } from './jwt';
import { Dashboard } from './Dashboard';
import { ClientsPage } from '../clients/ClientsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { DriversPage } from '../drivers/DriversPage';
import { VehiclesPage } from '../vehicles/VehiclesPage';
import { CarriersPage } from '../carriers/CarriersPage';
import { DriverPortal } from '../drivers/DriverPortal';
import { CreateOrderPage, type OrderDetail as CreateOrderDetail } from '../orders/CreateOrderPage';

type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit';

type NavItem = { view: CrmView; label: string; Icon: React.ElementType };

/* ── Які пункти меню видно для кожної ролі ──────────────── */

function buildNav(roles: string[]): { main: NavItem[]; fleet: NavItem[] } {
  const isAdmin   = roles.includes('ADMIN');
  const isLogist  = roles.includes('LOGIST');
  const isManager = roles.includes('MANAGER');
  const isDriver  = roles.includes('DRIVER');

  // Водій бачить тільки свої договори
  if (isDriver && !isAdmin && !isLogist && !isManager) {
    return {
      main: [{ view: 'my-orders', label: 'Мої договори', Icon: StreeringWheelIcon }],
      fleet: [],
    };
  }

  const main: NavItem[] = [];
  const fleet: NavItem[] = [];

  if (isAdmin) {
    main.push({ view: 'dashboard', label: 'Dashboard', Icon: DashboardSpeed02Icon });
  }

  if (isAdmin || isLogist || isManager) {
    main.push({ view: 'orders', label: 'Shipments', Icon: DeliveryTruck01Icon });
  }

  if (isAdmin || isLogist) {
    main.push({ view: 'clients', label: 'Customers', Icon: UserGroupIcon });
  }

  if (isAdmin) {
    main.push({ view: 'carriers', label: 'Carriers', Icon: Building01Icon });
  }

  if (isAdmin || isManager) {
    fleet.push({ view: 'drivers', label: 'Drivers', Icon: UserAccountIcon });
    fleet.push({ view: 'vehicles', label: 'Vehicles', Icon: TruckIcon });
  }

  return { main, fleet };
}

/* ── defaultView — перша доступна сторінка для ролі ─────── */

function defaultView(roles: string[]): CrmView {
  if (roles.includes('DRIVER') && !roles.includes('ADMIN') && !roles.includes('LOGIST') && !roles.includes('MANAGER')) {
    return 'my-orders';
  }
  if (roles.includes('ADMIN')) return 'dashboard';
  return 'orders';
}

/* ── Мітка ролі для відображення ───────────────────────── */

function roleLabel(roles: string[]): string {
  if (roles.includes('ADMIN'))   return 'Адміністратор';
  if (roles.includes('LOGIST'))  return 'Логіст';
  if (roles.includes('MANAGER')) return 'Менеджер';
  if (roles.includes('DRIVER'))  return 'Водій';
  return '';
}

export function CrmShell({ tokens, onLogout }: { tokens: AuthTokens; onLogout: () => void }) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken]);
  const email = useMemo(() => tryGetEmailFromJwt(tokens.accessToken), [tokens.accessToken]);

  const [view, setView] = useState<CrmView>(() => defaultView(roles));
  const [editOrderData, setEditOrderData] = useState<CreateOrderDetail | null>(null);

  const { main: NAV_MAIN, fleet: NAV_FLEET } = useMemo(() => buildNav(roles), [roles]);
  const allNav = [...NAV_MAIN, ...NAV_FLEET];

  const displayName = email ? email.split('@')[0] : 'User';
  const avatarLetter = displayName[0].toUpperCase();
  const currentLabel = allNav.find((n) => n.view === view)?.label ?? '';
  const badge = roleLabel(roles);

  function NavButton({ view: v, label, Icon }: NavItem) {
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
          {NAV_MAIN.length > 0 && (
            <>
              <span className="crm__navLabel">Main</span>
              {NAV_MAIN.map((item) => <NavButton key={item.view} {...item} />)}
            </>
          )}

          {NAV_FLEET.length > 0 && (
            <>
              <span className="crm__navLabel">Fleet Management</span>
              {NAV_FLEET.map((item) => <NavButton key={item.view} {...item} />)}
            </>
          )}
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
            <span className="crm__greeting">Вітаємо, {displayName}!</span>
            <span className="crm__subtitle">{currentLabel} overview</span>
          </div>

          <div className="crm__topbarRight">
            {badge && <span className="crm__roleBadge">{badge}</span>}
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
          {view === 'dashboard'  ? <Dashboard    tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'orders'     ? <OrdersPage   tokens={tokens} onUnauthorized={onLogout}
                                    onCreateNew={() => setView('order-new')}
                                    onEditOrder={(order) => { setEditOrderData(order); setView('order-edit'); }} /> :
           view === 'clients'    ? <ClientsPage  tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'drivers'    ? <DriversPage  tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'vehicles'   ? <VehiclesPage tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'carriers'   ? <CarriersPage tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'my-orders'  ? <DriverPortal tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'order-new'  ? <CreateOrderPage tokens={tokens} onUnauthorized={onLogout}
                                    onSaved={() => setView('orders')}
                                    onCancel={() => setView('orders')} /> :
           view === 'order-edit' && editOrderData ? <CreateOrderPage tokens={tokens} onUnauthorized={onLogout}
                                    editOrder={editOrderData}
                                    onSaved={() => { setEditOrderData(null); setView('orders'); }}
                                    onCancel={() => { setEditOrderData(null); setView('orders'); }} /> :
           null}
        </div>
      </main>
    </div>
  );
}
