import React, { useState } from 'react';
import { ViewState, Company } from '../types';
import { supabase } from '../services/supabaseClient';
import { 
    LayoutDashboard, UtensilsCrossed, MessageSquare, ShoppingBag, 
    LogOut, Settings, Wallet, Ticket, MonitorStop, History, Package, 
    QrCode, X, RefreshCw 
} from 'lucide-react'; 

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onLogout: () => void;
  companyStatus: Company['status'];
  onToggleStatus: () => void;
  company: Company;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  setView, 
  isMobileOpen, 
  setIsMobileOpen, 
  onLogout, 
  companyStatus, 
  onToggleStatus,
  company 
}) => {
  
  const [botActive, setBotActive] = useState(company?.chatbot !== 'disconnected');
  const [isUpdatingBot, setIsUpdatingBot] = useState(false);
  
  // Estados para o Modal do QR Code
  const [showWaModal, setShowWaModal] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

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
          setBotActive(newStatus === 'connected');
      } catch (error) {
          console.error('Erro ao alternar o robô:', error);
          alert('Erro ao alterar status do robô. Tente novamente.');
      } finally {
          setIsUpdatingBot(false);
      }
  };

  // Função que busca o QR Code na Evolution API baseada no ID da Empresa
  const handleFetchQr = async () => {
      if (!company?.id) return;

      setIsFetchingQr(true);
      setQrCodeBase64(null);
      setQrError(null);

      try {
          // O URL da sua API Evolution
          const EVOLUTION_URL = 'https://evolution.znzrqn.easypanel.host';
          // Aqui garantimos que a instância é sempre e unicamente o ID da empresa logada
          const INSTANCE_NAME = company.id; 
          // Recomenda-se colocar a API KEY no .env (ex: import.meta.env.VITE_EVO_API_KEY)
          const API_KEY = 'SUA_GLOBAL_API_KEY_AQUI'; 

          const response = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`, {
              headers: { 'apikey': API_KEY }
          });
          
          if (!response.ok) {
              throw new Error('Falha ao comunicar com a Evolution API');
          }

          const data = await response.json();
          
          if (data?.base64) {
              setQrCodeBase64(data.base64);
          } else if (data?.instance?.state === 'open') {
              setQrError('A instância já está conectada!');
          } else {
              setQrError('Não foi possível gerar o QR Code no momento.');
          }
      } catch (error) {
          console.error('Erro ao buscar QR Code:', error);
          setQrError('Erro de conexão com o servidor do WhatsApp.');
      } finally {
          setIsFetchingQr(false);
      }
  };

  const menuItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.POS, label: 'Frente de Caixa (PDV)', icon: MonitorStop },
    { id: ViewState.ORDERS, label: 'Pedidos (Kanban)', icon: ShoppingBag },
    { id: ViewState.HISTORY, label: 'Histórico de Pedidos', icon: History },
    { id: ViewState.MENU, label: 'Cardápio', icon: UtensilsCrossed },
    { id: ViewState.INVENTORY, label: 'Estoque', icon: Package },
    { id: ViewState.FINANCE, label: 'Financeiro', icon: Wallet },
    { id: ViewState.COUPONS, label: 'Cupons', icon: Ticket },
    { id: ViewState.SETTINGS, label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {/* Modal do QR Code (Fica sobre toda a tela) */}
      {showWaModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative flex flex-col items-center animate-scale-in">
                  <button
                      onClick={() => setShowWaModal(false)}
                      className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                  >
                      <X className="w-5 h-5" />
                  </button>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Conectar WhatsApp</h3>
                  <p className="text-sm text-gray-500 text-center mb-6">
                      Aponte a câmera do seu celular para o código abaixo para restabelecer a conexão do robô.
                  </p>
                  
                  <div className="w-64 h-64 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center mb-6 overflow-hidden">
                      {isFetchingQr ? (
                          <div className="flex flex-col items-center text-gray-400">
                              <RefreshCw className="w-8 h-8 animate-spin mb-2" />
                              <span className="text-sm font-medium">Gerando código...</span>
                          </div>
                      ) : qrCodeBase64 ? (
                          <img src={qrCodeBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain p-2" />
                      ) : (
                          <span className="text-sm text-red-500 font-medium text-center px-4">
                              {qrError || "Clique abaixo para gerar o código."}
                          </span>
                      )}
                  </div>
                  
                  <button
                      onClick={handleFetchQr}
                      className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                  >
                      <RefreshCw className={`w-4 h-4 ${isFetchingQr ? 'animate-spin' : ''}`} />
                      {qrError ? 'Tentar Novamente' : 'Atualizar QR Code'}
                  </button>
              </div>
          </div>
      )}

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

        {/* Footer com Status da Loja, WhatsApp e Logout */}
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

            {/* Módulo Robô WhatsApp */}
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
                
                <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-gray-500 font-medium truncate mr-2">
                        {botActive 
                            ? '🟢 Ativo' 
                            : '⏸️ Pausado'}
                    </span>
                    
                    <button
                        onClick={() => { setShowWaModal(true); handleFetchQr(); }}
                        className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded hover:bg-blue-200 flex items-center gap-1 transition-colors shrink-0"
                    >
                        <QrCode className="w-3 h-3" /> Reconectar
                    </button>
                </div>
            </div> 

            {/* Logout */}
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
