import React, { useState } from 'react';
import { ViewState, Company } from '../types';
import { supabase } from '../services/supabaseClient';
import { 
    LayoutDashboard, UtensilsCrossed, MessageSquare, ShoppingBag, 
    LogOut, Settings, Wallet, Ticket, MonitorStop, History, Package, 
    QrCode, X, RefreshCw, Store, Globe, Bot 
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

  const [acceptOrders, setAcceptOrders] = useState((company as any)?.accept_orders !== false);
  const [currentDeliveryMode, setCurrentDeliveryMode] = useState<string>((company as any)?.delivery_mode || 'both');
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const handleToggleAcceptOrders = async () => {
      if (!company?.id) return;
      setIsUpdatingSettings(true);
      const newValue = !acceptOrders;
      try {
          const { error } = await supabase.from('companies').update({ accept_orders: newValue }).eq('id', company.id);
          if (error) throw error;
          setAcceptOrders(newValue);
      } catch (error) {
          console.error('Erro ao alternar status do link:', error);
          alert('Erro ao alterar status do link. Tente novamente.');
      } finally {
          setIsUpdatingSettings(false);
      }
  };

  const handleChangeDeliveryMode = async (e: React.ChangeEvent<HTMLSelectElement>) => {
      if (!company?.id) return;
      setIsUpdatingSettings(true);
      const newMode = e.target.value;
      try {
          const { error } = await supabase.from('companies').update({ delivery_mode: newMode }).eq('id', company.id);
          if (error) throw error;
          setCurrentDeliveryMode(newMode);
      } catch (error) {
          console.error('Erro ao mudar o modo de entrega:', error);
          alert('Erro ao atualizar modo de entrega.');
      } finally {
          setIsUpdatingSettings(false);
      }
  };
  
  const [showWaModal, setShowWaModal] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const handleToggleChatbot = async () => {
      if (!company?.id) return;
      setIsUpdatingBot(true);
      const newStatus = botActive ? 'disconnected' : 'connected';
      try {
          const { error } = await supabase.from('companies').update({ chatbot: newStatus }).eq('id', company.id);
          if (error) throw error;
          setBotActive(newStatus === 'connected');
      } catch (error) {
          console.error('Erro ao alternar o robô:', error);
          alert('Erro ao alterar status do robô. Tente novamente.');
      } finally {
          setIsUpdatingBot(false);
      }
  };

  const handleFetchQr = async () => {
      if (!company?.id) return;
      setIsFetchingQr(true);
      setQrCodeBase64(null);
      setQrError(null);
      try {
          const EVOLUTION_URL = 'https://evolution.znzrqn.easypanel.host';
          const INSTANCE_NAME = company.id; 
          const API_KEY = 'f39d1eeee991decd02aceaea0e9d1310b31106e360d702744ed8c6020f08036b'; 
          const response = await fetch(`${EVOLUTION_URL}/instance/connect/${INSTANCE_NAME}`, { headers: { 'apikey': API_KEY } });
          if (!response.ok) throw new Error('Falha ao comunicar com a Evolution API');
          const data = await response.json();
          if (data?.base64) setQrCodeBase64(data.base64);
          else if (data?.instance?.state === 'open') setQrError('A instância já está conectada!');
          else setQrError('Não foi possível gerar o QR Code no momento.');
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
    { id: ViewState.HISTORY, label: 'Histórico', icon: History },
    { id: ViewState.MENU, label: 'Cardápio', icon: UtensilsCrossed },
    { id: ViewState.INVENTORY, label: 'Estoque', icon: Package },
    { id: ViewState.FINANCE, label: 'Financeiro', icon: Wallet },
    { id: ViewState.COUPONS, label: 'Cupons', icon: Ticket },
    { id: ViewState.SETTINGS, label: 'Configurações', icon: Settings },
  ];

  return (
    <>
      {showWaModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl relative flex flex-col items-center animate-scale-in">
                  <button onClick={() => setShowWaModal(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                      <X className="w-5 h-5" />
                  </button>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Conectar WhatsApp</h3>
                  <p className="text-sm text-gray-500 text-center mb-6">Aponte a câmera do seu celular para o código abaixo para restabelecer a conexão do robô.</p>
                  <div className="w-64 h-64 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center mb-6 overflow-hidden">
                      {isFetchingQr ? (
                          <div className="flex flex-col items-center text-gray-400"><RefreshCw className="w-8 h-8 animate-spin mb-2" /><span className="text-sm font-medium">Gerando código...</span></div>
                      ) : qrCodeBase64 ? (
                          <img src={qrCodeBase64} alt="WhatsApp QR Code" className="w-full h-full object-contain p-2" />
                      ) : (
                          <span className="text-sm text-red-500 font-medium text-center px-4">{qrError || "Clique abaixo para gerar o código."}</span>
                      )}
                  </div>
                  <button onClick={handleFetchQr} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                      <RefreshCw className={`w-4 h-4 ${isFetchingQr ? 'animate-spin' : ''}`} /> {qrError ? 'Tentar Novamente' : 'Atualizar QR Code'}
                  </button>
              </div>
          </div>
      )}

      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden transition-opacity" onClick={() => setIsMobileOpen(false)} />
      )}

      <div className={`
        fixed top-0 left-0 z-30 h-screen w-64 bg-white border-r border-gray-100 shadow-xl shadow-gray-100/50 transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 md:static flex flex-col
      `}>
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 shrink-0 border-b border-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-red-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-gray-900 font-bold text-lg leading-none tracking-tight">Chegoou</h1>
                <p className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider mt-0.5">Gestão</p>
              </div>
            </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5 no-scrollbar">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setView(item.id); setIsMobileOpen(false); }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive ? 'bg-red-50 text-red-600 shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-red-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                  {item.label}
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-600"></div>}
                </button>
              );
            })}
        </nav>

        {/* Footer: Central de Controle Compacta */}
        <div className="p-4 border-t border-gray-100 bg-white shrink-0">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 shadow-sm mb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Operação Rápida</p>
                
                <div className="space-y-3 px-1">
                    {/* Status da Loja */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Store className={`w-4 h-4 ${companyStatus === 'open' ? 'text-green-600' : 'text-gray-400'}`} />
                            <span className="text-xs font-semibold text-gray-700">Loja Aberta</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={companyStatus === 'open'} onChange={onToggleStatus} />
                            <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                    </div>

                    {/* Link Ativo */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Globe className={`w-4 h-4 ${acceptOrders ? 'text-red-500' : 'text-gray-400'}`} />
                            <span className="text-xs font-semibold text-gray-700">Receber Pedidos</span>
                        </div>
                        <label className={`relative inline-flex items-center cursor-pointer ${isUpdatingSettings ? 'opacity-50' : ''}`}>
                            <input type="checkbox" className="sr-only peer" checked={acceptOrders} onChange={handleToggleAcceptOrders} disabled={isUpdatingSettings} />
                            <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-red-500"></div>
                        </label>
                    </div>

                    {/* Modo de Entrega */}
                    <select 
                        value={currentDeliveryMode}
                        onChange={handleChangeDeliveryMode}
                        disabled={isUpdatingSettings}
                        className="w-full bg-white border border-gray-200 text-gray-600 text-[11px] font-medium rounded-lg px-2 py-1.5 outline-none focus:border-red-400 cursor-pointer"
                    >
                        <option value="both">Entregas e Retiradas</option>
                        <option value="delivery">Apenas Entregas</option>
                        <option value="pickup">Apenas Retiradas no Local</option>
                    </select>

                    <div className="h-px bg-gray-200 w-full"></div>

                    {/* Robô WhatsApp */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bot className={`w-4 h-4 ${botActive ? 'text-blue-500' : 'text-gray-400'}`} />
                            <span className="text-xs font-semibold text-gray-700">Robô Ativo</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={() => { setShowWaModal(true); handleFetchQr(); }} title="Reconectar QR Code" className="text-gray-400 hover:text-blue-600 transition-colors">
                                <QrCode className="w-4 h-4" />
                            </button>
                            <label className={`relative inline-flex items-center cursor-pointer ${isUpdatingBot ? 'opacity-50' : ''}`}>
                                <input type="checkbox" className="sr-only peer" checked={botActive} onChange={handleToggleChatbot} disabled={isUpdatingBot} />
                                <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-500"></div>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Logout */}
            <button 
                onClick={onLogout}
                className="flex items-center justify-center gap-2 w-full text-xs font-bold text-gray-500 hover:text-red-600 py-2 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sair da Conta
            </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
