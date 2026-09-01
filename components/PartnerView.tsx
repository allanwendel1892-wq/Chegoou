import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Company, Product, Order, ViewState, Address, ProductGroup, ProductOption, ChatMessage, SalesHistoryItem, WithdrawalRequest, Coupon, User } from '../types';
import { enhanceProductImage } from '../services/geminiService';
import { Plus, Image as ImageIcon, Sparkles, Clock, MapPin, Truck, Check, X, GripVertical, Settings2, ChefHat, Utensils, DollarSign, Store, Calendar, Upload, Save, Disc, Trash2, LogOut, Layers, ChevronDown, ChevronUp, MessageCircle, Send, ArrowLeft, Edit, Loader2, Navigation, MousePointer2, Map as MapIcon, Crosshair, CheckCircle, Camera, AlertTriangle, Wand2, ShoppingBag, Bike, Wallet, XCircle, ArrowRight, Lock, Unlock, Banknote, AlertCircle, Info, MessageSquare, CreditCard, Printer, TrendingUp, Copy, Link2, StickyNote } from 'lucide-react';
import { uploadProductImage, uploadCompanyImage } from '../services/imageUpload';
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
  onTogglePayment?: (orderId: string, newStatus: boolean) => void;
}

// URL do Webhook do n8n (fluxo Evolution API / WhatsApp)
const N8N_NOTIFY_WEBHOOK_URL = 'https://n8n-webhook.znzrqn.easypanel.host/webhook/6403e26a-5410-4756-a4db-7f3c3d2edeb0';

// Dispara a notificação de WhatsApp via n8n. Não bloqueia a UI e não quebra o fluxo se falhar.
const notifyCustomerWhatsApp = (order: Order, event: 'preparing' | 'delivering', companyName: string) => {
    if (!order.customerPhone) return;

    const shortId = order.id.slice(-4);
    const message = event === 'preparing'
        ? `Oi, ${order.customerName}! Seu pedido #${shortId} em ${companyName} acabou de entrar em preparo. 👨‍🍳🍽️`
        : `Oi, ${order.customerName}! Seu pedido #${shortId} de ${companyName} saiu para entrega. 🛵💨`;

    fetch(N8N_NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            event,
            orderId: order.id,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            companyName,
            message,
        }),
    }).catch(err => {
        console.error('Falha ao notificar cliente via WhatsApp (n8n):', err);
    });
};

