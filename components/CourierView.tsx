import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Order, User, WithdrawalRequest } from '../types';
import { supabase } from '../services/supabaseClient';
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
    Send,
    XCircle,
    Loader2,
    MessageCircle,
    Crosshair,
    CreditCard,
    AlertTriangle,
    Package
} from 'lucide-react';

interface CourierViewProps {
  courier: User;
  availableOrders: Order[];
  acceptOrder: (orderId: string) => void;
  confirmDelivery: (orderId: string, code: string) => void;
  onLogout: () => void;
  withdrawals: WithdrawalRequest[];
  onRequestWithdrawal: (courierId: string, amount: number, orderIds: string[], companyId?: string) => Promise<void> | void;
}

// ---------------------------------------------------------------------------
// HELPERS (fora do componente: não são recriados a cada render)
// ---------------------------------------------------------------------------

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const onlyDigits = (v?: string | null): string => (v ? String(v).replace(/\D/g, '') : '');

// Chave canônica de telefone: só dígitos e sem o DDI 55 (se houver),
// para casar "(81) 99999-9999", "81999999999" e "5581999999999".
const phoneKey = (v?: string | null): string => {
  const d = onlyDigits(v);
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
};

// Converte qualquer formato de data (Date, string, Timestamp do Firestore, número)
// em Date. Strings ISO SEM fuso horário são tratadas como UTC (padrão de timestamp
// do Postgres), evitando que entregas depois das 21h (UTC-3) caiam no dia seguinte.
const parseDate = (raw: any): Date | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'object' && typeof raw.seconds === 'number') {
      return new Date(raw.seconds * 1000);
    }
    if (typeof raw === 'number') {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof raw === 'string') {
      let s = raw.trim();
      const semFuso = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s);
      if (semFuso) s = s.replace(' ', 'T') + 'Z';
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {
    return null;
  }
  return null;
};

// Data em que a entrega foi concluída. NÃO cai em createdAt: um pedido criado
// ontem e entregue hoje não pode ser tratado como "de ontem" nem vice-versa.
const getDeliveredDate = (order: any): Date | null =>
  parseDate(order.deliveredAt ?? order.delivered_at ?? order.updatedAt ?? order.updated_at ?? order.timestamp ?? order.date);

const getWithdrawalDate = (w: any): Date | null =>
  parseDate(w.date ?? w.createdAt ?? w.created_at);

