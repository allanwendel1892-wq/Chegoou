import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, ShoppingBag, 
  Activity, Calendar, MapPin, Clock, Users, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell 
} from 'recharts';
import { supabase } from '../services/supabaseClient';

interface DashboardViewProps {
  companyId: string;
}

const COLORS = ['#4f46e5', '#ec4899', '#f59e0b', '#10b981', '#6366f1', '#f43f5e', '#8b5cf6', '#14b8a6'];

const StatCard = ({ title, value, icon: Icon, trend, trendValue, trendDesc, colorClass }: any) => {
  const isPositive = trend === 'up';
  const isNeutral = trend === 'neutral';
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        </div>
        <div className={`p-3 rounded-lg ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trendValue && (
        <div className={`flex items-center mt-4 text-sm font-medium ${isPositive ? 'text-green-600' : isNeutral ? 'text-gray-500' : 'text-red-600'}`}>
          {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : isNeutral ? <Minus className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
          <span>{trendValue}</span>
          <span className="text-gray-400 ml-1 font-normal">{trendDesc}</span>
        </div>
      )}
    </div>
  );
};

const DashboardView: React.FC<DashboardViewProps> = ({ companyId }) => {
  const [timeRange, setTimeRange] = useState('30days');
  const [orders, setOrders] = useState<any[]>([]);
  const [totalUsersCount, setTotalUsersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Busca de Dados do Supabase
  useEffect(() => {
    if (!companyId) return;

    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const [ordersRes, usersRes] = await Promise.all([
          supabase.from('orders').select('*').eq('companyId', companyId),
          supabase.from('users').select('phone').eq('companyId', companyId)
        ]);

        if (ordersRes.data) setOrders(ordersRes.data);
        if (usersRes.data) {
          // Conta usuários únicos com base no telefone
          const uniquePhones = new Set(usersRes.data.map(u => u.phone).filter(Boolean));
          setTotalUsersCount(uniquePhones.size);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [companyId]);

  // MOTOR DE CÁLCULOS E FILTROS (useMemo para performance)
  const analytics = useMemo(() => {
    const now = new Date();
    let dataLimite = new Date(0);
    
    if (timeRange === '7days') {
      dataLimite = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    } else if (timeRange === '15days') {
      dataLimite = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 15);
    } else if (timeRange === '30days') {
      dataLimite = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    }

    const filteredOrders = orders.filter(o => {
      const orderDate = new Date(o.timestamp || o.created_at);
      return orderDate >= dataLimite;
    });

    // 1. Visão Geral (Financeiro)
    let totalRevenue = 0;
    const validOrders = filteredOrders.filter(o => !['cancelled', 'rejected'].includes(o.status));
    
    validOrders.forEach(o => {
      totalRevenue += Number(o.total || 0);
    });
    const avgTicket = validOrders.length > 0 ? totalRevenue / validOrders.length : 0;

    // 2. Análise de Tendência Diária (Faturamento) e Regressão Linear
    const dailySalesMap: Record<string, number> = {};
    validOrders.forEach(o => {
      const dateStr = new Date(o.timestamp || o.created_at).toLocaleDateString('pt-BR');
      dailySalesMap[dateStr] = (dailySalesMap[dateStr] || 0) + Number(o.total || 0);
    });

    const dailySalesChart = Object.entries(dailySalesMap)
      .map(([date, revenue]) => ({ date, revenue }))
      .reverse(); // Garante ordem cronológica dependendo de como veio do banco

    // Regressão Linear Simples para Tendência
    let trendStatus = 'Estacionado';
    let slope = 0;
    if (dailySalesChart.length > 1) {
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      const n = dailySalesChart.length;
      dailySalesChart.forEach((d, i) => {
        sumX += i;
        sumY += d.revenue;
        sumXY += i * d.revenue;
        sumX2 += i * i;
      });
      slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      if (slope > 15) trendStatus = 'Alta';
      else if (slope < -15) trendStatus = 'Baixa';
    }

    // 3. Funil de Clientes
    const activeCustomersMap: Record<string, { name: string, spent: number, orders: number }> = {};
    let deliveryCount = 0;
    let pickupCount = 0;

    validOrders.forEach(o => {
      // Clientes
      const phone = o.customerPhone || 'Desconhecido';
      if (!activeCustomersMap[phone]) {
        activeCustomersMap[phone] = { name: o.customerName || 'Cliente Sem Nome', spent: 0, orders: 0 };
      }
      activeCustomersMap[phone].spent += Number(o.total || 0);
      activeCustomersMap[phone].orders += 1;

      // Delivery vs Retirada
      if (o.deliveryMethod === 'delivery') deliveryCount++;
      else pickupCount++;
    });

    const uniqueCustomersPeriod = Object.keys(activeCustomersMap).filter(k => k !== 'Desconhecido').length;
    const allTimeUniqueOrderingCustomers = new Set(orders.map(o => o.customerPhone).filter(Boolean)).size;
    const globalConversionRate = totalUsersCount > 0 ? (allTimeUniqueOrderingCustomers / totalUsersCount) * 100 : 0;

    const topCustomers = Object.values(activeCustomersMap)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    // 4. Ranking de Produtos e Sabores (JSONB Parse)
    const productMap: Record<string, { qtd: number, revenue: number }> = {};
    const flavorMap: Record<string, number> = {};

    validOrders.forEach(o => {
      const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
      if (!items || !Array.isArray(items)) return;

      items.forEach(item => {
        const pName = item.productName || 'Produto Desconhecido';
        const pQtd = Number(item.quantity || 1);
        const pPrice = Number(item.price || 0) * pQtd;

        if (!productMap[pName]) productMap[pName] = { qtd: 0, revenue: 0 };
        productMap[pName].qtd += pQtd;
        productMap[pName].revenue += pPrice;

        const options = typeof item.selectedOptions === 'string' ? JSON.parse(item.selectedOptions) : item.selectedOptions;
        if (options && Array.isArray(options)) {
          options.forEach(opt => {
            const flavorName = opt.optionName;
            if (flavorName) {
              flavorMap[flavorName] = (flavorMap[flavorName] || 0) + pQtd;
            }
          });
        }
      });
    });

    const topProducts = Object.entries(productMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);

    const topFlavors = Object.entries(flavorMap)
      .map(([name, qtd]) => ({ name, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 6);

    // 5. Horários de Pico (O navegador converte UTC para o fuso local automaticamente)
const peakHoursMap: Record<string, number> = {};
validOrders.forEach(o => {
  if (!o.timestamp && !o.created_at) return;
  
  const dateObj = new Date(o.timestamp || o.created_at);
  const hour = dateObj.getHours(); // Já pega a hora exata no seu fuso local
  const hourStr = `${hour.toString().padStart(2, '0')}:00`;
  
  peakHoursMap[hourStr] = (peakHoursMap[hourStr] || 0) + 1;
});

const peakHoursChart = Object.entries(peakHoursMap)
  .map(([time, orders]) => ({ time, orders }))
  .sort((a, b) => a.time.localeCompare(b.time));

    // 6. Inteligência Geográfica (Bairros)
    const neighborhoodMap: Record<string, { orders: number, revenue: number }> = {};
    validOrders.forEach(o => {
      let address = null;
      if (o.pickupAddress) {
        address = typeof o.pickupAddress === 'string' ? JSON.parse(o.pickupAddress) : o.pickupAddress;
      }
      
      const nbhd = (address && address.neighborhood) ? address.neighborhood : 'Balcão/Retirada';
      if (!neighborhoodMap[nbhd]) neighborhoodMap[nbhd] = { orders: 0, revenue: 0 };
      
      neighborhoodMap[nbhd].orders += 1;
      neighborhoodMap[nbhd].revenue += Number(o.total || 0);
    });

    const topNeighborhoods = Object.entries(neighborhoodMap)
      .map(([neighborhood, data]) => ({
        neighborhood,
        orders: data.orders,
        revenue: data.revenue,
        avgTicket: data.orders > 0 ? data.revenue / data.orders : 0
      }))
      .sort((a, b) => b.orders - a.orders);

    return {
      totalRevenue,
      totalOrders: validOrders.length,
      avgTicket,
      dailySalesChart,
      trendStatus,
      slope,
      topProducts,
      topFlavors,
      peakHoursChart,
      topNeighborhoods,
      deliveryVsPickup: [
        { name: 'Entrega (Delivery)', value: deliveryCount },
        { name: 'Retirada Local', value: pickupCount }
      ],
      uniqueCustomersPeriod,
      globalConversionRate,
      topCustomers
    };
  }, [orders, timeRange, totalUsersCount]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-indigo-600">
        <Activity className="w-8 h-8 animate-spin" />
        <span className="ml-3 font-medium text-lg">Analisando Inteligência de Negócio...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Activity className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Panorama do Negócio</h2>
            <p className="text-sm text-gray-500">Métricas analíticas avançadas e comportamento de vendas.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="all">Todo o Período</option>
            <option value="30days">Últimos 30 dias</option>
            <option value="15days">Últimos 15 dias</option>
            <option value="7days">Últimos 7 dias</option>
          </select>
        </div>
      </div>

      {/* Cartões de KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Faturamento Total" 
          value={`R$ ${analytics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          icon={DollarSign} 
          trend={analytics.slope > 0 ? 'up' : analytics.slope < 0 ? 'down' : 'neutral'} 
          trendValue={analytics.trendStatus} 
          trendDesc="Tendência atual" 
          colorClass="bg-green-50 text-green-600" 
        />
        <StatCard 
          title="Pedidos Fechados" 
          value={analytics.totalOrders} 
          icon={ShoppingBag} 
          trend="neutral" 
          trendValue={analytics.uniqueCustomersPeriod} 
          trendDesc="clientes ativos no filtro" 
          colorClass="bg-blue-50 text-blue-600" 
        />
        <StatCard 
          title="Ticket Médio" 
          value={`R$ ${analytics.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
          icon={Activity} 
          colorClass="bg-purple-50 text-purple-600" 
        />
        <StatCard 
          title="Conversão de Cadastros" 
          value={`${analytics.globalConversionRate.toFixed(1)}%`} 
          icon={Users} 
          trend="neutral"
          trendValue={totalUsersCount}
          trendDesc="usuários totais cadastrados"
          colorClass="bg-orange-50 text-orange-600" 
        />
      </div>

      {/* Gráficos Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Tendência (Ocupa 2 colunas) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-gray-800">Curva de Faturamento Diário</h3>
            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              analytics.trendStatus === 'Alta' ? 'bg-green-100 text-green-700' : 
              analytics.trendStatus === 'Baixa' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
            }`}>
              {analytics.trendStatus === 'Alta' ? <TrendingUp className="w-3 h-3"/> : 
               analytics.trendStatus === 'Baixa' ? <TrendingDown className="w-3 h-3"/> : <Minus className="w-3 h-3"/>}
              Tendência de {analytics.trendStatus}
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={analytics.dailySalesChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                <RechartsTooltip formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Faturamento']} />
                <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={3} dot={{ r: 3, fill: '#4f46e5' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico Delivery vs Balcão */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 mb-6">Logística de Saída</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analytics.deliveryVsPickup} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {analytics.deliveryVsPickup.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {analytics.deliveryVsPickup.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></div>
                  <span className="text-gray-600">{item.name}</span>
                </div>
                <span className="font-bold text-gray-800">{item.value} pedidos</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Blocos de Dados Inferiores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Produtos e Sabores Mais Vendidos */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-6">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
              <ShoppingBag className="w-5 h-5 text-indigo-500" />
              Top Produtos Mais Vendidos
            </h3>
            <div className="space-y-3">
              {analytics.topProducts.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                  <span className="font-medium text-gray-700">{i + 1}. {p.name}</span>
                  <div className="text-right">
                    <span className="block font-bold text-indigo-600">{p.qtd} un.</span>
                    <span className="text-xs text-gray-500">R$ {p.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-gray-800 mb-4">Top Sabores / Adicionais</h3>
            <div className="flex flex-wrap gap-2">
              {analytics.topFlavors.map((f, i) => (
                <div key={i} className="bg-orange-50 border border-orange-100 text-orange-700 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-2">
                  <span>{f.name}</span>
                  <span className="bg-white text-orange-600 px-1.5 py-0.5 rounded-full text-xs font-bold">{f.qtd}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Horários de Pico */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-blue-500" />
            Horários de Pico (Hora Local)
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.peakHoursChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="time" tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} />
                <YAxis tick={{fontSize: 12, fill: '#6b7280'}} axisLine={false} tickLine={false} allowDecimals={false} />
                <RechartsTooltip cursor={{fill: '#f3f4f6'}} formatter={(value: number) => [value, 'Pedidos']} />
                <Bar dataKey="orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Tabelas de Cruzamento (Bairros e Clientes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Inteligência de Bairros */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5 text-red-500" />
            Mapa de Calor: Bairros
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Bairro</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Pedidos</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Ticket Médio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analytics.topNeighborhoods.slice(0, 7).map((nb, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">{nb.neighborhood}</td>
                    <td className="py-3 px-4 text-sm text-gray-600">{nb.orders}</td>
                    <td className="py-3 px-4 text-sm font-medium text-green-600">R$ {nb.avgTicket.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Melhores Clientes */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-500" />
            Ranking de Clientes (Top 5)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Cliente</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Frequência</th>
                  <th className="py-3 px-4 text-sm font-semibold text-gray-600">Gasto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analytics.topCustomers.map((c, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </div>
                        {c.name}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{c.orders} pedidos</td>
                    <td className="py-3 px-4 text-sm font-bold text-emerald-600">R$ {c.spent.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardView;
