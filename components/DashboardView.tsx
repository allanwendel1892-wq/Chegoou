/**
 * DashboardView.tsx — Painel analítico completo
 *
 * Dependência de gráficos:  npm i recharts
 *
 * Ajustes rápidos (constantes logo abaixo):
 *  - FUSO: fuso horário usado para dias/horas (o banco guarda em UTC).
 *  - STATUS_EXCLUIDOS: status que NÃO contam como venda.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bike, Calendar, Clock, Crown,
  DollarSign, Filter, Loader2, MapPin, Minus, Package, Receipt, RotateCcw,
  ShoppingBag, Store, TrendingDown, TrendingUp, UserCheck, Users,
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, BarChart, Bar, Line, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { supabase } from '../services/supabaseClient';

/* ============================== CONFIG ============================== */

const FUSO = 'America/Fortaleza'; // UTC-3 (21h no banco = 18h local)
const STATUS_EXCLUIDOS = ['cancelled', 'canceled', 'cancelado', 'cancelada', 'rejected', 'rejeitado'];
const COLORS = ['#dc2626', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface DashboardViewProps {
  companyId: string;
}

/* ============================== HELPERS ============================== */

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number, d = 0) => (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n: number, d = 1) => `${num(n, d)}%`;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const trunc = (s: string, n = 22) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const dtf = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localParts(d: Date) {
  const p = dtf.formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  return {
    dateKey: `${g('year')}-${g('month')}-${g('day')}`,
    hour: parseInt(g('hour'), 10) % 24,
    weekday: WD[g('weekday').slice(0, 3)] ?? 0,
  };
}
const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const weekdayOf = (key: string) => new Date(key + 'T12:00:00Z').getUTCDay();
const fmtDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
const shortDate = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

const parseJson = (v: any) => {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
};
const phoneKey = (p: any) => {
  let d = String(p ?? '').replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length >= 8 ? d.slice(-11) : '';
};
const normKey = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

