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

// Novas interfaces baseadas nas tabelas do seu Supabase
export interface Composition {
  id: string;
  reference_id: string; // Ex: "Portuguesa", "Frango", "Borda Chocolate"
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
  compositions: Composition[];     // Tabela de receitas
  inventoryItems: InventoryItem[]; // Tabela de estoque físico
}

const MARGEM_SEGURANCA = 1.20; // 20% de folga

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

const DashboardView: React.FC<DashboardViewProps> = ({ salesData, orders, compositions = [], inventoryItems = [] }) => {
  const [timeRange, setTimeRange] = useState('7days');

  // 1. Cálculos de Visão Geral
  const stats = useMemo(() => {
    const totalRevenue = salesData.reduce((acc, curr) => acc + curr.revenue, 0);
    const totalOrders = salesData.reduce((acc, curr) => acc + curr.ordersCount, 0);
    const aiSalesCount = orders.filter(o => o.id && o.id.startsWith('ord-ia')).length;
    const manualSalesCount = totalOrders - aiSalesCount;
    const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;

    return { totalRevenue, totalOrders, aiSalesCount, manualSalesCount, avgTicket };
  }, [salesData, orders]);

  // 2. MOTOR DINÂMICO DE ESTOQUE (Conectado ao Banco)
  const previsaoInsumos = useMemo(() => {
    // Passo A: Contar quantas pizzas/frações de cada sabor saíram
    const demandaSabores: Record<string, number> = {};

    orders.forEach(pedido => {
      const items = typeof pedido.items === 'string' ? JSON.parse(pedido.items) : pedido.items;
      if (!items) return;

      items.forEach((item: any) => {
        if (!item.options) return;
        item.options.forEach((opt: any) => {
          // Pega o sabor da pizza ou o sabor da borda
          if (opt.groupName === 'PIZZA' || opt.groupName === 'Sabor' || opt.groupName === 'Borda') {
            const referenciaSabor = opt.optionName; // Tem que bater com o reference_id no banco
            const fracao = opt.name.includes('1/2') ? 0.5 : 1.0;
            demandaSabores[referenciaSabor] = (demandaSabores[referenciaSabor] || 0) + (item.quantity * fracao);
          }
        });
      });
    });

    // Passo B: Transformar sabores vendidos em insumos consumidos usando a tabela "compositions"
    const consumoInsumosBase: Record<string, number> = {};

    Object.entries(demandaSabores).forEach(([saborId, qtdVendida]) => {
      // Busca a receita (todos os ingredientes) vinculada a este sabor
      const receita = compositions.filter(c => c.reference_id === saborId);
      
      receita.forEach(ingrediente => {
        const totalGasto = ingrediente.amount_needed * qtdVendida;
        consumoInsumosBase[ingrediente.inventory_item_id] = (consumoInsumosBase[ingrediente.inventory_item_id] || 0) + totalGasto;
      });
    });

    // Passo C: Cruzar com o Estoque Físico ("inventory_items") para calcular custos e déficits
    const listaFinal = [];
    let custoTotalInvestimento = 0;

    Object.entries(consumoInsumosBase).forEach(([inventoryId, consumo]) => {
      const itemEstoque = inventoryItems.find(i => i.id === inventoryId);
      if (!itemEstoque) return; // Se o insumo foi deletado do banco, ignora.

      const metaSemanal = consumo * MARGEM_SEGURANCA;
      
      // A grande sacada: se você tem saldo negativo (ex: Mussarela -5.71), a matemática soma a dívida automaticamente
      const faltaComprar = Math.max(0, metaSemanal - itemEstoque.current_stock);
      const custoEstimado = faltaComprar * Number(itemEstoque.cost_price);

      custoTotalInvestimento += custoEstimado;

      listaFinal.push({
        id: itemEstoque.id,
        nome: itemEstoque.name,
        unidade: itemEstoque.unit,
        estoqueAtual: Number(itemEstoque.current_stock),
        consumoBase: consumo,
        metaConsumo: metaSemanal,
        faltaComprar: faltaComprar,
        custoEstimado: custoEstimado
      });
    });

    // Ordenar itens pelo impacto financeiro (maior custo de reposição no topo)
    return {
      lista: listaFinal.sort((a, b) => b.custoEstimado - a.custoEstimado),
      custoTotalInvestimento
    };

  }, [orders, compositions, inventoryItems]);

  return (
    <div className="space-y-6">
      {/* Header (Mantido) */}
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
            <option value="7days">Últimos 7 dias</option>
            <option value="month">Este Mês</option>
          </select>
        </div>
      </div>

      {/* Stats Cards (Mantido) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Receita Total" value={`R$ ${stats.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={DollarSign} trend="up" trendValue="+12.5%" trendDesc="vs. anterior" colorClass="bg-green-50 text-green-600" />
        <StatCard title="Pedidos Fechados" value={stats.totalOrders} icon={ShoppingBag} trend="up" trendValue="+8.2%" trendDesc="vs. anterior" colorClass="bg-blue-50 text-blue-600" />
        <StatCard title="Ticket Médio" value={`R$ ${stats.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} icon={Activity} trend="down" trendValue="-2.1%" trendDesc="vs. anterior" colorClass="bg-purple-50 text-purple-600" />
        <StatCard title="Vendas por IA" value={stats.aiSalesCount} icon={Sparkles} trend="up" trendValue={`${stats.totalOrders > 0 ? Math.round((stats.aiSalesCount / stats.totalOrders) * 100) : 0}%`} trendDesc="do total" colorClass="bg-indigo-50 text-indigo-600" />
      </div>

      {/* NOVA SEÇÃO: INTELIGÊNCIA DE ESTOQUE INTEGRADA AO BANCO */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              Inteligência de Reposição
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Cruzamento dinâmico: Consumo projetado (+20%) vs. Estoque Físico Atual.
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
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Previsão (Base+20%)</th>
                <th className="py-3 px-4 text-sm font-semibold text-red-600 bg-red-50/50">Falta Comprar</th>
                <th className="py-3 px-4 text-sm font-semibold text-gray-600">Custo (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {previsaoInsumos.lista.length > 0 ? previsaoInsumos.lista.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-800">
                    {item.nome}
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
                    Aguardando sincronização de pedidos e inventário...
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
