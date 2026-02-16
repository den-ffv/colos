import express, { type Response } from 'express';
import { prisma } from '../utils/prisma';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import type { OrderStatus } from '@prisma/client';
import { ok } from '../utils/http';

export const dashboardRouter = express.Router();

type PeriodPreset = 'today' | 'week' | 'custom';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfWeekMonday(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildRange(now: Date, preset: PeriodPreset, from?: Date | null, to?: Date | null) {
  if (preset === 'custom' && from && to) {
    return { from, to };
  }
  if (preset === 'week') {
    return { from: startOfDay(addDays(now, -6)), to: now };
  }
  return { from: startOfDay(now), to: now };
}

function previousRange(from: Date, to: Date) {
  const durationMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - durationMs);
  return { from: prevFrom, to: prevTo };
}

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
  kanban: Record<OrderStatus, number>;
  problematic_orders: Array<{
    id: string;
    order_number: string;
    status: OrderStatus;
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

function safeAvg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

dashboardRouter.get('/summary', requireAuth, async (req, res: Response) => {
  const now = new Date();
  const preset = (req.query.period as string | undefined) ?? 'today';
  const period = (preset === 'today' || preset === 'week' || preset === 'custom' ? preset : 'today') as PeriodPreset;
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);

  const range = buildRange(now, period, from, to);
  const prev = previousRange(range.from, range.to);
  const prevEndMs = prev.to.getTime();

  const companyId = (req as AuthenticatedRequest).auth.company_id;

  const activeStatuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_TRANSIT'];

  const [activeNow, vehiclesTotal, activeWithVehicles, currentOrders, previousOrders] = await Promise.all([
    prisma.order.count({ where: { company_id: companyId, status: { in: activeStatuses } } }),
    prisma.vehicle.count({ where: { company_id: companyId } }),
    prisma.order.findMany({
      where: { company_id: companyId, status: { in: activeStatuses }, execution_type: 'INTERNAL', vehicle_id: { not: null } },
      select: { vehicle_id: true },
    }),
    prisma.order.findMany({
      where: { company_id: companyId, created_at: { gte: range.from, lte: range.to } },
      select: {
        id: true,
        order_number: true,
        status: true,
        pickup_date: true,
        delivery_date: true,
        updated_at: true,
        margin_percent: true,
        client_paid: true,
        client_price: true,
      },
    }),
    prisma.order.findMany({
      where: { company_id: companyId, created_at: { gte: prev.from, lte: prev.to } },
      select: {
        status: true,
        pickup_date: true,
        delivery_date: true,
        updated_at: true,
        margin_percent: true,
        client_paid: true,
        client_price: true,
      },
    }),
  ]);

  const uniqueBusyVehicles = new Set(activeWithVehicles.map((x) => x.vehicle_id).filter(Boolean) as string[]);
  const fleetUtilization = vehiclesTotal === 0 ? 0 : (uniqueBusyVehicles.size / vehiclesTotal) * 100;

  const nowMs = now.getTime();
  const overdueCurrent = currentOrders.filter(
    (o) => o.delivery_date && o.delivery_date.getTime() < nowMs && o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
  );
  const overduePrev = previousOrders.filter(
    (o) =>
      o.delivery_date && o.delivery_date.getTime() < prevEndMs && o.status !== 'DELIVERED' && o.status !== 'CANCELLED',
  );

  const deliveredCurrent = currentOrders.filter((o) => o.status === 'DELIVERED' && o.delivery_date);
  const deliveredPrev = previousOrders.filter((o) => o.status === 'DELIVERED' && o.delivery_date);

  // OTD heuristic: consider delivered on-time if the record was marked DELIVERED before planned delivery_date.
  const otdCurrent =
    deliveredCurrent.length === 0
      ? 0
      : (deliveredCurrent.filter((o) => (o.updated_at?.getTime() ?? nowMs) <= (o.delivery_date as Date).getTime()).length /
          deliveredCurrent.length) *
        100;
  const otdPrev =
    deliveredPrev.length === 0
      ? 0
      : (deliveredPrev.filter((o) => (o.updated_at?.getTime() ?? nowMs) <= (o.delivery_date as Date).getTime()).length /
          deliveredPrev.length) *
        100;

  const deliveryHoursCurrent = deliveredCurrent
    .filter((o) => o.delivery_date)
    .map((o) => ((o.delivery_date as Date).getTime() - o.pickup_date.getTime()) / (1000 * 60 * 60));
  const deliveryHoursPrev = deliveredPrev
    .filter((o) => o.delivery_date)
    .map((o) => ((o.delivery_date as Date).getTime() - o.pickup_date.getTime()) / (1000 * 60 * 60));

  const avgDeliveryCurrent = safeAvg(deliveryHoursCurrent);
  const avgDeliveryPrev = safeAvg(deliveryHoursPrev);

  const receivableCurrent = deliveredCurrent.filter((o) => !o.client_paid).reduce((s, o) => s + (o.client_price ?? 0), 0);
  const receivablePrev = deliveredPrev.filter((o) => !o.client_paid).reduce((s, o) => s + (o.client_price ?? 0), 0);

  const marginCurrent = safeAvg(currentOrders.map((o) => o.margin_percent ?? 0));
  const marginPrev = safeAvg(previousOrders.map((o) => o.margin_percent ?? 0));

  const kanban: Record<OrderStatus, number> = {
    NEW: 0,
    CONFIRMED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  for (const o of currentOrders) kanban[o.status] += 1;

  const delayThresholdHours = 4;
  const problematic = currentOrders
    .map((o) => {
      const delayHours =
        o.delivery_date && o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
          ? Math.max(0, (nowMs - o.delivery_date.getTime()) / (1000 * 60 * 60))
          : 0;
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        delay_hours: delayHours,
        margin_percent: o.margin_percent ?? 0,
        client_paid: o.client_paid,
      };
    })
    .filter((o) => o.delay_hours >= delayThresholdHours || o.margin_percent < 0)
    .sort((a, b) => b.delay_hours - a.delay_hours)
    .slice(0, 10)
    .map((o) => ({ ...o, delay_hours: round1(o.delay_hours), margin_percent: round1(o.margin_percent) }));

  const overduePercentOfActive = activeNow === 0 ? 0 : (overdueCurrent.length / activeNow) * 100;
  const indicator: DashboardSummary['sla']['indicator'] =
    overduePercentOfActive < 5 ? 'green' : overduePercentOfActive <= 10 ? 'yellow' : 'red';

  const incidents = {
    sla_breaches: overdueCurrent.length,
    delays_over_n_hours: problematic.filter((o) => o.delay_hours >= delayThresholdHours).length,
    negative_margin: problematic.filter((o) => o.margin_percent < 0).length,
  };

  const summary: DashboardSummary = {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    kpi: {
      active_shipments: { value: activeNow, delta: 0 },
      overdue_shipments: { value: overdueCurrent.length, delta: overdueCurrent.length - overduePrev.length },
      otd_percent: { value: round1(otdCurrent), delta: round1(otdCurrent - otdPrev) },
      avg_delivery_hours: { value: round1(avgDeliveryCurrent), delta: round1(avgDeliveryCurrent - avgDeliveryPrev) },
      fleet_utilization_percent: { value: round1(fleetUtilization), delta: 0 },
      accounts_receivable: { value: Math.round(receivableCurrent), delta: Math.round(receivableCurrent - receivablePrev), currency: 'UAH' },
      margin_percent: { value: round1(marginCurrent), delta: round1(marginCurrent - marginPrev) },
    },
    sla: { overdue_percent_of_active: round1(overduePercentOfActive), indicator },
    kanban,
    problematic_orders: problematic,
    incidents,
  };

  return ok(res, summary);
});

