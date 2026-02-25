import React from 'react';
import { LayoutDashboard, UtensilsCrossed, MessageSquare, ShoppingBag, LogOut, Settings, Wallet, Ticket } from 'lucide-react';
import { ViewState, Company } from '../types';
import { LayoutDashboard, UtensilsCrossed, MessageSquare, ShoppingBag, LogOut, Settings, Wallet, Ticket, MonitorStop, History } from 'lucide-react';

interface SidebarProps {
  currentView: ViewState;
  setView: (view: ViewState) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
  onLogout: () => void;
  companyStatus: Company['status'];
  onToggleStatus: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, isMobileOpen, setIsMobileOpen, onLogout, companyStatus, onToggleStatus }) => {
  
  const menuItems = [
    { id: ViewState.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
    { id: ViewState.POS, label: 'Frente de Caixa (PDV)', icon: MonitorStop }, // NOVO MÓDULO
    { id: ViewState.ORDERS, label: 'Pedidos (Kanban)', icon: ShoppingBag },
    { id: ViewState.HISTORY, label: 'Histórico de Pedidos', icon: History }, // NOVO MÓDULO
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
        <div className="h-24 flex items-center px-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-red-200">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-gray-900 font-bold text-xl leading-none tracking-tight">Chegoou</h1>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mt-1">Portal Empresarial</p>
              </div>
            </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-4 space-y-2">
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

        {/* Footer */}
        <div className="p-6 border-t border-gray-50">
            <button 
                onClick={onToggleStatus}
                className="bg-gray-50 rounded-2xl p-4 mb-4 w-full text-left hover:bg-gray-100 transition-colors cursor-pointer"
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
            <button 
                onClick={onLogout}
                className="flex items-center gap-3 px-4 py-3 w-full text-sm font-medium text-gray-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
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
