import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Company, Product, Order, ViewState, Address, ProductGroup, ProductOption, ChatMessage, SalesHistoryItem } from '../types';
import { enhanceProductImage } from '../services/geminiService';
import { Plus, Image as ImageIcon, Sparkles, Clock, MapPin, Truck, Check, X, GripVertical, Settings2, ChefHat, Utensils, DollarSign, Store, Calendar, Upload, Save, Disc, Trash2, LogOut, Layers, ChevronDown, ChevronUp, MessageCircle, Send, ArrowLeft, Edit, Loader2, Navigation, MousePointer2, Map as MapIcon, Crosshair, CheckCircle, Camera, AlertTriangle, Wand2, ShoppingBag } from 'lucide-react';
import DashboardView from './DashboardView';
import ForecastView from './ForecastView';
import WhatsAppBotView from './WhatsAppBotView';
import Sidebar from './Sidebar';

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
  // Chat Props
  chats: Record<string, ChatMessage[]>;
  onSendMessage: (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => void;
  // Order Edit Props
  onUpdateFullOrder: (order: Order) => void;
  onDeleteOrder: (orderId: string) => void;
}

// EXACT MATCH WITH CLIENT VIEW CATEGORIES
const COMPANY_CATEGORIES = [
    "Lanches", "Pizza", "Japonesa", "Brasileira", "Açaí", 
    "Doces & Bolos", "Saudável", "Italiana", "Bebidas", "Padaria", 
    "Sorvetes", "Carnes", "Mercado", "Asiática"
];

// --- KANBAN COLUMN COMPONENT ---
interface KanbanColumnProps {
  title: string;
  status: Order['status'];
  items: Order[];
  color: string;
  isLast?: boolean;
  onClickOrder: (order: Order) => void;
  onDrop: (orderId: string, status: Order['status']) => void;
  // Chat Integration
  chats: Record<string, ChatMessage[]>;
  onOpenChat: (orderId: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ title, status, items, color, isLast, onClickOrder, onDrop, chats, onOpenChat }) => {
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
        className={`flex flex-col h-full min-w-[300px] bg-gray-50 rounded-2xl border-t-4 ${color} ${!isLast ? 'mr-4' : ''} transition-colors ${isOver ? 'bg-gray-100 ring-2 ring-gray-300' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      <div className="p-4 flex justify-between items-center border-b border-gray-100">
        <h3 className="font-bold text-gray-700">{title}</h3>
        <span className="bg-white px-2 py-1 rounded-lg text-xs font-bold text-gray-500 shadow-sm">{items.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {items.map(order => {
              const orderChats = chats[order.id] || [];
              const hasMessages = orderChats.length > 0;
              const lastMsg = hasMessages ? orderChats[orderChats.length - 1] : null;
              const hasUnread = lastMsg?.senderRole === 'client';

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
                      className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-grab active:cursor-grabbing group select-none relative"
                  >
                      <div className="flex justify-between items-start mb-3">
                          <span className="font-bold text-gray-900 group-hover:text-red-600 transition-colors">#{order.id.slice(-4)}</span>
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(order.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-600 text-xs">
                              {order.customerName.charAt(0)}
                          </div>
                          <span className="text-sm font-medium text-gray-800">{order.customerName}</span>
                      </div>
                      <div className="space-y-1 bg-gray-50 p-2 rounded-lg mb-3">
                          {order.items.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="text-xs text-gray-600 flex justify-between">
                                  <span>{item.quantity}x {item.productName}</span>
                              </div>
                          ))}
                          {order.items.length > 3 && <div className="text-[10px] text-center text-gray-400">Ver mais...</div>}
                      </div>
                      
                      {/* PAYMENT BADGE */}
                      {order.paymentMethod === 'cash' && (
                          <div className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-1 rounded mb-2 flex items-center gap-1 border border-green-200">
                              <DollarSign className="w-3 h-3"/>
                              Dinheiro {order.changeFor ? `(Troco p/ R$ ${order.changeFor.toFixed(2)})` : ''}
                          </div>
                      )}

                      <div className="flex justify-between items-center pt-2 border-t border-gray-50 mt-2">
                          <span className="font-bold text-sm">R$ {order.total.toFixed(2)}</span>
                          
                          <div className="flex items-center gap-2">
                              {/* CHAT BUTTON IN CARD */}
                              <button 
                                onClick={(e) => { e.stopPropagation(); onOpenChat(order.id); }}
                                className={`p-2 rounded-full transition-all flex items-center gap-1
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
                              
                              <div className={`w-2 h-2 rounded-full ${color.replace('border-', 'bg-').replace('200', '500')}`}></div>
                          </div>
                      </div>
                  </div>
              );
          })}
          {items.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50 pointer-events-none">
                  <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-2">
                      <ShoppingBag className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium">Solte aqui</p>
              </div>
          )}
      </div>
    </div>
  );
};

