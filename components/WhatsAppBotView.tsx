import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, Order, Company } from '../types';
import { MessageSquare, Users, Send, CheckCircle, AlertCircle, Clock, Calendar, RefreshCw, Zap, Search, Filter, Play, Pause, StopCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface WhatsAppBotViewProps {
  products: Product[]; 
  orders: Order[]; // Necessário para minerar clientes
  company: Company;
  updateCompany: (data: Partial<Company>) => void;
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

const WhatsAppBotView: React.FC<WhatsAppBotViewProps> = ({ orders, company, updateCompany }) => {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'list' | 'compose' | 'queue'>('list');

  // --- QUEUE STATE ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueStatus, setQueueStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
  const [countdown, setCountdown] = useState(0);
  const messageRef = useRef(messageText); // Ref to access message inside useEffect without dependency

  useEffect(() => { messageRef.current = messageText; }, [messageText]);

  // --- 1. LÓGICA DE CLIENTES (CRM) ---
  const customers = useMemo(() => {
      const customerMap = new Map<string, CustomerCRM>();
      const now = new Date();

      orders.forEach(order => {
          // REMOVIDO FILTRO DE ORIGEM WHATSAPP PARA INCLUIR TODOS OS CLIENTES
          
          const phone = order.customerPhone.replace(/\D/g, '');
          if (!phone) return;

          const orderDate = new Date(order.timestamp);
          
          if (!customerMap.has(phone)) {
              customerMap.set(phone, {
                  name: order.customerName,
                  phone: phone,
                  lastPurchase: orderDate,
                  totalOrders: 0,
                  status: 'inativo' // Default placeholder
              });
          }

          const customer = customerMap.get(phone)!;
          customer.totalOrders += 1;
          if (orderDate > customer.lastPurchase) {
              customer.lastPurchase = orderDate;
              customer.name = order.customerName; // Atualiza nome mais recente
          }
      });

      // Calcula Status Recente/Morno/Inativo
      return Array.from(customerMap.values()).map(c => {
          const diffTime = Math.abs(now.getTime() - c.lastPurchase.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

          let status: 'recente' | 'morno' | 'inativo' = 'inativo';
          if (diffDays <= 7) status = 'recente';
          else if (diffDays <= 30) status = 'morno';
          
          return { ...c, status };
      }).sort((a, b) => b.lastPurchase.getTime() - a.lastPurchase.getTime()); // Mais recentes primeiro

  }, [orders]);

  const filteredCustomers = useMemo(() => {
      return customers.filter(c => 
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          c.phone.includes(searchTerm)
      );
  }, [customers, searchTerm]);

  // --- 2. LÓGICA DE LIMITES DIÁRIOS ---
  const todayStr = new Date().toISOString().split('T')[0];
  
  // Reseta contador visualmente se mudou o dia
  const messagesSentToday = company.lastMessageDate === todayStr ? (company.messagesSentToday || 0) : 0;
  
  const dailyLimit = company.dailyMessageLimit || 5; // Default 5 disparos
  const selectionLimit = company.leadsPerBlastLimit || 20; // Default 20 leads
  const remainingBlasts = Math.max(0, dailyLimit - messagesSentToday);

  // --- 3. QUEUE PROCESSOR LOGIC ---
  useEffect(() => {
      let timeoutId: any;
      let intervalId: any;

      const processQueue = async () => {
          if (queueStatus !== 'running') return;

          // Find next pending item
          const pendingIndex = queue.findIndex(i => i.status === 'pending');
          
          if (pendingIndex === -1) {
              setQueueStatus('completed');
              alert("Disparos finalizados!");
              return;
          }

          // Calculate Delay (Random 30s to 60s)
          // First item sends immediately (delay 0), others wait
          const isFirst = pendingIndex === 0;
          const minDelay = 30000; // 30s
          const maxDelay = 60000; // 60s
          const delay = isFirst ? 1000 : Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

          // Set waiting status and countdown
          setQueue(prev => prev.map((item, idx) => idx === pendingIndex ? { ...item, status: 'waiting' } : item));
          setCountdown(Math.ceil(delay / 1000));

          // Countdown interval
          intervalId = setInterval(() => {
              setCountdown(prev => Math.max(0, prev - 1));
          }, 1000);

          // Execution Timeout
          timeoutId = setTimeout(async () => {
              clearInterval(intervalId);
              
              // Set sending status
              setQueue(prev => prev.map((item, idx) => idx === pendingIndex ? { ...item, status: 'sending' } : item));

              const currentItem = queue[pendingIndex];

              try {
                  // REAL N8N COMMUNICATION
                  // Construct the final message with the deep link
                  const restaurantLink = `${VERCEL_APP_URL}?restaurantId=${company.id}`;
                  const finalMessage = `${messageRef.current}\n\nPeça agora mesmo pelo nosso app:\n${restaurantLink}`;

                  const response = await fetch(N8N_WEBHOOK_URL, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          phone: currentItem.phone,
                          name: currentItem.name,
                          message: finalMessage, // Use the final message with the link
                          companyId: company.id,
                          companyName: company.name
                      })
                  });

                  if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

                  // Update DB Stats
                  // This is now handled by the webhook, so we just update the local state for immediate feedback
                  const newCount = (company.messagesSentToday || 0) + 1;
                  updateCompany({ messagesSentToday: newCount, lastMessageDate: todayStr });
                  
                  // Set sent status
                  setQueue(prev => prev.map((item, idx) => idx === pendingIndex ? { ...item, status: 'sent' } : item));

              } catch (e: any) {
                  console.error("Queue Error:", e);
                  setQueue(prev => prev.map((item, idx) => idx === pendingIndex ? { ...item, status: 'error', log: e.message } : item));
              }
              
          }, delay);
      };

      if (queueStatus === 'running') {
        processQueue();
      }

      return () => {
          clearTimeout(timeoutId);
          clearInterval(intervalId);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueStatus, queue]); 
  

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

  const startQueue = async () => {
      if (remainingBlasts <= 0) {
          alert("Limite diário de disparos atingido! Volte amanhã.");
          return;
      }
      if (!messageText.trim()) {
          alert("Digite uma mensagem.");
          return;
      }

      // Update company stats immediately
      const newCount = messagesSentToday + 1;
      updateCompany({ messagesSentToday: newCount, lastMessageDate: todayStr });
      await supabase.from('companies').update({ 
          messagesSentToday: newCount, 
          lastMessageDate: todayStr 
      }).eq('id', company.id);

      // Initialize Queue
      const newQueue: QueueItem[] = selectedLeads.map(phone => {
          const c = customers.find(cust => cust.phone === phone);
          return {
              phone,
              name: c?.name || 'Cliente',
              status: 'pending'
          };
      });

      setQueue(newQueue);
      setQueueStatus('running');
      setViewMode('queue');
  };

  // --- RENDER ---

  if (viewMode === 'queue') {
      const progress = queue.length > 0 
        ? Math.round((queue.filter(i => i.status === 'sent' || i.status === 'error').length / queue.length) * 100) 
        : 0;

      return (
          <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
              <div className="mb-6 flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                      <RefreshCw className={`w-6 h-6 ${queueStatus === 'running' ? 'animate-spin text-green-600' : 'text-gray-400'}`} />
                      Disparando Mensagens
                  </h2>
                  <div className="flex gap-2">
                      {queueStatus === 'running' ? (
                          <button onClick={() => setQueueStatus('paused')} className="px-4 py-2 bg-yellow-100 text-yellow-700 rounded-lg font-bold flex items-center gap-2">
                              <Pause className="w-4 h-4"/> Pausar
                          </button>
                      ) : (
                          <button onClick={() => setQueueStatus('running')} className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-bold flex items-center gap-2">
                              <Play className="w-4 h-4"/> Continuar
                          </button>
                      )}
                      <button onClick={() => { setQueueStatus('idle'); setViewMode('list'); }} className="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-bold flex items-center gap-2">
                          <StopCircle className="w-4 h-4"/> Sair
                      </button>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
                  <div className="flex justify-between items-end mb-2">
                      <div>
                          <p className="text-sm text-gray-500 font-bold uppercase">Progresso da Fila</p>
                          <h3 className="text-3xl font-bold text-gray-900">{progress}%</h3>
                      </div>
                      {queueStatus === 'running' && countdown > 0 && (
                          <div className="text-right">
                              <p className="text-xs text-gray-400 font-bold uppercase mb-1">Próximo envio em</p>
                              <p className="text-2xl font-mono text-blue-600 font-bold">{countdown}s</p>
                          </div>
                      )}
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className="bg-green-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 text-blue-800 text-xs rounded-lg flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span>Intervalo de segurança aleatório (30s a 1min) ativo para evitar bloqueios do WhatsApp.</span>
                  </div>
              </div>

              <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-gray-100 bg-gray-50/50 font-bold text-gray-500 text-xs uppercase flex justify-between">
                      <span>Fila de Envio ({queue.length})</span>
                      <span>Status</span>
                  </div>
                  <div className="overflow-y-auto flex-1 p-2 space-y-2">
                      {queue.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                              <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs
                                      ${item.status === 'sent' ? 'bg-green-100 text-green-700' : ''}
                                      ${item.status === 'error' ? 'bg-red-100 text-red-700' : ''}
                                      ${item.status === 'sending' ? 'bg-blue-100 text-blue-700' : ''}
                                      ${item.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' : ''}
                                      ${item.status === 'pending' ? 'bg-gray-100 text-gray-500' : ''}
                                  `}>
                                      {idx + 1}
                                  </div>
                                  <div>
                                      <p className="font-bold text-gray-800 text-sm">{item.name}</p>
                                      <p className="text-xs text-gray-500">{item.phone}</p>
                                  </div>
                              </div>
                              <div>
                                  {item.status === 'pending' && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Na fila</span>}
                                  {item.status === 'waiting' && <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded flex items-center gap-1"><Clock className="w-3 h-3"/> Aguardando...</span>}
                                  {item.status === 'sending' && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin"/> Enviando...</span>}
                                  {item.status === 'sent' && <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Enviado</span>}
                                  {item.status === 'error' && <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Erro</span>}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  }

  if (viewMode === 'compose') {
      return (
          <div className="flex flex-col h-full max-w-4xl mx-auto">
              <div className="mb-6 flex items-center gap-4">
                  <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <ArrowLeft className="w-6 h-6 text-gray-600"/>
                  </button>
                  <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Users className="w-6 h-6 text-gray-500"/>
                    Disparo em Massa
                  </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                  {/* Preview da Lista */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 col-span-1 h-fit">
                      <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                          <Users className="w-4 h-4 text-green-600"/> Destinatários ({selectedLeads.length})
                      </h3>
                      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                          {selectedLeads.map(phone => {
                              const customer = customers.find(c => c.phone === phone);
                              return (
                                  <div key={phone} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center font-bold text-gray-500 text-xs">
                                          {customer?.name.charAt(0)}
                                      </div>
                                      <div className="overflow-hidden">
                                          <p className="font-bold text-gray-800 truncate">{customer?.name}</p>
                                          <p className="text-xs text-gray-500">{phone}</p>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>

                  {/* Compositor */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 md:col-span-2 flex flex-col">
                      <div className="flex-1 flex flex-col">
                          <label className="font-bold text-gray-700 mb-2">Mensagem do WhatsApp</label>
                          <div className="bg-[#E5DDD5] p-4 rounded-xl flex-1 border border-gray-200 relative mb-4">
                               <textarea 
                                  value={messageText}
                                  onChange={e => setMessageText(e.target.value)}
                                  placeholder="Olá! Temos uma oferta especial hoje..."
                                  className="w-full h-full bg-white rounded-lg p-3 resize-none outline-none text-sm shadow-sm"
                               />
                               <div className="absolute bottom-6 right-6 text-xs text-gray-400">
                                   {messageText.length} caracteres
                               </div>
                          </div>
                          
                          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 mb-4 text-xs text-yellow-800 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4"/>
                              <span>Este disparo consumirá <strong>1</strong> do seu limite diário de <strong>{remainingBlasts}</strong> restantes. Um link para seu restaurante será adicionado ao final da mensagem.</span>
                          </div>

                          <div className="flex gap-3">
                              <button 
                                  onClick={() => setViewMode('list')}
                                  className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                              >
                                  Cancelar
                              </button>
                              <button 
                                  onClick={startQueue}
                                  className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-200 flex items-center justify-center gap-2"
                              >
                                  <Send className="w-5 h-5"/>
                                  Iniciar Disparos
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      );
  }

  // --- VIEW MODE: LIST ---
  return (
    <div className="flex flex-col h-full gap-6">
      
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-lg text-green-600"><MessageSquare className="w-6 h-6"/></div>
              <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">Disparos Hoje</p>
                  <h3 className="text-xl font-bold text-gray-800">
                      {messagesSentToday} <span className="text-gray-400 text-sm">/ {dailyLimit}</span>
                  </h3>
              </div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-blue-100 p-3 rounded-lg text-blue-600"><Users className="w-6 h-6"/></div>
              <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">Base de Clientes</p>
                  <h3 className="text-xl font-bold text-gray-800">{customers.length}</h3>
              </div>
          </div>
           <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
              <div className="bg-purple-100 p-3 rounded-lg text-purple-600"><Zap className="w-6 h-6"/></div>
              <div>
                  <p className="text-xs text-gray-500 font-bold uppercase">Limite Seleção</p>
                  <h3 className="text-xl font-bold text-gray-800">{selectionLimit} <span className="text-xs font-normal text-gray-400">leads/vez</span></h3>
              </div>
          </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4"/>
              <input 
                  type="text" 
                  placeholder="Buscar por nome ou telefone..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
              />
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="text-sm text-gray-500 font-medium">
                  {selectedLeads.length} selecionados
              </div>
              <button 
                  onClick={() => setViewMode('compose')}
                  disabled={selectedLeads.length === 0 || remainingBlasts <= 0}
                  className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all
                      ${selectedLeads.length > 0 && remainingBlasts > 0
                          ? 'bg-green-600 text-white hover:bg-green-700 shadow-md' 
                          : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                  `}
              >
                  <Send className="w-4 h-4"/> Criar Campanha
              </button>
          </div>
      </div>

      {/* Customer List */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="overflow-x-auto flex-1">
              <table className="w-full text-left">
                  <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 backdrop-blur-sm">
                      <tr>
                          <th className="p-4 w-10">
                              <input 
                                  type="checkbox" 
                                  onChange={handleSelectAll}
                                  checked={selectedLeads.length > 0 && selectedLeads.length >= Math.min(filteredCustomers.length, selectionLimit)}
                                  className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                              />
                          </th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase">Cliente</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase">Status</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase">Última Compra</th>
                          <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Pedidos</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredCustomers.length === 0 && (
                          <tr>
                              <td colSpan={5} className="p-8 text-center text-gray-400">
                                  <Users className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                                  Nenhum cliente encontrado.
                              </td>
                          </tr>
                      )}
                      {filteredCustomers.map(customer => (
                          <tr key={customer.phone} className="hover:bg-green-50/30 transition-colors">
                              <td className="p-4">
                                  <input 
                                      type="checkbox" 
                                      checked={selectedLeads.includes(customer.phone)}
                                      onChange={() => handleSelect(customer.phone)}
                                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                  />
                              </td>
                              <td className="p-4">
                                  <div className="flex flex-col">
                                      <span className="font-bold text-gray-800">{customer.name}</span>
                                      <span className="text-xs text-gray-500">{customer.phone}</span>
                                  </div>
                              </td>
                              <td className="p-4">
                                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide inline-flex items-center gap-1.5
                                      ${customer.status === 'recente' ? 'bg-green-100 text-green-700' : ''}
                                      ${customer.status === 'morno' ? 'bg-orange-100 text-orange-700' : ''}
                                      ${customer.status === 'inativo' ? 'bg-red-100 text-red-700' : ''}
                                  `}>
                                      <span className={`w-1.5 h-1.5 rounded-full 
                                          ${customer.status === 'recente' ? 'bg-green-600' : ''}
                                          ${customer.status === 'morno' ? 'bg-orange-600' : ''}
                                          ${customer.status === 'inativo' ? 'bg-red-600' : ''}
                                      `}></span>
                                      {customer.status}
                                  </span>
                              </td>
                              <td className="p-4 text-sm text-gray-600">
                                  <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 text-gray-400"/>
                                      {customer.lastPurchase.toLocaleDateString()}
                                  </div>
                              </td>
                              <td className="p-4 text-center font-bold text-gray-700">
                                  {customer.totalOrders}
                              </td>
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