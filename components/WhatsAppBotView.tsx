import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, Order, Company, Coupon } from '../types';
// FIX: Add missing 'X' icon import.
import { MessageSquare, Users, Send, CheckCircle, AlertCircle, Clock, Calendar, RefreshCw, Zap, Search, Filter, Play, Pause, StopCircle, ArrowLeft, Ticket, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface WhatsAppBotViewProps {
  products: Product[]; 
  orders: Order[]; // Necessário para minerar clientes
  company: Company;
  updateCompany: (data: Partial<Company>) => void;
  coupons: Coupon[]; // Para a nova feature de campanha
}

interface CustomerCRM {
    name: string;
    phone: string;
    lastPurchase: Date;
    totalOrders: number;
    status: 'recente' | 'morno' | 'inativo';
}

interface QueueItem {
    phone: string;
    name: string;
    status: 'pending' | 'waiting' | 'sending' | 'sent' | 'error';
    log?: string;
}

const N8N_WEBHOOK_URL = "https://n8n-webhook.znzrqn.easypanel.host/webhook/chegooudisparo";
const VERCEL_APP_URL = "https://chegoou.vercel.app";

// Função auxiliar de delay (promessa real)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const WhatsAppBotView: React.FC<WhatsAppBotViewProps> = ({ orders, company, updateCompany, coupons }) => {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'recente' | 'morno' | 'inativo'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'compose' | 'queue'>('list');
  
  // NEW: Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);


  // --- NEW: Composer State ---
  const [composerType, setComposerType] = useState<'message' | 'campaign'>('message');
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  // --- QUEUE STATE ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [countdown, setCountdown] = useState(0);
  const finalMessageForBatch = useRef('');
  const isCancelledRef = useRef(false);
  

  // --- 1. LÓGICA DE CLIENTES (CRM) ---
  const customers = useMemo(() => {
      const customerMap = new Map<string, CustomerCRM>();
      const now = new Date();

      orders.forEach(order => {
          const phone = order.customerPhone.replace(/\D/g, '');
          if (!phone) return;

          const orderDate = new Date(order.timestamp);
          
          if (!customerMap.has(phone)) {
              customerMap.set(phone, {
                  name: order.customerName,
                  phone: phone,
                  lastPurchase: orderDate,
                  totalOrders: 0,
                  status: 'inativo'
              });
          }

          const customer = customerMap.get(phone)!;
          customer.totalOrders += 1;
          if (orderDate > customer.lastPurchase) {
              customer.lastPurchase = orderDate;
              customer.name = order.customerName;
          }
      });

      return Array.from(customerMap.values()).map(c => {
          const diffTime = Math.abs(now.getTime() - c.lastPurchase.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

          let status: 'recente' | 'morno' | 'inativo' = 'inativo';
          if (diffDays <= 7) status = 'recente';
          else if (diffDays <= 30) status = 'morno';
          
          return { ...c, status };
      }).sort((a, b) => b.lastPurchase.getTime() - a.lastPurchase.getTime());

  }, [orders]);

  const filteredCustomers = useMemo(() => {
      return customers.filter(c => {
          const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                c.phone.includes(searchTerm);
          
          const matchesStatus = statusFilter === 'all' || c.status === statusFilter;

          return matchesSearch && matchesStatus;
      });
  }, [customers, searchTerm, statusFilter]);

  // --- 2. LÓGICA DE LIMITES DIÁRIOS ---
  const todayStr = new Date().toISOString().split('T')[0];
  const messagesSentToday = company.lastMessageDate === todayStr ? (company.messagesSentToday || 0) : 0;
  const dailyLimit = company.dailyMessageLimit || 5;
  const selectionLimit = company.leadsPerBlastLimit || 20;
  const remainingBlasts = Math.max(0, dailyLimit - messagesSentToday);

  // --- 3. QUEUE PROCESSOR LOGIC ---
  const processMessageQueue = async (currentQueue: QueueItem[]) => {
    isCancelledRef.current = false; // Reset on start
    for (let i = 0; i < currentQueue.length; i++) {
        if (isCancelledRef.current) {
            console.log("Fila de disparos cancelada.");
            return; 
        }

        const item = currentQueue[i];

        if (item.status === 'sent' || item.status === 'error') continue;

        setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'sending' } : q));
        
        const randomDelay = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;
        
        if (i > 0) { 
            let secondsLeft = Math.ceil(randomDelay / 1000);
            while (secondsLeft > 0) {
                if (isCancelledRef.current) {
                    console.log("Fila de disparos cancelada durante o delay.");
                    return;
                }
                setCountdown(secondsLeft);
                await wait(1000); 
                secondsLeft--;
            }
        }
        setCountdown(0);

        if (isCancelledRef.current) { // Check again after delay
             console.log("Fila de disparos cancelada após o delay.");
             return;
        }

        try {
            console.log(`[${i+1}/${currentQueue.length}] Disparando para: ${item.name} (${item.phone})`);
            
            const payload = {
                phone: item.phone,
                name: item.name,
                message: finalMessageForBatch.current,
                companyId: company.id,
                companyName: company.name
            };

            const response = await fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`N8N Recusou: ${response.status} - ${errorText}`);
            }

            console.log(`✅ Sucesso n8n: ${item.name}`);
            
            setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'sent' } : q));

        } catch (error: any) {
            console.error(`❌ Falha: ${item.name}`, error);
            setQueue(prev => prev.map((q, idx) => idx === i ? { ...q, status: 'error', log: error.message } : q));
        }
        
        await wait(1000);
    }
    
    if (isCancelledRef.current) return;

    setQueueStatus('completed');
    alert("Todos os disparos foram processados!");
  };
  
  

  // --- ACTIONS ---
  const handleSelect = (phone: string) => {
      if (selectedLeads.includes(phone)) {
          setSelectedLeads(prev => prev.filter(p => p !== phone));
      } else {
          if (selectedLeads.length >= selectionLimit) {
              alert(`Limite de seleção atingido: ${selectionLimit} leads por disparo.`);
              return;
          }
          setSelectedLeads(prev => [...prev, phone]);
      }
  };

  const handleSelectAll = () => {
      if (selectedLeads.length > 0) {
          setSelectedLeads([]);
      } else {
          const toSelect = filteredCustomers.slice(0, selectionLimit).map(c => c.phone);
          setSelectedLeads(toSelect);
      }
  };

  const prepareAndConfirmQueue = () => {
    if (remainingBlasts <= 0) { alert("Limite diário de disparos atingido! Volte amanhã."); return; }
    if (!messageText.trim()) { alert("Digite uma mensagem."); return; }
    if (selectedLeads.length === 0) { alert("Selecione pelo menos um destinatário."); return; }

    const restaurantLink = `${VERCEL_APP_URL}`;
    let finalMessage;

    if (composerType === 'campaign') {
        const selectedCoupon = coupons.find(c => c.id === selectedCouponId);
        if (!selectedCoupon) {
            alert("Por favor, selecione um cupom para a campanha.");
            return;
        }
        const couponText = `Aproveite nosso cupom especial ✨ *${selectedCoupon.code.toUpperCase()}* ✨ para ganhar ${selectedCoupon.discountType === 'fixed' ? `R$${selectedCoupon.discountValue.toFixed(2)}` : `${selectedCoupon.discountValue}%`} de desconto!😍💸`;
        finalMessage = `${messageText.trim()}\n\n${couponText}\n\n📲 Peça agora pelo app Chegoou:\n👉 ${restaurantLink}`;
    } else {
        finalMessage = `${messageText.trim()}`;
    }

    finalMessageForBatch.current = finalMessage;
    setShowConfirmModal(true);
  };

  const confirmAndStartQueue = async () => {
      setShowConfirmModal(false);
      
      const newCount = messagesSentToday + 1;
      updateCompany({ messagesSentToday: newCount, lastMessageDate: todayStr });
      await supabase.from('companies').update({ messagesSentToday: newCount, lastMessageDate: todayStr }).eq('id', company.id);

      const newQueue: QueueItem[] = selectedLeads.map(phone => ({
          phone,
          name: customers.find(cust => cust.phone === phone)?.name || 'Cliente',
          status: 'pending'
      }));

      setQueue(newQueue);
      setQueueStatus('running');
      setViewMode('queue');
      
      processMessageQueue(newQueue);
  };

  const handleGoBackFromQueue = () => {
    if (queueStatus === 'running') {
        if (window.confirm("A fila de disparos está em andamento. Deseja realmente cancelar e voltar?")) {
            isCancelledRef.current = true;
            setQueueStatus('idle'); // Visually stop it
            setViewMode('list');
        }
    } else {
        setViewMode('list');
        setQueue([]);
        setQueueStatus('idle');
    }
  };

  // --- RENDER ---
  
  // NEW: Confirmation Modal Render
  const renderConfirmModal = () => (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-orange-500"/> Confirmar Disparo
                </h3>
                <button onClick={() => setShowConfirmModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4">
                <p className="text-gray-600">
                    Você está prestes a enviar a mensagem abaixo para <strong>{selectedLeads.length} cliente(s)</strong>.
                </p>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 max-h-60 overflow-y-auto">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{finalMessageForBatch.current}</p>
                </div>
                 <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800 flex items-center gap-2">
                    <span>Este disparo consumirá <strong>1</strong> do seu limite diário de <strong>{remainingBlasts}</strong> restantes.</span>
                </div>
            </div>
            <div className="p-6 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
                <button onClick={() => setShowConfirmModal(false)} className="px-6 py-2 rounded-xl bg-gray-200 font-bold text-gray-700 hover:bg-gray-300 transition-colors">
                    Cancelar
                </button>
                <button onClick={confirmAndStartQueue} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-colors flex items-center gap-2">
                    <Send className="w-4 h-4" /> Confirmar e Enviar
                </button>
            </div>
        </div>
    </div>
  );

  if (showConfirmModal) return renderConfirmModal();

  if (viewMode === 'queue') {
    const progress = queue.length > 0 ? Math.round((queue.filter(i => i.status === 'sent' || i.status === 'error').length / queue.length) * 100) : 0;
    return (
        <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
            <div className="mb-6 flex items-center gap-4">
                <button 
                    onClick={handleGoBackFromQueue} 
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    title="Voltar e Cancelar"
                >
                    <ArrowLeft className="w-6 h-6 text-gray-600"/>
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Fila de Disparos</h2>
                    <p className="text-gray-500">Os envios estão sendo processados em segundo plano.</p>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-1 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-700">Progresso ({queue.filter(i => i.status === 'sent' || i.status === 'error').length}/{queue.length})</h3>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 mb-4"><div className="bg-green-500 h-4 rounded-full transition-all" style={{width: `${progress}%`}}></div></div>

                <div className="text-center mb-4 text-sm font-medium text-gray-500">
                    {queueStatus === 'running' && countdown > 0 && `Próximo envio em ${countdown} segundos...`}
                    {queueStatus === 'running' && countdown === 0 && `Processando envio...`}
                    {queueStatus === 'paused' && `Fila pausada.`}
                    {queueStatus === 'completed' && `Disparos concluídos.`}
                </div>

                <div className="overflow-y-auto flex-1 -mr-3 pr-3">
                    <table className="w-full text-left">
                        <thead className="sticky top-0 bg-white"><tr><th className="py-2 text-xs font-bold text-gray-400">Destinatário</th><th className="py-2 text-xs font-bold text-gray-400">Status</th></tr></thead>
                        <tbody>
                            {queue.map((item, idx) => (
                                <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2.5">
                                        <p className="font-medium text-gray-800">{item.name}</p>
                                        <p className="text-xs text-gray-400 font-mono">{item.phone}</p>
                                    </td>
                                    <td>
                                        {item.status === 'pending' && <span className="text-gray-400 text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3"/> Aguardando</span>}
                                        {item.status === 'waiting' && <span className="text-blue-500 text-xs font-bold flex items-center gap-1"><Clock className="w-3 h-3"/> Na fila</span>}
                                        {item.status === 'sending' && <span className="text-orange-500 text-xs font-bold flex items-center gap-1 animate-pulse"><Send className="w-3 h-3"/> Enviando...</span>}
                                        {item.status === 'sent' && <span className="text-green-500 text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Enviado</span>}
                                        {item.status === 'error' && <span className="text-red-500 text-xs font-bold flex items-center gap-1" title={item.log}><AlertCircle className="w-3 h-3"/> Erro</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  }

  if (viewMode === 'compose') {
      return (
          <div className="flex flex-col h-full max-w-4xl mx-auto">
              <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                      <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                          <ArrowLeft className="w-6 h-6 text-gray-600"/>
                      </button>
                      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="w-6 h-6 text-gray-500"/>
                        Disparo em Massa
                      </h2>
                  </div>
                  <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                      <button onClick={() => setComposerType('message')} className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${composerType === 'message' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-200/50'}`}>Mensagem</button>
                      <button onClick={() => setComposerType('campaign')} className={`px-4 py-1.5 text-sm font-bold rounded-lg transition-all ${composerType === 'campaign' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-200/50'}`}>Campanha</button>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 col-span-1 h-fit">
                      <h3 className="font-bold text-gray-700 mb-2 flex justify-between">Destinatários <span>({selectedLeads.length})</span></h3>
                      <div className="max-h-48 overflow-y-auto space-y-2 pr-2 -mr-2">
                          {selectedLeads.map(phone => {
                              const customer = customers.find(c => c.phone === phone);
                              return (
                                  <div key={phone} className="bg-gray-50 p-2 rounded-lg text-xs flex justify-between items-center">
                                      <div>
                                          <p className="font-bold text-gray-800">{customer?.name}</p>
                                          <p className="text-gray-500">{phone}</p>
                                      </div>
                                      <button onClick={() => handleSelect(phone)} className="text-red-500 p-1"><X className="w-3 h-3"/></button>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 md:col-span-2 flex flex-col">
                      <div className="flex-1 flex flex-col">
                          
                          {composerType === 'campaign' && (
                              <div className="mb-4 animate-fade-in">
                                  <label className="font-bold text-gray-700 mb-2 block">1. Selecione um Cupom</label>
                                  {coupons.filter(c => c.isActive).length > 0 ? (
                                      <select
                                          value={selectedCouponId || ''}
                                          onChange={(e) => setSelectedCouponId(e.target.value)}
                                          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-green-500 outline-none"
                                      >
                                          <option value="" disabled>Escolha um cupom ativo...</option>
                                          {coupons.filter(c => c.isActive).map(coupon => (
                                              <option key={coupon.id} value={coupon.id}>
                                                  {coupon.code} - ({coupon.discountType === 'fixed' ? `R$${coupon.discountValue.toFixed(2)}` : `${coupon.discountValue}% OFF`})
                                              </option>
                                          ))}
                                      </select>
                                  ) : (
                                      <div className="text-center p-4 bg-gray-50 rounded-lg border border-dashed">
                                          <p className="text-sm text-gray-500">Nenhum cupom ativo encontrado. Crie um na aba "Cupons".</p>
                                      </div>
                                  )}
                                  <label className="font-bold text-gray-700 mt-4 mb-2 block">2. Escreva a Mensagem</label>
                              </div>
                          )}
                          
                          {composerType === 'message' && (
                              <label className="font-bold text-gray-700 mb-2 block">Mensagem do WhatsApp</label>
                          )}

                          <div className="bg-[#E5DDD5] p-4 rounded-xl flex-1 border border-gray-200 relative mb-4">
                               <textarea 
                                  value={messageText}
                                  onChange={e => setMessageText(e.target.value)}
                                  placeholder={composerType === 'campaign' ? "Ex: Fim de semana chegou com novidade..." : "Olá! Temos uma oferta especial hoje..."}
                                  className="w-full h-full bg-white rounded-lg p-3 resize-none outline-none text-sm shadow-sm"
                               />
                               <div className="absolute bottom-6 right-6 text-xs text-gray-400">{messageText.length} caracteres</div>
                          </div>
                          
                          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 mb-4 text-xs text-yellow-800 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4"/>
                              <span>
                              {composerType === 'campaign' 
                                  ? ' O texto do cupom e o link do app serão adicionados automaticamente.'
                                  : ' Um link para seu restaurante será adicionado ao final da mensagem.'
                              }
                              </span>
                          </div>

                          <div className="flex gap-3">
                              <button onClick={() => setViewMode('list')} className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
                              <button onClick={prepareAndConfirmQueue} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"><Send className="w-5 h-5"/>Revisar e Enviar</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- VIEW MODE: LIST (Main CRM) ---
  return (
    <div className="flex flex-col h-full gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Clientes Totais", value: customers.length, icon: Users },
          { label: "Disparos Restantes", value: remainingBlasts, icon: Send },
          { label: "Leads por Disparo", value: selectionLimit, icon: Zap },
          { label: "Limite Diário", value: dailyLimit, icon: Calendar },
        ].map(stat => (
          <div key={stat.label} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <stat.icon className="w-5 h-5 text-gray-400 mb-2" />
            <p className="text-xl font-bold text-gray-800">{stat.value}</p>
            <p className="text-xs text-gray-500 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
        {/* Row 1: Search */}
        <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
                type="text" 
                placeholder="Buscar cliente por nome ou telefone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
        </div>
        {/* Row 2: Filters & Actions */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
            {/* Filter by Status */}
            <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    {[
                        {id: 'all', label: 'Todos'},
                        {id: 'recente', label: 'Recentes'},
                        {id: 'morno', label: 'Mornos'},
                        {id: 'inativo', label: 'Inativos'}
                    ].map(filter => (
                        <button 
                            key={filter.id}
                            onClick={() => setStatusFilter(filter.id as any)}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${statusFilter === filter.id ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:bg-gray-200/50'}`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1"></div> {/* Spacer */}

            {/* Action Buttons */}
            <div className="flex gap-2 w-full sm:w-auto">
                <button onClick={handleSelectAll} className="flex-1 sm:flex-none border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-gray-50">
                    {selectedLeads.length > 0 ? 'Limpar Seleção' : 'Selecionar Todos'}
                </button>
                <button onClick={() => setViewMode('compose')} disabled={selectedLeads.length === 0} className="flex-1 sm:flex-none bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm">
                    <Send className="w-4 h-4"/>
                    Novo Disparo ({selectedLeads.length})
                </button>
            </div>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex-1">
        <div className="overflow-x-auto h-full">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
              <tr>
                <th className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={selectedLeads.length === filteredCustomers.length && filteredCustomers.length > 0} /></th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Última Compra</th>
                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Total Pedidos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map(c => (
                <tr key={c.phone} className={`hover:bg-gray-50 transition-colors ${selectedLeads.includes(c.phone) ? 'bg-red-50' : ''}`}>
                  <td className="p-4"><input type="checkbox" checked={selectedLeads.includes(c.phone)} onChange={() => handleSelect(c.phone)} /></td>
                  <td className="p-4">
                      <p className="font-medium text-gray-800">{c.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{c.phone}</p>
                  </td>
                  <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold
                          ${c.status === 'recente' ? 'bg-green-100 text-green-700' : ''}
                          ${c.status === 'morno' ? 'bg-yellow-100 text-yellow-700' : ''}
                          ${c.status === 'inativo' ? 'bg-gray-100 text-gray-500' : ''}
                      `}>
                          {c.status}
                      </span>
                  </td>
                  <td className="p-4 text-sm text-gray-600">{c.lastPurchase.toLocaleDateString()}</td>
                  <td className="p-4 text-sm font-bold text-gray-800">{c.totalOrders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppBotView;