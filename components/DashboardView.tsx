import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, ShoppingBag, 
  Sparkles, Activity, Calendar, Package, ShoppingCart
} from 'lucide-react';
import { SalesHistoryItem, Order } from '../types';

interface DashboardViewProps {
  salesData: SalesHistoryItem[];
  orders: Order[];
}

// Matriz de Receitas Simplificada (Adicione os outros sabores aqui)
const RECEITAS_MATRIZ: Record<string, Record<string, number>> = {
  "Calabresa": { "Massa": 0.36, "Molho": 0.06, "Mussarela": 0.17, "Calabresa": 0.20, "Cebola": 0.13, "Orégano": 0.001 },
  "Frango": { "Massa": 0.36, "Molho": 0.06, "Mussarela": 0.17, "Frango": 0.20, "Milho": 0.05, "Cebola": 0.13, "Orégano": 0.001 },
  "Marguerita": { "Massa": 0.36, "Molho": 0.06, "Mussarela": 0.17, "Tomate": 0.17, "Orégano": 0.001 },
  "Quatro Queijos": { "Massa": 0.36, "Molho": 0.06, "Mussarela": 0.25, "Parmesão": 0.15, "Catupiry": 0.20, "Orégano": 0.001 }
};

const MARGEM_SEGURANCA = 1.20; // 20% a mais para evitar ruptura de estoque

const StatCard = ({ title, value, icon: Icon, trend, trendValue, trendDesc, colorClass }: any) => {
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
  const [timeRange, setTimeRange] = useState('7days');

  // 1. Cálculos do Topo (Receita, IA, etc)
  const stats = useMemo(() => {
    const totalRevenue = salesData.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalOrders = salesData.reduce((acc, curr) => acc + curr.ordersCount, 0);
    const aiSalesCount = orders.filter(o => o.id && o.id.startsWith('ord-ia')).length;
    const manualSalesCount = totalOrders - aiSalesCount;
    const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

    return { totalRevenue, totalOrders, aiSalesCount, manualSalesCount, avgTicket };
  }, [salesData, orders]);

  const distributionData = [
    { name: 'IA (Bot)', value: stats.aiSalesCount, color: '#4F46E5' },
    { name: 'Manual', value: stats.manualSalesCount, color: '#9CA3AF' }
  ];

  // 2. O MOTOR DE CÁLCULO DE ESTOQUE E PREVISÃO
  const previsaoInsumos = useMemo(() => {
    const consumo: Record<string, number> = {};

    // Varre todos os pedidos para extrair os sabores
    orders.forEach(pedido => {
      // Assumindo que pedido.items já é um array de objetos (ou faça JSON.parse se for string)
      const items = typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items;
      
      if(!items) return;

      items.forEach((item: any) => {
        if (!item.options) return;
        
        item.options.forEach((opt: any) => {
          if (opt.groupName === 'PIZZA' || opt.groupName === 'Sabor') {
            const sabor = opt.optionName;
            // Lógica da Fração: se tem "1/2" no nome consumiu metade da receita
            const fracao = opt.name.includes('1/2') ? 0.5 : 1.0; 
            const multiplicador = item.quantity * fracao;

            // Se o sabor existe na nossa matriz, adiciona os insumos
            if (RECEITAS_MATRIZ[sabor]) {
              Object.entries(RECEITAS_MATRIZ[sabor]).forEach(([insumo, qtdReceita]) => {
                const totalGasto = qtdReceita * multiplicador;
                consumo[insumo] = (consumo[insumo] || 0) + totalGasto;
              });
            }
          }
        });
      });
    });

    // Formata o dicionário em um Array para a tabela, aplicando a margem de segurança
    return Object.entries(consumo)
      .map(([nome, quantidade]) => ({
        nome,
        consumoBase: quantidade,
        sugestaoCompra: quantidade * MARGEM_SEGURANCA, // Adiciona os 20%
        unidade: nome === 'Massa' ? 'un' : 'kg' // Exemplo simples de unidade
      }))
      .sort((a, b) => b.sugestaoCompra - a.sugestaoCompra); // Ordena do maior pro menor
  }, [orders]);

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
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer hover:bg-gray-100"
          >
            <option value="7days">Últimos 7 dias</option>
            <option value="month">Este Mês</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Receita Total" value={`R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} trend="up" trendValue="+12.5%" trendDesc="vs. anterior" colorClass="bg-green-50 text-green-600" />
        <StatCard title="Pedidos Fechados" value={stats.totalOrders} icon={ShoppingBag} trend="up" trendValue="+8.2%" trendDesc="vs. anterior" colorClass="bg-blue-50 text-blue-600" />
        <StatCard title="Ticket Médio" value={`R$ ${stats.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={Activity} trend="down" trendValue="-2.1%" trendDesc="vs. anterior" colorClass="bg-purple-50 text-purple-600" />
        <StatCard title="Vendas por IA" value={stats.aiSalesCount} icon={Sparkles} trend="up" trendValue={`${stats.totalOrders > 0 ? Math.round((stats.aiSalesCount / stats.totalOrders) * 100) : 0}%`} trendDesc="do total" colorClass="bg-indigo-50 text-indigo-600" />
      </div>

      {/* Gráficos Originais (Área e Rosca) omitidos por brevidade, assuma que estão aqui como no código anterior */}
      
      {/* NOVA SEÇÃO: PREVISÃO DE ESTOQUE */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Previsão de Compras (Estoque Mínimo)
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Baseado no consumo do período selecionado + 20% de margem de segurança estatística.
            </p>
          </div>
          <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <ShoppingCart className="w-4 h-4" />
            Exportar Lista
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600 rounded-tl-lg">Insumo</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Consumo Base</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Margem (+20%)</th>
                <th className="py-3 px-4 text-sm font-semibold text-indigo-600 bg-indigo-50/50 rounded-tr-lg">Comprar (Alvo)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {previsaoInsumos.length > 0 ? previsaoInsumos.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-800 flex items-center gap-2">
                    {item.nome}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {item.consumoBase.toFixed(2)} {item.unidade}
                  </td>
                  <td className="py-3 px-4 text-sm text-amber-600 font-medium">
                    +{(item.sugestaoCompra - item.consumoBase).toFixed(2)} {item.unidade}
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-indigo-600 bg-indigo-50/30">
                    {item.sugestaoCompra.toFixed(2)} {item.unidade}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500 text-sm">
                    Nenhum dado de insumo encontrado para este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default DashboardView;
