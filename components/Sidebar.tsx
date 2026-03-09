import React, { useState } from 'react';
import { LayoutDashboard, UtensilsCrossed, MessageSquare, ShoppingBag, LogOut, Settings, Wallet, Ticket, MonitorStop, History } from 'lucide-react';
import { ViewState, Company } from '../types';
import { supabase } from '../services/supabaseClient'; // Importação do Supabase adicionada

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onLogout: () => void;
  companyStatus: Company['status'];
  onToggleStatus: () => void;
  company: Company; // <- ADICIONADO para poder atualizar o bot no banco de dados
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  setView, 
  isMobileOpen, 
  setIsMobileOpen, 
  onLogout, 
  companyStatus, 
  onToggleStatus,
  company // <- Recebendo a company aqui
}) => {
  
  // Estado local para controlar o visual do interruptor do bot mais rápido
  const [botActive, setBotActive] = useState(company?.chatbot !== 'disconnected');
  const [isUpdatingBot, setIsUpdatingBot] = useState(false);

  const handleToggleChatbot = async () => {
      if (!company?.id) return;
      
      setIsUpdatingBot(true);
      const newStatus = botActive ? 'disconnected' : 'connected';

      try {
          const { error } = await supabase
              .from('companies')
              .update({ chatbot: newStatus })
              .eq('id', company.id);

          if (error) throw error;

          // Atualiza visualmente na hora
          setBotActive(newStatus === 'connected');
          
      } catch (error) {
          console.error('Erro ao alternar o robô:', error);
          alert('Erro ao alterar status do robô. Tente novamente.');
      } finally {
          setIsUpdatingBot(false);
      }
  };

  const menuItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.POS, label: 'Frente de Caixa (PDV)', icon: MonitorStop },
    { id: ViewState.ORDERS, label: 'Pedidos (Kanban)', icon: ShoppingBag },
    { id: ViewState.HISTORY, label: 'Histórico de Pedidos', icon: History },
    { id: ViewState.MENU, label: 'Cardápio', icon: UtensilsCrossed },
    { id: ViewState.FINANCE, label: 'Financeiro', icon: Wallet },
    { id: ViewState.COUPONS, label: 'Cupons', icon: Ticket },
    { id: ViewState.WHATSAPP, label: 'Bot WhatsApp', icon: MessageSquare },
    { id: ViewState.SETTINGS, label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed top-0 left-0 z-30 h-screen w-72 bg-white border-r border-gray-100 shadow-xl shadow-gray-100/50 transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0 md:static flex flex-col
      `}>
        {/* Logo Area */}
        <div className="h-24 flex items-center px-8 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-gray-900 font-bold text-xl leading-none tracking-tight">Chegoou</h1>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mt-1">Painel Administrativo</p>
              </div>
            </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2 no-scrollbar">
            <p className="px-4 text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Gestão</p>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    setIsMobileOpen(false);
                  }}
                  className={`
                    w-full flex items-center gap-4 px-4 py-3.5 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-red-50 text-red-600 shadow-sm' 
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-red-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                  {item.label}
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-600"></div>}
                </button>
              );
            })}
        </nav>

        {/* Footer com Status da Loja, Bot e Logout */}
        <div className="p-5 border-t border-gray-100 bg-white shrink-0">
            {/* Botão Status da Loja */}
            <button 
                onClick={onToggleStatus}
                className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-3 w-full text-left hover:bg-gray-100 transition-colors cursor-pointer"
            >
                <p className="text-xs font-bold text-gray-500 mb-1">Status da Loja</p>
                <div className="flex items-center gap-2">
                    <span className={`relative flex h-2.5 w-2.5`}>
                        {companyStatus === 'open' && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${companyStatus === 'open' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                        {companyStatus === 'open' ? 'Aberto' : 'Fechado'}
                    </span>
                </div>
                 <p className="text-[10px] text-gray-400 mt-1">Clique para alterar</p>
            </button>

            {/* --- INÍCIO: TOGGLE ATENDENTE N8N --- */}
            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 mb-4 transition-colors hover:bg-gray-100">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Robô WhatsApp</span>
                    
                    <label className={`relative inline-flex items-center cursor-pointer ${isUpdatingBot ? 'opacity-50 pointer-events-none' : ''}`}>
                        <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={botActive}
                            onChange={handleToggleChatbot}
                            disabled={isUpdatingBot}
                        />
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </div>
                
                <span className="text-[10px] text-gray-500 font-medium">
                    {botActive 
                        ? '🟢 Respondendo clientes' 
                        : '⏸️ Pausado (Modo Manual)'}
                </span>
            </div>
            {/* --- FIM: TOGGLE ATENDENTE N8N --- */}

            <button 
                onClick={onLogout}
                className="flex items-center justify-center gap-3 px-4 py-3 w-full text-sm font-bold text-gray-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-5 h-5" />
              Sair da Conta
            </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
