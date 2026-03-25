import { useMemo, useState } from 'react';
import type { AuthTokens } from '../auth/auth.storage';
import { tryGetEmailFromJwt } from './jwt';
import { Dashboard } from './Dashboard';
import { Button } from '../../ui/Button';
import { ClientsPage } from '../clients/ClientsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { DriversPage } from '../drivers/DriversPage';
import { VehiclesPage } from '../vehicles/VehiclesPage';
import { CarriersPage } from '../carriers/CarriersPage';

type CrmView = 'dashboard' | 'orders' | 'clients' | 'drivers' | 'vehicles' | 'carriers';

export function CrmShell({ tokens, onLogout }: { tokens: AuthTokens; onLogout: () => void }) {
  const [view, setView] = useState<CrmView>('dashboard');
  const email = useMemo(() => tryGetEmailFromJwt(tokens.accessToken), [tokens.accessToken]);

  const title =
    view === 'dashboard'
      ? 'Dashboard'
      : view === 'orders'
        ? 'Orders'
        : view === 'clients'
          ? 'Clients'
          : view === 'drivers'
            ? 'Drivers'
            : view === 'carriers'
              ? 'Carriers'
              : 'Vehicles';

  return (
    <div className="crm">
      <aside className="crm__sidebar">
        <div className="crm__brand">Colos CRM</div>
        <nav className="crm__nav" aria-label="CRM navigation">
          <button
            type="button"
            className={view === 'dashboard' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={view === 'orders' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('orders')}
          >
            Orders
          </button>
          <button
            type="button"
            className={view === 'clients' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('clients')}
          >
            Clients
          </button>
          <button
            type="button"
            className={view === 'drivers' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('drivers')}
          >
            Drivers
          </button>
          <button
            type="button"
            className={view === 'vehicles' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('vehicles')}
          >
            Vehicles
          </button>
          <button
            type="button"
            className={view === 'carriers' ? 'crm__navBtn crm__navBtn--active' : 'crm__navBtn'}
            onClick={() => setView('carriers')}
          >
            Carriers
          </button>
        </nav>
      </aside>

      <main className="crm__main">
        <header className="crm__topbar">
          <h2 className="crm__title">{title}</h2>
          <div className="crm__user">
            <span className="crm__email">{email ?? '—'}</span>
            <Button type="button" variant="ghost" size="sm" className="crm__logout" onClick={onLogout}>
              Вийти
            </Button>
          </div>
        </header>

        <section>
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
        </section>
      </main>
    </div>
  );
}
