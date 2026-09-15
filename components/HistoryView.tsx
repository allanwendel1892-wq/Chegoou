import React, { useState, useEffect, useMemo } from 'react';
import { Order } from '../types';
import { Search, Calendar, Store, MessageSquare, ShoppingBag, Printer, Loader2, DollarSign } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface HistoryViewProps {
  companyId: string;
}

const HistoryView: React.FC<HistoryViewProps> = ({ companyId }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterOrigin, setFilterOrigin] = useState<string>('all');
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Busca autônoma e segura de pedidos vinculada estritamente ao ID do restaurante
  useEffect(() => {
    if (!companyId) return;

    const fetchOrdersHistory = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('companyId', companyId)
          .order('timestamp', { ascending: false });

        if (error) throw error;

        if (data) {
          // Mapeamento robusto convertendo snake_case do banco para camelCase da interface
          const mappedOrders: Order[] = data.map((item: any) => ({
            id: item.id,
            companyId: item.companyId || item.company_id,
            customerName: item.customer_name || item.customerName || 'Cliente sem nome',
            customerPhone: item.customer_phone || item.customerPhone || '',
            total: Number(item.total || 0),
            subtotal: Number(item.subtotal || 0),
            status: item.status || 'pending',
            origin: item.origin || 'app',
            timestamp: item.timestamp || item.created_at || new Date().toISOString(),
            items: typeof item.items === 'string' ? JSON.parse(item.items) : (item.items || []),
            deliveryMethod: item.delivery_method || item.deliveryMethod || 'delivery',
            deliveryFee: Number(item.delivery_fee || item.deliveryFee || 0),
            serviceFee: Number(item.service_fee || item.serviceFee || 0),
            paymentMethod: item.payment_method || item.paymentMethod || '',
            changeFor: item.change_for ? Number(item.change_for) : undefined,
            deliveryAddress: item.delivery_address || item.deliveryAddress,
            observacoes: item.observacoes || item.notes || ''
          }));

          setOrders(mappedOrders);
        }
      } catch (err) {
        console.error("Erro ao buscar histórico de pedidos:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrdersHistory();
  }, [companyId]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const name = (order.customerName || '').toLowerCase();
      const phone = (order.customerPhone || '').toLowerCase();
      const idStr = (order.id || '').toLowerCase();
      const query = searchTerm.toLowerCase().trim();

      const matchesSearch = !query || name.includes(query) || phone.includes(query) || idStr.includes(query);
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
    });
  }, [orders, searchTerm, filterStatus, filterOrigin, startDate, endDate]);

  const totalRevenue = filteredOrders
    .filter(o => o.status === 'delivered')
    .reduce((acc, order) => acc + order.total, 0);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
      </div>
    );
  }

  return (
    // Reduzido o space-y-6 para space-y-3 para economizar espaço vertical
    <div className="h-[calc(100vh-8rem)] print:h-auto flex flex-col space-y-3">
      
      {/* HEADER E RESUMO - Mais compacto e responsivo */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 print:shadow-none print:border-none print:p-0">
        <div className="w-full xl:w-auto">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-red-600 print:text-black" /> Histórico de Pedidos
            </h2>
            <p className="text-gray-500 text-xs mt-1">
                {startDate && endDate 
                    ? `Relatório de ${new Date(`${startDate}T00:00:00`).toLocaleDateString()} até ${new Date(`${endDate}T00:00:00`).toLocaleDateString()}` 
                    : 'Acompanhe e filtre todos os pedidos passados da sua loja.'}
            </p>
        </div>
        
        {/* Cards de Resumo adaptáveis ao celular */}
        <div className="flex flex-wrap sm:flex-nowrap w-full xl:w-auto gap-2 items-center">
            <div className="bg-gray-50 border border-gray-100 p-2 md:p-3 rounded-lg flex flex-col items-end flex-1 print:border-none print:bg-transparent">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Pedidos Filtrados</span>
                <span className="text-lg md:text-xl font-bold text-gray-900">{filteredOrders.length}</span>
            </div>
            <div className="bg-green-50 border border-green-100 p-2 md:p-3 rounded-lg flex flex-col items-end flex-1 min-w-[130px] print:border-none print:bg-transparent">
                <span className="text-[10px] font-bold text-green-700 uppercase">Faturamento (Entregues)</span>
                <span className="text-lg md:text-xl font-bold text-green-700">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <button 
                onClick={handlePrint}
                className="w-full sm:w-auto print:hidden bg-red-600 hover:bg-red-700 text-white p-2 md:p-3 py-2.5 md:py-3 rounded-lg flex items-center justify-center gap-2 transition-colors font-semibold shadow-sm text-sm"
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
                placeholder="Buscar nome, telefone, código..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-red-400 text-sm font-medium bg-gray-50/50"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            {/* Filtros de Data */}
            <div className="flex gap-2 items-center justify-between sm:justify-start">
                <span className="text-xs font-bold text-gray-400 uppercase">De:</span>
                <input 
                    type="date" 
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm w-full sm:w-auto"
                />
                <span className="text-xs font-bold text-gray-400 uppercase">Até:</span>
                <input 
                    type="date" 
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm w-full sm:w-auto"
                />
            </div>
            
            {/* Selects de Status e Origem */}
            <div className="flex gap-2 w-full sm:w-auto">
                <select 
                    value={filterStatus} 
                    onChange={e => setFilterStatus(e.target.value)}
                    className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm font-medium"
                >
                    <option value="all">Todos os Status</option>
                    <option value="delivered">Entregues</option>
                    <option value="cancelled">Cancelados</option>
                    <option value="pending">Pendentes</option>
                    <option value="preparing">Em Preparo</option>
                </select>

                <select 
                    value={filterOrigin} 
                    onChange={e => setFilterOrigin(e.target.value)}
                    className="flex-1 sm:flex-none border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm font-medium"
                >
                    <option value="all">Todas Origens</option>
                    <option value="app">App / Online</option>
                    <option value="pdv">Balcão (PDV)</option>
                    <option value="whatsapp">WhatsApp</option>
                </select>
            </div>
        </div>
      </div>

      {/* TABELA DE RESULTADOS - Com rolagem horizontal no celular */}
      <div className="flex-1 overflow-hidden print:overflow-visible bg-white rounded-xl shadow-sm border border-gray-100 print:border-none print:shadow-none flex flex-col">
          <div className="overflow-x-auto overflow-y-auto print:overflow-visible flex-1">
              {/* min-w-[800px] garante que a tabela terá barra de rolagem no celular e não vai espremer o texto */}
              <table className="w-full text-left min-w-[800px]">
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
                              <td colSpan={6} className="p-8 text-center text-gray-400 text-sm font-medium">Nenhum pedido encontrado com esses filtros.</td>
                          </tr>
                      ) : (
                          filteredOrders.map(order => (
                              <tr key={order.id} className="hover:bg-gray-50/80 transition-colors print:break-inside-avoid">
                                  <td className="p-3 text-sm font-medium text-gray-600 print:text-black whitespace-nowrap">
                                      {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </td>
                                  <td className="p-3 text-sm font-bold text-gray-900 print:text-black">
                                      #{order.id.slice(-4)}
                                  </td>
                                  <td className="p-3 text-sm font-medium text-gray-800 print:text-black">
                                      {order.customerName}
                                      {order.customerPhone && <span className="block text-xs text-gray-400 font-normal">{order.customerPhone}</span>}
                                  </td>
                                  <td className="p-3">
                                      {order.origin === 'pdv' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-[11px] font-bold border border-purple-100"><Store className="w-3 h-3 print:hidden"/> Balcão</span>
                                      ) : order.origin?.toLowerCase() === 'whatsapp' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-lg text-[11px] font-bold border border-green-100"><MessageSquare className="w-3 h-3 print:hidden"/> WhatsApp</span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[11px] font-bold border border-blue-100"><ShoppingBag className="w-3 h-3 print:hidden"/> App</span>
                                      )}
                                  </td>
                                  <td className="p-3">
                                      <span className={`px-2 py-1 rounded-lg text-[11px] font-bold uppercase
                                          ${order.status === 'delivered' ? 'bg-green-50 text-green-700 border border-green-100' : ''}
                                          ${order.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-100' : ''}
                                          ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' : ''}
                                      `}>
                                          {order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado' : 'Em Andamento'}
                                      </span>
                                  </td>
                                  <td className="p-3 text-sm font-bold text-gray-900 print:text-black whitespace-nowrap">
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
