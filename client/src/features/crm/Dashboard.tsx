import { useEffect, useMemo, useState } from 'react';
import type { AuthTokens } from '../auth/auth.storage';
import { apiGetJson, type ApiError } from '../../lib/api';
import { tryGetRolesFromJwt } from './jwt';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';

type Period = 'today' | 'week' | 'custom';

type KpiValue = { value: number; delta: number };

type DashboardSummary = {
  period: { from: string; to: string };
  kpi: {
    active_shipments: KpiValue;
    overdue_shipments: KpiValue;
    otd_percent: KpiValue;
    avg_delivery_hours: KpiValue;
    fleet_utilization_percent: KpiValue;
    accounts_receivable: { value: number; delta: number; currency: string };
    margin_percent: KpiValue;
  };
  sla: { overdue_percent_of_active: number; indicator: 'green' | 'yellow' | 'red' };
  kanban: Record<'NEW' | 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED', number>;
  problematic_orders: Array<{
    id: string;
    order_number: string;
    status: 'NEW' | 'CONFIRMED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
    delay_hours: number;
    margin_percent: number;
    client_paid: boolean;
  }>;
  incidents: {
    sla_breaches: number;
    delays_over_n_hours: number;
    negative_margin: number;
  };
};

type ApiResponse<T> = { success: true; data: T } | { success: false; message: string; details?: unknown };