const PartnerView: React.FC<PartnerViewProps> = ({ 
    company, orders, products, updateOrderStatus, updateCompany, onAddProduct, onUpdateProduct, onDeleteProduct, onLogout,
    chats, onSendMessage, onUpdateFullOrder, onDeleteOrder
}) => {
  const [view, setView] = useState<ViewState>(ViewState.DASHBOARD);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  // --- PRODUCT FORM STATE ---
  const [editingProductId, setEditingProductId] = useState<string | null>(null); 
  const [productToDelete, setProductToDelete] = useState<string | null>(null); 
  
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
      isAvailable: true,
      price: 0,
      pricingMode: 'default',
      groups: []
  });
  
  // UI State for Group Management
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);

  const [generatingAi, setGeneratingAi] = useState(false);
  const [productImagePreview, setProductImagePreview] = useState<string>('');

  // --- CHAT STATE ---
  const [activeChatOrder, setActiveChatOrder] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- ORDER EDIT STATE ---
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  // --- SETTINGS LOCAL STATE & MAP LOGIC ---
  const [localCompany, setLocalCompany] = useState<Company>(company);
  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);
  
  useEffect(() => {
      setLocalCompany(company);
  }, [company]);

  // --- DATA PROCESSING FOR DASHBOARD/AI ---
  const calculatedSalesHistory = useMemo(() => {
      // 1. Group orders by date (YYYY-MM-DD)
      const grouped: Record<string, { revenue: number, count: number }> = {};
      
      orders.forEach(o => {
          if (o.status === 'delivered' || o.status === 'delivering' || o.status === 'ready' || o.status === 'preparing' || o.status === 'pending') {
              // Note: In real app, date should be order creation date.
              // Assuming o.timestamp is a Date object or string
              const dateObj = new Date(o.timestamp);
              const dateKey = dateObj.toLocaleDateString('en-CA'); // YYYY-MM-DD format
              
              if (!grouped[dateKey]) grouped[dateKey] = { revenue: 0, count: 0 };
              grouped[dateKey].revenue += o.total;
              grouped[dateKey].count += 1;
          }
      });

      // 2. Convert to array and sort
      const history: SalesHistoryItem[] = Object.keys(grouped).map(date => ({
          date, // Display format can be handled in UI
          revenue: grouped[date].revenue,
          ordersCount: grouped[date].count
      })).sort((a, b) => a.date.localeCompare(b.date));

      // 3. Fill missing days (optional, simplified here to just return existing data)
      return history.slice(-30); // Last 30 days
  }, [orders]);

  // Map Initialization for Settings (Same logic as Admin/Client)
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
                  // 1. Update text
                  setLocalCompany(prev => ({ 
                      ...prev, 
                      address: { 
                          ...prev.address!, 
                          street: data.logradouro, 
                          city: data.localidade, 
                          neighborhood: data.bairro 
                      } 
                  }));

                  // 2. CRITICAL: Trigger Geocode to get lat/lng
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

  // --- HANDLERS ---
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
    
    // Call the updated service
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

  // --- ORDER EDITING HANDLERS ---
  const handleSaveEditingOrder = () => {
      if (editingOrder) {
          // Recalculate total
          const itemsTotal = editingOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          const newTotal = itemsTotal + editingOrder.deliveryFee + editingOrder.serviceFee; // Include serviceFee
          
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

  const handleDeleteOrderClick = (orderId: string) => {
      if (window.confirm("ATENÇÃO: Deseja realmente excluir este pedido permanentemente?")) {
          onDeleteOrder(orderId);
          setEditingOrder(null); // Close modal if open
      }
  };

  // --- DRAG AND DROP HANDLER ---
  const handleDragDropOrder = (orderId: string, status: Order['status']) => {
      updateOrderStatus(orderId, status);
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

  // --- PRODUCT CRUD HANDLERS ---
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
      
      handleCancelEdit(); // Reset form
  };

  const handleSaveSettings = () => {
    updateCompany(localCompany);
    alert('Configurações da loja salvas com sucesso!');
  };

  return (
    <div className="flex h-screen bg-gray-50 relative">
        
        {/* --- DELETE CONFIRMATION MODAL --- */}
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

        {/* EDIT ORDER MODAL */}
        {editingOrder && (
             <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                 <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl animate-scale-in overflow-hidden max-h-[90vh] flex flex-col">
                     <div className="bg-white border-b border-gray-100 p-6 flex justify-between items-center">
                         <h3 className="text-xl font-bold text-gray-900">Editar Pedido <span className="text-gray-400">#{editingOrder.id.slice(-4)}</span></h3>
                         <button onClick={() => setEditingOrder(null)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
                     </div>
                     <div className="p-6 overflow-y-auto space-y-6 flex-1">
                         {/* Payment Info */}
                         <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-xl">
                             <div className="flex justify-between items-center mb-2">
                                 <h4 className="font-bold text-sm text-yellow-800 uppercase">Pagamento</h4>
                                 <span className="bg-white px-2 py-1 rounded text-xs font-bold shadow-sm">{editingOrder.paymentMethod === 'cash' ? 'DINHEIRO' : 'ONLINE'}</span>
                             </div>
                             {editingOrder.paymentMethod === 'cash' ? (
                                 <p className="text-sm text-yellow-900 font-bold">
                                     Levar troco para: <span className="text-lg">R$ {editingOrder.changeFor ? editingOrder.changeFor.toFixed(2) : editingOrder.total.toFixed(2)}</span>
                                 </p>
                             ) : (
                                 <p className="text-sm text-green-700 font-medium">Pago via App/Pix/Cartão</p>
                             )}
                         </div>

                         {/* Customer Info */}
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
                         </div>

                         {/* Items Edit */}
                         <div className="space-y-4">
                             <h4 className="font-bold text-sm text-gray-500 uppercase tracking-wide">Itens do Pedido</h4>
                             <div className="bg-gray-50 rounded-xl p-4 space-y-4">
                                 {editingOrder.items.map((item, idx) => (
                                     <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
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
                                 ))}
                                 {editingOrder.items.length === 0 && <p className="text-center text-sm text-gray-400">Nenhum item.</p>}
                             </div>
                         </div>

                         {/* Status Edit */}
                         <div className="space-y-2">
                             <label className="text-xs font-bold text-gray-400 uppercase">Status do Pedido</label>
                             <select 
                                value={editingOrder.status}
                                onChange={e => setEditingOrder({...editingOrder, status: e.target.value as any})}
                                className="w-full border rounded-lg px-3 py-2 bg-white"
                             >
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
                     <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                         <div>
                             <p className="text-xs text-gray-500 font-bold uppercase">Total Atualizado</p>
                             <p className="text-xl font-bold text-gray-900">
                                 R$ {((editingOrder.items.reduce((a,b) => a + (b.price * b.quantity), 0)) + editingOrder.deliveryFee + editingOrder.serviceFee).toFixed(2)}
                             </p>
                         </div>
                         <button onClick={handleSaveEditingOrder} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-green-200 transition-colors">
                             <Check className="w-5 h-5" /> Salvar Alterações
                         </button>
                     </div>
                 </div>
             </div>
        )}

        {/* --- CHAT OVERLAY --- */}
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
        setView={setView} 
        isMobileOpen={isMobileOpen} 
        setIsMobileOpen={setIsMobileOpen} 
        onLogout={onLogout}
      />

      <div className="flex-1 overflow-auto flex flex-col">
        {/* Mobile Header */}
        <div className="md:hidden bg-white p-4 flex justify-between items-center border-b border-gray-100 sticky top-0 z-20">
             <div className="flex items-center gap-2">
                 <Store className="w-6 h-6 text-red-600" />
                 <h1 className="font-bold text-gray-900">Chegoou</h1>
             </div>
             <button onClick={() => setIsMobileOpen(true)} className="p-2 bg-gray-100 rounded-lg"><Layers className="w-6 h-6 text-gray-600" /></button>
        </div>

        <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full">
            
            {view === ViewState.DASHBOARD && (
                <DashboardView salesData={calculatedSalesHistory} />
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
                    
                    {/* KANBAN BOARD */}
                    <div className="flex-1 overflow-x-auto pb-4">
                        <div className="flex gap-4 h-full min-w-max px-1">
                            <KanbanColumn 
                                title="Pendentes" 
                                status="pending" 
                                items={orders.filter(o => o.status === 'pending')} 
                                color="border-yellow-200"
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
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
                            />
                            <KanbanColumn 
                                title="Concluídos" 
                                status="delivered" 
                                items={orders.filter(o => o.status === 'delivered')} 
                                color="border-gray-200"
                                isLast
                                onClickOrder={setEditingOrder}
                                onDrop={handleDragDropOrder}
                                chats={chats}
                                onOpenChat={setActiveChatOrder}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Other Views... (Same as before, simplified for brevity in this XML change block but assumed present) */}
            {view === ViewState.MENU && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Product Form */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit sticky top-8">
                        {/* ... (Existing Product Form Code) ... */}
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
                            {/* Image Upload */}
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
                                {/* UPDATED PRODUCT CATEGORY SELECT */}
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
                            
                            {/* Pizza/Groups Config */}
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
                                            }} className="font-bold text-sm border-b border-dashed border-gray-300 w-2/3" placeholder="Nome do Grupo" />
                                            <Trash2 onClick={() => removeGroup(idx)} className="w-4 h-4 text-gray-400 hover:text-red-500 cursor-pointer" />
                                        </div>
                                        <div className="flex gap-2 mb-2">
                                            <input type="number" placeholder="Min" className="w-12 text-xs border rounded px-1" value={group.min} onChange={e => {
                                                const g = [...(newProduct.groups || [])]; g[idx].min = parseInt(e.target.value); setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            <input type="number" placeholder="Max" className="w-12 text-xs border rounded px-1" value={group.max} onChange={e => {
                                                const g = [...(newProduct.groups || [])]; g[idx].max = parseInt(e.target.value); setNewProduct({...newProduct, groups: g});
                                            }}/>
                                            <button onClick={() => addOptionToGroup(idx)} className="text-xs text-blue-600 font-bold ml-auto">+ Opção</button>
                                        </div>
                                        {group.options.map((opt, oIdx) => (
                                            <div key={oIdx} className="flex gap-2 mb-1">
                                                <input className="flex-1 text-xs border rounded px-1" placeholder="Opção" value={opt.name} onChange={e => updateOption(idx, oIdx, 'name', e.target.value)} />
                                                <input className="w-16 text-xs border rounded px-1" placeholder="R$" type="number" value={opt.price} onChange={e => updateOption(idx, oIdx, 'price', parseFloat(e.target.value))} />
                                            </div>
                                        ))}
                                    </div>
                                ))}
                             </div>

                            {/* AI IMAGE ENHANCER */}
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

                    {/* Product List */}
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

            {view === ViewState.FORECAST && (
                <ForecastView products={products} salesHistory={calculatedSalesHistory} />
            )}

            {view === ViewState.WHATSAPP && (
                <WhatsAppBotView products={products} />
            )}

            {view === ViewState.SETTINGS && (
                <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    {/* ... (Existing Settings UI) ... */}
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurações da Loja</h2>
                    
                    <div className="space-y-6">
                        {/* VISUAL IDENTITY SECTION */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-sm font-bold text-gray-700 mb-2 block">Identidade Visual</label>
                                <div className="flex gap-6 items-start">
                                    {/* Logo Upload */}
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

                                    {/* Cover Upload (Fixed) */}
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
                            
                            {/* UPDATED CATEGORY SELECT FOR PARTNER SETTINGS */}
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

                        {/* ADDRESS CONFIGURATION */}
                        <div className="border-t border-gray-100 pt-6">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-gray-500" /> Endereço e Localização
                            </h3>
                            
                            <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                {/* Search Tools */}
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

                                {/* Address Fields */}
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

      {/* MAP MODAL (Partner Settings) */}
      {showMapModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in h-full">
            <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90%] relative">
                <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                    <div className="bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md border border-gray-100 pointer-events-auto">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Navigation className="w-4 h-4 text-red-600" /> Definir Localização
                        </h3>
                        <p className="text-xs text-gray-500">Mova o pin para o endereço correto.</p>
                    </div>
                    <button onClick={() => setShowMapModal(false)} className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 pointer-events-auto"><X className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="flex-1 bg-gray-100 relative group overflow-hidden">
                    {mapError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-8"><MapIcon className="w-16 h-16 text-gray-300"/><p>Erro no Mapa</p></div>
                    ) : (
                        <>
                        <div ref={mapContainerRef} className="w-full h-full" />
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none transition-all duration-300 ease-out ${isMapDragging ? '-mt-16 scale-110' : '-mt-8'}`}>
                            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-2xl border-[3px] border-white"><MapPin className="w-6 h-6 text-white fill-current" /></div>
                            <div className={`w-2 h-8 bg-black/80 rounded-full -mt-2 blur-[1px] transition-opacity duration-300 ${isMapDragging ? 'opacity-0' : 'opacity-20'}`}></div>
                        </div>
                        {!isMapDragging && <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none flex items-center gap-2 animate-pulse"><MousePointer2 className="w-3 h-3" /> Arraste o mapa</div>}
                        </>
                    )}
                </div>
                <div className="p-6 bg-white border-t border-gray-100 rounded-t-3xl -mt-6 relative z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
                    <div className="flex items-start gap-3 mb-6">
                        <div className="p-2 bg-red-50 rounded-lg shrink-0"><MapPin className="w-6 h-6 text-red-600" /></div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço Selecionado</p>
                            <h4 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">{mapAddress || 'Carregando endereço...'}</h4>
                        </div>
                    </div>
                    <button onClick={() => setShowMapModal(false)} className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 shadow-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Confirmar</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default PartnerView;