const COMPANY_CATEGORIES = [
    "Lanches", "Pizza", "Japonesa", "Brasileira", "Açaí", 
    "Doces & Bolos", "Saudável", "Italiana", "Bebidas", "Padaria", 
    "Sorvetes", "Carnes", "Mercado", "Asiática","Combos",
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
interface OrderCardProps {
  order: Order;
  status: Order['status'];
  orderChats: ChatMessage[];
  products: Product[];
  onClickOrder: (order: Order) => void;
  onDrop: (orderId: string, status: Order['status']) => void;
  onOpenChat: (orderId: string) => void;
  onPrintOrder: (order: Order) => void;
  onToggleDeliveryMethod?: (order: Order) => void;
  onTogglePayment?: (orderId: string, newStatus: boolean) => void;
}

// Compara apenas o que realmente importa para este cartão específico, evitando
// que o Kanban inteiro re-renderize quando o estado do componente pai muda
// (ex: digitação no chat ou no modal de edição de outro pedido).
const areOrderCardPropsEqual = (prev: OrderCardProps, next: OrderCardProps) => {
  if (prev.order !== next.order) {
      if (
          prev.order.id !== next.order.id ||
          prev.order.status !== next.order.status ||
          prev.order.total !== next.order.total ||
          prev.order.deliveryMethod !== next.order.deliveryMethod ||
          prev.order.customerName !== next.order.customerName ||
          prev.order.customerPhone !== next.order.customerPhone ||
          prev.order.changeFor !== next.order.changeFor ||
          prev.order.timestamp !== next.order.timestamp ||
          prev.order.items !== next.order.items ||
          (prev.order.pay !== next.order.pay) ||
          (prev.order.observacoes !== next.order.observacoes)
      ) {
          return false;
      }
  }
  if (prev.orderChats !== next.orderChats) {
      const prevLast = prev.orderChats[prev.orderChats.length - 1];
      const nextLast = next.orderChats[next.orderChats.length - 1];
      if (prev.orderChats.length !== next.orderChats.length || prevLast?.id !== nextLast?.id) {
          return false;
      }
  }
  return prev.status === next.status && prev.products === next.products;
};

// Formato já processado que o JSX consome diretamente, sem recalcular
// products.find/groups/frações a cada render.
interface FormattedOptionGroup {
  key: string;
  groupName: string;
  divide: boolean;
  fraction: string;
  options: string[];
}

interface FormattedOrderItem {
  key: string;
  quantity: number;
  productName: string;
  groups: FormattedOptionGroup[];
}

const OrderCard = React.memo(function OrderCard({ order, status, orderChats, products, onClickOrder, onDrop, onOpenChat, onPrintOrder, onToggleDeliveryMethod, onTogglePayment }: OrderCardProps) {
  const hasMessages = orderChats.length > 0;
  const lastMsg = hasMessages ? orderChats[orderChats.length - 1] : null;
  const hasUnread = lastMsg?.senderRole === 'client';
  const isWhatsapp = order.origin?.toLowerCase() === 'whatsapp';
  const pMethod = order.paymentMethod?.toLowerCase() || '';
  const dMethod = order.deliveryMethod?.toLowerCase() || '';
  const hasNote = !!order.observacoes;
  const isPaid = !!order.pay;

  // Motor de cálculo (produto correspondente, agrupamento de opções, regra de
  // divisão de fração de pizza) movido para fora do JSX. Só recalcula quando
  // os itens do pedido ou o catálogo de produtos mudam — não a cada render.
  const formattedItems: FormattedOrderItem[] = useMemo(() => {
    if (!Array.isArray(order.items) || order.items.length === 0) return [];

    return order.items.slice(0, 3).map((item, idx) => {
        const originalProduct = products.find(p => p.name === item.productName);
        const isPizza = (item as any).pricingMode === 'pizza' || originalProduct?.pricingMode === 'pizza';

        let groups: FormattedOptionGroup[] = [];

        if (item.selectedOptions && item.selectedOptions.length > 0) {
            const rawGroups: Record<string, string[]> = {};

            item.selectedOptions.forEach(opt => {
                const g = (opt as any).groupName || '';
                if (!rawGroups[g]) rawGroups[g] = [];
                rawGroups[g].push(opt.optionName || opt.name);
            });

            groups = Object.entries(rawGroups).map(([gName, opts], groupIdx) => {
                // 1. Lê a flag dividePrice direto do JSON salvo no banco
                const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                // 2. Fallback caso seja um pedido muito antigo e não tenha a flag no JSON
                const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
                // 3. Define a regra final (priorizando o JSON do pedido)
                const divideThisGroup = !!(snapshotDivide || originalGroup?.dividePrice || (isPizza && gName.toLowerCase().includes('sabor')));

                return {
                    key: `${idx}-${groupIdx}`,
                    groupName: gName,
                    divide: divideThisGroup,
                    fraction: divideThisGroup && opts.length > 1 ? `1/${opts.length} ` : '',
                    options: opts,
                };
            });
        }

        return {
            key: String(idx),
            quantity: item.quantity,
            productName: item.productName,
            groups,
        };
    });
  }, [order.items, products]);

  return (
      <div
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
              <span className="font-bold text-gray-900 group-hover:text-red-600 transition-colors flex items-center gap-1.5">
                  #{order.id.slice(-4)}
                  {hasNote && (
                      <span title="Existe observação interna neste pedido (oculta para o cliente)">
                          <StickyNote className="w-3.5 h-3.5 text-amber-500" fill="currentColor" fillOpacity={0.15} />
                      </span>
                  )}
              </span>
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
              {formattedItems.length > 0 ? (
                  <>
                      {formattedItems.map((item) => (
                          <div key={item.key} className="flex flex-col border-b border-gray-100 last:border-0 pb-1 last:pb-0">
                              <div className="text-xs text-gray-800 font-medium flex justify-between gap-2">
                                  <span className="truncate">{item.quantity}x {item.productName}</span>
                              </div>
                              {item.groups.length > 0 && (
                                  <div className="pl-3 mt-1 space-y-1">
                                      {item.groups.map(group => group.divide ? (
                                          <React.Fragment key={group.key}>
                                              {group.options.map((o, i) => (
                                                  <div key={i} className="text-[10px] text-gray-600 leading-tight mt-0.5">
                                                      <span className="font-bold text-gray-800">+ {group.fraction}{o}</span>
                                                  </div>
                                              ))}
                                          </React.Fragment>
                                      ) : (
                                          <div key={group.key} className="text-[10px] text-gray-600 leading-tight mt-0.5">
                                              {group.groupName ? <span className="font-bold text-gray-800 uppercase">{group.groupName}: </span> : <span className="font-bold text-gray-800">+ </span>}
                                              <span className="font-bold text-gray-800">{group.options.join(', ')}</span>
                                          </div>
                                      ))}
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

          <div className="pt-3 border-t border-gray-100 mt-2 space-y-2">
              {/* Linha 1: Preço e Botão Principal de Avançar */}
              <div className="flex justify-between items-center">
                  <span className="font-bold text-base text-gray-900">R$ {order.total.toFixed(2)}</span>

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
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                          title="Avançar Pedido"
                     >
                          Avançar <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                  )}
              </div>

              {/* Linha 2: Ícones Utilitários e Chat */}
              <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1">
                      <button
                          onClick={(e) => { e.stopPropagation(); onPrintOrder(order); }}
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                          title="Imprimir Pedido"
                      >
                          <Printer className="w-4 h-4" />
                      </button>

                      {onToggleDeliveryMethod && (
                          <button
                              onClick={(e) => { e.stopPropagation(); onToggleDeliveryMethod(order); }}
                              className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors"
                              title="Alternar Entrega / Retirada"
                          >
                              {dMethod.includes('pickup') || dMethod.includes('retirada') ? <Bike className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                          </button>
                      )}

                      {onTogglePayment && (
                          <button
                              onClick={(e) => { e.stopPropagation(); onTogglePayment(order.id, !isPaid); }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                  isPaid
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-500 hover:bg-red-100 hover:text-red-600'
                              }`}
                              title={isPaid ? 'Acerto de Caixa: Pago (clique para marcar como pendente)' : 'Acerto de Caixa: Pendente (clique para marcar como pago)'}
                          >
                              <DollarSign className="w-4 h-4" />
                          </button>
                      )}
                  </div>

                  <div>
                      {!isWhatsapp && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onOpenChat(order.id); }}
                            className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 text-xs font-bold
                                ${hasUnread
                                    ? 'bg-red-600 text-white animate-pulse shadow-md shadow-red-200'
                                    : hasMessages ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }
                            `}
                            title="Chat com Cliente"
                       >
                            <MessageCircle className="w-4 h-4" />
                            {hasUnread && <span>Novo</span>}
                       </button>
                      )}
                      {isWhatsapp && (
                          <button onClick={() => window.open(`https://wa.me/${order.customerPhone}`, '_blank')} className="p-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 flex items-center gap-1 text-xs font-bold px-2">
                              <MessageSquare className="w-4 h-4"/> WhatsApp
                          </button>
                      )}
                  </div>
              </div>
          </div>
      </div>
  );
}, areOrderCardPropsEqual);

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
  onToggleDeliveryMethod?: (order: Order) => void;
  onTogglePayment?: (orderId: string, newStatus: boolean) => void;
}

const EMPTY_CHATS: ChatMessage[] = [];

const KanbanColumn: React.FC<KanbanColumnProps> = React.memo(({ title, status, items, color, isLast, onClickOrder, onDrop, chats, onOpenChat, onPrintOrder, products, onToggleDeliveryMethod, onTogglePayment }) => {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      // Functional update: evita disparar re-render a cada pixel do mouse
      // enquanto o item é arrastado sobre a coluna (onDragOver dispara
      // dezenas de vezes por segundo). Só atualiza o estado quando ele
      // realmente muda de false -> true.
      setIsOver(prev => prev ? prev : true);
  }, []);

  const handleDragLeave = useCallback(() => {
      setIsOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const orderId = e.dataTransfer.getData("orderId");
      if (orderId) {
          onDrop(orderId, status);
      }
  }, [onDrop, status]);

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
          {items.map(order => (
              <OrderCard
                  key={order.id}
                  order={order}
                  status={status}
                  orderChats={chats[order.id] || EMPTY_CHATS}
                  products={products}
                  onClickOrder={onClickOrder}
                  onDrop={onDrop}
                  onOpenChat={onOpenChat}
                  onPrintOrder={onPrintOrder}
                  onToggleDeliveryMethod={onToggleDeliveryMethod}
                  onTogglePayment={onTogglePayment}
              />
          ))}
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
});

const calculateBankFee = (amount: number, percentage: number) => {
    const rawFee = amount * (percentage / 100);
    return Math.ceil(rawFee * 100) / 100;
};

interface EditOrderModalProps {
  order: Order;
  products: Product[];
  onClose: () => void;
  onSave: (order: Order) => void;
  onCancelOrder: (orderId: string) => void;
}

// Modal com estado 100% local: digitar aqui não re-renderiza o PartnerView nem o Kanban.
const EditOrderModal: React.FC<EditOrderModalProps> = ({ order, products, onClose, onSave, onCancelOrder }) => {
  const [localOrder, setLocalOrder] = useState<Order>(order);

  const paymentMethod = localOrder.paymentMethod?.toLowerCase() || '';
  const origin = localOrder.origin?.toLowerCase() || '';

  const handleDeleteItem = (index: number) => {
      const newItems = [...localOrder.items];
      newItems.splice(index, 1);
      setLocalOrder({ ...localOrder, items: newItems });
  };

  const handleUpdateItemQuantity = (index: number, delta: number) => {
      const newItems = [...localOrder.items];
      const newQty = Math.max(1, newItems[index].quantity + delta);
      newItems[index] = { ...newItems[index], quantity: newQty };
      setLocalOrder({ ...localOrder, items: newItems });
  };

  const handleSave = () => {
      const itemsTotal = localOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
      const newTotal = itemsTotal + localOrder.deliveryFee + localOrder.serviceFee;
      const finalOrder = { ...localOrder, total: newTotal, subtotal: itemsTotal };
      onSave(finalOrder);
      alert("Pedido atualizado com sucesso!");
  };

  const handleCancelOrder = () => {
      if (window.confirm("ATENÇÃO: Deseja realmente CANCELAR este pedido? Se houve pagamento online, o estorno será iniciado automaticamente.")) {
          onCancelOrder(localOrder.id);
      }
  };

  return (
       <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
           <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
               <div className="bg-white border-b border-gray-100 p-6 flex justify-between items-center">
                   <h3 className="text-xl font-bold text-gray-900">
                       {origin === 'whatsapp' ? (
                           <span className="flex items-center gap-2">
                               <MessageSquare className="w-5 h-5 text-green-600" /> Pedido IA #{localOrder.id.slice(-4)}
                           </span>
                       ) : (
                           `Editar Pedido #${localOrder.id.slice(-4)}`
                       )}
                   </h3>
                   <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
               </div>
       
               <div className="p-6 overflow-y-auto space-y-6 flex-1">
                   
                   {origin === 'whatsapp' && (
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
                              {paymentMethod.includes('cash') ? 'DINHEIRO' : 
                                (paymentMethod.includes('pix') ? 'PIX' : 
                                (paymentMethod.includes('whatsapp') ? 'WHATSAPP' : 'ONLINE'))}
                           </span>
                       </div>
                       {paymentMethod.includes('cash') ? (
                           <p className="text-sm text-yellow-900 font-bold">
                               Levar troco para: <span className="text-lg">R$ {localOrder.changeFor ? localOrder.changeFor.toFixed(2) : localOrder.total.toFixed(2)}</span>
                           </p>
                       ) : (
                           <p className="text-sm text-green-700 font-medium">
                              {paymentMethod.includes('whatsapp') ? 'Combinado via Chat' : (origin === 'whatsapp' ? 'Combinado via WhatsApp' : 'Pago via App/Pix/Cartão')}
                           </p>
                       )}
                  </div>

                   <div className="space-y-4">
                       <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Dados do Cliente</h4>
      
                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="text-xs font-bold text-gray-400">Nome</label>
                               <input 
                                  value={localOrder.customerName}
                                  onChange={e => setLocalOrder({...localOrder, customerName: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 mt-1 font-medium"
                               />
                          </div>
                           <div>
                               <label className="text-xs font-bold text-gray-400">Telefone</label>
                               <input 
                                  value={localOrder.customerPhone}
                                  onChange={e => setLocalOrder({...localOrder, customerPhone: e.target.value})}
                                  className="w-full border rounded-lg px-3 py-2 mt-1 font-medium"
                               />
                           </div>
                       </div>

                       {/* Alteração para Alternar Tipo de Entrega no próprio Modal */}
                       <div>
                           <label className="text-xs font-bold text-gray-400 uppercase">Tipo de Entrega</label>
                           <select 
                              value={localOrder.deliveryMethod}
                              onChange={e => {
                                  const method = e.target.value;
                                  setLocalOrder({
                                      ...localOrder,
                                      deliveryMethod: method,
                                      deliveryFee: method === 'pickup' ? 0 : localOrder.deliveryFee
                                  });
                              }}
                              className="w-full border rounded-lg px-3 py-2 mt-1 bg-white font-medium"
                           >
                               <option value="delivery">Entrega</option>
                               <option value="pickup">Retirada</option>
                           </select>
                       </div>

                       {localOrder.deliveryAddress && (
                          <div>
                               <label className="text-xs font-bold text-gray-400">Endereço</label>
                               <p className="text-sm font-medium bg-gray-50 p-2 rounded border border-gray-200">
                                   {localOrder.deliveryAddress.street}, {localOrder.deliveryAddress.number} <br/>
                                   {localOrder.deliveryAddress.neighborhood} - {localOrder.deliveryAddress.city}
                               </p>
                           </div>
                       )}
                   </div>

                   <div className="space-y-4">
                       <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Itens do Pedido</h4>
                       <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                           {Array.isArray(localOrder.items) && localOrder.items.length > 0 ?
                           localOrder.items.map((item, idx) => (
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
                                                    const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                                                    const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
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
                                   <p className="text-sm font-mono whitespace-pre-wrap">{localOrder.raw_description || "Sem descrição disponível."}</p>
                               </div>
                          )}
                       </div>
                   </div>

                   <div className="space-y-2">
                       <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-1.5">
                           <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                           Observações Internas (Oculto para o cliente)
                       </label>
                       <textarea
                          value={localOrder.observacoes || ''}
                          onChange={e => setLocalOrder({ ...localOrder, observacoes: e.target.value })}
                          placeholder="Ex: cliente pediu para tocar a campainha, apto sem elevador, embalar separado..."
                          rows={3}
                          className="w-full border rounded-lg px-3 py-2 bg-amber-50/50 border-amber-200 focus:border-amber-400 outline-none text-sm resize-none"
                       />
                   </div>

                   <div className="space-y-2">
                       <label className="text-xs font-bold text-gray-400 uppercase">Status do Pedido</label>
                       <select 
                          value={localOrder.status}
                          onChange={e => setLocalOrder({...localOrder, status: e.target.value as any})}
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
                           R$ {localOrder.total.toFixed(2)}
                       </p>
                   </div>
                   
                   <button 
                      onClick={handleCancelOrder}
                      className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-colors text-sm"
                      title="Cancela o pedido e estorna pagamento (se houver)"
                   >
                       <XCircle className="w-5 h-5" /> Cancelar
                   </button>
                   <button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-200 transition-colors">
                       <Check className="w-5 h-5" /> Salvar
                   </button>
               </div>
           </div>
       </div>
  );
};

interface ChatPanelProps {
  orderId: string;
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}

// Painel de chat com estado local do input: digitar não re-renderiza o resto da tela.
const ChatPanel: React.FC<ChatPanelProps> = ({ orderId, messages, onSend, onClose }) => {
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
      if (!chatInput.trim()) return;
      onSend(chatInput);
      setChatInput('');
  };

  return (
       <div className="fixed bottom-0 right-0 w-full sm:w-96 h-[500px] bg-white shadow-2xl z-40 rounded-t-3xl sm:rounded-tl-3xl border border-gray-200 flex flex-col animate-slide-up">
            <div className="bg-red-600 text-white p-4 rounded-t-3xl flex justify-between items-center">
               <div className="flex items-center gap-2">
                   <div className="bg-white/20 p-2 rounded-full"><MessageCircle className="w-5 h-5"/></div>
                   <div>
                       <h4 className="font-bold">Chat com Cliente</h4>
                       <p className="text-xs opacity-80">Pedido #{orderId.slice(-4)}</p>
                   </div>
               </div>
               <button onClick={onClose} className="hover:bg-white/20 p-2 rounded-full"><X className="w-5 h-5"/></button>
           </div>
           <div className="flex-1 bg-gray-50 overflow-y-auto p-4 space-y-3">
               {messages.map(msg => (
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
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
               />
               <button onClick={handleSend} className="bg-red-600 text-white p-2 rounded-full hover:bg-red-700"><Send className="w-5 h-5"/></button>
           </div>
       </div>
  );
};

const PartnerView: React.FC<PartnerViewProps> = ({ 
    company, orders, products, updateOrderStatus, updateCompany, onAddProduct, onUpdateProduct, onDeleteProduct, onLogout,
    chats, onSendMessage, onUpdateFullOrder, onDeleteOrder, onTogglePayment
}) => {
  const [view, setView] = useState<ViewState>(company.adminPin ? ViewState.POS : ViewState.DASHBOARD);
  const [isUnlocked, setIsUnlocked] = useState(!company.adminPin);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingView, setPendingView] = useState<ViewState | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Estados adicionados para a Nova Lógica de Despacho e Rota
  const [dispatchingOrder, setDispatchingOrder] = useState<Order | null>(null);
  const [couriers, setCouriers] = useState<User[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('');
  const [deliveryAddressStr, setDeliveryAddressStr] = useState<string>('');
  const [mapLink, setMapLink] = useState<string>('');
  const [deliveryFee, setDeliveryFee] = useState<number>(0);

  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  // Agrupa os pedidos por status UMA ÚNICA VEZ por render de `orders`, em vez de rodar
  // `orders.filter(...)` inline em cada KanbanColumn (o que gerava uma nova referência de
  // array a cada render do PartnerView e quebrava a memoização das colunas).
  const groupedOrders = useMemo(() => {
      return {
          waiting_payment: orders.filter(o => o.status === 'waiting_payment'),
          pending: orders.filter(o => o.status === 'pending'),
          preparing: orders.filter(o => o.status === 'preparing'),
          ready: orders.filter(o => o.status === 'ready' || o.status === 'waiting_courier'),
          delivering: orders.filter(o => o.status === 'delivering'),
          delivered: orders.filter(o => o.status === 'delivered'),
          cancelled: orders.filter(o => o.status === 'cancelled')
      };
  }, [orders]);
  // Handlers estáveis (useCallback com deps vazias, pois usam apenas setters de estado)
  // para que as props do KanbanColumn não mudem de referência a cada render.
  const handleOpenChat = useCallback((orderId: string) => setActiveChatOrder(orderId), []);
  const handleSetEditingOrder = useCallback((order: Order) => setEditingOrder(order), []);
  const prevOrdersCount = useRef(orders.length);
  // Ref sincronizado com `orders`: permite que handleDragDropOrder acesse a lista mais
  // recente sem precisar de `orders` no array de dependências do useCallback, evitando
  // que a função seja recriada a cada atualização de pedidos (o que quebrava o memo dos cards).
  const ordersRef = useRef(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
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

  // Estados para análise/aprovação de saques dos entregadores (repasse ao motoboy)
  const [courierWithdrawals, setCourierWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [isLoadingCourierWithdrawals, setIsLoadingCourierWithdrawals] = useState(false);
  const [processingCourierWithdrawalId, setProcessingCourierWithdrawalId] = useState<string | null>(null);

  const [compositions, setCompositions] = useState<any[]>([]);
  const [dashboardInventoryItems, setDashboardInventoryItems] = useState<any[]>([]);
  
    // --- INÍCIO: ESTADOS PARA TAXA DE BAIRRO ---
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newFee, setNewFee] = useState('');

  const handleAddNeighborhoodFee = () => {
      if (!newNeighborhood.trim() || !newFee) return;
      const feeVal = parseFloat(newFee.replace(',', '.'));
      const currentList = (localCompany as any).neighborhoodFees || [];
      
      const existingIdx = currentList.findIndex((n: any) => n.neighborhood.toLowerCase() === newNeighborhood.trim().toLowerCase());
      let updatedList = [...currentList];
      
      if (existingIdx >= 0) {
          updatedList[existingIdx].fee = feeVal;
      } else {
          updatedList.push({ neighborhood: newNeighborhood.trim(), fee: feeVal });
      }
      
      setLocalCompany({ ...localCompany, neighborhoodFees: updatedList } as any);
      setNewNeighborhood('');
      setNewFee('');
  };

  const handleRemoveNeighborhoodFee = (idx: number) => {
      const currentList = [...((localCompany as any).neighborhoodFees || [])];
      currentList.splice(idx, 1);
      setLocalCompany({ ...localCompany, neighborhoodFees: currentList } as any);
  };
  // --- FIM: ESTADOS PARA TAXA DE BAIRRO ---

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

  // Busca APENAS os entregadores vinculados a ESTE restaurante (companyId = company.id).
  // Antes buscava todos os entregadores da plataforma (`.eq('role','courier')` sem filtro
  // de loja), o que permitia que um restaurante despachasse/visse entregadores de outro.
  // Também limitamos as colunas retornadas (evita baixar senha/endereço/etc de cada
  // entregador só para popular um <select>, o que fica caro conforme a base cresce).
  const fetchCouriers = useCallback(async () => {
      const { data, error } = await supabase
          .from('users')
          .select('id, name, phone, role, companyId')
          .eq('role', 'courier')
          .eq('companyId', company.id);
      if (!error && data) {
          setCouriers(data as User[]);
      }
  }, [company.id]);

  useEffect(() => {
      fetchCouriers();
  }, [fetchCouriers]);

  // --- VINCULAÇÃO DE ENTREGADORES A ESTE RESTAURANTE ---
  // Como o cadastro do entregador (conta) é feito fora do painel do parceiro, o
  // vínculo com a loja é feito aqui: o parceiro localiza o entregador pelo telefone
  // (WhatsApp) e associa a conta dele a este restaurante (users.companyId = company.id).
  // Isso é o que impede um entregador de aparecer/aceitar corridas de outra loja.
  const [courierSearchPhone, setCourierSearchPhone] = useState('');
  const [isLinkingCourier, setIsLinkingCourier] = useState(false);
  const [courierLinkError, setCourierLinkError] = useState('');

  const handleLinkCourier = async () => {
      const digits = courierSearchPhone.replace(/\D/g, '');
      if (digits.length < 10) {
          setCourierLinkError('Digite o telefone completo do entregador (com DDD).');
          return;
      }
      setIsLinkingCourier(true);
      setCourierLinkError('');
      try {
          // Localiza o entregador pelo telefone (busca por "contém" para tolerar
          // diferenças de formatação/DDI já normalizadas no cadastro).
          const { data: found, error: findError } = await supabase
              .from('users')
              .select('id, name, phone, role, companyId')
              .eq('role', 'courier')
              .ilike('phone', `%${digits}%`)
              .limit(1);

          if (findError) throw findError;

          if (!found || found.length === 0) {
              setCourierLinkError('Nenhum entregador cadastrado com esse telefone.');
              return;
          }

          const courierFound = found[0] as any;

          if (courierFound.companyId && courierFound.companyId !== company.id) {
              setCourierLinkError('Este entregador já está vinculado a outro restaurante.');
              return;
          }

          const { error: updateError } = await supabase
              .from('users')
              .update({ companyId: company.id })
              .eq('id', courierFound.id);

          if (updateError) throw updateError;

          setCourierSearchPhone('');
          await fetchCouriers();
      } catch (e: any) {
          setCourierLinkError(e.message || 'Erro ao vincular entregador.');
      } finally {
          setIsLinkingCourier(false);
      }
  };

  const handleUnlinkCourier = async (courierId: string) => {
      if (!window.confirm('Remover o vínculo deste entregador com o seu restaurante? Ele deixará de ver os pedidos da sua loja.')) return;
      const { error } = await supabase
          .from('users')
          .update({ companyId: null })
          .eq('id', courierId);
      if (!error) {
          setCouriers(prev => prev.filter(c => c.id !== courierId));
      } else {
          alert('Erro ao desvincular entregador: ' + error.message);
      }
  };
  
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

  const handlePrintOrder = useCallback((order: Order) => {
      const itemsHtml = Array.isArray(order.items) ?
      order.items.map(item => {
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
                  const snapshotDivide = item.selectedOptions.some(opt => (opt as any).groupName === gName && (opt as any).dividePrice === true);
                  const originalGroup = originalProduct?.groups?.find(g => g.name === gName || g.name.toUpperCase() === gName);
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
  }, [products, company.name]);

  useEffect(() => {
    const healFinancials = async () => {
        const ordersToFix = orders.filter(o => 
            o.status === 'delivered' && 
            o.paymentMethod !== 'cash' && 
            o.origin !== 'whatsapp' && 
            o.origin !== 'pos' && 
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

  // IDs dos entregadores que já realizaram entregas para este restaurante
  // (usado para restringir a análise de saques apenas aos entregadores "deste" restaurante)
  const restaurantCourierIds = useMemo(() => {
      const ids = new Set<string>();
      orders.forEach(o => {
          if (o.courierId) ids.add(o.courierId);
      });
      return Array.from(ids);
  }, [orders]);

  // Busca as solicitações de saque feitas pelos entregadores deste restaurante diretamente pela coluna companyId
  useEffect(() => {
    if (view === ViewState.FINANCE) {
        setIsLoadingCourierWithdrawals(true);
        const fetchCourierWithdrawals = async () => {
             const { data, error } = await supabase
                .from('withdrawal_requests')
                .select('*')
                .eq('userType', 'courier')
                .eq('companyId', company.id) // <-- FILTRAGEM DIRETA PELO ID DA SUA COLUNA DO BANCO DE DADOS!
                .order('date', { ascending: false });
             if (!error && data) setCourierWithdrawals(data);
             setIsLoadingCourierWithdrawals(false);
        };
        fetchCourierWithdrawals();
    }
  }, [view, company.id]);
  
  (() => {
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
          const isPos = o.origin?.toLowerCase() === 'pos'; 
          const isIgnored = o.repasseStatus === 'ignored' || o.repasseStatus === 'none'; 
          return !isWhatsapp && !isPos && !isIgnored; 
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

  // Aprova o saque solicitado pelo entregador: marca a solicitação como paga
  // e abate (marca como pago) os pedidos vinculados na carteira do entregador
  const handleApproveCourierWithdrawal = async (request: WithdrawalRequest) => {
      if (processingCourierWithdrawalId) return;
      if (!window.confirm(`Confirmar repasse de R$ ${request.amount.toFixed(2)} para ${request.userName}? Esta ação abaterá o valor da carteira do entregador.`)) {
          return;
      }
      setProcessingCourierWithdrawalId(request.id);
      try {
          const relatedOrderIds: string[] = ((request as any).relatedOrderIds || []) as string[];

          const { error: withdrawalError } = await supabase
              .from('withdrawal_requests')
              .update({ status: 'paid' })
              .eq('id', request.id);
          if (withdrawalError) throw withdrawalError;

          if (relatedOrderIds.length > 0) {
              const { error: ordersError } = await supabase
                  .from('orders')
                  .update({ courierPaid: true })
                  .in('id', relatedOrderIds);
              if (ordersError) throw ordersError;
          }

          setCourierWithdrawals(prev => prev.map(w => w.id === request.id ? { ...w, status: 'paid' } : w));
          alert("Repasse aprovado! O valor foi abatido da carteira do entregador.");
      } catch (e: any) {
          console.error("Erro ao aprovar saque do entregador:", e);
          alert("Erro ao aprovar saque: " + (e.message || "Erro desconhecido."));
      } finally {
          setProcessingCourierWithdrawalId(null);
      }
  };

  // Rejeita a solicitação de saque do entregador (os pedidos vinculados voltam a ficar disponíveis para uma nova solicitação)
  const handleRejectCourierWithdrawal = async (request: WithdrawalRequest) => {
      if (processingCourierWithdrawalId) return;
      if (!window.confirm(`Rejeitar a solicitação de saque de R$ ${request.amount.toFixed(2)} de ${request.userName}?`)) {
          return;
      }
      setProcessingCourierWithdrawalId(request.id);
      try {
          const { error } = await supabase
              .from('withdrawal_requests')
              .update({ status: 'rejected' })
              .eq('id', request.id);
          if (error) throw error;

          setCourierWithdrawals(prev => prev.map(w => w.id === request.id ? { ...w, status: 'rejected' } : w));
      } catch (e: any) {
          console.error("Erro ao rejeitar saque do entregador:", e);
          alert("Erro ao rejeitar saque: " + (e.message || "Erro desconhecido."));
      } finally {
          setProcessingCourierWithdrawalId(null);
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
        else { const i = setInterval(() => { if (window.google && window.google.maps) { clearInterval(i); initMap(); } }, 100);
        return () => clearInterval(i); }
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
          } catch (e) {} finally { setLoadingCep(false); } // <-- CORREÇÃO APLICADA AQUI
      }
  };

  const [savingProduct, setSavingProduct] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

  // Lógica Modificada de Drag & Drop para Interceptação de Entregadores
  const handleDragDropOrder = useCallback((orderId: string, status: Order['status']) => {
      const order = ordersRef.current.find(o => o.id === orderId);
      const isDelivery = order && !(order.deliveryMethod?.toLowerCase().includes('pickup') || order.deliveryMethod?.toLowerCase().includes('retirada'));
      
      if (status === 'delivering' && isDelivery) {
          setDispatchingOrder(order);
          setSelectedCourierId(order.courierId || '');
          setDeliveryAddressStr(order.deliveryAddress ? `${order.deliveryAddress.street}, ${order.deliveryAddress.number || ''} - ${order.deliveryAddress.neighborhood || ''}`.trim() : '');
          setMapLink((order.deliveryAddress as any)?.mapLink || '');
          setDeliveryFee(order.deliveryFee || 0);
          return;
      }
      updateOrderStatus(orderId, status);

      if (status === 'preparing' && order) {
          notifyCustomerWhatsApp(order, 'preparing', company.name);
      }
  }, [updateOrderStatus, company.name]);

  // Handler estável (useCallback) para alternar entre entrega/retirada direto no card do Kanban,
  // evitando recriar uma função inline por coluna a cada render do PartnerView.
  const handleToggleDeliveryMethod = useCallback((order: Order) => {
      const isPickup = order.deliveryMethod?.toLowerCase().includes('pickup') || order.deliveryMethod?.toLowerCase().includes('retirada');
      onUpdateFullOrder({
          ...order,
          deliveryMethod: isPickup ? 'delivery' : 'pickup',
          deliveryFee: isPickup ? order.deliveryFee : 0
      });
  }, [onUpdateFullOrder]);

  // Botão rápido "Acerto de Caixa" do OrderCard: alterna a flag `pay` direto
  // no Supabase (feito no App.tsx) sem precisar abrir o modal de edição.
  const handleTogglePayment = useCallback((orderId: string, newStatus: boolean) => {
      onTogglePayment?.(orderId, newStatus);
  }, [onTogglePayment]);

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

  const handleSaveProduct = async () => {
      if (!newProduct.name || !newProduct.category) { alert("Preencha nome e categoria.");
      return; }

      setSavingProduct(true);
      try {
          // Se veio um arquivo novo (ou já melhorado pela IA), productImagePreview é uma
          // data URL base64. uploadProductImage comprime e sobe pro Storage, retornando
          // uma URL curta. Se já for uma URL (produto existente sem alteração de foto),
          // ela é apenas reaproveitada sem novo upload.
          const imageUrl = productImagePreview
              ? await uploadProductImage(productImagePreview, company.id)
              : 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c';

          const productData: Product = {
              id: editingProductId || Date.now().toString(),
              companyId: company.id,
              name: newProduct.name!,
              description: newProduct.description || '',
              category: newProduct.category!,
              price: Number(newProduct.price),
              image: imageUrl,
              isAvailable: true,
              pricingMode: newProduct.pricingMode || 'default',
              groups: newProduct.groups || []
          };
          if (editingProductId) {
              onUpdateProduct(productData);
              alert("Produto updated!");
          } else {
              onAddProduct(productData);
              alert("Produto criado!");
          }

          handleCancelEdit();
      } catch (e: any) {
          alert("Erro ao enviar a imagem do produto: " + (e.message || 'tente novamente.'));
      } finally {
          setSavingProduct(false);
      }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
        const updatedCompany = { ...localCompany };

        // Só sobe pro Storage se logo/coverImage forem uma data URL nova (base64).
        if (updatedCompany.logo && updatedCompany.logo.startsWith('data:')) {
            updatedCompany.logo = await uploadCompanyImage(updatedCompany.logo, company.id, 'logo');
        }
        if (updatedCompany.coverImage && updatedCompany.coverImage.startsWith('data:')) {
            updatedCompany.coverImage = await uploadCompanyImage(updatedCompany.coverImage, company.id, 'banner');
        }

        // 1. Atualiza a tela imediatamente (Otimista)
        setLocalCompany(updatedCompany);
        updateCompany(updatedCompany);

        // 2. Garante o salvamento no banco de dados focando na coluna exata (snake_case)
        try {
            const { error } = await supabase
                .from('companies') 
                .update({ neighborhood_fees: (updatedCompany as any).neighborhoodFees })
                .eq('id', company.id);
            
            if (error) {
                console.error("Erro do Supabase ao salvar bairros:", error);
                alert("Erro ao salvar os bairros no banco de dados. Verifique a coluna 'neighborhood_fees'.");
            }
        } catch (dbErr) {
            console.error("Erro de conexão ao salvar bairros:", dbErr);
        }

        alert('Configurações salvas com sucesso!');
    } catch (e: any) {
        alert("Erro ao salvar: " + (e.message || 'Tente novamente.'));
    } finally {
        setSavingSettings(false);
    }
  };
  const menuLink = `${window.location.origin}/cardapio/${company.id}`;

  const handleCopyMenuLink = async () => {
      try {
          await navigator.clipboard.writeText(menuLink);
      } catch {
          // Fallback para navegadores sem suporte ao Clipboard API
          const textarea = document.createElement('textarea');
          textarea.value = menuLink;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
      }
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
  };

  const currentBankFee = calculateBankFee(financialSummary.available, localCompany.serviceFeePercentage || 0);
  const currentNet = Math.max(0, financialSummary.available - currentBankFee);

  return (
    <div className="flex h-screen bg-gray-50 relative">
        
        {/* Modal de Despacho Customizado Interceptado (Entrega) */}
        {dispatchingOrder && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in">
                    <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4 mx-auto border border-red-100">
                        <Truck className="w-6 h-6 text-red-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Despachar Pedido #{dispatchingOrder.id.slice(-4)}</h3>
                    <p className="text-gray-500 text-sm text-center mb-6">Defina os detalhes operacionais da rota e repasse da entrega.</p>
                    
                    <div className="space-y-4 text-left">
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Selecionar Entregador</label>
                            <select 
                                value={selectedCourierId}
                                onChange={e => setSelectedCourierId(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 bg-white font-medium outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                            >
                                <option value="">Nenhum / Escolha na Lista</option>
                                {couriers.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Endereço de Entrega</label>
                            <input 
                                type="text"
                                value={deliveryAddressStr}
                                onChange={e => setDeliveryAddressStr(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 font-medium outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                placeholder="Rua, número, bairro..."
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Link do Mapa (Rota GPS / WhatsApp)</label>
                            <input 
                                type="text"
                                value={mapLink}
                                onChange={e => setMapLink(e.target.value)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 font-medium outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                placeholder="https://maps.google.com/..."
                            />
                        </div>
                        
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase">Valor de Taxa (Vai para Carteira do Entregador)</label>
                            <input 
                                type="number"
                                value={deliveryFee || ''}
                                onChange={e => setDeliveryFee(parseFloat(e.target.value) || 0)}
                                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 mt-1 font-medium outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 text-green-600 font-bold text-lg"
                                placeholder="0.00"
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-3 mt-6">
                        <button 
                            onClick={() => setDispatchingOrder(null)} 
                            className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
    onClick={() => {
        const novoStatus = selectedCourierId ? 'delivering' : 'waiting_courier';

const updated: any = {
    ...dispatchingOrder,
    status: novoStatus,
    courierId: selectedCourierId || null,
    deliveryFee: Number(deliveryFee),
    deliveryType: 'chegoou'
};

if (dispatchingOrder.deliveryAddress) {
    updated.deliveryAddress = {
        ...dispatchingOrder.deliveryAddress,
        mapLink: mapLink
    };
} else {
    updated.deliveryAddress = {
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        zipCode: '',
        lat: 0,
        lng: 0,
        mapLink: mapLink
    };
}

delete updated.mapLink;

        onUpdateFullOrder(updated);
        setDispatchingOrder(null);

        if (novoStatus === 'delivering') {
            notifyCustomerWhatsApp(dispatchingOrder, 'delivering', company.name);
        }

        alert(selectedCourierId 
            ? "Pedido despachado diretamente para o entregador!" 
            : "Pedido liberado! Entregadores já podem aceitar a corrida.");
    }} 
    className="flex-1 py-3 rounded-xl bg-gray-900 font-bold text-white hover:bg-black transition-colors shadow-lg"
>
    Confirmar Rota
</button>
                    </div>
                </div>
            </div>
        )}

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
                        <button onClick={() => setIsConfirmingStatus(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
                        <button onClick={handleConfirmStatusChange} className={`flex-1 py-3 rounded-xl font-bold text-white transition-colors ${company.status === 'open' ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200' : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200'}`}>
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
                            <span>Taxa Transação Bancária ({ (localCompany.serviceFeePercentage || 0).toFixed(2)}%):</span>
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
                        <button onClick={() => setIsWithdrawModalOpen(false)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
                        <button onClick={executeWithdrawal} className="flex-1 py-3 rounded-xl bg-green-600 font-bold text-white hover:bg-green-700 shadow-lg shadow-green-200 transition-colors">Confirmar</button>
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
                        <button onClick={() => setProductToDelete(null)} className="flex-1 py-3 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors">Cancelar</button>
                        <button onClick={handleConfirmDeleteProduct} className="flex-1 py-3 rounded-xl bg-red-600 font-bold text-white hover:bg-red-700 shadow-lg shadow-red-200 transition-colors">Sim, Excluir</button>
                    </div>
                </div>
           </div>
        )}

        {editingOrder && (
            <EditOrderModal
                key={editingOrder.id}
                order={editingOrder}
                products={products}
                onClose={() => setEditingOrder(null)}
                onSave={(updatedOrder) => { onUpdateFullOrder(updatedOrder); setEditingOrder(null); }}
                onCancelOrder={(orderId) => { updateOrderStatus(orderId, 'cancelled'); setEditingOrder(null); }}
            />
        )}

        {activeChatOrder && (
            <ChatPanel
                orderId={activeChatOrder}
                messages={chats[activeChatOrder] || []}
                onSend={(text) => onSendMessage(activeChatOrder, text, company.id, 'partner')}
                onClose={() => setActiveChatOrder(null)}
            />
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
                            Os valores abaixo referem-se <strong>apenas a vendas online</strong> (Pix e Cartão pelo App). Pagamentos em dinheiro ou <strong>via WhatsApp (IA)</strong> são recebidos diretamente por você.
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
                            className={`px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 shadow-lg transition-all ${financialSummary.available > 0 ? 'bg-green-600 text-white hover:bg-green-700 shadow-green-200 hover:-translate-y-1' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}
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
                                                 <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${req.status === 'paid' ? 'bg-green-100 text-green-700' : ''} ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : ''} ${req.status === 'rejected' ? 'bg-red-100 text-red-700' : ''}`}>
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

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <Bike className="w-5 h-5 text-gray-500" /> Entregadores do Restaurante
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Apenas entregadores vinculados aqui conseguem ver e aceitar os pedidos da sua loja.
                                Peça para o entregador criar a conta dele primeiro (WhatsApp) e depois vincule pelo telefone.
                            </p>
                        </div>
                        <div className="p-6 pt-4 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="tel"
                                    placeholder="Telefone do entregador (com DDD)"
                                    value={courierSearchPhone}
                                    onChange={e => { setCourierSearchPhone(e.target.value); setCourierLinkError(''); }}
                                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                                <button
                                    onClick={handleLinkCourier}
                                    disabled={isLinkingCourier}
                                    className="px-6 py-3 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isLinkingCourier ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Vincular Entregador'}
                                </button>
                            </div>
                            {courierLinkError && (
                                <p className="text-sm text-red-600 font-medium">{courierLinkError}</p>
                            )}

                            <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                                {couriers.length === 0 && (
                                    <p className="p-4 text-sm text-gray-400 text-center">Nenhum entregador vinculado ainda.</p>
                                )}
                                {couriers.map(c => (
                                    <div key={c.id} className="flex items-center justify-between p-4">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{c.name}</p>
                                            <p className="text-xs text-gray-500">{c.phone}</p>
                                        </div>
                                        <button
                                            onClick={() => handleUnlinkCourier(c.id)}
                                            className="text-xs font-bold text-red-600 hover:underline"
                                        >
                                            Desvincular
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                                <Bike className="w-5 h-5 text-gray-500" /> Saques dos Entregadores
                            </h3>
                            {isLoadingCourierWithdrawals && <Loader2 className="w-4 h-4 animate-spin text-gray-400"/>}
                        </div>
                        <div className="px-6 pt-4">
                            <p className="text-sm text-gray-500">
                                Analise e aprove os repasses solicitados pelos entregadores que atenderam pedidos deste restaurante. Ao aprovar, o valor é abatido da carteira do entregador.
                            </p>
                        </div>
                        <div className="overflow-x-auto mt-4">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Entregador</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Data Solicitada</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                        <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {courierWithdrawals.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-gray-400">
                                                Nenhuma solicitação de saque de entregador no momento.
                                            </td>
                                        </tr>
                                    )}
                                    {courierWithdrawals.map(req => (
                                        <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4 text-sm font-bold text-gray-800">
                                                {req.userName}
                                            </td>
                                            <td className="p-4 text-sm font-medium text-gray-600">
                                                {new Date(req.date).toLocaleString()}
                                            </td>
                                            <td className="p-4 font-bold text-gray-900">
                                                R$ {req.amount.toFixed(2)}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${req.status === 'paid' ? 'bg-green-100 text-green-700' : ''} ${req.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : ''} ${req.status === 'rejected' ? 'bg-red-100 text-red-700' : ''}`}>
                                                    {req.status === 'paid' ? 'Pago' : req.status === 'pending' ? 'Pendente' : 'Rejeitado'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {req.status === 'pending' ? (
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => handleRejectCourierWithdrawal(req)}
                                                            disabled={processingCourierWithdrawalId === req.id}
                                                            className="px-3 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <XCircle className="w-3.5 h-3.5" /> Rejeitar
                                                        </button>
                                                        <button
                                                            onClick={() => handleApproveCourierWithdrawal(req)}
                                                            disabled={processingCourierWithdrawalId === req.id}
                                                            className="px-3 py-2 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            {processingCourierWithdrawalId === req.id ? (
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            ) : (
                                                                <Check className="w-3.5 h-3.5" />
                                                            )}
                                                            Aprovar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="text-right text-xs text-gray-400">
                                                        {req.status === 'paid' ? 'Repassado' : 'Sem ação'}
                                                    </div>
                                                )}
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
                                items={groupedOrders.waiting_payment} 
                                color="border-yellow-200"
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                            />
                            <KanbanColumn 
                                 title="Pendentes" 
                                status="pending" 
                                items={groupedOrders.pending} 
                                color="border-orange-200"
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                             />
                            <KanbanColumn 
                                title="Em Preparo" 
                                 status="preparing" 
                                items={groupedOrders.preparing} 
                                color="border-blue-200"
                                 onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                 onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                             />
                            <KanbanColumn 
                                title="Pronto" 
                                 status="ready" 
                                items={groupedOrders.ready} 
                                color="border-green-200"
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                 chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                 products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                            />
                            <KanbanColumn 
                                 title="Em Entrega" 
                                status="delivering" 
                                items={groupedOrders.delivering} 
                                 color="border-purple-200"
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                 chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                 products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                            />
                            <KanbanColumn 
                                 title="Concluídos" 
                                status="delivered" 
                                items={groupedOrders.delivered} 
                                 color="border-gray-200"
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                 chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
                              />
                            <KanbanColumn 
                                title="Cancelados" 
                                 status="cancelled" 
                                items={groupedOrders.cancelled} 
                                color="border-red-200"
                                 isLast
                                onClickOrder={handleSetEditingOrder}
                                onDrop={handleDragDropOrder}
                                 chats={chats}
                                onOpenChat={handleOpenChat}
                                onPrintOrder={handlePrintOrder}
                                 products={products}
                                onToggleDeliveryMethod={handleToggleDeliveryMethod}
                                onTogglePayment={handleTogglePayment}
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
                                                const g = [...(newProduct.groups || [])];
                                                g[idx].min = parseInt(e.target.value); setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            <input type="number" placeholder="Max" className="w-12 text-xs border rounded px-1" value={group.max} onChange={e => {
                                                 const g = [...(newProduct.groups || [])]; g[idx].max = parseInt(e.target.value);
                                                setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            
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
                                    className={`w-full text-xs font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all ${generatingAi ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'}`}
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
                                disabled={savingProduct}
                                 className={`w-full text-white font-bold py-3 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-gray-200 flex items-center justify-center gap-2 ${savingProduct ? 'bg-gray-400 cursor-not-allowed' : editingProductId ? 'bg-blue-600' : 'bg-gray-900'}`}
                            >
                                {savingProduct ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando imagem...</>
                                ) : (
                                    editingProductId ? 'Atualizar Produto' : 'Salvar Produto'
                                )}
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

                        <div className="bg-gray-900 rounded-xl p-6 mb-2">
                            <h3 className="font-bold text-white mb-2 flex items-center gap-2">
                                <Link2 className="w-5 h-5" /> Link do Cardápio Digital
                            </h3>
                            <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                                Compartilhe este link com seus clientes (redes sociais, WhatsApp, etc). Ele abre seu cardápio direto, sem exigir login.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    readOnly
                                    value={menuLink}
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                    className="flex-1 bg-gray-800 text-gray-100 text-sm font-mono rounded-lg px-4 py-2.5 border border-gray-700 truncate outline-none"
                                />
                                <button
                                    onClick={handleCopyMenuLink}
                                    className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${linkCopied ? 'bg-green-600 text-white' : 'bg-white text-gray-900 hover:bg-gray-100'}`}
                                >
                                    {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {linkCopied ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                        </div>

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
                                <Wallet className="w-5 h-5 text-gray-500" /> Dados Financeiros (Recebimento Pix)
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                                <div>
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

                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-2">
                                <p className="text-xs text-blue-800 font-bold mb-3 flex items-center gap-1">
                                    <Info className="w-4 h-4 shrink-0" /> Obrigatório pelo Banco Central para gerar o QR Code:
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 uppercase">Nome do Titular da Conta</label>
                                        <input 
                                            type="text"
                                            placeholder="Nome exato como no banco"
                                            value={localCompany.pixMerchantName || ''} 
                                            onChange={e => setLocalCompany({...localCompany, pixMerchantName: e.target.value})}
                                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                                            maxLength={25}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-700 uppercase">Cidade da Conta</label>
                                        <input 
                                            type="text"
                                            placeholder="Ex: Sao Paulo (Sem acentos)"
                                            value={localCompany.pixMerchantCity || ''} 
                                            onChange={e => setLocalCompany({...localCompany, pixMerchantCity: e.target.value})}
                                            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm" 
                                            maxLength={15}
                                        />
                                    </div>
                                </div>
                            </div>
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
                                <Truck className="w-5 h-5 text-gray-500" /> Logística e Taxas
                            </h3>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Raio de Entrega (km)</label>
                                    <input 
                                        type="number"
                                        value={localCompany.deliveryRadiusKm || ''} 
                                        onChange={e => setLocalCompany({...localCompany, deliveryRadiusKm: parseFloat(e.target.value)})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5" 
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-gray-700">Taxa Própria Padrão (R$)</label>
                                    <input 
                                        type="number"
                                        value={localCompany.ownDeliveryFee || 0} 
                                        onChange={e => setLocalCompany({...localCompany, ownDeliveryFee: parseFloat(e.target.value)})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5" 
                                        placeholder="Ex: 5.00"
                                    />
                                </div>
                            </div>

                            {/* GERENCIADOR DE TAXAS POR BAIRRO (JSONB) */}
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <MapIcon className="w-4 h-4 text-gray-500" /> Taxas Personalizadas por Bairro
                                    </label>
                                    <button 
                                        onClick={() => {
                                            const newFees = [...(localCompany.neighborhood_fees || []), { neighborhood: '', fee: 0 }];
                                            setLocalCompany({...localCompany, neighborhood_fees: newFees});
                                        }}
                                        className="text-xs bg-gray-900 text-white hover:bg-black px-3 py-1.5 rounded-lg font-bold transition-colors"
                                    >
                                        + Adicionar Bairro
                                    </button>
                                </div>
                                
                                {(!localCompany.neighborhood_fees || localCompany.neighborhood_fees.length === 0) ? (
                                    <p className="text-xs text-gray-500 italic">Nenhum bairro cadastrado. A taxa padrão será usada.</p>
                                ) : (
                                    <div className="space-y-2">
                                        {localCompany.neighborhood_fees.map((item, index) => (
                                            <div key={index} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200">
                                                <input 
                                                    type="text" 
                                                    placeholder="Nome do Bairro (Ex: Centro)"
                                                    value={item.neighborhood}
                                                    onChange={(e) => {
                                                        const newFees = [...(localCompany.neighborhood_fees || [])];
                                                        newFees[index].neighborhood = e.target.value;
                                                        setLocalCompany({...localCompany, neighborhood_fees: newFees});
                                                    }}
                                                    className="flex-1 text-sm border-none bg-gray-50 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-400"
                                                />
                                                <input 
                                                    type="number" 
                                                    placeholder="R$"
                                                    value={item.fee}
                                                    onChange={(e) => {
                                                        const newFees = [...(localCompany.neighborhood_fees || [])];
                                                        newFees[index].fee = parseFloat(e.target.value) || 0;
                                                        setLocalCompany({...localCompany, neighborhood_fees: newFees});
                                                    }}
                                                    className="w-24 text-sm border-none bg-gray-50 rounded px-3 py-2 outline-none focus:ring-1 focus:ring-red-400 font-bold"
                                                />
                                                <button 
                                                    onClick={() => {
                                                        const newFees = [...(localCompany.neighborhood_fees || [])];
                                                        newFees.splice(index, 1);
                                                        setLocalCompany({...localCompany, neighborhood_fees: newFees});
                                                    }}
                                                    className="p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button 
                                 onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className={`text-white font-bold px-8 py-3 rounded-xl shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 ${savingSettings ? 'bg-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                 {savingSettings ? (
                                     <><Loader2 className="w-4 h-4 animate-spin" /> Enviando imagens...</>
                                 ) : (
                                     'Salvar Alterações'
                                 )}
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