dashboardRouter.get('/stats', requireAuth, async (req, res: Response) => {
  const now = new Date();
  const auth = (req as AuthenticatedRequest).auth;
  const companyId = auth.company_id;

  const fromToday = startOfDay(now);
  const fromWeek = startOfWeekMonday(now);
  const fromMonth = startOfMonth(now);

  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: { has_own_fleet: true, uses_broker_services: true },
  });

  const [totalOrders, ordersToday, ordersThisWeek, ordersThisMonth, byStatus, byExecutionType, revenueToday, revenueWeek, revenueMonth, marginAgg, unpaidAgg] =
    await Promise.all([
      prisma.order.count({ where: { company_id: companyId } }),
      prisma.order.count({ where: { company_id: companyId, created_at: { gte: fromToday, lte: now } } }),
      prisma.order.count({ where: { company_id: companyId, created_at: { gte: fromWeek, lte: now } } }),
      prisma.order.count({ where: { company_id: companyId, created_at: { gte: fromMonth, lte: now } } }),
      prisma.order.groupBy({
        by: ['status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ['execution_type'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: { company_id: companyId, created_at: { gte: fromToday, lte: now } },
        _sum: { client_price: true },
      }),
      prisma.order.aggregate({
        where: { company_id: companyId, created_at: { gte: fromWeek, lte: now } },
        _sum: { client_price: true },
      }),
      prisma.order.aggregate({
        where: { company_id: companyId, created_at: { gte: fromMonth, lte: now } },
        _sum: { client_price: true },
      }),
      prisma.order.aggregate({
        where: { company_id: companyId },
        _sum: { margin: true },
        _avg: { margin: true },
      }),
      prisma.order.aggregate({
        where: { company_id: companyId, client_paid: false },
        _count: { _all: true },
        _sum: { client_price: true },
      }),
    ]);

  const ordersByStatus = {
    new: byStatus.find((x) => x.status === 'NEW')?._count._all ?? 0,
    confirmed: byStatus.find((x) => x.status === 'CONFIRMED')?._count._all ?? 0,
    inTransit: byStatus.find((x) => x.status === 'IN_TRANSIT')?._count._all ?? 0,
    delivered: byStatus.find((x) => x.status === 'DELIVERED')?._count._all ?? 0,
    cancelled: byStatus.find((x) => x.status === 'CANCELLED')?._count._all ?? 0,
  };

  const ordersByExecution = {
    internal: byExecutionType.find((x) => x.execution_type === 'INTERNAL')?._count._all ?? 0,
    external: byExecutionType.find((x) => x.execution_type === 'EXTERNAL')?._count._all ?? 0,
  };

  const response: Record<string, unknown> = {
    totalOrders,
    ordersToday,
    ordersThisWeek,
    ordersThisMonth,
    ordersByStatus,
    ordersByExecutionType: ordersByExecution,
    revenue: {
      today: revenueToday._sum.client_price ?? 0,
      thisWeek: revenueWeek._sum.client_price ?? 0,
      thisMonth: revenueMonth._sum.client_price ?? 0,
    },
    margin: {
      total: marginAgg._sum.margin ?? 0,
      average: marginAgg._avg.margin ?? 0,
    },
    unpaidOrders: unpaidAgg._count._all ?? 0,
    unpaidAmount: unpaidAgg._sum.client_price ?? 0,
  };

  if (company?.has_own_fleet) {
    const [totalDrivers, availableDrivers, totalVehicles, availableVehicles] = await Promise.all([
      prisma.driver.count({ where: { company_id: companyId } }),
      prisma.driver.count({ where: { company_id: companyId, is_available: true } }),
      prisma.vehicle.count({ where: { company_id: companyId } }),
      prisma.vehicle.count({ where: { company_id: companyId, is_available: true } }),
    ]);
    response.ownFleet = { totalDrivers, availableDrivers, totalVehicles, availableVehicles };
  }

  if (company?.uses_broker_services) {
    const [total, available, avgRating] = await Promise.all([
      prisma.carrier.count({ where: { company_id: companyId } }),
      prisma.carrier.count({ where: { company_id: companyId, is_available: true } }),
      prisma.carrier.aggregate({ where: { company_id: companyId }, _avg: { rating: true } }),
    ]);
    response.carriers = { total, available, averageRating: avgRating._avg.rating ?? 0 };
  }

  return ok(res, response);
});