async function fetchAll(table: string, companyId: string) {
  const PAGE = 1000;
  let from = 0;
  const rows: any[] = [];
  // paginação: o Supabase limita 1000 linhas por requisição
  while (true) {
    const { data, error } = await supabase
      .from(table).select('*').eq('companyId', companyId)
      .order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

/* ============================== ESTATÍSTICA ============================== */

interface Reg { slope: number; intercept: number; r2: number; t: number; mean: number; n: number }

function linReg(xs: number[], ys: number[]): Reg | null {
  const n = xs.length;
  if (n < 5) return null;
  const mx = sum(xs) / n, my = sum(ys) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const r2 = syy > 0 ? 1 - ssRes / syy : 0;
  const se = Math.sqrt(ssRes / (n - 2) / sxx);
  const t = se > 0 ? slope / se : slope === 0 ? 0 : Math.sign(slope) * 99;
  return { slope, intercept, r2, t, mean: my, n };
}

function classify(reg: Reg | null) {
  if (!reg || reg.mean === 0) {
    return { key: 'na', label: 'Dados insuficientes', cls: 'bg-gray-100 text-gray-600', weekly: 0, Icon: Minus };
  }
  const weekly = ((reg.slope * 7) / reg.mean) * 100;
  const totalChange = (reg.slope * (reg.n - 1)) / reg.mean;
  if (Math.abs(reg.t) < 2 || Math.abs(totalChange) < 0.1) {
    return { key: 'flat', label: 'Estacionado', cls: 'bg-amber-100 text-amber-700', weekly, Icon: Minus };
  }
  return reg.slope > 0
    ? { key: 'up', label: 'Tendência de alta', cls: 'bg-green-100 text-green-700', weekly, Icon: TrendingUp }
    : { key: 'down', label: 'Tendência de baixa', cls: 'bg-red-100 text-red-700', weekly, Icon: TrendingDown };
}

function descStats(values: number[]) {
  if (!values.length) return { mean: 0, median: 0, std: 0, cv: 0, max: 0, min: 0 };
  const mean = sum(values) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const std = Math.sqrt(sum(values.map(v => (v - mean) ** 2)) / values.length);
  return { mean, median, std, cv: mean > 0 ? (std / mean) * 100 : 0, max: sorted[sorted.length - 1], min: sorted[0] };
}

/* ============================== TIPOS ============================== */

interface POrder {
  id: string;
  total: number;
  subtotal: number;
  status: string;
  dateKey: string;
  hour: number;
  weekday: number;
  items: any[];
  neighKey: string;
  neighLabel: string;
  method: 'delivery' | 'pickup' | 'outro';
  name: string;
  phoneRaw: string;
  pKey: string;
}

/* ============================== UI BÁSICA ============================== */

const Card: React.FC<{ title?: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> =
  ({ title, subtitle, right, children, className = '' }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border border-gray-100 ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-base font-semibold text-gray-800">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );

const Empty = ({ text = 'Sem dados para o filtro selecionado.' }) => (
  <div className="py-10 text-center text-sm text-gray-400">{text}</div>
);

const Delta = ({ cur, prev }: { cur: number; prev: number | null }) => {
  if (prev === null || prev === 0) return null;
  const d = ((cur - prev) / prev) * 100;
  const up = d >= 0;
  return (
    <div className={`flex items-center mt-3 text-xs font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      {up ? <ArrowUpRight className="w-4 h-4 mr-0.5" /> : <ArrowDownRight className="w-4 h-4 mr-0.5" />}
      {up ? '+' : ''}{num(d, 1)}%
      <span className="text-gray-400 ml-1 font-normal">vs. período anterior</span>
    </div>
  );
};

const Kpi = ({ title, value, icon: Icon, color, cur, prev, hint }: any) => (
  <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
      <div className={`p-2.5 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
    </div>
    {cur !== undefined && <Delta cur={cur} prev={prev} />}
  </div>
);

const Donut = ({ data, fmt = (v: number) => num(v), height = 260 }: { data: { name: string; value: number }[]; fmt?: (v: number) => string; height?: number }) => {
  if (!data.length || sum(data.map(d => d.value)) === 0) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: any) => fmt(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

const Select = ({ value, onChange, children, icon: Icon }: any) => (
  <div className="flex items-center gap-2">
    {Icon && <Icon className="w-4 h-4 text-gray-400" />}
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer max-w-[220px]"
    >
      {children}
    </select>
  </div>
);

const TrendCard = ({ title, reg, fmt, unitLabel }: { title: string; reg: Reg | null; fmt: (v: number) => string; unitLabel: string }) => {
  const c = classify(reg);
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.cls}`}>
          <c.Icon className="w-3.5 h-3.5" /> {c.label}
        </span>
      </div>
      {reg ? (
        <>
          <p className="text-2xl font-bold text-gray-900 mt-2">
            {c.weekly >= 0 ? '+' : ''}{num(c.weekly, 1)}% <span className="text-sm font-normal text-gray-400">por semana</span>
          </p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-gray-500">
            <div><p className="text-gray-400">Inclinação</p><p className="font-semibold text-gray-700">{reg.slope >= 0 ? '+' : ''}{fmt(reg.slope)}/{unitLabel}</p></div>
            <div><p className="text-gray-400">R²</p><p className="font-semibold text-gray-700">{num(reg.r2, 2)}</p></div>
            <div><p className="text-gray-400">Estat. t</p><p className="font-semibold text-gray-700">{num(reg.t, 1)}</p></div>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400 mt-3">Período curto demais (mínimo 5 dias).</p>
      )}
    </div>
  );
};

/* ============================== PERÍODOS ============================== */

const PERIODOS = [
  { v: '7d', l: 'Últimos 7 dias' },
  { v: '15d', l: 'Últimos 15 dias' },
  { v: '30d', l: 'Últimos 30 dias' },
  { v: '90d', l: 'Últimos 90 dias' },
  { v: 'month', l: 'Este mês' },
  { v: 'lastMonth', l: 'Mês passado' },
  { v: 'all', l: 'Todo o período' },
];

function getRange(p: string, today: string): { start: string | null; end: string } {
  switch (p) {
    case '7d': return { start: addDays(today, -6), end: today };
    case '15d': return { start: addDays(today, -14), end: today };
    case '30d': return { start: addDays(today, -29), end: today };
    case '90d': return { start: addDays(today, -89), end: today };
    case 'month': return { start: today.slice(0, 8) + '01', end: today };
    case 'lastMonth': {
      const end = addDays(today.slice(0, 8) + '01', -1);
      return { start: end.slice(0, 8) + '01', end };
    }
    default: return { start: null, end: today };
  }
}

/* ============================== COMPONENTE ============================== */

type Tab = 'resumo' | 'produtos' | 'horarios' | 'bairros' | 'clientes';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'resumo', label: 'Resumo & Tendência', icon: Activity },
  { id: 'produtos', label: 'Produtos & Sabores', icon: Package },
  { id: 'horarios', label: 'Horários de Pico', icon: Clock },
  { id: 'bairros', label: 'Bairros', icon: MapPin },
  { id: 'clientes', label: 'Clientes', icon: Users },
];

const DashboardView: React.FC<DashboardViewProps> = ({ companyId }) => {
  const [rawOrders, setRawOrders] = useState<any[]>([]);
  const [rawUsers, setRawUsers] = useState<any[]>([]);
  const [usersWarning, setUsersWarning] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<Tab>('resumo');
  const [periodo, setPeriodo] = useState('30d');
  const [metodo, setMetodo] = useState('all');
  const [bairro, setBairro] = useState('all');

  const [selProduct, setSelProduct] = useState('all');
  const [selGroup, setSelGroup] = useState('');
  const [prodMetric, setProdMetric] = useState<'qty' | 'revenue'>('qty');
  const [custMetric, setCustMetric] = useState<'spent' | 'orders'>('spent');

  /* ---------- Carga de dados (sempre filtrada por companyId) ---------- */
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setUsersWarning('');
      try {
        const orders = await fetchAll('orders', companyId);
        if (!cancelled) setRawOrders(orders);
      } catch (e: any) {
        console.error('Erro ao carregar pedidos:', e);
        if (!cancelled) setError('Não foi possível carregar os pedidos.');
      }
      try {
        const users = await fetchAll('users', companyId);
        if (!cancelled) setRawUsers(users);
      } catch (e: any) {
        console.error('Erro ao carregar users:', e);
        if (!cancelled) {
          setRawUsers([]);
          setUsersWarning('Não foi possível ler a tabela users filtrando por companyId. Confirme se ela possui essa coluna.');
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const today = useMemo(() => localParts(new Date()).dateKey, []);

  /* ---------- Normalização dos pedidos ---------- */
  const prepared: POrder[] = useMemo(() => {
    return rawOrders
      .map((o: any): POrder | null => {
        const d = new Date(o.timestamp);
        if (isNaN(d.getTime())) return null;
        const lp = localParts(d);
        const items = parseJson(o.items);
        const addr = parseJson(o.pickupAddress) || {};
        const neighRaw = String(addr.neighborhood ?? '').trim();
        const m = String(o.deliveryMethod ?? '').toLowerCase();
        const method: POrder['method'] =
          m.includes('pickup') || m.includes('retirada') ? 'pickup'
            : m.includes('delivery') || m.includes('entrega') ? 'delivery' : 'outro';
        return {
          id: String(o.id),
          total: Number(o.total) || 0,
          subtotal: Number(o.subtotal) || 0,
          status: String(o.status ?? '').toLowerCase(),
          dateKey: lp.dateKey,
          hour: lp.hour,
          weekday: lp.weekday,
          items: Array.isArray(items) ? items : [],
          neighKey: neighRaw ? normKey(neighRaw) : '__none__',
          neighLabel: neighRaw || 'Não informado',
          method,
          name: String(o.customerName ?? '').trim(),
          phoneRaw: String(o.customerPhone ?? ''),
          pKey: phoneKey(o.customerPhone),
        };
      })
      .filter((o): o is POrder => o !== null);
  }, [rawOrders]);

  const base = useMemo(() => prepared.filter(o => !STATUS_EXCLUIDOS.includes(o.status)), [prepared]);

  const bairrosDisponiveis = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    base.forEach(o => {
      if (o.neighKey === '__none__') return;
      const cur = m.get(o.neighKey) || { label: o.neighLabel, n: 0 };
      cur.n += 1;
      m.set(o.neighKey, cur);
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ key: k, label: v.label }));
  }, [base]);

  /* ---------- Filtros ---------- */
  const range = useMemo(() => getRange(periodo, today), [periodo, today]);

  const matchDim = (o: POrder) =>
    (metodo === 'all' || o.method === metodo) && (bairro === 'all' || o.neighKey === bairro);

  const current = useMemo(
    () => base.filter(o => matchDim(o) && (!range.start || o.dateKey >= range.start) && o.dateKey <= range.end),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, range, metodo, bairro],
  );

  const previous = useMemo(() => {
    if (!range.start) return null;
    const len = daysBetween(range.start, range.end) + 1;
    const ps = addDays(range.start, -len);
    const pe = addDays(range.start, -1);
    return base.filter(o => matchDim(o) && o.dateKey >= ps && o.dateKey <= pe);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, range, metodo, bairro]);

  const summarize = (list: POrder[]) => {
    const revenue = sum(list.map(o => o.total));
    const count = list.length;
    const customers = new Set(list.map(o => o.pKey).filter(Boolean)).size;
    return { revenue, count, ticket: count ? revenue / count : 0, customers };
  };
  const cur = useMemo(() => summarize(current), [current]);
  const prev = useMemo(() => (previous ? summarize(previous) : null), [previous]);

  /* ---------- Série diária + tendência ---------- */
  const trend = useMemo(() => {
    let start = range.start;
    if (!start) start = current.length ? current.reduce((m, o) => (o.dateKey < m ? o.dateKey : m), current[0].dateKey) : today;
    const days: string[] = [];
    for (let d = start; d <= range.end; d = addDays(d, 1)) days.push(d);

    const map = new Map<string, { revenue: number; orders: number }>();
    current.forEach(o => {
      const c = map.get(o.dateKey) || { revenue: 0, orders: 0 };
      c.revenue += o.total; c.orders += 1;
      map.set(o.dateKey, c);
    });

    const rows: any[] = days.map((d, i) => {
      const v = map.get(d) || { revenue: 0, orders: 0 };
      return { date: d, label: shortDate(d), revenue: v.revenue, orders: v.orders, ticket: v.orders ? v.revenue / v.orders : 0, idx: i };
    });
    rows.forEach((r, i) => {
      const w = rows.slice(Math.max(0, i - 6), i + 1);
      r.ma7 = sum(w.map((x: any) => x.revenue)) / w.length;
    });

    // O dia de hoje é parcial: fica fora do cálculo da regressão para não puxar a curva para baixo
    const useIdx = rows.filter((r, i) => !(r.date === today && i === rows.length - 1 && rows.length > 8)).map((r: any) => r.idx);
    const regRev = linReg(useIdx, useIdx.map(i => rows[i].revenue));
    const regOrd = linReg(useIdx, useIdx.map(i => rows[i].orders));
    const tIdx = useIdx.filter(i => rows[i].orders > 0);
    const regTicket = linReg(tIdx, tIdx.map(i => rows[i].ticket));

    if (regRev) rows.forEach(r => { r.trend = Math.max(0, regRev.intercept + regRev.slope * r.idx); });

    if (regRev && range.end === today && rows.length >= 7) {
      rows[rows.length - 1].forecast = rows[rows.length - 1].trend;
      for (let k = 1; k <= 7; k++) {
        const i = rows.length - 1 + k;
        const d = addDays(rows[rows.length - 1].date, k);
        rows.push({ date: d, label: shortDate(d), forecast: Math.max(0, regRev.intercept + regRev.slope * i), idx: i });
      }
    }

    const dayRevenues = days.map((d, i) => rows[i].revenue);
    const stats = descStats(dayRevenues);
    const best = rows.slice(0, days.length).reduce((b: any, r: any) => (!b || r.revenue > b.revenue ? r : b), null);
    const worst = rows.slice(0, days.length).reduce((b: any, r: any) => (!b || r.revenue < b.revenue ? r : b), null);

    return { rows, days, regRev, regOrd, regTicket, stats, best, worst };
  }, [current, range, today]);

  /* ---------- Dia da semana / hora ---------- */
  const weekdayData = useMemo(() => {
    const occ = Array(7).fill(0);
    trend.days.forEach(d => { occ[weekdayOf(d)] += 1; });
    const arr = DIAS_SEMANA.map((n, i) => ({ name: n, pedidos: 0, receita: 0, mediaPedidos: 0, mediaReceita: 0 }));
    current.forEach(o => { arr[o.weekday].pedidos += 1; arr[o.weekday].receita += o.total; });
    arr.forEach((a, i) => {
      a.mediaPedidos = occ[i] ? a.pedidos / occ[i] : 0;
      a.mediaReceita = occ[i] ? a.receita / occ[i] : 0;
    });
    return arr;
  }, [current, trend.days]);

  const hourData = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, '0')}h`, h, pedidos: 0, receita: 0 }));
    current.forEach(o => { arr[o.hour].pedidos += 1; arr[o.hour].receita += o.total; });
    return arr;
  }, [current]);

  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    current.forEach(o => { grid[o.weekday][o.hour] += 1; });
    return { grid, max: Math.max(1, ...grid.flat()) };
  }, [current]);

  const peakHours = useMemo(
    () => [...hourData].filter(h => h.pedidos > 0).sort((a, b) => b.pedidos - a.pedidos).slice(0, 3),
    [hourData],
  );

  /* ---------- Produtos / grupos / sabores ---------- */
  const buildOptionStats = (orders: POrder[], product: string) => {
    const groups: Record<string, Record<string, { qty: number; revenue: number }>> = {};
    orders.forEach(o => o.items.forEach((it: any) => {
      if (product !== 'all' && it.productName !== product) return;
      const qty = Number(it.quantity) || 1;
      (it.selectedOptions ?? it.options ?? []).forEach((op: any) => {
        const g = String(op.groupName ?? 'Sem grupo');
        const name = String(op.optionName ?? op.name ?? '—');
        groups[g] = groups[g] || {};
        const c = groups[g][name] || { qty: 0, revenue: 0 };
        c.qty += qty;
        c.revenue += (Number(op.price) || 0) * qty;
        groups[g][name] = c;
      });
    }));
    return Object.entries(groups)
      .map(([g, opts]) => ({
        name: g,
        total: sum(Object.values(opts).map(o => o.qty)),
        options: Object.entries(opts).map(([n, v]) => ({ name: n, ...v })).sort((a, b) => b.qty - a.qty),
      }))
      .sort((a, b) => b.total - a.total);
  };

  const products = useMemo(() => {
    const m: Record<string, { name: string; qty: number; revenue: number; orders: number }> = {};
    current.forEach(o => {
      const seen = new Set<string>();
      o.items.forEach((it: any) => {
        const name = String(it.productName ?? 'Sem nome');
        const qty = Number(it.quantity) || 1;
        const optsExtra = sum((it.selectedOptions ?? it.options ?? []).map((op: any) => Number(op.price) || 0));
        const rev = ((Number(it.price) || 0) + optsExtra) * qty;
        const c = m[name] || { name, qty: 0, revenue: 0, orders: 0 };
        c.qty += qty; c.revenue += rev;
        if (!seen.has(name)) { c.orders += 1; seen.add(name); }
        m[name] = c;
      });
    });
    return Object.values(m).sort((a, b) => (prodMetric === 'qty' ? b.qty - a.qty : b.revenue - a.revenue));
  }, [current, prodMetric]);

  const groupStats = useMemo(() => buildOptionStats(current, selProduct), [current, selProduct]);
  const effectiveGroup = groupStats.find(g => g.name === selGroup)?.name ?? groupStats[0]?.name ?? '';
  const activeGroup = groupStats.find(g => g.name === effectiveGroup);
  const globalGroupStats = useMemo(() => buildOptionStats(current, 'all'), [current]);

  /* ---------- Bairros ---------- */
  const neighborhoods = useMemo(() => {
    const m: Record<string, { name: string; pedidos: number; receita: number }> = {};
    current.forEach(o => {
      const c = m[o.neighKey] || { name: o.neighLabel, pedidos: 0, receita: 0 };
      c.pedidos += 1; c.receita += o.total;
      m[o.neighKey] = c;
    });
    return Object.values(m)
      .map(n => ({ ...n, ticket: n.pedidos ? n.receita / n.pedidos : 0 }))
      .sort((a, b) => b.pedidos - a.pedidos);
  }, [current]);

  /* ---------- Entrega x retirada ---------- */
  const methodData = useMemo(() => {
    const m = { delivery: { n: 0, rev: 0 }, pickup: { n: 0, rev: 0 }, outro: { n: 0, rev: 0 } };
    current.forEach(o => { m[o.method].n += 1; m[o.method].rev += o.total; });
    return m;
  }, [current]);

  /* ---------- Clientes ---------- */
  const customers = useMemo(() => {
    // Histórico completo (todos os pedidos válidos) para medir conversão de cadastros
    const all = new Map<string, { name: string; phone: string; orders: number; first: string }>();
    base.forEach(o => {
      if (!o.pKey) return;
      const c = all.get(o.pKey) || { name: o.name, phone: o.phoneRaw, orders: 0, first: o.dateKey };
      c.orders += 1;
      if (o.dateKey < c.first) c.first = o.dateKey;
      if (!c.name && o.name) c.name = o.name;
      all.set(o.pKey, c);
    });

    const userMap = new Map<string, any>();
    rawUsers.forEach(u => { const k = phoneKey(u.phone); if (k) userMap.set(k, u); });
    const registered = userMap.size;
    const registeredBuyers = [...userMap.keys()].filter(k => all.has(k)).length;
    const buyersNoRegistration = [...all.keys()].filter(k => !userMap.has(k)).length;
    const repeat = [...all.values()].filter(c => c.orders >= 2).length;

    const freq = [
      { name: '1 pedido', value: 0 }, { name: '2 pedidos', value: 0 },
      { name: '3–4 pedidos', value: 0 }, { name: '5+ pedidos', value: 0 },
    ];
    all.forEach(c => {
      if (c.orders === 1) freq[0].value++;
      else if (c.orders === 2) freq[1].value++;
      else if (c.orders <= 4) freq[2].value++;
      else freq[3].value++;
    });

    // Ranking no período filtrado
    const rank = new Map<string, { name: string; phone: string; orders: number; spent: number; last: string }>();
    current.forEach(o => {
      if (!o.pKey) return;
      const c = rank.get(o.pKey) || { name: o.name, phone: o.phoneRaw, orders: 0, spent: 0, last: o.dateKey };
      c.orders += 1; c.spent += o.total;
      if (o.dateKey > c.last) c.last = o.dateKey;
      if (!c.name && o.name) c.name = o.name;
      rank.set(o.pKey, c);
    });
    const ranking = [...rank.values()]
      .map(c => ({ ...c, ticket: c.orders ? c.spent / c.orders : 0 }))
      .sort((a, b) => (custMetric === 'spent' ? b.spent - a.spent : b.orders - a.orders))
      .slice(0, 10);

    // Cadastros x primeiros pedidos por mês
    const monthly: Record<string, { mes: string; cadastros: number; primeirosPedidos: number }> = {};
    const ensure = (mk: string) => (monthly[mk] = monthly[mk] || { mes: mk, cadastros: 0, primeirosPedidos: 0 });
    let hasDates = false;
    userMap.forEach(u => {
      const raw = u.created_at ?? u.createdAt;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      hasDates = true;
      ensure(localParts(d).dateKey.slice(0, 7)).cadastros += 1;
    });
    all.forEach(c => { ensure(c.first.slice(0, 7)).primeirosPedidos += 1; });
    const monthlyArr = Object.values(monthly)
      .sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12)
      .map(m => ({ ...m, label: `${m.mes.slice(5)}/${m.mes.slice(2, 4)}` }));

    return {
      registered, registeredBuyers, buyersNoRegistration, repeat,
      totalBuyers: all.size,
      conversion: registered ? (registeredBuyers / registered) * 100 : 0,
      repeatRate: all.size ? (repeat / all.size) * 100 : 0,
      freq, ranking, monthly: monthlyArr, hasDates,
      ordersNoPhone: base.filter(o => !o.pKey).length,
    };
  }, [base, current, rawUsers, custMetric]);

  /* ---------- Insights automáticos ---------- */
  const insights = useMemo(() => {
    const list: { icon: any; title: string; text: string; color: string }[] = [];
    const c = classify(trend.regRev);
    list.push({
      icon: c.Icon, title: 'Tendência do faturamento', color: c.cls,
      text: trend.regRev ? `${c.label} (${c.weekly >= 0 ? '+' : ''}${num(c.weekly, 1)}% por semana).` : 'Período curto demais para calcular.',
    });
    if (products[0]) list.push({ icon: Package, title: 'Produto mais vendido', color: 'bg-blue-100 text-blue-700', text: `${products[0].name} — ${num(products[0].qty)} un. / ${brl(products[0].revenue)}.` });
    const gTop = globalGroupStats[0];
    if (gTop?.options[0]) list.push({ icon: Crown, title: `Top em “${gTop.name}”`, color: 'bg-amber-100 text-amber-700', text: `${gTop.options[0].name} — ${num(gTop.options[0].qty)} un.` });
    if (peakHours[0]) list.push({ icon: Clock, title: 'Horário de pico', color: 'bg-purple-100 text-purple-700', text: `${peakHours[0].hora} é o horário com mais pedidos (${num(peakHours[0].pedidos)}).` });
    const nTop = neighborhoods.find(n => n.name !== 'Não informado');
    if (nTop) list.push({ icon: MapPin, title: 'Bairro que mais compra', color: 'bg-green-100 text-green-700', text: `${nTop.name} — ${num(nTop.pedidos)} pedidos, ticket ${brl(nTop.ticket)}.` });
    const bestDay = [...weekdayData].sort((a, b) => b.mediaReceita - a.mediaReceita)[0];
    if (bestDay && bestDay.mediaReceita > 0) list.push({ icon: Calendar, title: 'Melhor dia da semana', color: 'bg-pink-100 text-pink-700', text: `${bestDay.name} — média de ${brl(bestDay.mediaReceita)} por dia.` });
    return list;
  }, [trend, products, globalGroupStats, peakHours, neighborhoods, weekdayData]);

  const resetFilters = () => { setPeriodo('30d'); setMetodo('all'); setBairro('all'); };

  /* ============================== RENDER ============================== */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }
  if (error) {
    return <div className="p-6 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm">{error}</div>;
  }

  const moneyTip = (v: any) => brl(Number(v));

  return (
    <div className="space-y-6">
      {/* Cabeçalho + filtros */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-50 rounded-lg"><Activity className="w-6 h-6 text-red-600" /></div>
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Painel Analítico</h2>
              <p className="text-xs text-gray-500">
                {range.start ? `${fmtDate(range.start)} a ${fmtDate(range.end)}` : 'Todo o histórico'} · {num(cur.count)} pedidos válidos
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Filter className="w-4 h-4 text-gray-400" />
            <Select value={periodo} onChange={setPeriodo} icon={Calendar}>
              {PERIODOS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
            </Select>
            <Select value={metodo} onChange={setMetodo} icon={Bike}>
              <option value="all">Entrega + Retirada</option>
              <option value="delivery">Somente entrega</option>
              <option value="pickup">Somente retirada</option>
            </Select>
            <Select value={bairro} onChange={setBairro} icon={MapPin}>
              <option value="all">Todos os bairros</option>
              {bairrosDisponiveis.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </Select>
            <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> Limpar
            </button>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto border-t border-gray-100 pt-3">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-red-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============ RESUMO ============ */}
      {tab === 'resumo' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Faturamento" value={brl(cur.revenue)} icon={DollarSign} color="bg-green-50 text-green-600" cur={cur.revenue} prev={prev?.revenue ?? null} />
            <Kpi title="Pedidos fechados" value={num(cur.count)} icon={ShoppingBag} color="bg-blue-50 text-blue-600" cur={cur.count} prev={prev?.count ?? null} />
            <Kpi title="Ticket médio" value={brl(cur.ticket)} icon={Receipt} color="bg-purple-50 text-purple-600" cur={cur.ticket} prev={prev?.ticket ?? null} />
            <Kpi title="Clientes ativos" value={num(cur.customers)} icon={Users} color="bg-amber-50 text-amber-600" cur={cur.customers} prev={prev?.customers ?? null} hint="telefones distintos no período" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {insights.map((i, k) => (
              <div key={k} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-start gap-3">
                <div className={`p-2 rounded-lg ${i.color}`}><i.icon className="w-5 h-5" /></div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{i.title}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{i.text}</p>
                </div>
              </div>
            ))}
          </div>

          <Card
            title="Faturamento diário e curva de tendência"
            subtitle="Barras = faturamento do dia · linha vermelha = média móvel 7 dias · tracejada = regressão linear · pontilhada = projeção de 7 dias. O dia de hoje (parcial) não entra no cálculo."
          >
            {trend.rows.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={trend.rows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${num(v)}`} width={70} />
                  <Tooltip formatter={moneyTip} labelFormatter={(_, p: any) => (p?.[0]?.payload?.date ? fmtDate(p[0].payload.date) : '')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" name="Faturamento" fill="#fca5a5" radius={[3, 3, 0, 0]} />
                  <Line dataKey="ma7" name="Média móvel 7d" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line dataKey="trend" name="Tendência (regressão)" stroke="#1f2937" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                  <Line dataKey="forecast" name="Projeção 7 dias" stroke="#3b82f6" strokeWidth={2} strokeDasharray="2 4" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TrendCard title="Faturamento" reg={trend.regRev} fmt={brl} unitLabel="dia" />
            <TrendCard title="Volume de pedidos" reg={trend.regOrd} fmt={v => num(v, 2)} unitLabel="dia" />
            <TrendCard title="Ticket médio" reg={trend.regTicket} fmt={brl} unitLabel="dia" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Estatística do faturamento diário" className="lg:col-span-1">
              <dl className="text-sm divide-y divide-gray-100">
                {[
                  ['Média diária', brl(trend.stats.mean)],
                  ['Mediana', brl(trend.stats.median)],
                  ['Desvio padrão', brl(trend.stats.std)],
                  ['Coef. de variação', pct(trend.stats.cv)],
                  ['Melhor dia', trend.best ? `${fmtDate(trend.best.date)} · ${brl(trend.best.revenue)}` : '-'],
                  ['Pior dia', trend.worst ? `${fmtDate(trend.worst.date)} · ${brl(trend.worst.revenue)}` : '-'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-2"><dt className="text-gray-500">{k}</dt><dd className="font-semibold text-gray-800 text-right">{v}</dd></div>
                ))}
              </dl>
              <p className="text-xs text-gray-400 mt-3">
                Coeficiente de variação alto = faturamento instável de um dia para o outro.
              </p>
            </Card>

            <Card title="Entrega x Retirada" subtitle="Proporção de pedidos" className="lg:col-span-1">
              <Donut
                data={[
                  { name: 'Entrega', value: methodData.delivery.n },
                  { name: 'Retirada', value: methodData.pickup.n },
                  ...(methodData.outro.n ? [{ name: 'Outro', value: methodData.outro.n }] : []),
                ]}
              />
            </Card>

            <Card title="Comparativo por modalidade" className="lg:col-span-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 text-xs uppercase">
                    <th className="py-2"></th><th>Pedidos</th><th>Receita</th><th>Ticket</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {([['Entrega', Bike, methodData.delivery], ['Retirada', Store, methodData.pickup]] as any[]).map(([label, Icon, d]) => (
                    <tr key={label}>
                      <td className="py-3 font-medium text-gray-700"><span className="inline-flex items-center gap-1.5"><Icon className="w-4 h-4 text-gray-400" />{label}</span></td>
                      <td>{num(d.n)}</td>
                      <td>{brl(d.rev)}</td>
                      <td>{brl(d.n ? d.rev / d.n : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-3">
                Entrega: {pct(cur.count ? (methodData.delivery.n / cur.count) * 100 : 0)} · Retirada: {pct(cur.count ? (methodData.pickup.n / cur.count) * 100 : 0)}
              </p>
            </Card>
          </div>
        </>
      )}

      {/* ============ PRODUTOS ============ */}
      {tab === 'produtos' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card
              className="lg:col-span-2"
              title="Produtos mais vendidos"
              subtitle="Top 10 do período filtrado"
              right={
                <Select value={prodMetric} onChange={setProdMetric}>
                  <option value="qty">Por quantidade</option>
                  <option value="revenue">Por faturamento</option>
                </Select>
              }
            >
              {products.length ? (
                <ResponsiveContainer width="100%" height={Math.max(260, Math.min(products.length, 10) * 36)}>
                  <BarChart data={products.slice(0, 10).map(p => ({ ...p, label: trunc(p.name, 28) }))} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => (prodMetric === 'revenue' ? `R$${num(v)}` : num(v))} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: any) => (prodMetric === 'revenue' ? brl(Number(v)) : `${num(Number(v))} un.`)} />
                    <Bar dataKey={prodMetric} name={prodMetric === 'qty' ? 'Unidades' : 'Faturamento'} radius={[0, 4, 4, 0]}>
                      {products.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <Empty />}
            </Card>

            <Card title="Participação dos produtos" subtitle={prodMetric === 'qty' ? 'Em unidades' : 'Em faturamento'}>
              <Donut
                data={products.slice(0, 8).map(p => ({ name: trunc(p.name, 20), value: prodMetric === 'qty' ? p.qty : p.revenue }))}
                fmt={v => (prodMetric === 'qty' ? num(v) : brl(v))}
                height={320}
              />
            </Card>
          </div>

          <Card title="Tabela de produtos" subtitle="Faturamento estimado = (preço + adicionais) × quantidade">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr><th className="p-3">#</th><th className="p-3">Produto</th><th className="p-3">Unidades</th><th className="p-3">Pedidos com o item</th><th className="p-3">Faturamento</th><th className="p-3">% unid.</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.slice(0, 15).map((p, i) => (
                    <tr key={p.name} className="hover:bg-gray-50">
                      <td className="p-3 text-gray-400">{i + 1}</td>
                      <td className="p-3 font-medium text-gray-800">{p.name}</td>
                      <td className="p-3">{num(p.qty)}</td>
                      <td className="p-3">{num(p.orders)}</td>
                      <td className="p-3">{brl(p.revenue)}</td>
                      <td className="p-3">{pct(sum(products.map(x => x.qty)) ? (p.qty / sum(products.map(x => x.qty))) * 100 : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!products.length && <Empty />}
            </div>
          </Card>

          <Card
            title="Grupos e sabores"
            subtitle="Escolha o produto e o grupo para ver quais opções (sabores, bordas, adicionais) mais saem"
            right={
              <div className="flex flex-wrap gap-3">
                <Select value={selProduct} onChange={(v: string) => { setSelProduct(v); setSelGroup(''); }} icon={Package}>
                  <option value="all">Todos os produtos</option>
                  {[...products].sort((a, b) => a.name.localeCompare(b.name)).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </Select>
                <Select value={effectiveGroup} onChange={setSelGroup}>
                  {groupStats.map(g => <option key={g.name} value={g.name}>{g.name}</option>)}
                </Select>
              </div>
            }
          >
            {activeGroup ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ResponsiveContainer width="100%" height={Math.max(260, Math.min(activeGroup.options.length, 12) * 34)}>
                    <BarChart data={activeGroup.options.slice(0, 12).map(o => ({ ...o, label: trunc(o.name, 26) }))} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: any) => `${num(Number(v))} un.`} />
                      <Bar dataKey="qty" name="Unidades" radius={[0, 4, 4, 0]}>
                        {activeGroup.options.slice(0, 12).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <Donut data={activeGroup.options.slice(0, 8).map(o => ({ name: trunc(o.name, 18), value: o.qty }))} height={240} />
                  {activeGroup.options.length > 5 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Menor saída</p>
                      <ul className="text-sm text-gray-600 space-y-0.5">
                        {activeGroup.options.slice(-5).reverse().map(o => (
                          <li key={o.name} className="flex justify-between"><span>{trunc(o.name, 26)}</span><span className="text-gray-400">{num(o.qty)} un.</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-3 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="p-3">#</th><th className="p-3">Opção</th><th className="p-3">Unidades</th><th className="p-3">% do grupo</th><th className="p-3">Receita de adicional</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {activeGroup.options.slice(0, 20).map((o, i) => (
                        <tr key={o.name} className="hover:bg-gray-50">
                          <td className="p-3 text-gray-400">{i + 1}</td>
                          <td className="p-3 font-medium text-gray-800">{o.name}</td>
                          <td className="p-3">{num(o.qty)}</td>
                          <td className="p-3">{pct(activeGroup.total ? (o.qty / activeGroup.total) * 100 : 0)}</td>
                          <td className="p-3">{o.revenue > 0 ? brl(o.revenue) : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : <Empty text="Este produto não possui grupos/opções no período." />}
          </Card>
        </>
      )}

      {/* ============ HORÁRIOS ============ */}
      {tab === 'horarios' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {peakHours.length ? peakHours.map((h, i) => (
              <Kpi key={h.h} title={`${i + 1}º horário de pico`} value={h.hora} icon={Clock} color="bg-purple-50 text-purple-600"
                hint={`${num(h.pedidos)} pedidos · ${brl(h.receita)}`} />
            )) : <div className="sm:col-span-3"><Empty /></div>}
          </div>

          <Card title="Pedidos por hora do dia" subtitle={`Horário local (${FUSO}) · barras = pedidos, linha = faturamento`}>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={hourData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `R$${num(v)}`} width={70} />
                <Tooltip formatter={(v: any, n: any) => (n === 'Faturamento' ? brl(Number(v)) : num(Number(v)))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="pedidos" name="Pedidos" fill="#dc2626" radius={[3, 3, 0, 0]} />
                <Line yAxisId="r" dataKey="receita" name="Faturamento" stroke="#1f2937" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Pedidos por dia da semana" subtitle="Total e média por ocorrência do dia no período">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => num(Number(v), 1)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="pedidos" name="Pedidos (total)" fill="#fca5a5" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="mediaPedidos" name="Média por dia" stroke="#dc2626" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Faturamento médio por dia da semana">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${num(v)}`} width={70} />
                  <Tooltip formatter={moneyTip} />
                  <Bar dataKey="mediaReceita" name="Média por dia" radius={[4, 4, 0, 0]}>
                    {weekdayData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="Mapa de calor: dia da semana × hora" subtitle="Quanto mais escuro, mais pedidos">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 700 }}>
                <div className="grid gap-0.5" style={{ gridTemplateColumns: '44px repeat(24, 1fr)' }}>
                  <div />
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="text-[10px] text-gray-400 text-center">{h}</div>
                  ))}
                  {DIAS_SEMANA.map((d, wd) => (
                    <React.Fragment key={d}>
                      <div className="text-xs text-gray-500 flex items-center">{d}</div>
                      {heat.grid[wd].map((v: number, h: number) => (
                        <div
                          key={h}
                          title={`${d} ${String(h).padStart(2, '0')}h — ${v} pedidos`}
                          className="h-7 rounded-sm"
                          style={{ background: v > 0 ? `rgba(220,38,38,${0.1 + 0.9 * (v / heat.max)})` : '#f3f4f6' }}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ============ BAIRROS ============ */}
      {tab === 'bairros' && (
        <>
          <Card title="Pedidos e ticket médio por bairro" subtitle="Barras = pedidos · linha = ticket médio · Top 12">
            {neighborhoods.length ? (
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={neighborhoods.slice(0, 12).map(n => ({ ...n, label: trunc(n.name, 14) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                  <YAxis yAxisId="l" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} tickFormatter={v => `R$${num(v)}`} width={70} />
                  <Tooltip formatter={(v: any, n: any) => (n === 'Ticket médio' ? brl(Number(v)) : num(Number(v)))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="pedidos" name="Pedidos" fill="#dc2626" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="r" dataKey="ticket" name="Ticket médio" stroke="#1f2937" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Participação nos pedidos" className="lg:col-span-1">
              <Donut data={neighborhoods.slice(0, 8).map(n => ({ name: trunc(n.name, 18), value: n.pedidos }))} height={300} />
            </Card>
            <Card title="Ranking de bairros" className="lg:col-span-2">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                    <tr><th className="p-3">#</th><th className="p-3">Bairro</th><th className="p-3">Pedidos</th><th className="p-3">% pedidos</th><th className="p-3">Faturamento</th><th className="p-3">Ticket médio</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {neighborhoods.map((n, i) => (
                      <tr key={n.name} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-400">{i + 1}</td>
                        <td className="p-3 font-medium text-gray-800">{n.name}</td>
                        <td className="p-3">{num(n.pedidos)}</td>
                        <td className="p-3">{pct(cur.count ? (n.pedidos / cur.count) * 100 : 0)}</td>
                        <td className="p-3">{brl(n.receita)}</td>
                        <td className="p-3 font-semibold">{brl(n.ticket)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ============ CLIENTES ============ */}
      {tab === 'clientes' && (
        <>
          {usersWarning && <div className="p-3 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg text-sm">{usersWarning}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi title="Cadastrados" value={num(customers.registered)} icon={Users} color="bg-blue-50 text-blue-600" hint="clientes na tabela users" />
            <Kpi title="Cadastrados que compraram" value={num(customers.registeredBuyers)} icon={UserCheck} color="bg-green-50 text-green-600" hint={`Conversão: ${pct(customers.conversion)}`} />
            <Kpi title="Cadastrados sem pedido" value={num(customers.registered - customers.registeredBuyers)} icon={Users} color="bg-red-50 text-red-600" hint={`${pct(100 - customers.conversion)} dos cadastros`} />
            <Kpi title="Taxa de recompra" value={pct(customers.repeatRate)} icon={Activity} color="bg-purple-50 text-purple-600" hint={`${num(customers.repeat)} de ${num(customers.totalBuyers)} compradores`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="Cadastro x Pedido" subtitle="Histórico completo (sem filtro de período)">
              <Donut data={[
                { name: 'Cadastrou e comprou', value: customers.registeredBuyers },
                { name: 'Cadastrou e não comprou', value: customers.registered - customers.registeredBuyers },
              ]} />
              <p className="text-xs text-gray-400 mt-2">
                Compradores sem cadastro na tabela users: <b>{num(customers.buyersNoRegistration)}</b>
                {customers.ordersNoPhone > 0 && <> · pedidos sem telefone: <b>{num(customers.ordersNoPhone)}</b></>}
              </p>
            </Card>

            <Card title="Frequência de compra" subtitle="Quantos pedidos cada cliente já fez">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={customers.freq}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v: any) => `${num(Number(v))} clientes`} />
                  <Bar dataKey="value" name="Clientes" radius={[4, 4, 0, 0]}>
                    {customers.freq.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Cadastros x primeiros pedidos" subtitle="Por mês (últimos 12)">
              {customers.monthly.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={customers.monthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {customers.hasDates && <Bar dataKey="cadastros" name="Novos cadastros" fill="#93c5fd" radius={[3, 3, 0, 0]} />}
                    <Line dataKey="primeirosPedidos" name="Primeiros pedidos" stroke="#dc2626" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : <Empty />}
              {!customers.hasDates && <p className="text-xs text-gray-400">A tabela users não tem created_at/createdAt, então só os primeiros pedidos são exibidos.</p>}
            </Card>
          </div>

          <Card
            title="Melhores clientes"
            subtitle="No período filtrado · identificados pelo telefone"
            right={
              <Select value={custMetric} onChange={setCustMetric}>
                <option value="spent">Por valor gasto</option>
                <option value="orders">Por nº de pedidos</option>
              </Select>
            }
          >
            {customers.ranking.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr><th className="p-3">#</th><th className="p-3">Cliente</th><th className="p-3">Celular</th><th className="p-3">Pedidos</th><th className="p-3">Total gasto</th><th className="p-3">Ticket médio</th><th className="p-3">Último pedido</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customers.ranking.map((c, i) => (
                      <tr key={c.phone + i} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-400">{i + 1}</td>
                        <td className="p-3 font-medium text-gray-800">{c.name || 'Sem nome'}</td>
                        <td className="p-3">{c.phone}</td>
                        <td className="p-3">{num(c.orders)}</td>
                        <td className="p-3 font-semibold">{brl(c.spent)}</td>
                        <td className="p-3">{brl(c.ticket)}</td>
                        <td className="p-3">{fmtDate(c.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Empty />}
          </Card>
        </>
      )}
    </div>
  );
};

export default DashboardView;
