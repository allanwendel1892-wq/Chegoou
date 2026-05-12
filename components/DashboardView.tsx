import React, { useState, useMemo } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  ArrowUpRight, ArrowDownRight, DollarSign, ShoppingBag, 
  Sparkles, Activity, Calendar, Package, ShoppingCart, Calculator
} from 'lucide-react';
import { SalesHistoryItem, Order } from '../types';

export interface Composition {
  id: string;
  reference_id: string; 
  inventory_item_id: string;
  amount_needed: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  cost_price: number;
}

interface DashboardViewProps {
  salesData: SalesHistoryItem[];
  orders: Order[];
  compositions: Composition[];     
  inventoryItems: InventoryItem[]; 
}

const MARGEM_SEGURANCA = 1.20; // 20% de margem

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

const DashboardView: React.FC<DashboardViewProps> = ({ salesData = [], orders = [], compositions = [], inventoryItems = [] }) => {
  const [timeRange, setTimeRange] = useState('7days');

  // FILTRO CENTRAL E CONTAGEM DE DIAS PARA MÉDIA
  const { filteredOrders, filteredSales, diasNoFiltro } = useMemo(() => {
    const now = new Date();
    let dataLimite = new Date(0); 
    let dias = 7;

    if (timeRange === '7days') {
      dataLimite = new Date();
      dataLimite.setDate(now.getDate() - 7);
      dataLimite.setHours(0, 0, 0, 0);
      dias = 7;
    } else if (timeRange === '15days') {
      dataLimite = new Date();
      dataLimite.setDate(now.getDate() - 15);
      dataLimite.setHours(0, 0, 0, 0);
      dias = 15;
    } else if (timeRange === 'month') {
      dataLimite = new Date(now.getFullYear(), now.getMonth(), 1); 
      // Conta exatamente quantos dias se passaram neste mês até hoje para não distorcer a média
      dias = Math.max(1, Math.ceil((now.getTime() - dataLimite.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (timeRange === 'all') {
      dataLimite = new Date(0);
      dias = 30; // Evita divisão por zero. A lógica abaixo corrige se houver pedidos.
    }

    // Leitura BLINDADA de datas
    const getSafeDate = (item: any) => {
      const rawDate = item.created_at || item.createdAt || item.date;
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!isNaN(parsed.getTime())) return parsed;
      }
      if (item.id && typeof item.id === 'string' && item.id.includes('-')) {
        const tsMatch = item.id.match(/\d{13}/);
        if (tsMatch) return new Date(parseInt(tsMatch[0]));
      }
      return new Date(0); // Retorna 1970 em vez de "Hoje" para não poluir os filtros curtos
    };

    const filteredOrd = orders.filter(order => getSafeDate(order) >= dataLimite);
    const filteredSD = salesData.filter(sale => getSafeDate(sale) >= dataLimite);

    // Se for 'all', calcula a quantidade de dias entre o pedido mais antigo e hoje
    if (timeRange === 'all' && filteredOrd.length > 0) {
      const oldestDate = Math.min(...filteredOrd.map(o => getSafeDate(o).getTime()));
      dias = Math.max(1, Math.ceil((now.getTime() - oldestDate) / (1000 * 60 * 60 * 24)));
    }

    return { filteredOrders: filteredOrd, filteredSales: filteredSD, diasNoFiltro: dias };
  }, [orders, salesData, timeRange]);

  // 1. Cálculos de Visão Geral
  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalOrders = filteredSales.reduce((acc, curr) => acc + curr.ordersCount, 0);
    const aiSalesCount = filteredOrders.filter(o => o.id && o.id.startsWith('ord-ia')).length;
    const manualSalesCount = filteredOrders.length - aiSalesCount; // Usando length do array filtrado para maior precisão
    const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

    return { totalRevenue, totalOrders, aiSalesCount, manualSalesCount, avgTicket };
  }, [filteredSales, filteredOrders]);

  // 2. MOTOR DINÂMICO DE ESTOQUE (Corrigido para Média Diária -> Projeção de 7 Dias)
  const previsaoInsumos = useMemo(() => {
    const demandaSabores: Record<string, number> = {};

    filteredOrders.forEach(pedido => {
      const items = typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items;
      if (!items) return;

      items.forEach((item: any) => {
        if (!item.options) return;
        item.options.forEach((opt: any) => {
          if (opt.groupName === 'PIZZA' || opt.groupName === 'Sabor' || opt.groupName === 'Borda') {
            const referenciaSabor = opt.optionName; 
            const fracao = opt.name.includes('1/2') ? 0.5 : 1.0;
            demandaSabores[referenciaSabor] = (demandaSabores[referenciaSabor] || 0) + (item.quantity * fracao);
          }
        });
      });
    });

    const consumoInsumosBase: Record<string, number> = {};

    Object.entries(demandaSabores).forEach(([saborId, qtdVendida]) => {
      const receita = compositions.filter(c => c.reference_id === saborId);
      
      receita.forEach(ingrediente => {
        const totalGasto = ingrediente.amount_needed * qtdVendida;
        consumoInsumosBase[ingrediente.inventory_item_id] = (consumoInsumosBase[ingrediente.inventory_item_id] || 0) + totalGasto;
      });
    });

    const listaFinal = [];
    let custoTotalInvestimento = 0;

    Object.entries(consumoInsumosBase).forEach(([inventoryId, consumoTotalNoFiltro]) => {
      const itemEstoque = inventoryItems.find(i => i.id === inventoryId);
      if (!itemEstoque) return; 

      // A MATEMÁTICA CORRETA AQUI:
      // 1. Descobre a média de consumo por dia
      const consumoDiario = consumoTotalNoFiltro / diasNoFiltro;
      
      // 2. Projeta quanto vai precisar para 7 dias corridos (Meta padrão de reposição)
      const projecao7Dias = consumoDiario * 7;
      
      // 3. Adiciona a margem de segurança de 20%
      const metaConsumoSemanal = projecao7Dias * MARGEM_SEGURANCA;
      
      const faltaComprar = Math.max(0, metaConsumoSemanal - itemEstoque.current_stock);
      const custoEstimado = faltaComprar * Number(itemEstoque.cost_price);

      custoTotalInvestimento += custoEstimado;

      listaFinal.push({
        id: itemEstoque.id,
        nome: itemEstoque.name,
        unidade: itemEstoque.unit,
        estoqueAtual: Number(itemEstoque.current_stock),
        consumoDiario: consumoDiario,
        metaConsumo: metaConsumoSemanal,
        faltaComprar: faltaComprar,
        custoEstimado: custoEstimado
      });
    });

    return {
      lista: listaFinal.sort((a, b) => b.custoEstimado - a.custoEstimado),
      custoTotalInvestimento
    };

  }, [filteredOrders, compositions, inventoryItems, diasNoFiltro]);

  return (
    <div className="space-y-6">
      {/* Header */}
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
            className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 cursor-pointer"
          >
            <option value="all">Geral</option>
            <option value="month">Este Mês</option>
            <option value="15days">Últimos 15 dias</option>
            <option value="7days">Últimos 7 dias</option>
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

      {/* SEÇÃO: INTELIGÊNCIA DE ESTOQUE INTEGRADA AO BANCO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Inteligência de Reposição
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Meta baseada na média diária do período filtrado projetada para 1 semana (+20%).
            </p>
          </div>
          
          {/* Card de Custo Estimado */}
          <div className="bg-red-50 border border-red-100 px-4 py-3 rounded-lg flex items-center gap-3">
            <div className="bg-red-100 p-2 rounded-md">
              <Calculator className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-red-600 font-semibold uppercase tracking-wider">Investimento Necessário</p>
              <p className="text-xl font-bold text-red-700">
                R$ {previsaoInsumos.custoTotalInvestimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Insumo</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Estoque Atual</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Meta (7 Dias+20%)</th>
                <th className="py-3 px-4 text-sm font-semibold text-red-600 bg-red-50/50">Falta Comprar</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Custo (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {previsaoInsumos.lista.length > 0 ? previsaoInsumos.lista.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-800">
                    {item.nome}
                    <div className="text-xs text-gray-400 font-normal mt-0.5">Média/dia: {item.consumoDiario.toFixed(2)} {item.unidade}</div>
                  </td>
                  <td className={`py-3 px-4 text-sm font-medium ${item.estoqueAtual <= 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {item.estoqueAtual.toFixed(2)} <span className="text-gray-400 text-xs">{item.unidade}</span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {item.metaConsumo.toFixed(2)} <span className="text-gray-400 text-xs">{item.unidade}</span>
                  </td>
                  <td className="py-3 px-4 text-sm font-bold text-red-600 bg-red-50/30">
                    {item.faltaComprar > 0 ? (
                      `${item.faltaComprar.toFixed(2)} ${item.unidade}`
                    ) : (
                      <span className="text-green-500 text-xs uppercase bg-green-50 px-2 py-1 rounded">OK</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-700">
                    {item.custoEstimado > 0 ? `R$ ${item.custoEstimado.toFixed(2)}` : '-'}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 text-sm">
                    Nenhuma movimentação de insumos no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        <div className="mt-4 flex justify-end">
           <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            <ShoppingCart className="w-4 h-4" />
            Exportar Lista de Compras
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