const formatPaymentMethod = (method?: string) => {
  if (!method) return '—';
  const m = method.toLowerCase().trim();
  if (m === 'cash' || m === 'dinheiro') return 'Dinheiro';
  if (m === 'card' || m === 'cartao' || m === 'cartão') return 'Cartão';
  if (m === 'pix') return 'PIX';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

const sameDay = (a: Date, b: Date) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

// ---------------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------------

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

  // Código de entrega POR PEDIDO (antes era um único estado compartilhado por todos)
  const [deliveryCodes, setDeliveryCodes] = useState<Record<string, string>>({});
  // Checklist de conferência POR ITEM (controlado: não perde o estado em re-render)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  const [requestingWithdrawal, setRequestingWithdrawal] = useState(false);
  const [justRequested, setJustRequested] = useState(false); // trava até o saque pendente chegar nas props
  const requestLockRef = useRef(false);                       // trava síncrona contra duplo clique

  // "Agora" atualizado a cada minuto: faz "entregas de hoje" virar na meia-noite
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // -------------------------------------------------------------------------
  // PEDIDOS (única fonte de verdade: props do componente pai)
  // -------------------------------------------------------------------------

  const myActiveOrders = useMemo(() => {
    return (availableOrders || []).filter(o =>
        o.courierId === courier.id &&
        (o.status === 'delivering' || o.status === 'ready')
    );
  }, [availableOrders, courier.id]);

  const openPoolOrders = useMemo(() => {
    return (availableOrders || []).filter(o => o.status === 'waiting_courier');
  }, [availableOrders]);

  const myCompletedOrders = useMemo(() => {
    return (availableOrders || []).filter(o =>
        o.courierId === courier.id &&
        o.status === 'delivered'
    );
  }, [availableOrders, courier.id]);

  const todaysCompletedOrders = useMemo(() => {
    return myCompletedOrders
      .map(order => ({ order, date: getDeliveredDate(order) }))
      .filter((x): x is { order: Order; date: Date } => !!x.date && sameDay(x.date, now))
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .map(x => x.order);
  }, [myCompletedOrders, now]);

  // -------------------------------------------------------------------------
  // LOCALIZAÇÃO DOS CLIENTES
  // -------------------------------------------------------------------------

  const [customerCoords, setCustomerCoords] = useState<Record<string, { lat?: number; lng?: number }>>({});
  const fetchedPhonesRef = useRef<Set<string>>(new Set());   // já buscados COM SUCESSO
  const inFlightPhonesRef = useRef<Set<string>>(new Set());  // buscas em andamento

  // Chave estável: o effect só roda quando o CONJUNTO de telefones muda,
  // e não a cada atualização do array de pedidos.
  const activePhonesKey = useMemo(() => {
    const keys = Array.from(new Set(
      myActiveOrders.map(o => phoneKey(o.customerPhone)).filter(Boolean)
    )).sort();
    return keys.join('|');
  }, [myActiveOrders]);

  const fetchCustomerCoords = useCallback(async (keys: string[]) => {
    const pending = keys.filter(k => !fetchedPhonesRef.current.has(k) && !inFlightPhonesRef.current.has(k));
    if (pending.length === 0) return;
    pending.forEach(k => inFlightPhonesRef.current.add(k));

    // Consulta em vários formatos possíveis salvos na tabela users
    const variants = Array.from(new Set(pending.flatMap(k => [k, `55${k}`])));

    try {
      const { data, error } = await supabase
        .from('users')
        .select('phone, latitude, longitude')
        .in('phone', variants);

      if (error) {
        // Não marca como buscado: tentará de novo na próxima mudança
        console.error('Erro ao buscar localização dos clientes:', error);
        return;
      }

      setCustomerCoords(prev => {
        const next = { ...prev };
        (data || []).forEach((row: any) => {
          const key = phoneKey(row.phone);
          if (!key) return;
          const lat = parseFloat(String(row.latitude ?? '').replace(',', '.'));
          const lng = parseFloat(String(row.longitude ?? '').replace(',', '.'));
          next[key] = {
            lat: isNaN(lat) ? undefined : lat,
            lng: isNaN(lng) ? undefined : lng,
          };
        });
        return next;
      });

      // Só marca como buscado depois do sucesso
      pending.forEach(k => fetchedPhonesRef.current.add(k));
    } catch (err) {
      console.error('Falha de rede ao buscar localização dos clientes:', err);
    } finally {
      pending.forEach(k => inFlightPhonesRef.current.delete(k));
    }
  }, []);

  useEffect(() => {
    if (!activePhonesKey) return;
    fetchCustomerCoords(activePhonesKey.split('|'));
  }, [activePhonesKey, fetchCustomerCoords]);

  // -------------------------------------------------------------------------
  // CARTEIRA
  // -------------------------------------------------------------------------

  const myWithdrawals = useMemo(() => {
    return (withdrawals || [])
      .filter(w => w.courierId === courier.id || (w as any).userId === courier.id)
      .sort((a, b) => (getWithdrawalDate(b)?.getTime() || 0) - (getWithdrawalDate(a)?.getTime() || 0));
  }, [withdrawals, courier.id]);

  const pendingWithdrawal = myWithdrawals.find(w => w.status === 'pending');

  // IDs de corridas já vinculadas a saques ativos (pendentes ou pagos)
  const withdrawnOrderIds = useMemo(() => {
    const ids = new Set<string>();
    myWithdrawals.forEach(w => {
      if (w.status === 'pending' || w.status === 'paid') {
        const related = (w as any).relatedOrderIds;
        if (Array.isArray(related)) related.forEach((id: string) => ids.add(id));
      }
    });
    return ids;
  }, [myWithdrawals]);

  // Corridas concluídas que ainda não entraram em nenhum saque
  const unwithdrawnOrders = useMemo(
    () => myCompletedOrders.filter(o => !withdrawnOrderIds.has(o.id)),
    [myCompletedOrders, withdrawnOrderIds]
  );

  // Saques antigos (pendentes/pagos) SEM relatedOrderIds: não dá para saber quais
  // corridas cobrem, então o valor deles é abatido do saldo para não inflar.
  const legacyWithdrawnAmount = useMemo(() => {
    return round2(
      myWithdrawals
        .filter(w => {
          if (w.status !== 'pending' && w.status !== 'paid') return false;
          const related = (w as any).relatedOrderIds;
          return !(Array.isArray(related) && related.length > 0);
        })
        .reduce((acc, w) => acc + (Number(w.amount) || 0), 0)
    );
  }, [myWithdrawals]);

  const availableBalance = useMemo(() => {
    const produced = unwithdrawnOrders.reduce((acc, o) => acc + (Number(o.deliveryFee) || 0), 0);
    return Math.max(0, round2(produced - legacyWithdrawnAmount));
  }, [unwithdrawnOrders, legacyWithdrawnAmount]);

  const walletBalance = availableBalance;

  const totalRecebido = useMemo(() => round2(
    myWithdrawals
      .filter(w => w.status === 'paid')
      .reduce((acc, w) => acc + (Number(w.amount) || 0), 0)
  ), [myWithdrawals]);

  const availableOrderIdsToWithdraw = useMemo(
    () => unwithdrawnOrders.map(o => o.id),
    [unwithdrawnOrders]
  );

  // Libera a trava local assim que o saque pendente aparece nas props
  useEffect(() => {
    if (pendingWithdrawal) {
      setJustRequested(false);
      requestLockRef.current = false;
    }
  }, [pendingWithdrawal]);

  const handleRequestWithdrawal = async () => {
    if (availableBalance <= 0) return;
    if (requestLockRef.current || pendingWithdrawal || justRequested) return;

    requestLockRef.current = true;
    setRequestingWithdrawal(true);
    setJustRequested(true);

    // Rede de segurança: se o pai não devolver o saque pendente, destrava após 15s
    const safety = setTimeout(() => {
      setJustRequested(false);
      requestLockRef.current = false;
    }, 15_000);

    try {
      // Empresa: a da corrida mais recente que está sendo sacada; fallback no vínculo do entregador
      const latest = [...unwithdrawnOrders]
        .map(o => ({ o, d: getDeliveredDate(o)?.getTime() || 0 }))
        .sort((a, b) => b.d - a.d)[0]?.o;
      const targetCompanyId = latest?.companyId || (courier as any).companyId || undefined;

      await onRequestWithdrawal(
        courier.id,
        availableBalance,
        availableOrderIdsToWithdraw,
        targetCompanyId
      );
    } catch (err) {
      console.error('Erro ao solicitar saque:', err);
      clearTimeout(safety);
      setJustRequested(false);
      requestLockRef.current = false;
    } finally {
      setRequestingWithdrawal(false);
    }
  };

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------

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
            {!(courier as any).companyId ? (
                <div className="text-center py-10 bg-amber-50 rounded-2xl border border-dashed border-amber-300">
                    <p className="text-amber-700 font-medium px-4">
                        Sua conta ainda não está vinculada a nenhum restaurante. Fale com o restaurante para que ele vincule o seu cadastro antes de aceitar corridas.
                    </p>
                </div>
            ) : openPoolOrders.length === 0 ? (
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
                                <span className="text-xl font-black text-green-600">R$ {(Number(order.deliveryFee) || 0).toFixed(2)}</span>
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
                myActiveOrders.map(order => {
                    const pMethod = (order.paymentMethod || '').toLowerCase();
                    const isCash = pMethod.includes('cash') || pMethod.includes('dinheiro');
                    const isSettled = !!order.pay;
                    // TRAVA: pedido em dinheiro cujo caixa ainda não confirmou o acerto
                    const blockedByCashSettlement = isCash && !isSettled;

                    const rawPhone = onlyDigits(order.customerPhone);
                    const whatsappLink = rawPhone ? `https://wa.me/${rawPhone}` : null;

                    const coords = customerCoords[phoneKey(order.customerPhone)];
                    const lat = coords?.lat;
                    const lng = coords?.lng;
                    const hasExactCoords = lat !== undefined && lng !== undefined;
                    const addressSearchLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.deliveryAddress?.street || ''}, ${order.deliveryAddress?.number || ''}, ${order.deliveryAddress?.neighborhood || ''}, ${order.deliveryAddress?.city || ''}`)}`;

                    const items: any[] = (order as any).items || [];
                    const code = deliveryCodes[order.id] || '';

                    return (
                    <div key={order.id} className="bg-white rounded-2xl shadow-md border-l-4 border-green-500 overflow-hidden">
                        <div className="p-5 flex flex-col gap-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-lg text-gray-900">{order.customerName}</h3>
                                        {whatsappLink && (
                                            <a
                                                href={whatsappLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="p-1.5 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors"
                                                title="Chamar cliente no WhatsApp"
                                            >
                                                <MessageCircle className="w-4 h-4" />
                                            </a>
                                        )}
                                    </div>
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
                                    <p className="font-black text-green-700">R$ {(Number(order.deliveryFee) || 0).toFixed(2)}</p>
                                </div>
                            </div>

                            {/* DETALHES DO PEDIDO */}
                            <div className="grid grid-cols-2 gap-2 bg-gray-50 rounded-xl p-3 border border-gray-100 text-sm">
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Forma de Pagamento</p>
                                    <p className="font-bold text-gray-800 flex items-center gap-1">
                                        {isCash ? <DollarSign className="w-3.5 h-3.5 text-green-600" /> : <CreditCard className="w-3.5 h-3.5 text-blue-600" />}
                                        {formatPaymentMethod(order.paymentMethod)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Status Pagamento</p>
                                    <p className={`font-bold ${isSettled ? 'text-green-600' : 'text-yellow-600'}`}>
                                        {isSettled ? 'Acertado' : 'Pendente'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Valor Total</p>
                                    <p className="font-bold text-gray-800">R$ {(Number(order.total) || 0).toFixed(2)}</p>
                                </div>
                                {isCash && !!order.changeFor && (
                                    <div>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Troco Para</p>
                                        <p className="font-bold text-gray-800">R$ {Number(order.changeFor).toFixed(2)}</p>
                                    </div>
                                )}
                            </div>

                            {/* ITENS DO PEDIDO (checklist controlado) */}
                            {items.length > 0 && (
                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-col gap-2 mt-2">
                                    <p className="text-[10px] text-gray-400 font-bold uppercase flex items-center gap-1">
                                        <Package className="w-3.5 h-3.5" /> Conferência de Itens
                                    </p>

                                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                        {items.map((item: any, idx: number) => {
                                            const checkKey = `${order.id}:${item.id ?? idx}`;
                                            return (
                                            <label
                                                key={checkKey}
                                                className="flex items-start gap-3 p-2.5 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors shadow-sm"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!!checkedItems[checkKey]}
                                                    onChange={(e) =>
                                                        setCheckedItems(prev => ({ ...prev, [checkKey]: e.target.checked }))
                                                    }
                                                    className="mt-0.5 w-4 h-4 text-green-600 rounded border-gray-300 focus:ring-green-500 cursor-pointer"
                                                />
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-gray-800 leading-tight">
                                                        <span className="text-green-600 mr-1">{item.quantity}x</span>
                                                        {item.name || item.productName}
                                                    </p>

                                                    {item.observations && (
                                                        <p className="text-xs text-gray-500 mt-1 italic">
                                                            Obs: {item.observations}
                                                        </p>
                                                    )}

                                                    {Array.isArray(item.options) && item.options.length > 0 && (
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            + {item.options.join(', ')}
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* GPS */}
                            <div className="flex flex-col gap-2 mt-2">
                                {hasExactCoords && (
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full bg-green-50 text-green-700 font-bold py-2.5 rounded-xl border border-green-200 hover:bg-green-100"
                                    >
                                        <Crosshair className="w-5 h-5" /> Abrir Localização
                                    </a>
                                )}
                                {order.deliveryAddress && (
                                    <a
                                        href={order.deliveryAddress.mapLink || addressSearchLink}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center gap-2 w-full bg-blue-50 text-blue-700 font-bold py-2.5 rounded-xl border border-blue-200 hover:bg-blue-100"
                                    >
                                        <MapPin className="w-5 h-5" /> Buscar Endereço
                                    </a>
                                )}
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="text-sm font-bold text-gray-700 mb-2 block">Código de Entrega (se houver):</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ex: 1234"
                                        value={code}
                                        onChange={(e) =>
                                            setDeliveryCodes(prev => ({ ...prev, [order.id]: e.target.value }))
                                        }
                                        disabled={blockedByCashSettlement}
                                        className="flex-1 border-2 border-gray-200 rounded-xl px-4 py-2 text-center text-lg font-bold tracking-widest focus:border-green-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                    />
                                    <button
                                        onClick={() => {
                                            confirmDelivery(order.id, code);
                                            setDeliveryCodes(prev => {
                                                const next = { ...prev };
                                                delete next[order.id];
                                                return next;
                                            });
                                        }}
                                        disabled={blockedByCashSettlement}
                                        className="bg-green-600 text-white px-6 font-bold rounded-xl hover:bg-green-700 transition flex items-center gap-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    >
                                        <Check className="w-5 h-5" /> Entregue
                                    </button>
                                </div>
                                {blockedByCashSettlement && (
                                    <p className="mt-2 text-xs font-bold text-red-600 flex items-center gap-1.5">
                                        <AlertTriangle className="w-4 h-4 shrink-0" />
                                        Aguardando o caixa confirmar o acerto deste pedido.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    );
                })
            )}
          </div>
        )}

        {/* ABA: CARTEIRA */}
        {activeTab === 'carteira' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                <DollarSign className="absolute -right-4 -top-4 w-32 h-32 text-white opacity-5" />
                <p className="text-gray-400 font-medium text-sm">Saldo a Receber (Pendente)</p>
                <h2 className="text-4xl font-black mt-1 text-green-400">R$ {walletBalance.toFixed(2)}</h2>

                <div className="mt-6 pt-4 border-t border-gray-700 flex justify-between items-center">
                    <div>
                        <p className="text-gray-400 text-xs">Total já recebido</p>
                        <p className="font-bold">R$ {totalRecebido.toFixed(2)}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-gray-400 text-xs">Total de entregas</p>
                        <p className="font-bold">{myCompletedOrders.length} corridas</p>
                    </div>
                </div>

                <button
                    onClick={handleRequestWithdrawal}
                    disabled={availableBalance <= 0 || !!pendingWithdrawal || requestingWithdrawal || justRequested}
                    className={`w-full mt-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        pendingWithdrawal
                            ? 'bg-yellow-500/20 text-yellow-300 cursor-not-allowed'
                            : availableBalance <= 0 || justRequested
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-green-500 text-gray-900 hover:bg-green-400'
                    }`}
                >
                    {requestingWithdrawal || (justRequested && !pendingWithdrawal) ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                    ) : pendingWithdrawal ? (
                        <><Clock className="w-4 h-4" /> Saque de R$ {(Number(pendingWithdrawal.amount) || 0).toFixed(2)} em análise</>
                    ) : (
                        <><Send className="w-4 h-4" /> Solicitar Saque (R$ {availableBalance.toFixed(2)})</>
                    )}
                </button>
            </div>

            <div className="mt-6">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-gray-500" /> Minhas solicitações de saque
                </h3>
                {myWithdrawals.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Você ainda não solicitou nenhum saque.</p>
                ) : (
                    <div className="space-y-2">
                        {myWithdrawals.map(w => {
                            const wDate = getWithdrawalDate(w);
                            return (
                            <div key={w.id} className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">R$ {(Number(w.amount) || 0).toFixed(2)}</p>
                                    <p className="text-xs text-gray-400">{wDate ? wDate.toLocaleDateString('pt-BR') : '—'}</p>
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
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-6">
                <h3 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" /> Corridas entregues hoje
                </h3>
                {todaysCompletedOrders.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Você ainda não realizou nenhuma entrega hoje.</p>
                ) : (
                    <div className="space-y-2">
                        {todaysCompletedOrders.slice(0, 15).map(order => (
                            <div key={order.id} className="bg-white p-3 rounded-xl border border-gray-200 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-sm text-gray-800">{order.customerName}</p>
                                    <p className="text-xs text-gray-400">Pedido #{order.id.slice(0,6)}</p>
                                </div>
                                <div className="font-bold text-green-600">
                                    + R$ {(Number(order.deliveryFee) || 0).toFixed(2)}
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
