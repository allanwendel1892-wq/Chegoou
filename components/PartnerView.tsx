import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, Product, Order, ViewState, Address, ProductGroup, ProductOption, ChatMessage, SalesHistoryItem, WithdrawalRequest, Coupon } from '../types';
import { enhanceProductImage } from '../services/geminiService';
import { Plus, Image as ImageIcon, Sparkles, Clock, MapPin, Truck, Check, X, GripVertical, Settings2, ChefHat, Utensils, DollarSign, Store, Calendar, Upload, Save, Disc, Trash2, LogOut, Layers, ChevronDown, ChevronUp, MessageCircle, Send, ArrowLeft, Edit, Loader2, Navigation, MousePointer2, Map as MapIcon, Crosshair, CheckCircle, Camera, AlertTriangle, Wand2, ShoppingBag, Bike, Wallet, XCircle, ArrowRight, Lock, Unlock, Banknote, AlertCircle, Info, MessageSquare, CreditCard, Printer, TrendingUp } from 'lucide-react';
import DashboardView from './DashboardView';
import WhatsAppBotView from './WhatsAppBotView';
import Sidebar from './Sidebar';
import CouponsView from './CouponsView';
import { supabase } from '../services/supabaseClient';
import POSView from './POSView';
import HistoryView from './HistoryView';
import InventoryView, { InventoryItem } from './InventoryView';

// Componente isolado para não quebrar o React
const InventoryModule = () => {
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    
    useEffect(() => {
        const fetchInventory = async () => {
            const { data } = await supabase.from('inventory_items').select('*').order('name');
            if (data) {
                // TRADUÇÃO CRÍTICA: Mapeando os dados do banco (snake_case) para a UI (camelCase)
                const mappedData: InventoryItem[] = data.map((item: any) => ({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    currentStock: item.current_stock || 0,
                    minStock: item.min_stock || 0,
                    costPrice: item.cost_price || 0
                }));
                setInventoryItems(mappedData);
            }
        };
        fetchInventory();
    }, []);

    // O setItems agora só atualiza a tela local. O salvamento no DB ocorre no próprio InventoryView.
    return (
        <InventoryView 
            items={inventoryItems} 
            setItems={setInventoryItems} 
        />
    );
};

interface PartnerViewProps {
  company: Company;
  orders: Order[];
  products: Product[];
  updateOrderStatus: (orderId: string, status: Order['status']) => void;
  updateCompany: (data: Partial<Company>) => void;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void; 
  onDeleteProduct: (productId: string) => void; 
  onLogout: () => void;
  chats: Record<string, ChatMessage[]>;
  onSendMessage: (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => void;
  onUpdateFullOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
}

const COMPANY_CATEGORIES = [
    "Lanches", "Pizza", "Japonesa", "Brasileira", "Açaí", 
    "Doces & Bolos", "Saudável", "Italiana", "Bebidas", "Padaria", 
    "Sorvetes", "Carnes", "Mercado", "Asiática"
];

const PROTECTED_VIEWS = [
    ViewState.DASHBOARD, 
    ViewState.FINANCE, 
    ViewState.SETTINGS, 
    ViewState.MENU, 
    ViewState.COUPONS, 
    ViewState.WHATSAPP,
    ViewState.HISTORY
];

interface KanbanColumnProps {
  title: string;
  status: Order['status'];
  items: Order[];
  color: string;
  isLast?: boolean;
  onClickOrder: (order: Order) => void;
  onDrop: (orderId: string, status: Order['status']) => void;
  chats: Record<string, ChatMessage[]>;
  onOpenChat: (orderId: string) => void;
  onPrintOrder: (order: Order) => void;
  products: Product[];
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, status, items, color, isLast, onClickOrder, onDrop, chats, onOpenChat, onPrintOrder, products }) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(true);
  };

  const handleDragLeave = () => {
      setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const orderId = e.dataTransfer.getData("orderId");
      if (orderId) {
          onDrop(orderId, status);
      }
  };

  return (
    <div 
        className={`flex flex-col h-full w-[300px] min-w-[300px] max-w-[300px] shrink-0 bg-gray-50 rounded-2xl border-t-4 ${color} ${!isLast ? 'mr-4' : ''} transition-colors ${isOver ? 'bg-gray-100 ring-2 ring-gray-300' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      <div className="p-4 flex justify-between items-center border-b border-gray-100 shrink-0">
        <h3 className="font-bold text-gray-700 truncate pr-2">{title}</h3>
        <span className="bg-white px-2 py-1 rounded-lg text-xs font-bold text-gray-500 shadow-sm shrink-0">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {items.map(order => {
              const orderChats = chats[order.id] || [];
              const hasMessages = orderChats.length > 0;
              const lastMsg = hasMessages ? orderChats[orderChats.length - 1] : null;
              const hasUnread = lastMsg?.senderRole === 'client';
              
              const isWhatsapp = order.origin?.toLowerCase() === 'whatsapp';
              const pMethod = order.paymentMethod?.toLowerCase() || '';
              const dMethod = order.deliveryMethod?.toLowerCase() || '';

              return (
                  <div 
                      key={order.id} 
                      draggable
                      onDragStart={(e) => {
                          e.dataTransfer.setData("orderId", order.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.currentTarget.style.opacity = "0.5";
                      }}
                      onDragEnd={(e) => {
                          e.currentTarget.style.opacity = "1";
                      }}
                      onClick={() => onClickOrder(order)}
                      className={`bg-white p-4 rounded-xl shadow-sm border ${isWhatsapp ? 'border-green-200 bg-green-50/30' : 'border-gray-100'} hover:shadow-md transition-all cursor-grab active:cursor-grabbing group select-none relative overflow-hidden`}
                  >
                      {isWhatsapp && (
                          <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full p-1 shadow-sm z-10" title="Pedido via WhatsApp (IA)">
                              <MessageSquare className="w-3 h-3" fill="white" />
                          </div>
                      )}

                      <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-gray-900 group-hover:text-red-600 transition-colors">#{order.id.slice(-4)}</span>
                          <span className="text-xs text-gray-400 flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              {new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                      </div>
                      <div className="mb-3">
                          {dMethod.includes('pickup') || dMethod.includes('retirada') ? (
                              <span className="inline-flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-100 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide">
                                  <Store className="w-3 h-3" /> Retirada
                              </span>
                          ) : (
                              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide">
                                  <Bike className="w-3 h-3" /> Entrega
                              </span>
                          )}
                      </div>
                      
                      <div className="mb-3">
                          <div className="flex items-center gap-2 mb-1">
                              <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 text-[10px] shrink-0">
                                  {order.customerName.charAt(0)}
                              </div>
                              <span className="text-sm font-medium text-gray-800 truncate">{order.customerName}</span>
                          </div>
                          {order.deliveryAddress && (
                              <p className="text-[10px] text-gray-500 flex items-start gap-1 pl-1 line-clamp-2">
                                  <MapPin className="w-3 h-3 shrink-0 mt-0.5"/> {order.deliveryAddress.street}, {order.deliveryAddress.number} - {order.deliveryAddress.neighborhood}
                              </p>
                          )}
                      </div>

                      <div className="space-y-2 bg-gray-50 p-2.5 rounded-lg mb-3 border border-gray-100">
                          {Array.isArray(order.items) && order.items.length > 0 ? (
                              <>
                                  {order.items.slice(0, 3).map((item, idx) => (
                                      <div key={idx} className="flex flex-col border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                                          <div className="text-xs text-gray-800 font-medium flex justify-between gap-2">
                                              <span className="truncate">{item.quantity}x {item.productName}</span>
                                          </div>
                                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                                              <div className="pl-3 mt-1 space-y-1">
                                                  {(() => {
                                                      const originalProduct = products.find(p => p.name === item.productName);
                                                      const isPizza = (item as any).pricingMode === 'pizza' || originalProduct?.pricingMode === 'pizza';
                                                      const groups: Record<string, string[]> = {};
                                                      
                                                      item.selectedOptions.forEach(opt => {
                                                          const g = (opt as any).groupName || '';
                                                          if (!groups[g]) groups[g] = [];
                                                          groups[g].push(opt.optionName || opt.name);
                                                      });
                                                      
                                                      return Object.entries(groups).map(([gName, opts], groupIdx) => {
                                                          // 1. Lê a flag dividePrice direto do JSON salvo no banco
                                                          const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                                                          
                                                          // 2. Fallback caso seja um pedido muito antigo e não tenha a flag no JSON
                                                          const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
                                                          
                                                          // 3. Define a regra final (priorizando o JSON do pedido)
                                                          const divideThisGroup = snapshotDivide || originalGroup?.dividePrice || (isPizza && gName.toLowerCase().includes('sabor'));

                                                          if (divideThisGroup) {
                                                              const fraction = opts.length > 1 ? `1/${opts.length} ` : '';
                                                              return (
                                                                  <React.Fragment key={groupIdx}>
                                                                      {opts.map((o, i) => (
                                                                          <div key={i} className="text-[10px] text-gray-600 leading-tight mt-0.5">
                                                                              <span className="font-bold text-gray-800">+ {fraction}{o}</span>
                                                                          </div>
                                                                      ))}
                                                                  </React.Fragment>
                                                              );
                                                          } else {
                                                              return (
                                                                  <div key={groupIdx} className="text-[10px] text-gray-600 leading-tight mt-0.5">
                                                                      {gName ? <span className="font-bold text-gray-800 uppercase">{gName}: </span> : <span className="font-bold text-gray-800">+ </span>}
                                                                      <span className="font-bold text-gray-800">{opts.join(', ')}</span>
                                                                  </div>
                                                              );
                                                          }
                                                      });
                                                  })()}
                                              </div>
                                          )}
                                      </div>
                                  ))}
                                  {order.items.length > 3 && <div className="text-[10px] text-center text-gray-400 font-medium pt-1">Ver mais {order.items.length - 3} itens...</div>}
                              </>
                          ) : (
                              <p className="text-xs text-gray-600 italic whitespace-pre-wrap leading-relaxed break-words">
                                  {order.raw_description || "Sem descrição"}
                              </p>
                          )}
                      </div>

                      <div className="mb-2">
                          {pMethod.includes('cash') || pMethod.includes('dinheiro') ? (
                              <div className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-green-200 w-fit">
                                  <DollarSign className="w-3 h-3 shrink-0"/>
                                  <span className="truncate">Dinheiro {order.changeFor ? `(Troco p/ R$ ${order.changeFor.toFixed(2)})` : ''}</span>
                              </div>
                          ) : pMethod.includes('pix') ? (
                              <div className="bg-teal-100 text-teal-800 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-teal-200 w-fit">
                                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-4.33-6.027l2.997 2.998 2.062-2.064-2.997-2.997 2.997-2.998-2.063-2.063-2.996 2.997-2.998-2.997-2.063 2.063 2.997 2.998-2.997 2.063 2.064 2.998-2.998z"/></svg>
                                  Pix
                              </div>
                          ) : pMethod.includes('card') || pMethod.includes('cartao') || pMethod.includes('cartão') ? (
                              <div className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-blue-200 w-fit">
                                  <CreditCard className="w-3 h-3 shrink-0"/>
                                  Cartão
                              </div>
                          ) : (
                              <div className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 border border-green-200 w-fit">
                                  <MessageSquare className="w-3 h-3 shrink-0"/>
                                  Combinado no Chat
                              </div>
                          )}
                      </div>

                      {order.status === 'waiting_payment' && !isWhatsapp && (
                           <div className="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-1 rounded mb-2 flex items-center gap-1 border border-yellow-200 w-fit">
                               <Clock className="w-3 h-3 shrink-0"/>
                               Aguardando Pagamento
                           </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-gray-50 mt-2">
                          <span className="font-bold text-sm shrink-0">R$ {order.total.toFixed(2)}</span>
                          
                          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                              
                              {status !== 'delivered' && status !== 'cancelled' && (
                                  <button 
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          const nextStatusMap: Record<string, Order['status']> = {
                                              'waiting_payment': 'pending',
                                              'pending': 'preparing',
                                              'preparing': 'ready',
                                              'ready': 'delivering',
                                              'waiting_courier': 'delivering',
                                              'delivering': 'delivered'
                                          };
                                          const nextStatus = nextStatusMap[status];
                                          if (nextStatus) onDrop(order.id, nextStatus);
                                      }}
                                      className="md:hidden bg-red-100 text-red-700 hover:bg-red-200 px-2 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 shrink-0"
                                      title="Avançar Pedido"
                                  >
                                      Avançar <ArrowRight className="w-3 h-3" />
                                  </button>
                              )}

                              <button
                                onClick={(e) => { e.stopPropagation(); onPrintOrder(order); }}
                                className="p-2 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors shrink-0"
                                title="Imprimir Pedido"
                              >
                                  <Printer className="w-4 h-4" />
                              </button>

                              {!isWhatsapp && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onOpenChat(order.id); }}
                                    className={`p-2 rounded-full transition-all flex items-center gap-1 shrink-0
                                        ${hasUnread 
                                            ? 'bg-red-600 text-white animate-pulse shadow-md shadow-red-200' 
                                            : hasMessages ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }
                                    `}
                                    title="Chat com Cliente"
                                >
                                    <MessageCircle className="w-4 h-4" />
                                    {hasUnread && <span className="text-[10px] font-bold">Novo</span>}
                                </button>
                              )}
                              {isWhatsapp && (
                                  <button onClick={() => window.open(`https://wa.me/${order.customerPhone}`, '_blank')} className="p-2 rounded-full bg-green-100 text-green-600 hover:bg-green-200 shrink-0">
                                      <MessageSquare className="w-4 h-4"/>
                                  </button>
                              )}
                          </div>
                      </div>
                  </div>
              );
          })}
          {items.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50 pointer-events-none">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-2 shrink-0">
                      <ShoppingBag className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium">Solte aqui</p>
              </div>
          )}
      </div>
    </div>
  );
};

