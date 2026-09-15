import React, { useState, useMemo } from 'react';
import { Order } from '../types';
import { Search, Calendar, Filter, DollarSign, ShoppingBag, Store, MessageSquare, Printer } from 'lucide-react';

interface HistoryViewProps {
  orders: Order[];
}

const HistoryView: React.FC<HistoryViewProps> = ({ orders }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

      let matchesDate = true;
      if (startDate || endDate) {
        const orderDate = new Date(order.timestamp);
        const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
        const end = endDate ? new Date(`${endDate}T23:59:59`) : null;

        if (start && end) {
            matchesDate = orderDate >= start && orderDate <= end;
        } else if (start) {
            matchesDate = orderDate >= start;
        } else if (end) {
            matchesDate = orderDate <= end;
        }
      }

      return matchesSearch && matchesStatus && matchesOrigin && matchesDate;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [orders, searchTerm, filterStatus, filterOrigin, startDate, endDate]);

  const totalRevenue = filteredOrders
    .filter(o => o.status === 'delivered')
    .reduce((acc, order) => acc + order.total, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    // Reduzido space-y-6 para space-y-4 para ganhar espaço vertical
    <div className="h-[calc(100vh-8rem)] print:h-auto flex flex-col space-y-4">
      
      {/* HEADER E RESUMO - Mais compacto */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-none print:p-0">
        <div className="w-full xl:w-auto">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-600 print:text-black" /> Histórico de Pedidos
            </h2>
            <p className="text-gray-500 text-xs mt-1">
                {startDate && endDate 
                    ? `Relatório de ${new Date(`${startDate}T00:00:00`).toLocaleDateString()} até ${new Date(`${endDate}T00:00:00`).toLocaleDateString()}` 
                    : 'Acompanhe e filtre os pedidos passados da sua loja.'}
            </p>
        </div>
        
        {/* Cards responsivos: lado a lado no celular, esticando proporcionalmente */}
        <div className="flex flex-wrap sm:flex-nowrap w-full xl:w-auto gap-2 items-center">
            <div className="bg-gray-50 border border-gray-100 p-2 md:p-3 rounded-lg flex flex-col items-end flex-1 print:border-none print:bg-transparent">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Pedidos Filtrados</span>
                <span className="text-lg md:text-xl font-bold text-gray-900">{filteredOrders.length}</span>
            </div>
            <div className="bg-green-50 border border-green-100 p-2 md:p-3 rounded-lg flex flex-col items-end flex-1 min-w-[130px] print:border-none print:bg-transparent">
                <span className="text-[10px] font-bold text-green-700 uppercase">Faturamento</span>
                <span className="text-lg md:text-xl font-bold text-green-700">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <button 
                onClick={handlePrint}
                className="w-full sm:w-auto print:hidden bg-red-600 hover:bg-red-700 text-white p-2 md:p-3 py-3 md:py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-semibold text-sm"
            >
                <Printer className="w-4 h-4" />
                Imprimir
            </button>
        </div>
      </div>

      {/* FILTROS - Responsivos para Mobile */}
      <div className="flex flex-col lg:flex-row gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-100 print:hidden">
        <div className="relative flex-1 w-full">
            <input 
                type="text" 
                placeholder="Buscar por nome ou código..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-red-300 text-sm"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {/* Filtros de Data */}
            <div className="flex gap-2 items-center justify-between sm:justify-start">
                <span className="text-xs font-medium text-gray-500">De:</span>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-300 bg-white text-sm w-full sm:w-auto"
                />
                <span className="text-xs font-medium text-gray-500">Até:</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-300 bg-white text-sm w-full sm:w-auto"
                />
            </div>
            
            {/* Selects */}
            <div className="flex gap-2 w-full sm:w-auto">
                <select 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                    className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-300 bg-white text-sm"
                >
                    <option value="all">Todos os Status</option>
                    <option value="delivered">Entregues</option>
                    <option value="cancelled">Cancelados</option>
                    <option value="pending">Pendentes</option>
                </select>

                <select 
                    value={filterOrigin} 
                    onChange={e => setFilterOrigin(e.target.value)}
                    className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-300 bg-white text-sm"
                >
                    <option value="all">Todas Origens</option>
                    <option value="app">App / Online</option>
                    <option value="pdv">Balcão (PDV)</option>
                    <option value="whatsapp">WhatsApp</option>
                </select>
            </div>
        </div>
      </div>

      {/* TABELA DE RESULTADOS - Com rolagem horizontal no mobile (overflow-x-auto) */}
      <div className="flex-1 overflow-hidden print:overflow-visible bg-white rounded-xl shadow-sm border border-gray-100 print:border-none print:shadow-none flex flex-col">
          <div className="overflow-x-auto overflow-y-auto print:overflow-visible flex-1">
              {/* min-w-[700px] garante que a tabela não esprema no celular, permitindo o scroll horizontal */}
              <table className="w-full text-left min-w-[700px]">
                  <thead className="bg-gray-50 print:bg-transparent sticky top-0 z-10 print:static">
                      <tr>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Data / Hora</th>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Código</th>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Cliente</th>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Origem</th>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Status</th>
                          <th className="p-3 text-xs font-semibold text-gray-500 uppercase print:text-black print:border-b">Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                      {filteredOrders.length === 0 ? (
                          <tr>
                              <td colSpan={6} className="p-8 text-center text-gray-400">Nenhum pedido encontrado com esses filtros.</td>
                          </tr>
                      ) : (
                          filteredOrders.map(order => (
                              <tr key={order.id} className="hover:bg-gray-50 transition-colors print:break-inside-avoid">
                                  <td className="p-3 text-sm font-medium text-gray-600 print:text-black">
                                      {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </td>
                                  <td className="p-3 text-sm font-bold text-gray-900 print:text-black">
                                      #{order.id.slice(-4)}
                                  </td>
                                  <td className="p-3 text-sm text-gray-800 print:text-black">
                                      {order.customerName}
                                  </td>
                                  <td className="p-3">
                                      {order.origin === 'pdv' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 print:bg-transparent print:border print:border-gray-300 text-purple-700 print:text-black rounded text-[11px] font-bold"><Store className="w-3 h-3 print:hidden"/> Balcão</span>
                                      ) : order.origin?.toLowerCase() === 'whatsapp' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 print:bg-transparent print:border print:border-gray-300 text-green-700 print:text-black rounded text-[11px] font-bold"><MessageSquare className="w-3 h-3 print:hidden"/> WhatsApp</span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 print:bg-transparent print:border print:border-gray-300 text-blue-700 print:text-black rounded text-[11px] font-bold"><ShoppingBag className="w-3 h-3 print:hidden"/> App</span>
                                      )}
                                  </td>
                                  <td className="p-3">
                                      <span className={`px-2 py-1 rounded text-[11px] font-bold uppercase print:bg-transparent print:border print:border-gray-300 print:text-black
                                          ${order.status === 'delivered' ? 'bg-green-100 text-green-700' : ''}
                                          ${order.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
                                          ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'bg-yellow-100 text-yellow-700' : ''}
                                      `}>
                                          {order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado' : 'Em Andamento'}
                                      </span>
                                  </td>
                                  <td className="p-3 text-sm font-bold text-gray-900 print:text-black">
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
