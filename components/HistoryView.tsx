import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { Search, Calendar, Filter, DollarSign, ShoppingBag, Store, MessageSquare } from 'lucide-react';

interface HistoryViewProps {
  orders: Order[];
}

const HistoryView: React.FC<HistoryViewProps> = ({ orders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');

  // Filtra apenas pedidos concluídos ou cancelados para o histórico, 
  // mas deixa os outros aparecerem se o usuário buscar ativamente
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = order.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            order.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      
      const isWhatsapp = order.origin?.toLowerCase() === 'whatsapp';
      const isPDV = order.origin?.toLowerCase() === 'pdv';
      const matchesOrigin = filterOrigin === 'all' 
                            || (filterOrigin === 'whatsapp' && isWhatsapp)
                            || (filterOrigin === 'pdv' && isPDV)
                            || (filterOrigin === 'app' && !isWhatsapp && !isPDV);

      return matchesSearch && matchesStatus && matchesOrigin;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [orders, searchTerm, filterStatus, filterOrigin]);

  const totalRevenue = filteredOrders
    .filter(o => o.status === 'delivered')
    .reduce((acc, order) => acc + order.total, 0);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col space-y-6">
      
      {/* HEADER E RESUMO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-red-600" /> Histórico de Pedidos
            </h2>
            <p className="text-gray-500 text-sm mt-1">Acompanhe e filtre os pedidos passados da sua loja.</p>
        </div>
        <div className="flex gap-4">
            <div className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex flex-col items-end">
                <span className="text-xs font-bold text-gray-500 uppercase">Pedidos Filtrados</span>
                <span className="text-2xl font-bold text-gray-900">{filteredOrders.length}</span>
            </div>
            <div className="bg-green-50 border border-green-100 p-4 rounded-xl flex flex-col items-end min-w-[150px]">
                <span className="text-xs font-bold text-green-700 uppercase">Faturamento (Entregues)</span>
                <span className="text-2xl font-bold text-green-700">R$ {totalRevenue.toFixed(2)}</span>
            </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div className="relative flex-1">
            <input 
                type="text" 
                placeholder="Buscar por nome do cliente ou código..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:border-red-300"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
        </div>
        
        <div className="flex gap-2">
            <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-red-300 bg-white"
            >
                <option value="all">Todos os Status</option>
                <option value="delivered">Entregues</option>
                <option value="cancelled">Cancelados</option>
                <option value="pending">Pendentes</option>
            </select>

            <select 
                value={filterOrigin} 
                onChange={e => setFilterOrigin(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2 outline-none focus:border-red-300 bg-white"
            >
                <option value="all">Todas Origens</option>
                <option value="app">App / Online</option>
                <option value="pdv">Balcão (PDV)</option>
                <option value="whatsapp">WhatsApp (IA)</option>
            </select>
        </div>
      </div>

      {/* TABELA DE RESULTADOS */}
      <div className="flex-1 overflow-hidden bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <div className="overflow-y-auto flex-1">
              <table className="w-full text-left">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Data / Hora</th>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Código</th>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Origem</th>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredOrders.length === 0 ? (
                          <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-400">Nenhum pedido encontrado com esses filtros.</td>
                          </tr>
                      ) : (
                          filteredOrders.map(order => (
                              <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="p-4 text-sm font-medium text-gray-600">
                                      {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </td>
                                  <td className="p-4 text-sm font-bold text-gray-900">
                                      #{order.id.slice(-4)}
                                  </td>
                                  <td className="p-4 text-sm text-gray-800">
                                      {order.customerName}
                                  </td>
                                  <td className="p-4">
                                      {order.origin === 'pdv' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-bold"><Store className="w-3 h-3"/> Balcão</span>
                                      ) : order.origin?.toLowerCase() === 'whatsapp' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold"><MessageSquare className="w-3 h-3"/> WhatsApp</span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold"><ShoppingBag className="w-3 h-3"/> App</span>
                                      )}
                                  </td>
                                  <td className="p-4">
                                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase
                                          ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : ''}
                                          ${order.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
                                          ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'bg-yellow-100 text-yellow-700' : ''}
                                      `}>
                                          {order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado' : 'Em Andamento'}
                                      </span>
                                  </td>
                                  <td className="p-4 text-sm font-bold text-gray-900">
                                      R$ {order.total.toFixed(2)}
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default HistoryView;