const calculateBankFee = (amount: number, percentage: number) => {
    const rawFee = amount * (percentage / 100);
    return Math.ceil(rawFee * 100) / 100;
};

const PartnerView: React.FC<PartnerViewProps> = ({ 
    company, orders, products, updateOrderStatus, updateCompany, onAddProduct, onUpdateProduct, onDeleteProduct, onLogout,
    chats, onSendMessage, onUpdateFullOrder, onDeleteOrder
}) => {
  const [view, setView] = useState<ViewState>(company.adminPin ? ViewState.POS : ViewState.DASHBOARD);
  const [isUnlocked, setIsUnlocked] = useState(!company.adminPin);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState<ViewState | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const prevOrdersCount = useRef(orders.length);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null); 
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isConfirmingStatus, setIsConfirmingStatus] = useState(false);
  
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
      isAvailable: true,
      price: 0,
      pricingMode: 'default',
      groups: []
  });
  
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState<string>('');
  const [activeChatOrder, setActiveChatOrder] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [localCompany, setLocalCompany] = useState<Company>(company);
  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [withdrawHistory, setWithdrawHistory] = useState<WithdrawalRequest[]>([]);
  const [isLoadingFinance, setIsLoadingFinance] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  // --- MÁGICA ADICIONADA AQUI: Buscando dados pro Dashboard ---
  const [compositions, setCompositions] = useState<any[]>([]);
  const [dashboardInventoryItems, setDashboardInventoryItems] = useState<any[]>([]);

  useEffect(() => {
      const fetchDashboardData = async () => {
          const [compRes, invRes] = await Promise.all([
              supabase.from('compositions').select('*'),
              supabase.from('inventory_items').select('*')
          ]);
          if (compRes.data) setCompositions(compRes.data);
          if (invRes.data) setDashboardInventoryItems(invRes.data);
      };
      fetchDashboardData();
  }, []);
  // -------------------------------------------------------------
  
  useEffect(() => { setLocalCompany(company); }, [company]);

  useEffect(() => {
      if (autoPrintEnabled && orders.length > prevOrdersCount.current) {
          const newOrder = orders[0]; 
          if (newOrder && (newOrder.status === 'pending' || newOrder.status === 'waiting_payment')) {
              handlePrintOrder(newOrder);
          }
      }
      prevOrdersCount.current = orders.length;
  }, [orders, autoPrintEnabled]);

  const handleNavigation = (newView: ViewState) => {
    if (localCompany.adminPin && !isUnlocked && PROTECTED_VIEWS.includes(newView)) {
        setPendingView(newView);
        setPinModalOpen(true);
    } else {
        setView(newView);
    }
  };

  const handleVerifyPin = () => {
      if (pinInput === localCompany.adminPin) {
          setIsUnlocked(true);
          setPinModalOpen(false);
          setPinInput('');
          setPinError('');
          if (pendingView) {
              setView(pendingView);
              setPendingView(null);
          }
      } else {
          setPinError('PIN incorreto. Tente novamente.');
          setPinInput('');
      }
  };

  const handleLockSession = () => {
      setIsUnlocked(false);
      setView(ViewState.POS);
  };

  const handleToggleStatus = () => {
    setIsConfirmingStatus(true);
  };

  const handleConfirmStatusChange = () => {
    const newStatus = company.status === 'open' ? 'closed' : 'open';
    updateCompany({ status: newStatus });
    setIsConfirmingStatus(false);
  };

  const handlePrintOrder = (order: Order) => {
      const itemsHtml = Array.isArray(order.items) ? order.items.map(item => {
          let optionsHtml = '';
          const originalProduct = products.find(p => p.name === item.productName);
          const isPizza = (item as any).pricingMode === 'pizza' || originalProduct?.pricingMode === 'pizza';

          if (item.selectedOptions && item.selectedOptions.length > 0) {
              const groups: Record<string, string[]> = {};
              item.selectedOptions.forEach(opt => {
                  const g = (opt as any).groupName || '';
                  if (!groups[g]) groups[g] = [];
                  groups[g].push(opt.optionName || opt.name);
              });
              
              optionsHtml = `<div style="font-size: 11px; margin-left: 10px; margin-bottom: 5px;">
              ${Object.entries(groups).map(([gName, opts]) => {
                  // 1. Lê a flag dividePrice direto do JSON salvo no banco
                  const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                  
                  // 2. Fallback caso seja um pedido muito antigo e não tenha a flag no JSON
                  const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
                  
                  // 3. Define a regra final (priorizando o JSON do pedido)
                  const divideThisGroup = snapshotDivide || originalGroup?.dividePrice || (isPizza && gName.toLowerCase().includes('sabor'));
              
                  if (divideThisGroup) {
                      const fraction = opts.length > 1 ? `1/${opts.length} ` : '';
                      return opts.map(o => `<div style="margin-bottom: 3px;"><b>+ ${fraction}${o}</b></div>`).join('');
                  } else {
                      if (gName) {
                          return `<div style="margin-bottom: 3px;"><b>${gName.toUpperCase()}:</b> <b>${opts.join(', ')}</b></div>`;
                      } else {
                          return opts.map(o => `<div style="margin-bottom: 3px;"><b>+ ${o}</b></div>`).join('');
                      }
                  }
              }).join('')}
              </div>`;
          }

          return `
              <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                  <span style="font-weight:bold;">${item.quantity}x</span>
                  <span style="flex:1; margin-left: 5px; font-weight:bold;">${item.productName}</span>
                  <span style="font-weight:bold;">R$ ${(item.price * item.quantity).toFixed(2)}</span>
              </div>
              ${optionsHtml}
          `;
      }).join('') : `<p>${order.raw_description || 'Itens não estruturados'}</p>`;

      const addressHtml = order.deliveryMethod === 'pickup' 
        ? '<p style="text-align:center; font-weight:bold; font-size:14px; margin: 10px 0;">RETIRADA NO BALCÃO</p>'
        : `
          <p style="font-weight:bold;">ENTREGA</p>
          <p>${order.deliveryAddress?.street}, ${order.deliveryAddress?.number}</p>
          <p>${order.deliveryAddress?.neighborhood} - ${order.deliveryAddress?.city}</p>
          ${order.deliveryAddress?.zipCode ? `<p>CEP: ${order.deliveryAddress.zipCode}</p>` : ''}
        `;

      const paymentInfo = order.paymentMethod === 'cash' 
        ? `DINHEIRO ${order.changeFor ? `(Troco p/ R$ ${order.changeFor.toFixed(2)})` : ''}`
        : order.paymentMethod.toUpperCase();

      const htmlContent = `
          <html>
              <head>
                  <title>Pedido #${order.id.slice(-4)}</title>
                  <style>
                      body { 
                          font-family: 'Courier New', monospace; 
                          width: 80mm; 
                          margin: 0; 
                          padding: 10px; 
                          font-size: 12px; 
                          color: #000000; 
                      }
                      .center { text-align: center; }
                      .line { border-bottom: 1px dashed #000; margin: 10px 0; }
                      h2, h3 { margin: 5px 0; }
                      .bold { font-weight: bold; }
                      .flex { display: flex; justify-content: space-between; }
                      @media print {
                          @page { margin: 0; size: 80mm auto; }
                          body { margin: 0; padding: 5px; }
                      }
                  </style>
              </head>
              <body>
                  <div class="center">
                      <h3 class="bold">${company.name}</h3>
                      <p>${new Date(order.timestamp).toLocaleString()}</p>
                      <h2 style="font-size: 24px; margin: 10px 0;">#${order.id.slice(-4)}</h2>
                  </div>
                  <div class="line"></div>
                  <div style="margin-bottom: 10px;">
                      <span class="bold">Cliente:</span> ${order.customerName}<br/>
                      <span class="bold">Tel:</span> ${order.customerPhone}
                  </div>
                  <div class="line"></div>
                  ${itemsHtml}
                  <div class="line"></div>
                  <div class="flex">
                      <span>Subtotal:</span>
                      <span>R$ ${order.subtotal.toFixed(2)}</span>
                  </div>
                  <div class="flex">
                      <span>Entrega:</span>
                      <span>R$ ${order.deliveryFee.toFixed(2)}</span>
                  </div>
                  <div class="flex" style="font-size: 16px; font-weight: bold; margin-top: 5px;">
                      <span>TOTAL:</span>
                      <span>R$ ${order.total.toFixed(2)}</span>
                  </div>
                  <div class="line"></div>
                  <p class="center bold">${paymentInfo}</p>
                  <div class="line"></div>
                  <div style="margin-top: 10px;">
                      ${addressHtml}
                  </div>
                  <div class="center" style="margin-top: 20px;">
                      <p>*** NÃO É DOCUMENTO FISCAL ***</p>
                      <p>Chegoou Delivery</p>
                  </div>
              </body>
          </html>
      `;

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
          iframeDoc.write(htmlContent);
          iframeDoc.close();

          setTimeout(() => {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
              setTimeout(() => {
                  document.body.removeChild(iframe);
              }, 2000);
          }, 500);
      }
  };

  useEffect(() => {
    const healFinancials = async () => {
        const ordersToFix = orders.filter(o => 
            o.status === 'delivered' && 
            o.paymentMethod !== 'cash' && 
            o.origin !== 'whatsapp' && 
            o.origin !== 'pos' && // TRAVA ADICIONADA: Impede geração de repasse para PDV
            (o.repasseStatus === 'pending' || !o.repasseStatus)
        );

        for (const order of ordersToFix) {
             const now = new Date();
             const orderTime = new Date(order.timestamp);
             const hoursDiff = (now.getTime() - orderTime.getTime()) / (1000 * 60 * 60);
             
             const newStatus = hoursDiff > 12 ? 'available' : 'blocked';
             
             let newValue = order.repasseValue === undefined || order.repasseValue === null ? 0 : order.repasseValue;
             
             if (newValue === 0 && order.total > 0) {
                 if (company.deliveryType === 'own') {
                     newValue = order.subtotal + order.deliveryFee; 
                 } else {
                     newValue = order.subtotal;
                 }
             }

             console.log(`Self-Healing Order #${order.id.slice(-4)}: Status ${newStatus}, Value ${newValue}`);

             await supabase.from('orders').update({ 
                 repasseStatus: newStatus,
                 repasseValue: newValue,
                 repasseDate: order.repasseDate || new Date().toISOString()
             }).eq('id', order.id);
        }
    };
    
    const interval = setInterval(healFinancials, 5000);
    healFinancials(); 
    return () => clearInterval(interval);
  }, [orders, company.deliveryType]);

  useEffect(() => {
    const checkBlockedFunds = async () => {
        const now = new Date();
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

        const ordersToUnlock = orders.filter(o => 
            o.repasseStatus === 'blocked' &&
            o.repasseDate &&
            new Date(o.repasseDate) < twelveHoursAgo
        );

        if (ordersToUnlock.length > 0) {
            console.log(`[Finance Engine] Desbloqueando ${ordersToUnlock.length} pedido(s) para saque...`);
            const updates = ordersToUnlock.map(order => 
                supabase
                    .from('orders')
                    .update({ repasseStatus: 'available' })
                    .eq('id', order.id)
            );
            
            Promise.all(updates).catch(err => console.error("Erro ao desbloquear fundos:", err));
        }
    };

    const intervalId = setInterval(checkBlockedFunds, 5 * 60 * 1000);
    checkBlockedFunds(); 

    return () => clearInterval(intervalId);
  }, [orders]);

  useEffect(() => {
    if (view === ViewState.FINANCE) {
        setIsLoadingFinance(true);
        const fetchWithdrawals = async () => {
             const { data } = await supabase.from('withdrawal_requests').select('*').eq('userId', company.id).order('date', {ascending: false});
             if (data) setWithdrawHistory(data);
             setIsLoadingFinance(false);
        };
        fetchWithdrawals();
    }
  }, [view, company.id]);
  
  useEffect(() => {
    const fetchCoupons = async () => {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('companyId', company.id)
        .order('createdAt', { ascending: false });
      if (data) setCoupons(data);
    };
    if (view === ViewState.COUPONS) {
      fetchCoupons();
    }
  }, [view, company.id]);
  
  const handleSaveCoupon = async (coupon: Coupon) => {
    const { data, error } = await supabase.from('coupons').upsert(coupon).select();
    if (error) {
      alert('Erro ao salvar cupom: ' + error.message);
    } else if (data) {
      setCoupons(prev => {
        const exists = prev.find(c => c.id === data[0].id);
        if (exists) return prev.map(c => c.id === data[0].id ? data[0] : c);
        return [data[0], ...prev];
      });
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    const { error } = await supabase.from('coupons').delete().eq('id', couponId);
    if (error) {
      alert('Erro ao excluir cupom: ' + error.message);
    } else {
      setCoupons(prev => prev.filter(c => c.id !== couponId));
    }
  };

  const financialSummary = useMemo(() => {
      const validOrders = orders.filter(o => {
          const isWhatsapp = o.origin?.toLowerCase() === 'whatsapp';
          const isPos = o.origin?.toLowerCase() === 'pos'; // TRAVA ADICIONADA
          const isIgnored = o.repasseStatus === 'ignored' || o.repasseStatus === 'none'; // CORREÇÃO PARA 'none'
          return !isWhatsapp && !isPos && !isIgnored; // FILTRO ATUALIZADO
      });

      const blocked = validOrders
        .filter(o => o.repasseStatus === 'blocked' && o.status !== 'cancelled')
        .reduce((acc, o) => {
            const val = (o.repasseValue !== undefined) ? o.repasseValue : 0;
            return acc + val;
        }, 0);

      const totalAvailableFromOrders = validOrders
        .filter(o => o.repasseStatus === 'available' && o.status !== 'cancelled')
        .reduce((acc, o) => {
            const val = (o.repasseValue !== undefined) ? o.repasseValue : 0;
            return acc + val;
        }, 0);

      const totalWithdrawals = withdrawHistory
        .filter(w => w.status !== 'rejected')
        .reduce((acc, w) => acc + w.amount, 0);

      const available = Math.max(0, totalAvailableFromOrders - totalWithdrawals);

      const paid = withdrawHistory
        .filter(w => w.status === 'paid')
        .reduce((acc, w) => acc + w.amount, 0);

      return { blocked, available, paid };
  }, [orders, withdrawHistory]);

  const handleRequestWithdraw = () => {
      if (!localCompany.pixKey) {
          alert("Configure sua chave Pix nas configurações antes de solicitar saque.");
          handleNavigation(ViewState.SETTINGS);
          return;
      }

      if (financialSummary.available <= 0) {
          alert("Saldo insuficiente para saque.");
          return;
      }

      setIsWithdrawModalOpen(true);
  };

  const executeWithdrawal = async () => {
       setIsWithdrawModalOpen(false); 
       setIsLoadingFinance(true);
       try {
           console.log("Registrando solicitação de saque manual...");
           
           const bankFeeRate = localCompany.serviceFeePercentage || 0;
           const bankFeeValue = calculateBankFee(financialSummary.available, bankFeeRate);
           const netAmount = Math.max(0, financialSummary.available - bankFeeValue);

           const withdrawalId = self.crypto.randomUUID();
           const detailString = `${localCompany.pixKeyType || 'PIX'}: ${localCompany.pixKey} | Taxa (${bankFeeRate}%): R$ ${bankFeeValue.toFixed(2)} | Líquido: R$ ${netAmount.toFixed(2)}`;

           const { error } = await supabase.from('withdrawal_requests').insert([{
               id: withdrawalId,
               userId: company.id,
               userName: company.name,
               userType: 'partner',
               amount: financialSummary.available, 
               status: 'pending',
               date: new Date().toISOString(),
               bankInfo: detailString
           }]);

           if (error) throw error;

           alert("Solicitação concluída! Você receberá entre 09h e 15h do próximo horário bancário.");
           
           const { data: updatedHistory } = await supabase
                .from('withdrawal_requests')
                .select('*')
                .eq('userId', company.id)
                .order('date', {ascending: false});
                
           if (updatedHistory) setWithdrawHistory(updatedHistory);

       } catch (e: any) {
           console.error("Erro no catch:", e);
           alert("Erro ao processar saque: " + (e.message || "Erro desconhecido."));
       } finally {
           setIsLoadingFinance(false);
       }
  };

  const calculatedSalesHistory = useMemo(() => {
      const grouped: Record<string, { revenue: number, count: number }> = {};
      orders.forEach(o => {
          if (o.status === 'delivered' || o.status === 'delivering' || o.status === 'ready' || o.status === 'preparing' || o.status === 'pending') {
              const dateObj = new Date(o.timestamp);
              const dateKey = dateObj.toLocaleDateString('en-CA');
              if (!grouped[dateKey]) grouped[dateKey] = { revenue: 0, count: 0 };
              grouped[dateKey].revenue += o.total;
              grouped[dateKey].count += 1;
          }
      });
      const history: SalesHistoryItem[] = Object.keys(grouped).map(date => ({
          date,
          revenue: grouped[date].revenue,
          ordersCount: grouped[date].count
      })).sort((a, b) => a.date.localeCompare(b.date));
      return history.slice(-30);
  }, [orders]);

  useEffect(() => {
    let map: any;
    const initMap = () => {
        if (!mapContainerRef.current || !window.google || mapError) return;
        try {
            const initialPos = { 
                lat: localCompany.address?.lat || -23.550520, 
                lng: localCompany.address?.lng || -46.633308 
            };
            map = new window.google.maps.Map(mapContainerRef.current, {
                center: initialPos, zoom: 17, disableDefaultUI: true, zoomControl: false, gestureHandling: 'greedy',
                styles: [{ "featureType": "poi", "stylers": [{ "visibility": "off" }] }]
            });
            const geocoder = new window.google.maps.Geocoder();
            map.addListener('dragstart', () => setIsMapDragging(true));
            map.addListener('idle', () => {
                setIsMapDragging(false);
                const center = map.getCenter();
                if (center) {
                    const lat = center.lat(); const lng = center.lng();
                    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                        if (status === 'OK' && results[0]) {
                            const comps = results[0].address_components;
                            let route = '', num = '', neigh = '', city = '', zip = '';
                            comps.forEach((c: any) => {
                                if (c.types.includes('route')) route = c.long_name;
                                if (c.types.includes('street_number')) num = c.long_name;
                                if (c.types.includes('sublocality')) neigh = c.long_name;
                                if (c.types.includes('administrative_area_level_2')) city = c.long_name;
                                if (c.types.includes('postal_code')) zip = c.long_name;
                            });
                            setMapAddress(`${route}, ${num || 'S/N'}`);
                            setLocalCompany(prev => ({
                                ...prev,
                                address: { ...prev.address!, lat, lng, street: route || prev.address?.street || '', neighborhood: neigh || prev.address?.neighborhood || '', city: city || prev.address?.city || '', zipCode: zip ? zip.replace('-', '') : prev.address?.zipCode || '' }
                            }));
                        }
                    });
                }
            });
        } catch (e) { setMapError(true); }
    };
    if (showMapModal && !mapError) {
        if (window.google && window.google.maps) initMap();
        else { const i = setInterval(() => { if (window.google && window.google.maps) { clearInterval(i); initMap(); } }, 100); return () => clearInterval(i); }
    }
  }, [showMapModal, mapError]);

  const handleGetCurrentLocation = () => {
      if (!navigator.geolocation) { alert('GPS indisponível.'); return; }
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          if (window.google && window.google.maps) {
              new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
                  if (status === 'OK' && results[0]) {
                      const comps = results[0].address_components;
                      let route = '', num = '', neigh = '', city = '', zip = '';
                      comps.forEach((c: any) => {
                          if (c.types.includes('route')) route = c.long_name;
                          if (c.types.includes('street_number')) num = c.long_name;
                          if (c.types.includes('sublocality')) neigh = c.long_name;
                          if (c.types.includes('administrative_area_level_2')) city = c.long_name;
                          if (c.types.includes('postal_code')) zip = c.long_name;
                      });
                      setLocalCompany(prev => ({ ...prev, address: { ...prev.address!, lat: latitude, lng: longitude, street: route, number: num, neighborhood: neigh, city: city, zipCode: zip } }));
                  }
                  setLoadingLocation(false);
              });
          } else {
              setLocalCompany(prev => ({ ...prev, address: { ...prev.address!, lat: latitude, lng: longitude } }));
              setLoadingLocation(false);
          }
      }, () => { alert("Erro GPS"); setLoadingLocation(false); }, { timeout: 10000 });
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, '');
      setLocalCompany(prev => ({...prev, address: {...prev.address!, zipCode: value}}));
      if (value.length === 8) {
          setLoadingCep(true);
          try {
              const res = await fetch(`https://viacep.com.br/ws/${value}/json/`);
              const data = await res.json();
              if (!data.erro) {
                  setLocalCompany(prev => ({ 
                      ...prev, 
                      address: { 
                          ...prev.address!, 
                          street: data.logradouro, 
                          city: data.localidade, 
                          neighborhood: data.bairro 
                      } 
                  }));
                  if (window.google && window.google.maps) {
                      const geocoder = new window.google.maps.Geocoder();
                      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, Brasil`;
                      geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                          if (status === 'OK' && results[0]) {
                              const location = results[0].geometry.location;
                              setLocalCompany(prev => ({
                                  ...prev,
                                  address: {
                                      ...prev.address!,
                                      lat: location.lat(),
                                      lng: location.lng()
                                  }
                              }));
                          }
                      });
                  }
              }
          } catch (e) {} finally { setLoadingCep(false); }
      }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, activeChatOrder]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, onSuccess: (base64: string) => void) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              onSuccess(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleEnhanceImage = async () => {
    if (!productImagePreview) {
        alert("Por favor, faça o upload de uma imagem do produto primeiro.");
        return;
    }
    if (!newProduct.name || !newProduct.category) {
        alert("Preencha o nome e categoria do produto para ajudar a IA.");
        return;
    }
    setGeneratingAi(true);
    const enhancedImage = await enhanceProductImage(productImagePreview, newProduct.name, newProduct.category);
    if (enhancedImage) {
        setProductImagePreview(enhancedImage);
    } else {
        alert("Não foi possível melhorar a imagem. Tente novamente.");
    }
    setGeneratingAi(false);
  };

  const handlePartnerSendMessage = () => {
      if (!activeChatOrder || !chatInput.trim()) return;
      onSendMessage(activeChatOrder, chatInput, company.id, 'partner');
      setChatInput('');
  };

  const handleSaveEditingOrder = () => {
      if (editingOrder) {
          const itemsTotal = editingOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          const newTotal = itemsTotal + editingOrder.deliveryFee + editingOrder.serviceFee; 
          const finalOrder = { ...editingOrder, total: newTotal, subtotal: itemsTotal };
          onUpdateFullOrder(finalOrder);
          setEditingOrder(null);
          alert("Pedido atualizado com sucesso!");
      }
  };

  const handleDeleteItem = (index: number) => {
      if (!editingOrder) return;
      const newItems = [...editingOrder.items];
      newItems.splice(index, 1);
      setEditingOrder({ ...editingOrder, items: newItems });
  };
  
  const handleUpdateItemQuantity = (index: number, delta: number) => {
      if (!editingOrder) return;
      const newItems = [...editingOrder.items];
      const newQty = Math.max(1, newItems[index].quantity + delta);
      newItems[index] = { ...newItems[index], quantity: newQty };
      setEditingOrder({ ...editingOrder, items: newItems });
  };

  const handlePartnerCancelOrder = () => {
      if (!editingOrder) return;
      if (window.confirm("ATENÇÃO: Deseja realmente CANCELAR este pedido? Se houve pagamento online, o estorno será iniciado automaticamente.")) {
          updateOrderStatus(editingOrder.id, 'cancelled');
          setEditingOrder(null); 
      }
  };

  const handleDragDropOrder = async (orderId: string, status: Order['status']) => {
      // 1. ATUALIZAÇÃO OTIMISTA IMEDIATA: Atualiza a tela antes do banco!
      updateOrderStatus(orderId, status);

      const order = orders.find(o => o.id === orderId);

      // 2. PROCESSAMENTO EM SEGUNDO PLANO (Fire and Forget)
      // A função abaixo roda de forma invisível sem travar o arrastar do Kanban
      if (order && status === 'delivered' && order.status !== 'delivered') {
          (async () => {
              try {
                  const { data: compositions, error: compError } = await supabase.from('compositions').select('*');
                  
                  if (!compError && compositions && compositions.length > 0) {
                      for (const item of order.items) {
                          // A. ABATE DO PRODUTO PRINCIPAL
                          const mainComps = compositions.filter(c => c.reference_id === item.productName);
                          for (const comp of mainComps) {
                              const amountToDeduct = comp.amount_needed * item.quantity;
                              const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', comp.inventory_item_id).single();
                              if (inv) {
                                  await supabase.from('inventory_items').update({ 
                                      current_stock: inv.current_stock - amountToDeduct 
                                  }).eq('id', comp.inventory_item_id);
                              }
                          }

                          // B. ABATE DOS SABORES E ADICIONAIS
                          if (item.selectedOptions && item.selectedOptions.length > 0) {
                              for (const opt of item.selectedOptions) {
                                  const optName = (opt as any).optionName || opt.name;
                                  const groupName = (opt as any).groupName;
                                  
                                  let fraction = 1;
                                  if ((opt as any).dividePrice === true) {
                                      const selectedInGroup = item.selectedOptions.filter(o => 
                                          (o as any).groupName === groupName && 
                                          (o as any).dividePrice === true
                                      ).length;
                                      
                                      if (selectedInGroup > 0) {
                                          fraction = 1 / selectedInGroup; 
                                      }
                                  }

                                  const optComps = compositions.filter(c => c.reference_id === optName);
                                  for (const comp of optComps) {
                                      const amountToDeduct = comp.amount_needed * item.quantity * fraction;
                                      const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', comp.inventory_item_id).single();
                                      if (inv) {
                                          await supabase.from('inventory_items').update({ 
                                              current_stock: inv.current_stock - amountToDeduct 
                                      }).eq('id', comp.inventory_item_id);
                                      }
                                  }
                              }
                          }
                      }
                  }
              } catch (e) {
                  console.error("Erro silencioso ao abater estoque:", e);
              }
          })(); // <- Isso faz a função executar instantaneamente sem bloquear o React
      }
  };

  const addGroup = () => {
      const newGroup: ProductGroup = {
          id: Date.now().toString(),
          name: 'Novo Grupo',
          min: 1, max: 1, options: []
      };
      setNewProduct(prev => ({ ...prev, groups: [...(prev.groups || []), newGroup] }));
      setActiveGroupIndex((newProduct.groups?.length || 0));
  };
  const removeGroup = (index: number) => {
      const groups = [...(newProduct.groups || [])];
      groups.splice(index, 1);
      setNewProduct(prev => ({ ...prev, groups }));
      setActiveGroupIndex(null);
  };
  const addOptionToGroup = (groupIndex: number) => {
      const groups = [...(newProduct.groups || [])];
      groups[groupIndex].options.push({id: Date.now().toString(), name: '', price: 0, isAvailable: true});
      setNewProduct(prev => ({ ...prev, groups }));
  };
  const updateOption = (groupIndex: number, optionIndex: number, field: keyof ProductOption, value: any) => {
      const groups = [...(newProduct.groups || [])];
      groups[groupIndex].options[optionIndex] = { ...groups[groupIndex].options[optionIndex], [field]: value };
      setNewProduct(prev => ({ ...prev, groups }));
  };

  const handleEditProduct = (product: Product) => {
      setNewProduct(product);
      setProductImagePreview(product.image);
      setEditingProductId(product.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRequestDeleteProduct = (productId: string) => {
      setProductToDelete(productId);
  };

  const handleConfirmDeleteProduct = () => {
      if (productToDelete) {
          onDeleteProduct(productToDelete);
          if (editingProductId === productToDelete) {
              handleCancelEdit();
          }
          setProductToDelete(null); 
      }
  };

  const handleCancelEdit = () => {
      setNewProduct({ isAvailable: true, price: 0, pricingMode: 'default', groups: [] });
      setProductImagePreview('');
      setEditingProductId(null);
  };

  const handleSaveProduct = () => {
      if (!newProduct.name || !newProduct.category) { alert("Preencha nome e categoria."); return; }
      
      const productData: Product = {
          id: editingProductId || Date.now().toString(),
          companyId: company.id,
          name: newProduct.name!,
          description: newProduct.description || '',
          category: newProduct.category!,
          price: Number(newProduct.price),
          image: productImagePreview || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
          isAvailable: true,
          pricingMode: newProduct.pricingMode || 'default',
          groups: newProduct.groups || []
      };

      if (editingProductId) {
          onUpdateProduct(productData);
          alert("Produto atualizado!");
      } else {
          onAddProduct(productData);
          alert("Produto criado!");
      }
      
      handleCancelEdit();
  };

  const handleSaveSettings = () => {
    updateCompany(localCompany);
    alert('Configurações salvas com sucesso!');
  };

  const editingOrderPaymentMethod = editingOrder?.paymentMethod?.toLowerCase() || '';
  const editingOrderOrigin = editingOrder?.origin?.toLowerCase() || '';

  const currentBankFee = calculateBankFee(financialSummary.available, localCompany.serviceFeePercentage || 0);
  const currentNet = Math.max(0, financialSummary.available - currentBankFee);

  return (
    <div className="flex h-screen bg-gray-50 relative">
        
        {pinModalOpen && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in text-center">
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 mx-auto border border-red-100">
                        <Lock className="w-6 h-6 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Acesso Restrito</h3>
                    <p className="text-gray-500 text-sm mb-6">Digite o PIN gerencial para desbloquear os módulos administrativos.</p>
                    
                    <input 
                        type="password"
                        autoFocus
                        value={pinInput}
                        onChange={e => setPinInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleVerifyPin()}
                        className="w-full text-center text-2xl tracking-[0.5em] font-bold border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 mb-2 transition-all"
                        maxLength={6}
                        placeholder="••••"
                    />
                    
                    <div className="h-6 mb-4">
                        {pinError && <p className="text-red-500 text-xs font-bold animate-pulse">{pinError}</p>}
                    </div>
                    
                    <div className="flex gap-3">
                        <button onClick={() => { setPinModalOpen(false); setPinInput(''); setPinError(''); }} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
                        <button onClick={handleVerifyPin} className="flex-1 py-3 rounded-xl bg-gray-900 font-bold text-white hover:bg-black transition-colors shadow-lg">Desbloquear</button>
                    </div>
                </div>
            </div>
        )}

        {isConfirmingStatus && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
                    <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <AlertTriangle className="w-6 h-6 text-yellow-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Confirmar Alteração</h3>
                    <p className="text-gray-600 text-center mb-6 text-sm">
                        Tem certeza que deseja <strong>{company.status === 'open' ? 'FECHAR' : 'ABRIR'}</strong> a sua loja agora?
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsConfirmingStatus(false)}
                            className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirmStatusChange}
                            className={`flex-1 py-3 rounded-xl font-bold text-white transition-colors
                                ${company.status === 'open' 
                                    ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200' 
                                    : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200'
                                }
                            `}
                        >
                            Sim, {company.status === 'open' ? 'Fechar' : 'Abrir'} Loja
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isWithdrawModalOpen && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 border-b pb-2">Resumo do Saque</h3>
                    
                    <div className="space-y-3 mb-6 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>Saldo Disponível:</span>
                            <span className="font-bold">R$ {financialSummary.available.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-red-500">
                            <span>Taxa Transação Bancária ({(localCompany.serviceFeePercentage || 0).toFixed(2)}%):</span>
                            <span className="font-bold">- R$ {currentBankFee.toFixed(2)}</span>
                        </div>
                        <div className="border-t pt-2 mt-2 flex justify-between text-lg text-gray-900 font-bold">
                            <span>Valor Líquido (Pix):</span>
                            <span>R$ {currentNet.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100 mb-6 flex gap-3 items-start">
                        <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800 leading-relaxed">
                            O pagamento será realizado na próxima janela bancária <strong>(09h às 15h)</strong> para a chave: <br/>
                            <span className="font-mono font-bold bg-white px-1 rounded border border-blue-200">{localCompany.pixKey}</span>
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsWithdrawModalOpen(false)}
                            className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={executeWithdrawal}
                            className="flex-1 py-3 rounded-xl bg-green-600 font-bold text-white hover:bg-green-700 shadow-lg shadow-green-200 transition-colors"
                        >
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {productToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-scale-in">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                        <Trash2 className="w-6 h-6 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Excluir Produto?</h3>
                    <p className="text-gray-600 text-center mb-6 text-sm">
                        Tem certeza que deseja excluir este item do cardápio? Essa ação não pode ser desfeita.
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setProductToDelete(null)}
                            className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={handleConfirmDeleteProduct}
                            className="flex-1 py-3 rounded-xl bg-red-600 font-bold text-white hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                        >
                            Sim, Excluir
                        </button>
                    </div>
                </div>
            </div>
        )}

        {editingOrder && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                 <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
                     <div className="bg-white border-b border-gray-100 p-6 flex justify-between items-center">
                         <h3 className="text-xl font-bold text-gray-900">
                             {editingOrderOrigin === 'whatsapp' ? (
                                 <span className="flex items-center gap-2">
                                     <MessageSquare className="w-5 h-5 text-green-600" /> Pedido IA #{editingOrder.id.slice(-4)}
                                 </span>
                             ) : (
                                 `Editar Pedido #${editingOrder.id.slice(-4)}`
                             )}
                         </h3>
                         <button onClick={() => setEditingOrder(null)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
                     </div>
                     <div className="p-6 overflow-y-auto space-y-6 flex-1">
                         
                         {editingOrderOrigin === 'whatsapp' && (
                             <div className="bg-green-50 p-4 rounded-xl border border-green-200 mb-4">
                                 <p className="text-sm text-green-800 font-bold flex items-center gap-2">
                                     <Info className="w-4 h-4"/> Pedido Externo (WhatsApp)
                                 </p>
                                 <p className="text-xs text-green-700 mt-1">
                                     Este pedido foi gerado pela IA. O pagamento é tratado diretamente com o cliente. Não contabiliza no saldo da plataforma.
                                 </p>
                             </div>
                         )}

                         <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl">
                             <div className="flex justify-between items-center mb-2">
                                 <h4 className="font-bold text-sm text-yellow-800 uppercase">Pagamento</h4>
                                 <span className="bg-white px-2 py-1 rounded text-xs font-bold shadow-sm">
                                     {editingOrderPaymentMethod.includes('cash') ? 'DINHEIRO' : 
                                      (editingOrderPaymentMethod.includes('pix') ? 'PIX' : 
                                      (editingOrderPaymentMethod.includes('whatsapp') ? 'WHATSAPP' : 'ONLINE'))}
                                 </span>
                             </div>
                             {editingOrderPaymentMethod.includes('cash') ? (
                                 <p className="text-sm text-yellow-900 font-bold">
                                     Levar troco para: <span className="text-lg">R$ {editingOrder.changeFor ? editingOrder.changeFor.toFixed(2) : editingOrder.total.toFixed(2)}</span>
                                 </p>
                             ) : (
                                 <p className="text-sm text-green-700 font-medium">
                                     {editingOrderPaymentMethod.includes('whatsapp') ? 'Combinado via Chat' : (editingOrderOrigin === 'whatsapp' ? 'Combinado via WhatsApp' : 'Pago via App/Pix/Cartão')}
                                 </p>
                             )}
                         </div>

                         <div className="space-y-4">
                             <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Dados do Cliente</h4>
                             <div className="grid grid-cols-2 gap-4">
                                 <div>
                                     <label className="text-xs font-bold text-gray-400">Nome</label>
                                     <input 
                                        value={editingOrder.customerName}
                                        onChange={e => setEditingOrder({...editingOrder, customerName: e.target.value})}
                                        className="w-full border rounded-lg px-3 py-2 mt-1 font-medium"
                                     />
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-gray-400">Telefone</label>
                                     <input 
                                        value={editingOrder.customerPhone}
                                        onChange={e => setEditingOrder({...editingOrder, customerPhone: e.target.value})}
                                        className="w-full border rounded-lg px-3 py-2 mt-1 font-medium"
                                     />
                                 </div>
                             </div>
                             {editingOrder.deliveryAddress && (
                                 <div>
                                     <label className="text-xs font-bold text-gray-400">Endereço</label>
                                     <p className="text-sm font-medium bg-gray-50 p-2 rounded border border-gray-200">
                                         {editingOrder.deliveryAddress.street}, {editingOrder.deliveryAddress.number} <br/>
                                         {editingOrder.deliveryAddress.neighborhood} - {editingOrder.deliveryAddress.city}
                                     </p>
                                 </div>
                             )}
                         </div>

                         <div className="space-y-4">
                             <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Itens do Pedido</h4>
                             <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                                 {Array.isArray(editingOrder.items) && editingOrder.items.length > 0 ? editingOrder.items.map((item, idx) => (
                                     <div key={idx} className="flex flex-col bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                                         <div className="flex justify-between items-center mb-1">
                                             <div className="flex items-center gap-3">
                                                 <div className="flex items-center border rounded-lg">
                                                     <button onClick={() => handleUpdateItemQuantity(idx, -1)} className="px-2 py-1 hover:bg-gray-100">-</button>
                                                     <span className="px-2 font-bold text-sm">{item.quantity}</span>
                                                     <button onClick={() => handleUpdateItemQuantity(idx, 1)} className="px-2 py-1 hover:bg-gray-100">+</button>
                                                 </div>
                                                 <span className="text-sm font-medium">{item.productName}</span>
                                             </div>
                                             <div className="flex items-center gap-4">
                                                 <span className="font-bold text-sm">R$ {item.price.toFixed(2)}</span>
                                                 <button onClick={() => handleDeleteItem(idx)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg">
                                                     <Trash2 className="w-4 h-4"/>
                                                 </button>
                                             </div>
                                         </div>
                                         {item.selectedOptions && item.selectedOptions.length > 0 && (
                                              <div className="pl-24 space-y-1 border-t border-gray-50 pt-1 mt-1">
                                                  {(() => {
                                                      const originalProduct = products.find(p => p.name === item.productName);
                                                      const isPizza = (item as any).pricingMode === 'pizza' || originalProduct?.pricingMode === 'pizza';
                                                      const groups: Record<string, string[]> = {};
                                                      
                                                      item.selectedOptions.forEach(opt => {
                                                          const g = (opt as any).groupName || '';
                                                          if (!groups[g]) groups[g] = [];
                                                          groups[g].push(opt.optionName || opt.name);
                                                      });

                                                      return Object.entries(groups).map(([gName, opts], groupIdx) => {
                                                          // 1. Lê a flag dividePrice direto do JSON salvo no banco
                                                          const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                                                          
                                                          // 2. Fallback caso seja um pedido muito antigo e não tenha a flag no JSON
                                                          const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
                                                          
                                                          // 3. Define a regra final (priorizando o JSON do pedido)
                                                          const divideThisGroup = snapshotDivide || originalGroup?.dividePrice || (isPizza && gName.toLowerCase().includes('sabor'));
                                                          
                                                          if (divideThisGroup) {
                                                              const fraction = opts.length > 1 ? `1/${opts.length} ` : '';
                                                              return (
                                                                  <React.Fragment key={groupIdx}>
                                                                      {opts.map((o, i) => (
                                                                          <div key={i} className="text-[10px] text-gray-600 mt-0.5">
                                                                              <span className="font-bold text-gray-800">+ {fraction}{o}</span>
                                                                          </div>
                                                                      ))}
                                                                  </React.Fragment>
                                                              );
                                                          } else {
                                                              return (
                                                                  <div key={groupIdx} className="text-[10px] text-gray-600 mt-0.5">
                                                                      {gName ? <span className="font-bold text-gray-800 uppercase">{gName}: </span> : <span className="font-bold text-gray-800">+ </span>}
                                                                      <span className="font-bold text-gray-800">{opts.join(', ')}</span>
                                                                  </div>
                                                              );
                                                          }
                                                      });
                                                  })()}
                                              </div>
                                         )}
                                     </div>
                                 )) : (
                                     <div className="bg-white p-4 rounded-lg border border-gray-200">
                                         <p className="text-sm font-mono whitespace-pre-wrap">{editingOrder.raw_description || "Sem descrição disponível."}</p>
                                     </div>
                                 )}
                             </div>
                         </div>

                         <div className="space-y-2">
                             <label className="text-xs font-bold text-gray-400 uppercase">Status do Pedido</label>
                             <select 
                                value={editingOrder.status}
                                onChange={e => setEditingOrder({...editingOrder, status: e.target.value as any})}
                                className="w-full border rounded-lg px-3 py-2 bg-white"
                             >
                                 <option value="waiting_payment">Aguardando Pagamento</option>
                                 <option value="pending">Pendente</option>
                                 <option value="preparing">Preparando</option>
                                 <option value="ready">Pronto</option>
                                 <option value="waiting_courier">Aguardando Entregador</option>
                                 <option value="delivering">Em Rota</option>
                                 <option value="delivered">Entregue</option>
                                 <option value="cancelled">Cancelado</option>
                             </select>
                         </div>
                     </div>
                     <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center gap-2">
                         <div className="flex-1">
                             <p className="text-xs text-gray-500 font-bold uppercase">Total Atualizado</p>
                             <p className="text-xl font-bold text-gray-900">
                                 R$ {editingOrder.total.toFixed(2)}
                             </p>
                         </div>
                         
                         <button 
                            onClick={handlePartnerCancelOrder}
                            className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors text-sm"
                            title="Cancela o pedido e estorna pagamento (se houver)"
                         >
                             <XCircle className="w-5 h-5" /> Cancelar
                         </button>

                         <button onClick={handleSaveEditingOrder} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-200 transition-colors">
                             <Check className="w-5 h-5" /> Salvar
                         </button>
                     </div>
                 </div>
             </div>
        )}

        {activeChatOrder && (
             <div className="fixed bottom-0 right-0 w-full sm:w-96 h-[500px] bg-white shadow-2xl z-40 rounded-t-3xl sm:rounded-tl-3xl border border-gray-200 flex flex-col animate-slide-up">
                 <div className="bg-red-600 text-white p-4 rounded-t-3xl flex justify-between items-center">
                     <div className="flex items-center gap-2">
                         <div className="bg-white/20 p-2 rounded-full"><MessageCircle className="w-5 h-5"/></div>
                         <div>
                             <h4 className="font-bold">Chat com Cliente</h4>
                             <p className="text-xs opacity-80">Pedido #{activeChatOrder.slice(-4)}</p>
                         </div>
                     </div>
                     <button onClick={() => setActiveChatOrder(null)} className="hover:bg-white/20 p-2 rounded-full"><X className="w-5 h-5"/></button>
                 </div>
                 <div className="flex-1 bg-gray-50 overflow-y-auto p-4 space-y-3">
                     {(chats[activeChatOrder] || []).map(msg => (
                         <div key={msg.id} className={`flex ${msg.senderRole === 'partner' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.senderRole === 'partner' ? 'bg-red-100 text-red-900 rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none'}`}>
                                 {msg.text}
                                 <span className="block text-[10px] text-gray-400 text-right mt-1">
                                     {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                 </span>
                             </div>
                         </div>
                     ))}
                     <div ref={messagesEndRef} />
                 </div>
                 <div className="p-3 bg-white border-t border-gray-100 flex gap-2">
                     <input 
                        value={chatInput} onChange={e => setChatInput(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        className="flex-1 bg-gray-100 rounded-full px-4 py-2 outline-none focus:ring-2 focus:ring-red-500"
                        onKeyDown={e => e.key === 'Enter' && handlePartnerSendMessage()}
                     />
                     <button onClick={handlePartnerSendMessage} className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700"><Send className="w-5 h-5"/></button>
                 </div>
             </div>
        )}

      <Sidebar 
        currentView={view} 
        setView={handleNavigation} 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen} 
        onLogout={onLogout}
        companyStatus={localCompany.status}
        onToggleStatus={handleToggleStatus}
        company={localCompany}
      />
          
      <div className="flex-1 overflow-auto flex flex-col">
        <div className="bg-white p-4 flex justify-between items-center border-b border-gray-100 sticky top-0 z-20 shadow-sm">
             <div className="flex items-center gap-2">
                 <button onClick={() => setIsMobileOpen(true)} className="md:hidden p-2 bg-gray-100 rounded-lg mr-2"><Layers className="w-6 h-6 text-gray-600" /></button>
                 <Store className="w-6 h-6 text-red-600" />
                 <h1 className="font-bold text-gray-900 hidden md:block">Chegoou Gestão</h1>
             </div>
             
             <div className="flex items-center gap-4">
                 <div className="hidden md:flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-lg">
                    <label className="text-sm font-bold text-gray-700 cursor-pointer flex items-center gap-2 select-none">
                        <Printer size={16} className={autoPrintEnabled ? "text-red-600" : "text-gray-400"} />
                        Auto-Imprimir
                        <input 
                            type="checkbox" 
                            className="w-4 h-4 text-red-600 rounded focus:ring-red-500 cursor-pointer"
                            checked={autoPrintEnabled}
                            onChange={(e) => setAutoPrintEnabled(e.target.checked)}
                        />
                    </label>
                 </div>

                 {localCompany.adminPin && isUnlocked && (
                     <button 
                        onClick={handleLockSession} 
                        className="flex items-center gap-2 text-sm text-red-600 font-bold bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 transition-colors animate-fade-in"
                        title="Bloquear módulos administrativos"
                     >
                         <Unlock className="w-4 h-4"/> Modo Gerente Ativo (Bloquear)
                     </button>
                 )}
                 {localCompany.adminPin && !isUnlocked && (
                     <span className="flex items-center gap-1.5 text-xs text-gray-500 font-bold bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                         <Lock className="w-3.5 h-3.5"/> Modo Caixa
                     </span>
                 )}
                 <div className="w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-sm">
                     {localCompany.name.charAt(0)}
                 </div>
             </div>
        </div>

        <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full">
            
            {view === ViewState.DASHBOARD && (
                <div className="space-y-8">
                    <DashboardView 
                        salesData={calculatedSalesHistory} 
                        orders={orders} 
                        compositions={compositions}
                        inventoryItems={dashboardInventoryItems}
                    />
                    
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-gray-500"/> Financeiro Rápido
                            </h3>
                            <button onClick={() => handleNavigation(ViewState.FINANCE)} className="text-sm font-bold text-blue-600 hover:underline">Ver Detalhes</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <p className="text-xs text-gray-500 uppercase font-bold">Saldo Disponível</p>
                                <h4 className="text-2xl font-bold text-green-600 mt-1">R$ {financialSummary.available.toFixed(2)}</h4>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <p className="text-xs text-gray-500 uppercase font-bold">Bloqueado (12h)</p>
                                <h4 className="text-2xl font-bold text-gray-400 mt-1 flex items-center gap-2">
                                    R$ {financialSummary.blocked.toFixed(2)} <Lock className="w-4 h-4"/>
                                </h4>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {view === ViewState.FINANCE && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Banknote className="w-8 h-8 text-green-600" /> Gestão Financeira
                        </h2>
                        {!localCompany.pixKey && (
                            <div className="bg-yellow-50 text-yellow-800 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Configure sua chave Pix para receber
                            </div>
                        )}
                    </div>

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
                        <p className="text-sm text-blue-800 font-medium">
                            Os valores abaixo referem-se <strong>apenas a vendas online</strong> (Pix e Cartão pelo App). 
                            Pagamentos em dinheiro ou <strong>via WhatsApp (IA)</strong> são recebidos diretamente por você.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                            <div className="relative z-10">
                                <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Saldo Disponível</p>
                                <h3 className="text-4xl font-bold text-green-600 mt-2">R$ {financialSummary.available.toFixed(2)}</h3>
                                <p className="text-xs text-gray-400 mt-2">Livre para saque imediato.</p>
                            </div>
                            <div className="absolute right-0 top-0 h-full w-24 bg-gradient-to-l from-green-50 to-transparent"></div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Bloqueado (12h)</p>
                                    <h3 className="text-3xl font-bold text-gray-400 mt-2">R$ {financialSummary.blocked.toFixed(2)}</h3>
                                </div>
                                <div className="bg-gray-100 p-2 rounded-lg"><Lock className="w-6 h-6 text-gray-400"/></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">Valores liberados 12h após entrega.</p>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                             <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-bold text-gray-500 uppercase tracking-wide">Total Sacado</p>
                                    <h3 className="text-3xl font-bold text-blue-900 mt-2">R$ {financialSummary.paid.toFixed(2)}</h3>
                                </div>
                                <div className="bg-blue-50 p-2 rounded-lg"><CheckCircle className="w-6 h-6 text-blue-600"/></div>
                            </div>
                             <p className="text-xs text-gray-400 mt-2">Histórico total de repasses.</p>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">Solicitar Repasse</h3>
                            <p className="text-gray-500 mt-1 max-w-lg">
                                O valor será enviado para sua chave Pix cadastrada: 
                                <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded ml-1">
                                    {localCompany.pixKey || 'Não cadastrada'}
                                </span>
                            </p>
                        </div>
                        <button 
                            onClick={handleRequestWithdraw}
                            disabled={financialSummary.available <= 0}
                            className={`px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 shadow-lg transition-all
                                ${financialSummary.available > 0 
                                    ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200 hover:-translate-y-1' 
                                    : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}
                            `}
                        >
                            <DollarSign className="w-6 h-6" /> Solicitar Saque
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">Histórico de Saques</h3>
                            {isLoadingFinance && <Loader2 className="w-4 h-4 animate-spin text-gray-400"/>}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Data Solicitada</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Detalhes Pix</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {withdrawHistory.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-8 text-center text-gray-400">
                                                Nenhum saque registrado ainda.
                                            </td>
                                        </tr>
                                    )}
                                    {withdrawHistory.map(req => (
                                        <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-sm font-medium text-gray-600">
                                                {new Date(req.date).toLocaleString()}
                                            </td>
                                            <td className="p-4 font-bold text-gray-900">
                                                R$ {req.amount.toFixed(2)}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase
                                                    ${req.status === 'paid' ? 'bg-green-100 text-green-700' : ''}
                                                    ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : ''}
                                                    ${req.status === 'rejected' ? 'bg-red-100 text-red-700' : ''}
                                                `}>
                                                    {req.status === 'paid' ? 'Pago' : req.status === 'pending' ? 'Pendente' : 'Rejeitado'}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs font-mono text-gray-500">
                                                {req.bankInfo}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            {view === ViewState.COUPONS && (
                <CouponsView 
                    coupons={coupons}
                    onSave={handleSaveCoupon}
                    onDelete={handleDeleteCoupon}
                    companyId={company.id}
                />
            )}

            {view === ViewState.POS && (
                <POSView 
                    products={products} 
                    company={localCompany} 
                    onPlaceOrder={async (newOrder) => {
                        try {
                            const { error } = await supabase.from('orders').insert([newOrder]);
                            if (error) {
                                console.error("Erro do Supabase:", error);
                                alert("Erro ao salvar o pedido.");
                                return;
                            }
                            setView(ViewState.ORDERS);
                        } catch (err) {
                            console.error("Erro ao lançar pedido:", err);
                        }
                    }} 
                />
            )}

            {view === ViewState.HISTORY && (
                <HistoryView orders={orders} />
            )}

            {view === ViewState.ORDERS && (
                <div className="h-[calc(100vh-8rem)] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800">Gestão de Pedidos</h2>
                            <p className="text-gray-500">Arraste os pedidos para mudar o status (Drag & Drop).</p>
                        </div>
                        <div className="flex gap-2">
                             <div className="px-4 py-2 bg-white rounded-lg border border-gray-200 text-sm font-bold flex items-center gap-2">
                                 <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                 Atualização em Tempo Real
                             </div>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-x-auto pb-4">
                        <div className="flex gap-4 h-full min-w-max px-1">
                            <KanbanColumn 
                                title="Aguardando Pagamento" 
                                status="waiting_payment" 
                                items={orders.filter(o => o.status === 'waiting_payment')} 
                                color="border-yellow-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Pendentes" 
                                status="pending" 
                                items={orders.filter(o => o.status === 'pending')} 
                                color="border-orange-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Em Preparo" 
                                status="preparing" 
                                items={orders.filter(o => o.status === 'preparing')} 
                                color="border-blue-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Pronto" 
                                status="ready" 
                                items={orders.filter(o => o.status === 'ready' || o.status === 'waiting_courier')} 
                                color="border-green-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Em Entrega" 
                                status="delivering" 
                                items={orders.filter(o => o.status === 'delivering')} 
                                color="border-purple-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Concluídos" 
                                status="delivered" 
                                items={orders.filter(o => o.status === 'delivered')} 
                                color="border-gray-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                            <KanbanColumn 
                                title="Cancelados" 
                                status="cancelled" 
                                items={orders.filter(o => o.status === 'cancelled')} 
                                color="border-red-200"
                                isLast
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                            />
                        </div>
                    </div>
                </div>
            )}
          
      {view === ViewState.INVENTORY && (
                <div className="space-y-6">
                    <InventoryModule />
                </div>
            )}    
                
          {view === ViewState.MENU && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit sticky top-8">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                {editingProductId ? <Edit className="w-5 h-5 text-blue-600"/> : <Plus className="w-5 h-5 bg-red-100 text-red-600 rounded p-0.5" />} 
                                {editingProductId ? 'Editar Produto' : 'Novo Produto'}
                            </h3>
                            {editingProductId && (
                                <button onClick={handleCancelEdit} className="text-xs text-gray-500 hover:text-red-600 underline">
                                    Cancelar
                                </button>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div className="w-full h-40 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center relative overflow-hidden group hover:border-red-300 transition-colors cursor-pointer">
                                {productImagePreview ? (
                                    <img src={productImagePreview} className="w-full h-full object-cover" />
                                ) : (
                                    <>
                                        <ImageIcon className="w-8 h-8 text-gray-300 mb-2" />
                                        <p className="text-xs text-gray-400 font-medium">Clique para enviar imagem</p>
                                    </>
                                )}
                                <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, setProductImagePreview)} accept="image/*" />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Nome</label>
                                    <input 
                                        value={newProduct.name || ''} 
                                        onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-red-500 outline-none" 
                                        placeholder="Ex: X-Burger" 
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Descrição</label>
                                    <textarea 
                                        value={newProduct.description || ''} 
                                        onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-red-500 outline-none h-20 resize-none" 
                                        placeholder="Ingredientes e detalhes..." 
                                    />
                                </div>
                                
                                {/* NOVO MODO DE VENDA (PIZZARIA VS PADRÃO) */}
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Modo de Venda (Cálculo)</label>
                                    <div className="flex gap-4 mt-2">
                                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:border-red-300 transition-colors">
                                            <input
                                                type="radio"
                                                name="pricingMode"
                                                checked={newProduct.pricingMode === 'default' || !newProduct.pricingMode}
                                                onChange={() => setNewProduct({...newProduct, pricingMode: 'default'})}
                                                className="text-red-600 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Padrão (Soma tudo)</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 hover:border-red-300 transition-colors">
                                            <input
                                                type="radio"
                                                name="pricingMode"
                                                checked={newProduct.pricingMode === 'pizza'}
                                                onChange={() => setNewProduct({...newProduct, pricingMode: 'pizza'})}
                                                className="text-red-600 focus:ring-red-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Pizzaria (Frações 1/2, 1/3)</span>
                                        </label>
                                    </div>
                                    {newProduct.pricingMode === 'pizza' && (
                                        <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                                            <Info className="w-4 h-4 shrink-0" /> Se o cliente selecionar mais de um item no grupo, o sistema fará a divisão proporcional.
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Preço (R$)</label>
                                    <input 
                                        type="number"
                                        value={newProduct.price || ''} 
                                        onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-red-500 outline-none" 
                                        placeholder="0.00" 
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase ml-1">Categoria</label>
                                    <select 
                                        value={newProduct.category || ''} 
                                        onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-red-500 outline-none"
                                    >
                                        <option value="">Selecione</option>
                                        {COMPANY_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            
                             <div className="bg-gray-50 rounded-xl p-3 border border-gray-200">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-sm text-gray-700">Complementos / Grupos</h4>
                                    <button onClick={addGroup} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded font-bold">+ Grupo</button>
                                </div>
                                
                                {newProduct.groups?.map((group, idx) => (
                                    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3 mb-2">
                                        <div className="flex justify-between mb-2">
                                            <input value={group.name} onChange={e => {
                                                const g = [...(newProduct.groups || [])]; g[idx].name = e.target.value; setNewProduct({...newProduct, groups: g});
                                            }} className="font-bold text-sm border-b border-dashed border-gray-300 w-2/3" placeholder="Nome do Grupo (Ex: Sabores)" />
                                            <Trash2 onClick={() => removeGroup(idx)} className="w-4 h-4 text-gray-400 hover:text-red-500 cursor-pointer" />
                                        </div>
                                        <div className="flex gap-2 mb-2 items-center">
                                            <input type="number" placeholder="Min" className="w-12 text-xs border rounded px-1" value={group.min} onChange={e => {
                                                const g = [...(newProduct.groups || [])]; g[idx].min = parseInt(e.target.value); setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            <input type="number" placeholder="Max" className="w-12 text-xs border rounded px-1" value={group.max} onChange={e => {
                                                const g = [...(newProduct.groups || [])]; g[idx].max = parseInt(e.target.value); setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            
                                            {/* NOVA OPÇÃO AQUI */}
                                            <label className="flex items-center gap-1 text-xs text-gray-600 ml-2 cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={group.dividePrice || false} 
                                                    onChange={e => {
                                                        const g = [...(newProduct.groups || [])]; 
                                                        g[idx].dividePrice = e.target.checked; 
                                                        setNewProduct({...newProduct, groups: g});
                                                    }}
                                                    className="text-red-600 focus:ring-red-500 rounded"
                                                />
                                                Divide o preço? (ex: Sabores)
                                            </label>
                                        
                                            <button onClick={() => addOptionToGroup(idx)} className="text-xs text-blue-600 font-bold ml-auto">+ Opção</button>
                                        </div>
                                        {group.options.map((opt, oIdx) => (
                                            <div key={oIdx} className="flex flex-col gap-2 mb-2 p-2 bg-gray-50 border border-gray-100 rounded-lg">
                                                <div className="flex gap-2 items-center">
                                                    <input className="flex-1 text-xs border rounded px-2 py-1" placeholder="Opção (Ex: Calabresa)" value={opt.name} onChange={e => updateOption(idx, oIdx, 'name', e.target.value)} />
                                                    <input className="w-16 text-xs border rounded px-2 py-1" placeholder="R$" type="number" value={opt.price} onChange={e => updateOption(idx, oIdx, 'price', parseFloat(e.target.value))} />
                                                    
                                                    {/* O BOTÃO QUE ABRE O MODAL DA RECEITA (FICHA TÉCNICA) */}
                                                    <button 
                                                        onClick={() => {
                                                            const compStr = prompt("Ficha Técnica: Digite o ID do insumo e a quantidade, separados por vírgula. \n\nExemplo para vincular 0.5kg de algo: \n0a1b2c3d-4e5f...,0.5");
                                                            if (compStr) {
                                                                const [invId, amount] = compStr.split(',');
                                                                if (invId && amount) {
                                                                    const g = [...(newProduct.groups || [])];
                                                                    if (!(g[idx].options[oIdx] as any).compositions) (g[idx].options[oIdx] as any).compositions = [];
                                                                    (g[idx].options[oIdx] as any).compositions.push({ inventoryItemId: invId.trim(), amount: parseFloat(amount) });
                                                                    setNewProduct({...newProduct, groups: g});
                                                                    alert("Insumo atrelado ao sabor com sucesso!");
                                                                }
                                                            }
                                                        }} 
                                                        className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200"
                                                    >
                                                        + Receita {((opt as any).compositions?.length || 0) > 0 ? `(${(opt as any).compositions?.length})` : ''}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                             </div>

                            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="font-bold text-indigo-900 text-xs uppercase flex items-center gap-1">
                                        <Wand2 className="w-3 h-3" /> Estúdio de IA
                                    </h4>
                                </div>
                                <p className="text-xs text-indigo-800 mb-3 leading-relaxed">
                                    A IA melhorará a iluminação, cor e nitidez da foto atual, mantendo o prato real.
                                </p>
                                <button 
                                    onClick={handleEnhanceImage} 
                                    disabled={generatingAi || !productImagePreview} 
                                    className={`w-full text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all 
                                        ${generatingAi ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}
                                    `}
                                >
                                    {generatingAi ? (
                                        <><Loader2 className="w-3 h-3 animate-spin" /> Tratando Imagem...</>
                                    ) : (
                                        <><Sparkles className="w-3 h-3" /> Melhorar Foto com IA</>
                                    )}
                                </button>
                            </div>

                            <button 
                                onClick={handleSaveProduct} 
                                className={`w-full text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-gray-200 ${editingProductId ? 'bg-blue-600' : 'bg-gray-900'}`}
                            >
                                {editingProductId ? 'Atualizar Produto' : 'Salvar Produto'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold text-gray-800">Cardápio Atual</h2>
                            <div className="flex gap-2">
                                <span className="text-sm font-medium text-gray-500 bg-white px-3 py-1 rounded-full border border-gray-200">Total: {products.length} itens</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {products.map(product => (
                                <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 hover:shadow-md transition-shadow">
                                    <img src={product.image} className="w-24 h-24 rounded-lg object-cover bg-gray-100 flex-shrink-0" />
                                    <div className="flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-gray-900 line-clamp-1">{product.name}</h4>
                                                <span className="text-xs font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded uppercase">{product.category}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                                        </div>
                                        <div className="flex justify-between items-end mt-2">
                                            <span className="font-bold text-lg text-gray-900">R$ {product.price.toFixed(2)}</span>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleEditProduct(product)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Edit className="w-4 h-4"/>
                                                </button>
                                                <button 
                                                    onClick={() => handleRequestDeleteProduct(product.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4"/>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {view === ViewState.WHATSAPP && (
                <WhatsAppBotView 
                    products={products} 
                    orders={orders} 
                    company={localCompany} 
                    updateCompany={updateCompany} 
                    coupons={coupons}
                />
            )}
            
            {view === ViewState.SETTINGS && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurações da Loja</h2>
                    
                    <div className="space-y-6">

                        <div className="bg-red-50 border border-red-100 rounded-xl p-6 mb-6">
                            <h3 className="font-bold text-red-900 mb-2 flex items-center gap-2">
                                <Lock className="w-5 h-5" /> Controle de Acesso (Modo Caixa)
                            </h3>
                            <p className="text-sm text-red-800 mb-4 leading-relaxed">
                                Crie uma senha numérica. Se preenchida, o sistema iniciará travado no Frente de Caixa (PDV) e Kanban. Para acessar o Financeiro, Dashboard ou Cardápio, será exigida a senha.
                            </p>
                            <div>
                                <input 
                                    type="password"
                                    placeholder="Ex: 1234 (Deixe em branco para desativar)"
                                    value={localCompany.adminPin || ''}
                                    onChange={e => setLocalCompany({...localCompany, adminPin: e.target.value})}
                                    className="w-full max-w-xs border border-red-200 rounded-xl px-4 py-2.5 font-bold tracking-[0.2em] focus:ring-2 focus:ring-red-400 outline-none"
                                    maxLength={6}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                             <div className="col-span-2">
                                <label className="text-sm font-bold text-gray-700 mb-2 block">Identidade Visual</label>
                                <div className="flex gap-6 items-start">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-24 h-24 bg-gray-100 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden group hover:border-red-300 cursor-pointer">
                                            {localCompany.logo ? (
                                                <img src={localCompany.logo} className="w-full h-full object-cover"/>
                                            ) : (
                                                <Camera className="w-8 h-8 text-gray-300"/>
                                            )}
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, (b64) => setLocalCompany({...localCompany, logo: b64}))} accept="image/*"/>
                                        </div>
                                        <span className="text-xs font-bold text-gray-500">Logo</span>
                                    </div>

                                    <div className="flex-1">
                                        <div className="w-full h-24 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden group hover:border-red-300 cursor-pointer">
                                            {localCompany.coverImage ? (
                                                <img src={localCompany.coverImage} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="text-center">
                                                    <ImageIcon className="w-6 h-6 text-gray-300 mx-auto mb-1"/>
                                                    <span className="text-xs text-gray-400">Imagem de Capa (Banner)</span>
                                                </div>
                                            )}
                                            <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => handleFileUpload(e, (b64) => setLocalCompany({...localCompany, coverImage: b64}))} accept="image/*"/>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="col-span-2 mt-4">
                                <label className="text-sm font-bold text-gray-700">Nome da Loja</label>
                                <input 
                                    value={localCompany.name} 
                                    onChange={e => setLocalCompany({...localCompany, name: e.target.value})}
                                    className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5" 
                                />
                            </div>
                            
                             <div className="col-span-2">
                                <label className="text-sm font-bold text-gray-700">Categoria</label>
                                <select 
                                    value={localCompany.category} 
                                    onChange={e => setLocalCompany({...localCompany, category: e.target.value})}
                                    className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 bg-white" 
                                >
                                    {COMPANY_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="col-span-2">
                                <label className="text-sm font-bold text-gray-700">Descrição</label>
                                <textarea 
                                    value={localCompany.description} 
                                    onChange={e => setLocalCompany({...localCompany, description: e.target.value})}
                                    className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 h-24 resize-none" 
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                             <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-gray-500" /> Dados Financeiros (Recebimento)
                            </h3>
                            <div className="grid grid-cols-3 gap-4">
                                 <div>
                                    <label className="text-sm font-bold text-gray-700">Tipo Chave Pix</label>
                                    <select 
                                        value={localCompany.pixKeyType || 'email'} 
                                        onChange={e => setLocalCompany({...localCompany, pixKeyType: e.target.value as any})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 bg-white" 
                                    >
                                        <option value="cpf">CPF</option>
                                        <option value="cnpj">CNPJ</option>
                                        <option value="email">E-mail</option>
                                        <option value="phone">Celular</option>
                                        <option value="random">Chave Aleatória</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="text-sm font-bold text-gray-700">Chave Pix</label>
                                    <input 
                                        type="text"
                                        placeholder="Chave para receber repasses"
                                        value={localCompany.pixKey || ''} 
                                        onChange={e => setLocalCompany({...localCompany, pixKey: e.target.value})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 font-mono" 
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                * Seus pagamentos online serão transferidos automaticamente para esta chave.
                            </p>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-gray-500" /> Endereço e Localização
                            </h3>
                            
                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex gap-2">
                                    <div className="relative w-1/3">
                                        <input 
                                            placeholder="CEP" 
                                            className="w-full border rounded-lg px-3 py-2"
                                            value={localCompany.address?.zipCode || ''}
                                            onChange={handleCepChange}
                                            maxLength={8}
                                        />
                                        {loadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-red-500"/>}
                                    </div>
                                    <button 
                                        onClick={() => setShowMapModal(true)}
                                        className="flex-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-100"
                                    >
                                        <MapPin className="w-3 h-3"/> Abrir Mapa
                                    </button>
                                    <button 
                                        onClick={handleGetCurrentLocation}
                                        className="px-3 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                                        title="Usar GPS"
                                    >
                                        {loadingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Crosshair className="w-4 h-4"/>}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <input 
                                            value={localCompany.address?.street || ''}
                                            onChange={e => setLocalCompany(prev => ({...prev, address: {...prev.address!, street: e.target.value}}))}
                                            className="w-full border rounded-lg px-3 py-2"
                                            placeholder="Rua..."
                                        />
                                    </div>
                                    <div>
                                        <input 
                                            value={localCompany.address?.number || ''}
                                            onChange={e => setLocalCompany(prev => ({...prev, address: {...prev.address!, number: e.target.value}}))}
                                            className="w-full border rounded-lg px-3 py-2"
                                            placeholder="Nº"
                                        />
                                    </div>
                                    <div>
                                        <input 
                                            value={localCompany.address?.neighborhood || ''}
                                            onChange={e => setLocalCompany(prev => ({...prev, address: {...prev.address!, neighborhood: e.target.value}}))}
                                            className="w-full border rounded-lg px-3 py-2"
                                            placeholder="Bairro"
                                        />
                                    </div>
                                    <div>
                                        <input 
                                            value={localCompany.address?.city || ''}
                                            onChange={e => setLocalCompany(prev => ({...prev, address: {...prev.address!, city: e.target.value}}))}
                                            className="w-full border rounded-lg px-3 py-2"
                                            placeholder="Cidade"
                                        />
                                    </div>
                                </div>
                                {localCompany.address && localCompany.address.lat !== 0 && (
                                    <div className="text-[10px] text-green-600 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3"/> Localização exata (GPS) confirmada.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Truck className="w-5 h-5 text-gray-500" /> Logística
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Raio de Entrega (km)</label>
                                    <input 
                                        type="number"
                                        value={localCompany.deliveryRadiusKm} 
                                        onChange={e => setLocalCompany({...localCompany, deliveryRadiusKm: parseFloat(e.target.value)})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5" 
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Taxa Própria (se aplicável)</label>
                                    <input 
                                        type="number"
                                        value={localCompany.ownDeliveryFee || 0} 
                                        onChange={e => setLocalCompany({...localCompany, ownDeliveryFee: parseFloat(e.target.value)})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5" 
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex justify-end pt-4">
                            <button 
                                onClick={handleSaveSettings}
                                className="bg-red-600 text-white font-bold px-8 py-3 rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
                            >
                                Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PartnerView;
