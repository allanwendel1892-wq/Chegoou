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

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

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
        const orderDateObj = new Date(order.timestamp);
        const year = orderDateObj.getFullYear();
        const month = String(orderDateObj.getMonth() + 1).padStart(2, '0');
        const day = String(orderDateObj.getDate()).padStart(2, '0');
        const orderDateStr = `${year}-${month}-${day}`;

        if (startDate && endDate) {
            matchesDate = orderDateStr >= startDate && orderDateStr <= endDate;
        } else if (startDate) {
            matchesDate = orderDateStr >= startDate;
        } else if (endDate) {
            matchesDate = orderDateStr <= endDate;
        }
      }

      return matchesSearch && matchesStatus && matchesOrigin && matchesDate;
    });
  }, [orders, searchTerm, filterStatus, filterOrigin, startDate, endDate]);

  const totalRevenue = filteredOrders
    .filter(o => o.status === 'delivered')
    .reduce((acc, order) => acc + (Number(order.total) || 0), 0);

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-red-600" />
        <span className="text-gray-500 font-medium text-sm">Carregando histórico completo...</span>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-6rem)] md:h-[calc(100vh-5rem)] flex flex-col gap-3 print:h-auto print:block">
      
      <div className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4 print:hidden shrink-0">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-red-600" />
            Panorama de Vendas
          </h2>
          
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2 md:py-1.5 rounded-lg border border-gray-100 flex-1 md:flex-none">
              <span className="text-xs text-gray-500 font-bold uppercase">Resultados</span>
              <span className="text-sm font-bold text-gray-900">{filteredOrders.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3 bg-green-50 px-3 py-2 md:py-1.5 rounded-lg border border-green-100 flex-1 md:flex-none">
              <span className="text-xs text-green-700 font-bold uppercase">Faturamento (Entregues)</span>
              <span className="text-sm font-bold text-green-700">R$ {totalRevenue.toFixed(2)}</span>
            </div>
            <button 
              onClick={handlePrint}
              className="p-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg transition-colors flex-none"
              title="Imprimir Relatório"
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
          <div className="relative sm:col-span-2 md:col-span-2">
            <input 
              type="text" 
              placeholder="Buscar cliente, tel, cód..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg outline-none focus:border-red-400 text-sm bg-gray-50/50"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          </div>
          
          <div className="col-span-1">
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm text-gray-600"
              title="Data Inicial"
            />
          </div>

          <div className="col-span-1">
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm text-gray-600"
              title="Data Final"
            />
          </div>
          
          <select 
            value={filterStatus} 
            onChange={e => setFilterStatus(e.target.value)}
            className="col-span-1 border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm text-gray-600 font-medium"
          >
            <option value="all">Status: Todos</option>
            <option value="delivered">Entregues</option>
            <option value="cancelled">Cancelados</option>
            <option value="pending">Pendentes</option>
            <option value="preparing">Em Preparo</option>
            <option value="ready">Pronto</option>
            <option value="delivering">Em Rota</option>
          </select>

          <select 
            value={filterOrigin} 
            onChange={e => setFilterOrigin(e.target.value)}
            className="col-span-1 border border-gray-200 rounded-lg px-2 py-2 outline-none focus:border-red-400 bg-gray-50/50 text-sm text-gray-600 font-medium"
          >
            <option value="all">Origem: Todas</option>
            <option value="app">App</option>
            <option value="pdv">Balcão</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden print:border-none print:shadow-none print:overflow-visible">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full text-left min-w-[750px]">
            <thead className="bg-gray-50 sticky top-0 z-10 print:static print:bg-transparent shadow-sm print:shadow-none">
              <tr>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black">Data / Hora</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black">Cód</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black">Cliente</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black">Origem</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black">Status</th>
                <th className="p-3 text-xs font-bold text-gray-500 uppercase print:text-black text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 print:divide-gray-300">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 text-sm font-medium">
                    Nenhum pedido atende aos filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/80 transition-colors print:break-inside-avoid">
                    <td className="p-3 text-xs font-medium text-gray-600 whitespace-nowrap">
                      {new Date(order.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="p-3 text-xs font-bold text-gray-900">
                      #{order.id.slice(-4)}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-gray-800">{order.customerName || 'Cliente sem nome'}</span>
                        {order.customerPhone && <span className="text-[11px] text-gray-400">{order.customerPhone}</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      {order.origin === 'pdv' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded text-[11px] font-bold border border-purple-100"><Store className="w-3 h-3 print:hidden"/> Balcão</span>
                      ) : order.origin?.toLowerCase() === 'whatsapp' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-[11px] font-bold border border-green-100"><MessageSquare className="w-3 h-3 print:hidden"/> Whats</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px] font-bold border border-blue-100"><ShoppingBag className="w-3 h-3 print:hidden"/> App</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border
                        ${order.status === 'delivered' ? 'bg-green-50 text-green-700 border-green-100' : ''}
                        ${order.status === 'cancelled' ? 'bg-red-50 text-red-700 border-red-100' : ''}
                        ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'bg-yellow-50 text-yellow-700 border-yellow-100' : ''}
                      `}>
                        {order.status === 'delivered' ? 'Entregue' : order.status === 'cancelled' ? 'Cancelado' : 'Em Andamento'}
                      </span>
                    </td>
                    <td className="p-3 text-sm font-bold text-gray-900 text-right whitespace-nowrap">
                      R$ {Number(order.total).toFixed(2)}
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
