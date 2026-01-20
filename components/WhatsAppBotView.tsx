
import React, { useState, useEffect } from 'react';
import { Product } from '../types';
import { MessageSquare, CheckCircle, Clock, Trash2, ClipboardList, Database, Loader2, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface WhatsAppBotViewProps {
  products: Product[]; 
}

interface RawOrder {
  id: string;
  raw_text: string;
  status: 'pending' | 'delivered';
  created_at: string;
}

const WhatsAppBotView: React.FC<WhatsAppBotViewProps> = ({ products }) => {
  const [rawOrders, setRawOrders] = useState<RawOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Busca inicial e Subscription
  useEffect(() => {
    fetchOrders();

    // Inscreve-se para atualizações em tempo real vindas do n8n/banco
    const channel = supabase
      .channel('public:ai_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_orders' }, (payload) => {
         if (payload.eventType === 'INSERT') {
            setRawOrders(prev => [payload.new as RawOrder, ...prev]);
         } else if (payload.eventType === 'UPDATE') {
            setRawOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as RawOrder : o));
         } else if (payload.eventType === 'DELETE') {
            setRawOrders(prev => prev.filter(o => o.id !== payload.old.id));
         }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('ai_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setRawOrders(data as RawOrder[]);
    } catch (error: any) {
      console.error("Erro ao buscar pedidos da IA:", error);
      setError("Não foi possível carregar os pedidos. Verifique se a tabela 'ai_orders' foi criada no Supabase.");
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: string, newStatus: 'pending' | 'delivered') => {
    // Atualização Otimista
    setRawOrders(prev => prev.map(order => 
      order.id === id ? { ...order, status: newStatus } : order
    ));

    const { error } = await supabase
      .from('ai_orders')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar status no banco:", error);
        // Reverter em caso de erro (opcional, mas recomendado)
        fetchOrders(); 
        alert("Erro ao sincronizar status. Verifique a conexão.");
    }
  };

  const deleteOrder = async (id: string) => {
    if (window.confirm('Remover este registro permanentemente?')) {
      // Atualização Otimista
      setRawOrders(prev => prev.filter(order => order.id !== id));
      
      const { error } = await supabase
        .from('ai_orders')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error("Erro ao deletar do banco:", error);
        fetchOrders(); // Reverter
      }
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-6">
      
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-600" />
          Pedidos via WhatsApp (IA)
        </h2>
        <p className="text-gray-500 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Integração Real-Time: n8n ➔ Supabase ➔ Painel
        </p>
      </div>

      <div className="flex flex-col h-full">
        {/* Full Width List */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-gray-500"/> Fila de Processamento
            </h3>
            <div className="flex items-center gap-3">
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">
                {rawOrders.length} registros
                </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            
            {/* Loading State */}
            {isLoading && rawOrders.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-green-600" />
                    <p>Carregando pedidos...</p>
                </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-600 flex flex-col items-center justify-center h-full">
                    <AlertCircle className="w-8 h-8 mb-2" />
                    <p className="font-bold">Erro de Conexão</p>
                    <p className="text-sm text-center max-w-md">{error}</p>
                    <button onClick={fetchOrders} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                        Tentar Novamente
                    </button>
                </div>
            )}

            {/* Empty State */}
            {rawOrders.length === 0 && !isLoading && !error && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-60">
                <ClipboardList className="w-16 h-16 mb-4 text-gray-200" />
                <p className="font-medium">Nenhum pedido recebido da IA ainda.</p>
                <p className="text-xs mt-1">Os pedidos aparecerão aqui automaticamente quando o n8n processar.</p>
              </div>
            )}

            {/* List */}
            {rawOrders.map((order) => (
              <div 
                key={order.id} 
                className={`border rounded-xl p-4 transition-all ${
                  order.status === 'delivered' 
                    ? 'bg-gray-50 border-gray-200 opacity-75' 
                    : 'bg-white border-l-4 border-l-green-500 border-y-gray-100 border-r-gray-100 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-xs font-mono text-gray-400 flex items-center gap-2">
                    ID: {order.id.slice(0,8)}... • {new Date(order.created_at).toLocaleString()}
                  </span>
                  <button 
                    onClick={() => deleteOrder(order.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                    title="Excluir Registro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4 font-mono text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                  {order.raw_text}
                </div>

                <div className="flex gap-3 justify-end">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase flex items-center gap-1.5
                        ${order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}
                    `}>
                        <Clock className="w-3 h-3" />
                        {order.status === 'pending' ? 'Pendente' : 'Arquivado'}
                    </span>

                   {order.status === 'pending' && (
                      <button
                        onClick={() => updateStatus(order.id, 'delivered')}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 transition-colors shadow-sm"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Marcar como Processado
                      </button>
                   )}
                   
                   {order.status === 'delivered' && (
                      <button
                        onClick={() => updateStatus(order.id, 'pending')}
                        className="bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 px-4 py-1.5 rounded-lg font-bold text-xs transition-colors"
                      >
                        Reabrir
                      </button>
                   )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppBotView;
