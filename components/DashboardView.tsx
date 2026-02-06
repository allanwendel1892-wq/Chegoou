import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, DollarSign, ShoppingBag, Users, Activity } from 'lucide-react';
import { SalesHistoryItem } from '../types';

interface DashboardViewProps {
  salesData: SalesHistoryItem[];
}

const DashboardView: React.FC<DashboardViewProps> = ({ salesData }) => {
  const totalRevenue = salesData.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalOrders = salesData.reduce((acc, curr) => acc + curr.ordersCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Visão Geral</h2>
        <div className="flex gap-2">
          <select className="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500">
            <option>Últimos 7 dias</option>
            <option>Este Mês</option>
            <option>Este Ano</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Receita Total</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">R$ {totalRevenue.toFixed(2)}</h3>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-green-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            <span>+12.5%</span>
            <span className="text-gray-400 ml-1 font-normal">vs. semana anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Pedidos</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">{totalOrders}</h3>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <ShoppingBag className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-green-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            <span>+8.2%</span>
            <span className="text-gray-400 ml-1 font-normal">vs. semana anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Ticket Médio</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">R$ {(totalRevenue / totalOrders).toFixed(2)}</h3>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <Activity className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-red-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1 rotate-90" />
            <span>-2.1%</span>
            <span className="text-gray-400 ml-1 font-normal">vs. semana anterior</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-gray-500">Novos Clientes</p>
              <h3 className="text-2xl font-bold text-gray-900 mt-1">142</h3>
            </div>
            <div className="p-2 bg-orange-50 rounded-lg">
              <Users className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div className="flex items-center mt-4 text-green-600 text-sm font-medium">
            <ArrowUpRight className="w-4 h-4 mr-1" />
            <span>+18%</span>
            <span className="text-gray-400 ml-1 font-normal">vs. semana anterior</span>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-6">Receita Semanal</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={salesData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA1D2C" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#EA1D2C" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
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
              />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                cursor={{ stroke: '#EA1D2C', strokeWidth: 1 }}
              />
              <Area 
                type="monotone" 
                dataKey="revenue" 
                stroke="#EA1D2C" 
                strokeWidth={3} 
                fillOpacity={1} 
                fill="url(#colorRevenue)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;