function formatDelta(delta: number, suffix = '') {
  if (!Number.isFinite(delta) || delta === 0) return `0${suffix}`;
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta}${suffix}`;
}

function indicatorLabel(x: DashboardSummary['sla']['indicator']) {
  if (x === 'green') return 'OK';
  if (x === 'yellow') return 'RISK';
  return 'ALERT';
}

export function Dashboard({
  tokens,
  onUnauthorized,
}: {
  tokens: AuthTokens;
  onUnauthorized: () => void;
}) {
  const roles = useMemo(() => tryGetRolesFromJwt(tokens.accessToken), [tokens.accessToken]);
  const showFinance = roles.includes('ADMIN') || roles.includes('MANAGER') || roles.includes('ACCOUNTANT');

  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set('period', period);
    if (period === 'custom' && customFrom && customTo) {
      const fromDate = new Date(customFrom);
      const toDate = new Date(customTo);
      if (!Number.isNaN(fromDate.getTime()) && !Number.isNaN(toDate.getTime())) {
        p.set('from', fromDate.toISOString());
        p.set('to', toDate.toISOString());
      }
    }
    return p.toString();
  }, [period, customFrom, customTo]);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiGetJson<ApiResponse<DashboardSummary>>(`/api/dashboard/summary?${query}`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (res && typeof res === 'object' && 'success' in res && (res as { success: unknown }).success === true) {
        setData((res as ApiResponse<DashboardSummary>).data);
      } else {
        setData(res as unknown as DashboardSummary);
      }
    } catch (err) {
      const apiErr = err as Partial<ApiError>;
      if (apiErr.status === 401) onUnauthorized();
      setError(apiErr.message ?? 'Не вдалося завантажити dashboard');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tokens.accessToken]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tokens.accessToken]);

  const slaClass =
    data?.sla.indicator === 'green' ? 'success' : data?.sla.indicator === 'yellow' ? 'warning' : 'danger';

  return (
    <div className="dash">
      <div className="dash__filters">
        <div className="dash__filter">
          <span className="dash__label">Період</span>
          <div className="dash__seg">
            <button type="button" className={period === 'today' ? 'dash__segBtn dash__segBtn--active' : 'dash__segBtn'} onClick={() => setPeriod('today')}>
              Today
            </button>
            <button type="button" className={period === 'week' ? 'dash__segBtn dash__segBtn--active' : 'dash__segBtn'} onClick={() => setPeriod('week')}>
              Week
            </button>
            <button type="button" className={period === 'custom' ? 'dash__segBtn dash__segBtn--active' : 'dash__segBtn'} onClick={() => setPeriod('custom')}>
              Custom
            </button>
          </div>
        </div>

        {period === 'custom' ? (
          <div className="dash__filter dash__range">
            <label className="dash__rangeItem">
              <span className="dash__label">From</span>
              <input
                className="ui-input dash__input"
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className="dash__rangeItem">
              <span className="dash__label">To</span>
              <input className="ui-input dash__input" type="datetime-local" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        ) : null}

          <div className="dash__actions">
            <Button type="button" variant="secondary" size="sm" className="dash__refresh" onClick={() => void load()} disabled={isLoading}>
              {isLoading ? 'Оновлення…' : 'Оновити'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="dash__export" disabled>
              Export
            </Button>
          </div>
      </div>

      {error ? <div className="dash__error">{error}</div> : null}

      <section className="kpi">
        <div className="kpi__grid">
          <div className="ui-card kpi__card">
            <div className="kpi__head">
              <span className="kpi__name">Активні перевезення</span>
              {data ? (
                <Badge variant={slaClass === 'success' ? 'success' : slaClass === 'warning' ? 'warning' : 'danger'}>
                  SLA {indicatorLabel(data.sla.indicator)}
                </Badge>
              ) : null}
            </div>
            <div className="kpi__value">{data ? data.kpi.active_shipments.value : '—'}</div>
            <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.active_shipments.delta) : '—'}</div>
          </div>

          <div className="ui-card kpi__card">
            <div className="kpi__head">
              <span className="kpi__name">Прострочено</span>
              {data ? <span className="kpi__sub">{data.sla.overdue_percent_of_active}% від активних</span> : null}
            </div>
            <div className="kpi__value">{data ? data.kpi.overdue_shipments.value : '—'}</div>
            <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.overdue_shipments.delta) : '—'}</div>
          </div>

          <div className="ui-card kpi__card">
            <div className="kpi__head">
              <span className="kpi__name">OTD</span>
            </div>
            <div className="kpi__value">{data ? `${data.kpi.otd_percent.value}%` : '—'}</div>
            <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.otd_percent.delta, '%') : '—'}</div>
          </div>

          <div className="ui-card kpi__card">
            <div className="kpi__head">
              <span className="kpi__name">Сер. час доставки</span>
            </div>
            <div className="kpi__value">{data ? `${data.kpi.avg_delivery_hours.value} год` : '—'}</div>
            <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.avg_delivery_hours.delta, ' год') : '—'}</div>
          </div>

          <div className="ui-card kpi__card">
            <div className="kpi__head">
              <span className="kpi__name">Завантаження автопарку</span>
            </div>
            <div className="kpi__value">{data ? `${data.kpi.fleet_utilization_percent.value}%` : '—'}</div>
            <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.fleet_utilization_percent.delta, '%') : '—'}</div>
          </div>

          {showFinance ? (
            <div className="ui-card kpi__card">
              <div className="kpi__head">
                <span className="kpi__name">Дебіторка</span>
              </div>
              <div className="kpi__value">{data ? `${data.kpi.accounts_receivable.value} ${data.kpi.accounts_receivable.currency}` : '—'}</div>
              <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.accounts_receivable.delta) : '—'}</div>
            </div>
          ) : null}

          {showFinance ? (
            <div className="ui-card kpi__card">
              <div className="kpi__head">
                <span className="kpi__name">Маржинальність</span>
              </div>
              <div className="kpi__value">{data ? `${data.kpi.margin_percent.value}%` : '—'}</div>
              <div className="kpi__delta">Δ {data ? formatDelta(data.kpi.margin_percent.delta, '%') : '—'}</div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="ops">
        <div className="ops__grid">
          <div className="ui-card ops__card">
            <div className="ops__title">Операційна панель (канбан-статуси)</div>
            <div className="kanban">
              {(['NEW', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as const).map((s) => (
                <div className="kanban__col" key={s}>
                  <div className="kanban__head">
                    <span className="kanban__name">{s}</span>
                    <span className="kanban__count">{data ? data.kanban[s] : '—'}</span>
                  </div>
                  <div className="kanban__body">{data ? <span className="kanban__hint">Drill-down: буде список</span> : <span className="kanban__hint">—</span>}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="ui-card ops__card">
            <div className="ops__title">Ризики та інциденти</div>
            <div className="inc">
              <div className="inc__row">
                <span>SLA порушення</span>
                <strong>{data ? data.incidents.sla_breaches : '—'}</strong>
              </div>
              <div className="inc__row">
                <span>Затримки &gt; 4 год</span>
                <strong>{data ? data.incidents.delays_over_n_hours : '—'}</strong>
              </div>
              <div className="inc__row">
                <span>Негативна маржа</span>
                <strong>{data ? data.incidents.negative_margin : '—'}</strong>
              </div>
              <div className="inc__hint">Клік → drill-down у рейс (додамо після сторінки Orders).</div>
            </div>
          </div>
        </div>

        <div className="ops__grid">
          <div className="ui-card ops__card">
            <div className="ops__title">Проблемні рейси</div>
            <div className={showFinance ? 'table' : 'table table--compact'}>
              <div className="table__head">
                <div>Номер</div>
                <div>Статус</div>
                <div>Затримка (год)</div>
                {showFinance ? <div>Маржа %</div> : null}
                {showFinance ? <div>Оплата</div> : null}
              </div>
              {data ? (
                data.problematic_orders.length ? (
                  data.problematic_orders.map((o) => (
                    <div className="table__row" key={o.id}>
                      <div className="table__mono">{o.order_number}</div>
                      <div>{o.status}</div>
                      <div>{o.delay_hours}</div>
                      {showFinance ? <div>{o.margin_percent}</div> : null}
                      {showFinance ? <div>{o.client_paid ? 'paid' : 'unpaid'}</div> : null}
                    </div>
                  ))
                ) : (
                  <div className="table__empty">Нема проблемних рейсів для вибраного періоду.</div>
                )
              ) : (
                <div className="table__empty">{isLoading ? 'Завантаження…' : '—'}</div>
              )}
            </div>
          </div>

          <div className="ui-card ops__card">
            <div className="ops__title">Live-трекінг</div>
            <div className="live">
              <div className="live__stub">GPS/ETA ще не інтегровано. Далі: WebSocket або polling по рейсах.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="fin">
        <div className="ui-card fin__card">
          <div className="fin__title">Аналітика та фінанси</div>
          <div className="fin__stub">
            {showFinance ? 'Графіки (revenue/margin/top clients) додамо наступним кроком.' : 'Блок приховано вашою роллю.'}
          </div>
        </div>
      </section>
    </div>
  );
}
