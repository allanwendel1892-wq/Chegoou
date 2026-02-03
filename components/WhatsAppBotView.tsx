
import React, { useState, useMemo, useEffect } from 'react';
import { Product, Order, Company } from '../types';
import { MessageSquare, Users, Send, CheckCircle, AlertCircle, Clock, Calendar, RefreshCw, Zap, Search, Filter } from 'lucide-react';
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

const WhatsAppBotView: React.FC<WhatsAppBotViewProps> = ({ orders, company, updateCompany }) => {
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'compose'>('list');

  // --- 1. LÓGICA DE CLIENTES (CRM) ---
  const customers = useMemo(() => {
      const customerMap = new Map<string, CustomerCRM>();
      const now = new Date();

      orders.forEach(order => {
          // Filtra apenas pedidos vindos do WhatsApp
          if (order.origin?.toLowerCase() !== 'whatsapp') return;
          
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
          // Seleciona até o limite
          const toSelect = filteredCustomers.slice(0, selectionLimit).map(c => c.phone);
          setSelectedLeads(toSelect);
      }
  };

  // --- FUNÇÃO OTIMIZADA COM PROMISE.ALL ---
  const handleSendMessages = async () => {
      // Validações iniciais
      if (selectedLeads.length === 0) {
        alert("Selecione pelo menos um cliente.");
        return;
      }
      if (!messageText.trim()) {
        alert("Digite uma mensagem.");
        return;
      }

      setIsSending(true);
      
      const webhookUrl = 'https://n8n-webhook.znzrqn.easypanel.host/webhook/chegooudisparo'; 

      try {
        // PREPARAÇÃO: Cria um "pacote" de envios (Promessas) em paralelo
        const sendPromises = selectedLeads.map(async (phone) => {
            try {
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        number: phone, 
                        message: messageText,
                        company: company.name
                    }),
                });
                
                return response.ok; // Retorna true se deu certo
            } catch (error) {
                console.error(`Erro ao enviar para ${phone}:`, error);
                return false; // Retorna false se falhar
            }
        });

        // DISPARO: O Promise.all dispara todos simultaneamente
        const results = await Promise.all(sendPromises);

        // Opcional: Contar sucessos se quiser logar (mas o limite é por campanha/disparo)
        const successCount = results.filter(result => result === true).length;

        // Atualização do Banco (Supabase) - Consome 1 Disparo do Limite
        if (company) {
            const newTotal = (messagesSentToday || 0) + 1;
            
            const { error } = await supabase
              .from('companies')
              .update({ 
                messagesSentToday: newTotal,
                lastMessageDate: todayStr
              })
              .eq('id', company.id);

            if (!error) {
                updateCompany({
                    messagesSentToday: newTotal,
                    lastMessageDate: todayStr
                });
                
                alert(`Campanha enviada! ${successCount} mensagens processadas.`);
                setViewMode('list');
                setSelectedLeads([]);
                setMessageText("");
            } else {
                console.error("Erro ao atualizar limite:", error);
                alert("Mensagens enviadas, mas erro ao atualizar o limite diário.");
            }
        }

      } catch (error) {
        console.error("Erro geral no envio em massa:", error);
        alert("Houve um erro ao processar os envios.");
      } finally {
        setIsSending(false);
      }
   };


  // --- RENDER ---

  if (viewMode === 'compose') {
      return (
          <div className="flex flex-col h-[calc(100vh-6rem)] max-w-4xl mx-auto">
              <div className="mb-6 flex items-center gap-4">
                  <button onClick={() => setViewMode('list')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <Users className="w-6 h-6 text-gray-600"/>
                  </button>
                  <h2 className="text-2xl font-bold text-gray-800">Nova Campanha</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
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
                              <span>Este disparo consumirá <strong>1</strong> do seu limite diário de <strong>{remainingBlasts}</strong> restantes.</span>
                          </div>

                          <div className="flex gap-3">
                              <button 
                                  onClick={() => setViewMode('list')}
                                  className="flex-1 py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition-colors"
                              >
                                  Cancelar
                              </button>
                              <button 
                                  onClick={handleSendMessages} // Corrigido para plural
                                  disabled={isSending}
                                  className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors shadow-lg shadow-green-200 flex items-center justify-center gap-2"
                              >
                                  {isSending ? <RefreshCw className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
                                  Enviar Agora
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
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-6">
      
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
                                  Nenhum cliente encontrado com origem WhatsApp.
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
