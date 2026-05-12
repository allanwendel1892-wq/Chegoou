import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, ShoppingBag, 
  Sparkles, Activity, Calendar
} from 'lucide-react';
import { SalesHistoryItem, Order } from '../types';

interface DashboardViewProps {
  salesData: SalesHistoryItem[];
  orders: Order[];
}

// Subcomponente para os Cards, mantendo o código limpo (DRY - Don't Repeat Yourself)
const StatCard = ({ title, value, icon: Icon, trend, trendValue, trendDesc, colorClass }) => {
  const isPositive = trend === 'up';
  
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
        <div className={`flex items-center mt-4 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
          <span>{trendValue}</span>
          <span className="text-gray-400 ml-1 font-normal">{trendDesc}</span>
        </div>
      )}
    </div>
  );
};

const DashboardView: React.FC<DashboardViewProps> = ({ salesData, orders }) => {
  // Estado para o filtro de tempo
  const [timeRange, setTimeRange] = useState('7days');

  // Cálculos otimizados para evitar re-renderizações desnecessárias
  const stats = useMemo(() => {
    const totalRevenue = salesData.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalOrders = salesData.reduce((acc, curr) => acc + curr.ordersCount, 0);
    const aiSalesCount = orders.filter(o => o.id && o.id.startsWith('ord-ia')).length;
    const manualSalesCount = totalOrders - aiSalesCount;
    const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

    return { totalRevenue, totalOrders, aiSalesCount, manualSalesCount, avgTicket };
  }, [salesData, orders]);

  // Dados para o novo gráfico de distribuição
  const distributionData = [
    { name: 'IA (Bot)', value: stats.aiSalesCount, color: '#4F46E5' }, // Indigo-600
    { name: 'Manual', value: stats.manualSalesCount, color: '#9CA3AF' } // Gray-400
  ];

  return (
    <div className="space-y-6">
      {/* Header e Filtros */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-50 rounded-lg">
            <Activity className="w-6 h-6 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Visão Geral</h2>
        </div>
        
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-500" />
          <select 
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <option value="7days">Últimos 7 dias</option>
            <option value="month">Este Mês</option>
            <option value="year">Este Ano</option>
          </select>
        </div>
      </div>

      {/* Stats Cards - Agora usando o subcomponente dinâmico */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Receita Total" 
          value={`R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          trend="up"
          trendValue="+12.5%"
          trendDesc="vs. período anterior"
          colorClass="bg-green-50 text-green-600"
        />
        <StatCard 
          title="Pedidos Fechados" 
          value={stats.totalOrders}
          icon={ShoppingBag}
          trend="up"
          trendValue="+8.2%"
          trendDesc="vs. período anterior"
          colorClass="bg-blue-50 text-blue-600"
        />
        <StatCard 
          title="Ticket Médio" 
          value={`R$ ${stats.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={Activity}
          trend="down"
          trendValue="-2.1%"
          trendDesc="vs. período anterior"
          colorClass="bg-purple-50 text-purple-600"
        />
        <StatCard 
          title="Vendas por IA" 
          value={stats.aiSalesCount}
          icon={Sparkles}
          trend="up"
          trendValue={`${stats.totalOrders > 0 ? Math.round((stats.aiSalesCount / stats.totalOrders) * 100) : 0}%`}
          trendDesc="do total"
          colorClass="bg-indigo-50 text-indigo-600"
        />
      </div>

      {/* Seção de Gráficos (Dividida em Área e Rosca) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Gráfico Principal de Receita (Ocupa 2/3 da tela em desktops) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-800">Evolução da Receita</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EA1D2C" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EA1D2C" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  tickFormatter={(value) => `R$ ${value}`}
                  width={80}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Receita']}
                  labelStyle={{ color: '#374151', fontWeight: 'bold', marginBottom: '4px' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#EA1D2C" 
                  strokeWidth={3} 
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#EA1D2C' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Novo Gráfico: Distribuição de Canais (Ocupa 1/3 da tela) */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">Origem dos Pedidos</h3>
          <p className="text-sm text-gray-500 mb-6">Comparativo de automação vs atendimento manual</p>
          
          <div className="flex-grow h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => [`${value} pedidos`, 'Quantidade']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardView;
