import { useCallback, useEffect, useMemo, useState } from 'react';
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
  UserEdit01Icon,
  UserCircle02Icon,
} from 'hugeicons-react';
import type { AuthTokens } from '../auth/auth.storage';
import { apiGetJson, apiPatchJson } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { isApiSuccess } from '../../lib/apiResponse';
import type { ApiResponse } from '../../lib/apiResponse';
import { tryGetEmailFromJwt, tryGetRolesFromJwt } from './jwt';
import { Dashboard } from './Dashboard';
import { ClientsPage } from '../clients/ClientsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { DriversPage } from '../drivers/DriversPage';
import { VehiclesPage } from '../vehicles/VehiclesPage';
import { CarriersPage } from '../carriers/CarriersPage';
import { DriverPortal } from '../drivers/DriverPortal';
import { CreateOrderPage, type OrderDetail as CreateOrderDetail } from '../orders/CreateOrderPage';
import { UsersPage } from '../users/UsersPage';
import { NotificationDropdown } from './NotificationDropdown';
import { NotificationToast } from './NotificationToast';
import { ProfilePage } from '../profile/ProfilePage';

type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers' | 'my-orders' | 'order-new' | 'order-edit' | 'users' | 'profile';

type NotifItem = {
  id: string
  type: string
  title: string
  body: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}

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
    main.push({ view: 'dashboard', label: 'Дашборд', Icon: DashboardSpeed02Icon });
  }

  if (isAdmin || isLogist || isManager) {
    main.push({ view: 'orders', label: 'Замовлення', Icon: DeliveryTruck01Icon });
  }

  if (isAdmin || isLogist) {
    main.push({ view: 'clients', label: 'Клієнти', Icon: UserGroupIcon });
  }

  if (isAdmin) {
    main.push({ view: 'carriers', label: 'Перевізники', Icon: Building01Icon });
    main.push({ view: 'users', label: 'Співробітники', Icon: UserEdit01Icon });
  }

  if (isAdmin || isManager) {
    fleet.push({ view: 'drivers', label: 'Водії', Icon: UserAccountIcon });
    fleet.push({ view: 'vehicles', label: 'Транспорт', Icon: TruckIcon });
  }

  main.push({ view: 'profile', label: 'Профіль', Icon: UserCircle02Icon });

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

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${tokens.accessToken}` }), [tokens.accessToken]);

  /* ── Notifications ─────────────────────────────────── */
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [toasts,        setToasts]        = useState<NotifItem[]>([]);

  useEffect(() => {
    type NotifResp = { notifications: NotifItem[]; unreadCount: number }
    apiGetJson<ApiResponse<NotifResp>>('/api/notifications', { headers: authHeaders })
      .then((res) => {
        if (res && 'success' in res && res.success) {
          setNotifications((res as { success: true; data: NotifResp }).data.notifications);
          setUnreadCount((res as { success: true; data: NotifResp }).data.unreadCount);
        }
      })
      .catch(() => { /* bell stays at 0 */ });
  }, [authHeaders]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (n: NotifItem) => {
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((c) => c + 1);
      setToasts((prev) => [...prev.slice(-2), n]);
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, []);

  const markAllRead = useCallback(() => {
    apiPatchJson('/api/notifications/read', { all: true }, { headers: authHeaders })
      .catch(() => { /* ignore */ });
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, [authHeaders]);

  /* ── Exchange rates ────────────────────────────────── */
  type ExRate = { currency: string; rate: number }
  const [exRates, setExRates] = useState<ExRate[]>([])

  useEffect(() => {
    const fetch = () => {
      apiGetJson<ApiResponse<ExRate[]>>('/api/market-data/exchange-rates', { headers: authHeaders })
        .then((res) => { if (isApiSuccess(res)) setExRates(res.data) })
        .catch(() => { /* silently ignore */ })
    }
    fetch()
    const timer = setInterval(fetch, 60 * 60 * 1000)
    return () => clearInterval(timer)
  }, [authHeaders])

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
            {exRates.length > 0 && (
              <div className="crm__rates">
                {(['USD', 'EUR'] as const).map((cc) => {
                  const r = exRates.find((e) => e.currency === cc)
                  if (!r) return null
                  return (
                    <span key={cc} className="crm__rateChip">
                      <span className="crm__rateCc">{cc}</span>
                      <span className="crm__rateVal">{r.rate.toFixed(2)}</span>
                    </span>
                  )
                })}
              </div>
            )}
            {badge && <span className="crm__roleBadge">{badge}</span>}
            <div className="crm__bellWrap">
              <button
                type="button"
                className="crm__iconBtn crm__bellBtn"
                aria-label="Сповіщення"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  if (!notifOpen) markAllRead();
                }}
              >
                <Notification02Icon size={17} strokeWidth={1.6} />
                {unreadCount > 0 && (
                  <span className="crm__bellBadge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationDropdown
                  notifications={notifications.slice(0, 20)}
                  onMarkAllRead={markAllRead}
                  onClose={() => setNotifOpen(false)}
                  onNavigate={(orderId) => {
                    setNotifOpen(false);
                    if (orderId) setView('orders');
                  }}
                />
              )}
            </div>
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
           view === 'users'      ? <UsersPage    tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'my-orders'  ? <DriverPortal tokens={tokens} onUnauthorized={onLogout} /> :
           view === 'order-new'  ? <CreateOrderPage tokens={tokens} onUnauthorized={onLogout}
                                    onSaved={() => setView('orders')}
                                    onCancel={() => setView('orders')} /> :
           view === 'order-edit' && editOrderData ? <CreateOrderPage tokens={tokens} onUnauthorized={onLogout}
                                    editOrder={editOrderData}
                                    onSaved={() => { setEditOrderData(null); setView('orders'); }}
                                    onCancel={() => { setEditOrderData(null); setView('orders'); }} /> :
           view === 'profile'    ? <ProfilePage tokens={tokens} /> :
           null}
        </div>
      </main>
      <NotificationToast
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
        onNavigate={(orderId) => { if (orderId) setView('orders'); }}
      />
    </div>
  );
}
