import React, { useState, useMemo } from 'react';
import { Order, User, WithdrawalRequest } from '../types';
import { 
    Navigation, 
    Bike, 
    CheckCircle, 
    MapPin, 
    DollarSign, 
    LogOut, 
    Wallet, 
    Clock, 
    Check,
    AlertCircle,
    Send,
    XCircle,
    Loader2
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface CourierViewProps {
  courier: User;
  availableOrders: Order[];
  acceptOrder: (orderId: string) => void;
  confirmDelivery: (orderId: string, code: string) => void;
  onLogout: () => void;
  withdrawals: WithdrawalRequest[];
  // AJUSTADO: Agora aceita o quarto parâmetro opcional 'companyId'
  onRequestWithdrawal: (courierId: string, amount: number, orderIds: string[], companyId?: string) => Promise<void> | void;
}

const CourierView: React.FC<CourierViewProps> = ({ 
    courier, 
    availableOrders, 
    acceptOrder, 
    confirmDelivery, 
    onLogout,
    withdrawals,
    onRequestWithdrawal
}) => {
  const [activeTab, setActiveTab] = useState<'disponiveis' | 'rota' | 'carteira'>('rota');
  const [deliveryCode, setDeliveryCode] = useState('');
  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);

  // Pedidos liberados para todos (limbo nunca mais)
  const openPoolOrders = useMemo(() => {
    return (availableOrders || []).filter(o => o.status === 'waiting_courier');
  }, [availableOrders]);

  // Pedidos atribuídos a ESTE motoboy que estão em andamento
  const myActiveOrders = useMemo(() => {
    return (availableOrders || []).filter(o => 
        o.courierId === courier.id && 
        (o.status === 'delivering' || o.status === 'ready')
    );
  }, [availableOrders, courier.id]);

  // Pedidos concluídos por ESTE motoboy (Para a Carteira)
  const myCompletedOrders = useMemo(() => {
    return (availableOrders || []).filter(o => 
        o.courierId === courier.id && 
        o.status === 'delivered'
    );
  }, [availableOrders, courier.id]);

  // Solicitações de saque deste entregador
  const myWithdrawals = useMemo(() => {
    return [...(withdrawals || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [withdrawals]);

  const pendingWithdrawal = myWithdrawals.find(w => w.status === 'pending');

  // --- NOVA LÓGICA DA CARTEIRA FINANCEIRA (LIVRO-CAIXA) ---
  // 1. Soma TUDO que o entregador já ganhou na vida
  const totalEarned = myCompletedOrders.reduce((acc, o) => acc + (Number(o.deliveryFee) || 0), 0);

  // 2. Soma TUDO que ele já sacou (pago) ou pediu para sacar (pendente)
  const totalSacadoOuPendente = myWithdrawals
      .filter(w => w.status === 'paid' || w.status === 'pending')
      .reduce((acc, w) => acc + (Number(w.amount) || 0), 0);

  // 3. O saldo disponível é a diferença
  const availableBalance = Math.max(0, totalEarned - totalSacadoOuPendente);
  const walletBalance = availableBalance; // Alias para manter a interface funcionando
    
  const handleRequestWithdrawal = async () => {
      if (availableBalance <= 0) return;
      setRequestingWithdrawal(true);
      try {
          // Pega a empresa da última entrega como referência
          const targetCompanyId = myCompletedOrders.length > 0 ? myCompletedOrders[myCompletedOrders.length - 1].companyId : undefined;
          
          await onRequestWithdrawal(
              courier.id, 
              availableBalance, 
              [], // Não precisamos mais enviar os IDs das corridas
              targetCompanyId
          );
      } finally {
          setRequestingWithdrawal(false);
      }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20 font-sans">
      {/* HEADER */}
      <div className="bg-gray-900 text-white p-5 shadow-lg rounded-b-3xl relative z-10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-800 rounded-full flex items-center justify-center border-2 border-green-500">
              <Bike className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">{courier?.name}</h1>
              <p className="text-gray-400 text-sm flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-green-400" /> Online e Operando
              </p>
            </div>
          </div>
          <button onClick={onLogout} className="p-2 bg-gray-800 rounded-full hover:bg-red-500 hover:text-white transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="flex bg-gray-800 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('disponiveis')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'disponiveis' ? 'bg-gray-900 text-white shadow' : 'text-gray-400'}`}
          >
            <Clock className="w-4 h-4" /> Livres
            {openPoolOrders.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{openPoolOrders.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('rota')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'rota' ? 'bg-gray-900 text-white shadow' : 'text-gray-400'}`}
          >
            <Navigation className="w-4 h-4" /> Minha Rota
            {myActiveOrders.length > 0 && (
                <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full">{myActiveOrders.length}</span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('carteira')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${activeTab === 'carteira' ? 'bg-gray-900 text-white shadow' : 'text-gray-400'}`}
          >
            <Wallet className="w-4 h-4" /> Carteira
          </button>
        </div>
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="p-4 flex-1">
        
        {/* ABA: DISPONÍVEIS */}
        {activeTab === 'disponiveis' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-700 text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" /> Pedidos Liberados
            </h2>
            {openPoolOrders.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                    <p className="text-gray-500 font-medium">Nenhum pedido livre no momento.</p>
                </div>
            ) : (
                openPoolOrders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-md">#{order.id.slice(0,6)}</span>
                                <p className="font-bold text-gray-800 mt-2">{order.customerName}</p>
                                <p className="text-sm text-gray-500 truncate max-w-[200px]">{order.deliveryAddress?.street}</p>
                            </div>
                            <div className="text-right">
                                <span className="text-xl font-black text-green-600">R$ {order.deliveryFee.toFixed(2)}</span>
                                <p className="text-xs text-gray-400">Taxa de Entrega</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => acceptOrder(order.id)}
                            className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-black transition-colors shadow-lg"
                        >
                            Aceitar Corrida
                        </button>
                    </div>
                ))
            )}
          </div>
        )}

        {/* ABA: MINHA ROTA */}
        {activeTab === 'rota' && (
          <div className="space-y-4">
            <h2 className="font-bold text-gray-700 text-lg flex items-center gap-2">
              <Navigation className="w-5 h-5 text-green-500" /> Em Andamento
            </h2>
            {myActiveOrders.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-gray-300">
                    <Bike className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">Sua rota está vazia.</p>
                </div>
            ) : (
                myActiveOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-2xl shadow-md border-l-4 border-green-500 overflow-hidden">
                        <div className="p-5 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">{order.customerName}</h3>
                                    <p className="text-gray-600 text-sm mt-1 flex items-start gap-1">
                                        <MapPin className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                                        <span>
                                            {order.deliveryAddress?.street}, {order.deliveryAddress?.number}
                                            <br/>{order.deliveryAddress?.neighborhood}
                                        </span>
                                    </p>
                                </div>
                                <div className="bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 text-center">
                                    <p className="text-xs text-green-600 font-bold uppercase">Taxa</p>
                                    <p className="font-black text-green-700">R$ {order.deliveryFee.toFixed(2)}</p>
                                </div>
                            </div>

                            {/* DYNAMIC GPS ACTION BUTTON: Redireciona para o Google Maps preenchendo automaticamente o endereço se não houver link salvo */}
                            {order.deliveryAddress && (
                                <a 
                                    href={order.deliveryAddress.mapLink || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.deliveryAddress.street || ''}, ${order.deliveryAddress.number || ''}, ${order.deliveryAddress.neighborhood || ''}, ${order.deliveryAddress.city || ''}`)}`}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-700 font-bold py-2.5 rounded-xl border border-blue-200 hover:bg-blue-100"
                                >
                                    <MapPin className="w-5 h-5" /> Abrir no GPS
                                </a>
                            )}

                            <div className="pt-4 border-t border-gray-100">
                                <label className="text-sm font-bold text-gray-700 mb-2 block">Código de Entrega (se houver):</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Ex: 1234"
                                        value={deliveryCode}
                                        onChange={(e) => setDeliveryCode(e.target.value)}
                                        className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2 text-center text-lg font-bold tracking-widest focus:border-green-500 outline-none"
                                    />
                                    <button 
                                        onClick={() => {
                                            confirmDelivery(order.id, deliveryCode);
                                            setDeliveryCode('');
                                        }}
                                        className="bg-green-600 text-white px-6 font-bold rounded-xl hover:bg-green-700 transition flex items-center gap-2"
                                    >
                                        <Check className="w-5 h-5" /> Entregue
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            )}
          </div>
        )}

        {/* ABA: CARTEIRA */}
        {activeTab === 'carteira' && (
          <div className="space-y-4">
            {/* Resumo Financeiro */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <DollarSign className="absolute -right-4 -top-4 w-32 h-32 text-white opacity-5" />
                <p className="text-gray-400 font-medium text-sm">Saldo a Receber (Pendente)</p>
                <h2 className="text-4xl font-black mt-1 text-green-400">R$ {walletBalance.toFixed(2)}</h2>
                
                <div className="mt-6 pt-4 border-t border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-xs">Total já recebido</p>
                        <p className="font-bold">R$ {totalEarned.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-gray-400 text-xs">Entregas pendentes</p>
                        <p className="font-bold">{unpaidOrders.length} corridas</p>
                    </div>
                </div>

                <button
                    onClick={handleRequestWithdrawal}
                    disabled={availableBalance <= 0 || !!pendingWithdrawal || requestingWithdrawal}
                    className={`w-full mt-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        pendingWithdrawal
                            ? 'bg-yellow-500/20 text-yellow-300 cursor-not-allowed'
                            : availableBalance <= 0
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-green-500 text-gray-900 hover:bg-green-400'
                    }`}
                >
                    {requestingWithdrawal ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    ) : pendingWithdrawal ? (
                        <><Clock className="w-4 h-4" /> Saque de R$ {pendingWithdrawal.amount.toFixed(2)} em análise</>
                    ) : (
                        <><Send className="w-4 h-4" /> Solicitar Saque (R$ {availableBalance.toFixed(2)})</>
                    )}
                </button>
            </div>

            {/* Histórico de Solicitações de Saque */}
            <div className="mt-6">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-gray-500" /> Minhas solicitações de saque
                </h3>
                {myWithdrawals.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Você ainda não solicitou nenhum saque.</p>
                ) : (
                    <div className="space-y-2">
                        {myWithdrawals.map(w => (
                            <div key={w.id} className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">R$ {w.amount.toFixed(2)}</p>
                                    <p className="text-xs text-gray-400">{new Date(w.date).toLocaleDateString('pt-BR')}</p>
                                </div>
                                {w.status === 'pending' && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-yellow-700 bg-yellow-50 px-2.5 py-1 rounded-full border border-yellow-200">
                                        <Clock className="w-3 h-3" /> Em análise
                                    </span>
                                )}
                                {w.status === 'paid' && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full border border-green-200">
                                        <CheckCircle className="w-3 h-3" /> Pago
                                    </span>
                                )}
                                {w.status === 'rejected' && (
                                    <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-full border border-red-200">
                                        <XCircle className="w-3 h-3" /> Rejeitado
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lista de Corridas Pendentes de Pagamento */}
            <div className="mt-6">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500" /> Corridas aguardando acerto
                </h3>
                {unpaidOrders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Sua carteira está zerada. Todas as entregas foram pagas!</p>
                ) : (
                    <div className="space-y-2">
                        {unpaidOrders.map(order => (
                            <div key={order.id} className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">{order.customerName}</p>
                                    <p className="text-xs text-gray-400">Pedido #{order.id.slice(0,6)}</p>
                                </div>
                                <div className="font-bold text-green-600">
                                    + R$ {order.deliveryFee.toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
};

export default CourierView;
