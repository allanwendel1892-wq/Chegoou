import React, { useState, useEffect, useMemo } from 'react';
import { Order } from '../types';
import { Search, Calendar, Store, MessageSquare, ShoppingBag, Printer, Loader2 } from 'lucide-react';
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
    <div className="h-[calc(100vh-6rem)] print:h-auto flex flex-col space-y-3">
      
      {/* HEADER COMPACTO */}
      <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 print:shadow-none print:border-none print:p-0">
        <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-50 rounded-lg">
                <Calendar className="w-5 h-5 text-red-600 print:text-black" />
            </div>
            <div>
                <h2 className="text-lg font-bold text-gray-800 leading-tight">Histórico de Pedidos</h2>
                <p className="text-xs text-gray-500">
                    {startDate && endDate 
                        ? `${new Date(`${startDate}T00:00:00`).toLocaleDateString()} até ${new Date(`${endDate}T00:00:00`).toLocaleDateString()}` 
                        : 'Acompanhe e filtre os pedidos passados.'}
                </p>
            </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            <div className="bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-lg flex items-center gap-2 print:border-none print:bg-transparent">
                <span className="text-[11px] font-bold text-gray-500 uppercase">Filtrados:</span>
                <span className="text-sm font-bold text-gray-900">{filteredOrders.length}</span>
            </div>
            <div className="bg-green-50 border border-green-100 px-3 py-1.5 rounded-lg flex items-center gap-2 print:border-none print:bg-transparent">
                <span className="text-[11px] font-bold text-green-700 uppercase">Faturamento:</span>
                <span className="text-sm font-bold text-green-700">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <button 
                onClick={handlePrint}
                className="print:hidden bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-colors shadow-sm ml-auto md:ml-0"
            >
                <Printer className="w-4 h-4" />
                Imprimir
            </button>
        </div>
      </div>

      {/* FILTROS COMPACTOS */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2.5 items-center print:hidden">
        <div className="relative flex-1 min-w-[200px]">
            <input 
                type="text" 
                placeholder="Buscar por nome, telefone ou código..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-red-400 text-xs font-medium bg-gray-50/50"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        </div>
        
        <div className="flex items-center gap-1.5 bg-gray-50/50 border border-gray-200 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-gray-400 uppercase">De:</span>
            <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-medium text-gray-700 cursor-pointer"
            />
            <span className="text-[11px] font-bold text-gray-400 uppercase ml-1">Até:</span>
            <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent outline-none text-xs font-medium text-gray-700 cursor-pointer"
            />
        </div>
        
        <div className="flex gap-2 w-full lg:w-auto">
            <select 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
                className="flex-1 lg:flex-initial border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-xs font-medium text-gray-700"
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
                className="flex-1 lg:flex-initial border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-xs font-medium text-gray-700"
            >
                <option value="all">Todas Origens</option>
                <option value="app">App / Online</option>
                <option value="pdv">Balcão (PDV)</option>
                <option value="whatsapp">WhatsApp</option>
            </select>
        </div>
      </div>

      {/* TABELA DE RESULTADOS COM MAIS ESPAÇO */}
      <div className="flex-1 overflow-hidden print:overflow-visible bg-white rounded-xl shadow-sm border border-gray-100 print:border-none print:shadow-none flex flex-col">
          <div className="overflow-y-auto print:overflow-visible flex-1">
              <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 print:bg-transparent sticky top-0 z-10 print:static border-b border-gray-100">
                      <tr>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black">Data / Hora</th>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black">Código</th>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black">Cliente</th>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black">Origem</th>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black">Status</th>
                          <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase print:text-black text-right">Total</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 print:divide-gray-300">
                      {filteredOrders.length === 0 ? (
                          <tr>
                              <td colSpan={6} className="p-12 text-center text-gray-400 text-sm font-medium">Nenhum pedido encontrado com esses filtros.</td>
                          </tr>
                      ) : (
                          filteredOrders.map(order => (
                              <tr key={order.id} className="hover:bg-gray-50/80 transition-colors print:break-inside-avoid">
                                  <td className="py-3 px-4 text-xs font-medium text-gray-600 print:text-black whitespace-nowrap">
                                      {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </td>
                                  <td className="py-3 px-4 text-xs font-bold text-gray-900 print:text-black whitespace-nowrap">
                                      #{order.id.slice(-4)}
                                  </td>
                                  <td className="py-3 px-4 text-xs font-medium text-gray-800 print:text-black">
                                      {order.customerName}
                                      {order.customerPhone && <span className="block text-[10px] text-gray-400 font-normal">{order.customerPhone}</span>}
                                  </td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                      {order.origin === 'pdv' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-[11px] font-bold border border-purple-100"><Store className="w-3 h-3 print:hidden"/> Balcão</span>
                                      ) : order.origin?.toLowerCase() === 'whatsapp' ? (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 rounded text-[11px] font-bold border border-green-100"><MessageSquare className="w-3 h-3 print:hidden"/> WhatsApp</span>
                                      ) : (
                                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-bold border border-blue-100"><ShoppingBag className="w-3 h-3 print:hidden"/> App</span>
                                      )}
                                  </td>
                                  <td className="py-3 px-4 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase
                                          ${order.status === 'delivered' ? 'bg-green-50 text-green-700 border border-green-100' : ''}
                                          ${order.status === 'cancelled' ? 'bg-red-50 text-red-700 border border-red-100' : ''}
                                          ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' : ''}
                                      `}>
                                          {order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado' : 'Em Andamento'}
                                      </span>
                                  </td>
                                  <td className="py-3 px-4 text-xs font-bold text-gray-900 print:text-black text-right whitespace-nowrap">
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
