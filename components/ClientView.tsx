


import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Company, Product, Order, ChatMessage, Address, CreditCard as CreditCardType, ProductOption, User } from '../types';
import { Search, MapPin, Star, ShoppingBag, Plus, CreditCard, ChevronRight, Clock, CheckCircle, X, Bike, Store, Home, FileText, User as UserIcon, Wallet, MessageCircle, Send, ArrowLeft, Trash2, Loader2, Navigation, MousePointer2, Map as MapIcon, Pizza, Utensils, UtensilsCrossed, Fish, Coffee, Cake, ShoppingCart, Salad, DollarSign, QrCode, Copy, Timer, Settings, LogOut, Crosshair, AlertCircle, ClipboardCheck, ScanLine } from 'lucide-react';

declare global {
  interface Window {
    google: any;
  }
}

interface ClientViewProps {
  user: User;
  companies: Company[];
  products: Product[];
  orders: Order[];
  onPlaceOrder: (items: any[], companyId: string, total: number, deliveryMethod: 'delivery' | 'pickup', serviceFee: number, deliveryFee: number, subtotal: number, paymentMethod: 'cash' | 'card' | 'pix', changeFor?: number) => Promise<boolean>;
  onLogout: () => void;
  onUpdateUser: (user: User) => void;
  chats: Record<string, ChatMessage[]>;
  onSendMessage: (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => void;
  onAddAddress: (address: Address) => void;
  onRemoveAddress: (index: number) => void;
  onAddCard: (card: CreditCardType) => void;
  onRemoveCard: (index: number) => void;
}

// --- UTILS ---
const normalizeText = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const isMatch = (sourceText: string, searchTerm: string) => {
    if (!sourceText || !searchTerm) return false;
    const normSource = normalizeText(sourceText);
    const normSearch = normalizeText(searchTerm);
    return normSource.includes(normSearch);
};

const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return Infinity;
  // Check for default SP coordinates or 0,0
  const isDefault = (lat: number, lng: number) => (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) || (Math.abs(lat - (-23.550520)) < 0.0001 && Math.abs(lng - (-46.633308)) < 0.0001);
  
  if (isDefault(lat1, lon1) || isDefault(lat2, lon2)) return Infinity;

  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1) * (Math.PI / 180)) * Math.cos((lat2) * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const CATEGORIES = [
    { name: "Tudo", icon: Store },
    { name: "Lanches", icon: Utensils },
    { name: "Pizza", icon: Pizza },
    { name: "Japonesa", icon: Fish },
    { name: "Brasileira", icon: UtensilsCrossed },
    { name: "Açaí", icon: ShoppingBag },
    { name: "Doces & Bolos", icon: Cake },
    { name: "Saudável", icon: Salad },
    { name: "Italiana", icon: Pizza },
    { name: "Bebidas", icon: Coffee },
    { name: "Padaria", icon: Store },
    { name: "Sorvetes", icon: ShoppingBag },
    { name: "Carnes", icon: UtensilsCrossed },
    { name: "Mercado", icon: ShoppingCart },
    { name: "Asiática", icon: Fish }
];

const ClientView: React.FC<ClientViewProps> = ({ 
    user, companies, products, orders, onPlaceOrder, onLogout, onUpdateUser,
    chats, onSendMessage, onAddAddress, onRemoveAddress, onAddCard, onRemoveCard
}) => {
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'profile'>('home');
  const [subView, setSubView] = useState<'none' | 'wallet' | 'addresses' | 'settings' | 'chat'>('none');
  
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState<Partial<Address>>({});
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardForm, setNewCardForm] = useState<Partial<CreditCardType>>({});
  const [chatOrderId, setChatOrderId] = useState<string | null>(null);

  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [cart, setCart] = useState<{product: Product, quantity: number, selectedOptions?: { groupName: string, optionName: string, price: number }[], finalPrice: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>("Tudo");
  const [specialFilter, setSpecialFilter] = useState<'none' | 'free' | 'fast'>('none');
  
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('card');
  const [changeAmount, setChangeAmount] = useState<string>('');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selections, setSelections] = useState<Record<string, ProductOption[]>>({});
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // New State for Pix Feedback
  const [copiedPix, setCopiedPix] = useState<string | null>(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Map Initialization
  useEffect(() => {
    let map: any;
    const initMap = () => {
        if (!mapContainerRef.current || !window.google || mapError) return;
        try {
            const initialPos = { lat: newAddressForm.lat || -23.550520, lng: newAddressForm.lng || -46.633308 };
            map = new window.google.maps.Map(mapContainerRef.current, { center: initialPos, zoom: 17, disableDefaultUI: true, zoomControl: false, gestureHandling: 'greedy', styles: [{ "featureType": "poi", "stylers": [{ "visibility": "off" }] }] });
            const geocoder = new window.google.maps.Geocoder();
            map.addListener('dragstart', () => setIsMapDragging(true));
            map.addListener('idle', () => {
                setIsMapDragging(false);
                const center = map.getCenter();
                if (center) {
                    const lat = center.lat(); const lng = center.lng();
                    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                        if (status === 'OK' && results[0]) {
                            const addressComponents = results[0].address_components;
                            let route = ''; let streetNumber = ''; let sublocality = ''; let locality = ''; let postalCode = '';
                            addressComponents.forEach((component: any) => {
                                if (component.types.includes('route')) route = component.long_name;
                                if (component.types.includes('street_number')) streetNumber = component.long_name;
                                if (component.types.includes('sublocality')) sublocality = component.long_name;
                                if (component.types.includes('administrative_area_level_2') || component.types.includes('locality')) locality = component.long_name;
                                if (component.types.includes('postal_code')) postalCode = component.long_name;
                            });
                            setMapAddress(`${route}, ${streetNumber || 'S/N'}`);
                            setNewAddressForm(prev => ({ ...prev, lat, lng, street: route || prev.street, neighborhood: sublocality || prev.neighborhood, city: locality || prev.city, zipCode: postalCode ? postalCode.replace('-', '') : prev.zipCode }));
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
      if (!navigator.geolocation) { alert('GPS não suportado.'); return; }
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition((pos) => {
          const { latitude, longitude } = pos.coords;
          if (window.google && window.google.maps) {
              new window.google.maps.Geocoder().geocode({ location: { lat: latitude, lng: longitude } }, (res: any, stat: any) => {
                  if (stat === 'OK' && res[0]) {
                      const comps = res[0].address_components;
                      let route='',num='',neigh='',city='',zip='';
                      comps.forEach((c:any) => {
                         if(c.types.includes('route')) route=c.long_name;
                         if(c.types.includes('street_number')) num=c.long_name;
                         if(c.types.includes('sublocality')) neigh=c.long_name;
                         if(c.types.includes('administrative_area_level_2')) city=c.long_name;
                         if(c.types.includes('postal_code')) zip=c.long_name;
                      });
                      setNewAddressForm(prev=>({...prev, lat:latitude, lng:longitude, street:route, number:num, neighborhood:neigh, city:city, zipCode:zip.replace('-','')}));
                  }
                  setLoadingLocation(false);
              });
          } else {
              setNewAddressForm(prev => ({...prev, lat: latitude, lng: longitude}));
              setLoadingLocation(false);
          }
      }, () => { alert("Erro GPS"); setLoadingLocation(false); });
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.replace(/\D/g, '');
      setNewAddressForm(prev => ({...prev, zipCode: val}));
      if (val.length === 8) {
          setLoadingCep(true);
          try {
              const res = await fetch(`https://viacep.com.br/ws/${val}/json/`);
              const data = await res.json();
              if(!data.erro) {
                  setNewAddressForm(prev=>({...prev, street: data.logradouro, city: data.localidade, neighborhood: data.bairro}));
                  if(window.google) {
                      new window.google.maps.Geocoder().geocode({address: `${data.logradouro}, ${data.bairro}, ${data.localidade}, Brasil`}, (r:any, s:any) => {
                          if(s==='OK'&&r[0]) setNewAddressForm(prev=>({...prev, lat:r[0].geometry.location.lat(), lng:r[0].geometry.location.lng()}));
                      });
                  }
              }
          } catch {} finally { setLoadingCep(false); }
      }
  };

  const filteredCompanies = useMemo(() => {
      if (!user.address) return [];

      return companies
        .map(c => {
            const dist = getDistanceFromLatLonInKm(Number(user.address!.lat), Number(user.address!.lng), Number(c.address?.lat), Number(c.address?.lng));
            const fee = c.deliveryType === 'own' ? (c.ownDeliveryFee||0) : (c.customPlatformFee && c.customPlatformFee > 0 ? c.customPlatformFee : 5.00 + (dist * 1.5));
            return { ...c, distanceCalc: dist, deliveryFeeCalc: fee };
        })
        .filter(c => {
            if (c.status !== 'open') return false;
            if (c.distanceCalc > c.deliveryRadiusKm || c.distanceCalc === Infinity) return false;
            if (specialFilter === 'free' && c.deliveryFeeCalc > 0) return false;
            if (specialFilter === 'fast' && c.distanceCalc > 5) return false; 
            if (selectedCategory !== 'Tudo' && c.category !== selectedCategory) return false;
            if (searchTerm) {
                const cm = isMatch(c.name, searchTerm) || isMatch(c.category, searchTerm);
                const pm = products.filter(p=>p.companyId===c.id).some(p => isMatch(p.name, searchTerm));
                if (!cm && !pm) return false;
            }
            return true;
        })
        .sort((a, b) => a.distanceCalc - b.distanceCalc);
  }, [companies, user.address, searchTerm, selectedCategory, products, specialFilter]);

  const activeCompanyData = selectedCompany ? filteredCompanies.find(c => c.id === selectedCompany.id) : null;
  const productTotal = cart.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0); 
  const activeDeliveryFee = deliveryMethod === 'pickup' ? 0 : (activeCompanyData ? activeCompanyData.deliveryFeeCalc : 0);
  const serviceFeeValue = productTotal * ((activeCompanyData ? activeCompanyData.serviceFeePercentage : 0) / 100);
  const finalTotal = productTotal + activeDeliveryFee + serviceFeeValue;

  const handleFinalizeOrder = async () => {
      let changeForValue = 0;
      if (paymentMethod === 'cash') {
          changeForValue = parseFloat(changeAmount.replace(',','.'));
          if (changeForValue < finalTotal) { alert("Troco deve ser maior que o total."); return; }
      }
      
      setIsProcessingPayment(true);
      
      const success = await onPlaceOrder(cart, cart[0].product.companyId, finalTotal, deliveryMethod, serviceFeeValue, activeDeliveryFee, productTotal, paymentMethod, changeForValue); 
      
      setIsProcessingPayment(false);
      
      if (success) {
          setIsCartOpen(false); 
          setCart([]); 
          setSelectedCompany(null); 
          setChangeAmount('');
          
          if (paymentMethod === 'cash') {
            alert("Pedido realizado com sucesso!");
          } else {
             // alert("Pedido realizado! Aguardando confirmação do pagamento pelo sistema.");
             // UX: Silent redirect to Orders tab to see the QR Code
          }
          setActiveTab('orders');
      }
  };

  const openProductModal = (product: Product) => {
    if (!product.groups || product.groups.length === 0) {
        addToCart(product, product.price, []);
    } else {
        setCustomizingProduct(product);
        setSelections({});
    }
  };
  const currentPrice = useMemo(() => {
    if (!customizingProduct) return 0;
    let total = customizingProduct.price; 
    customizingProduct.groups.forEach(group => {
        const selected = selections[group.id] || [];
        if (selected.length === 0) return;
        if (group.max > 1 && customizingProduct.pricingMode === 'average') total += (selected.reduce((a,c)=>a+c.price,0)/selected.length);
        else if (group.max > 1 && customizingProduct.pricingMode === 'highest') total += Math.max(...selected.map(o=>o.price));
        else total += selected.reduce((a,c)=>a+c.price,0);
    });
    return total;
  }, [customizingProduct, selections]);
  
  const addToCart = (product: Product, finalPrice: number, selectedOptions: any[]) => {
    if (cart.length > 0 && cart[0].product.companyId !== product.companyId) {
        if (!window.confirm("Limpar carrinho atual?")) return;
        setCart([]);
    }
    setCart([...cart, {product, quantity: 1, selectedOptions, finalPrice}]);
    setIsCartOpen(true); 
  };
  const removeFromCart = (index: number) => {
    const newCart = [...cart];
    if (newCart[index].quantity > 1) newCart[index].quantity--; else newCart.splice(index, 1);
    setCart(newCart);
  };
  const openChat = (orderId: string) => { setChatOrderId(orderId); setSubView('chat'); };
  const handleSendMessage = () => { if(chatInput.trim() && chatOrderId) { onSendMessage(chatOrderId, chatInput, user.id, 'client'); setChatInput(''); }};
  const handleSelectAddress = (addr: Address) => { onUpdateUser({ ...user, address: addr }); setSubView('none'); };
  const confirmAddAddress = () => {
    if (!newAddressForm.street || !newAddressForm.number) { alert("Preencha rua e número."); return; }
    onAddAddress({ ...newAddressForm as Address, lat: newAddressForm.lat || 0, lng: newAddressForm.lng || 0, name: newAddressForm.name || 'Outro' });
    setIsAddingAddress(false); setNewAddressForm({});
  };
  const confirmAddCard = () => {
      if (!newCardForm.number) return;
      onAddCard({...newCardForm, id:Date.now().toString(), brand:'mastercard', last4:newCardForm.number.slice(-4)} as CreditCardType);
      setIsAddingCard(false); setNewCardForm({});
  };

  const handleCopyPix = (code: string) => {
      navigator.clipboard.writeText(code);
      setCopiedPix(code);
      setTimeout(() => setCopiedPix(null), 2000); // Reset feedback after 2s
  };

  // --- RENDERERS ---
  const renderHome = () => {
      if (selectedCompany) {
        const feeDisplay = filteredCompanies.find(c => c.id === selectedCompany.id)?.deliveryFeeCalc || 0;
        return (
            <div className="pb-32 bg-gray-50 min-h-screen animate-fade-in">
                <div className="relative h-48 md:h-64">
                    <img src={selectedCompany.coverImage || selectedCompany.logo} className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <button onClick={() => setSelectedCompany(null)} className="absolute top-6 left-6 bg-white/20 backdrop-blur-md rounded-full p-2 text-white hover:bg-white/30 transition-colors"><ChevronRight className="rotate-180 w-6 h-6" /></button>
                </div>
                <div className="max-w-4xl mx-auto -mt-12 relative z-10 px-4">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                         <div className="flex gap-4 items-center mb-2">
                             <img src={selectedCompany.logo} className="w-16 h-16 rounded-full border-2 border-gray-100 bg-white object-cover shadow-sm" />
                             <div><h1 className="text-2xl font-bold text-gray-900">{selectedCompany.name}</h1><p className="text-sm text-gray-500">{selectedCompany.category}</p></div>
                         </div>
                         <div className="flex gap-4 text-sm text-gray-600 border-t border-gray-100 pt-4 mt-2">
                             <div className="flex items-center gap-1"><Clock className="w-4 h-4 text-brand"/> 30-45 min</div>
                             <div className="flex items-center gap-1"><Bike className="w-4 h-4 text-brand"/> {feeDisplay===0?'Grátis':`R$ ${feeDisplay.toFixed(2)}`}</div>
                             <div className="flex items-center gap-1"><MapPin className="w-4 h-4 text-brand"/> {selectedCompany.address?.neighborhood}</div>
                         </div>
                    </div>
                    <div className="mt-8 space-y-8">
                        {Array.from(new Set(products.filter(p=>p.companyId===selectedCompany.id).map(p=>p.category))).map(cat => (
                            <div key={cat}><h2 className="text-xl font-bold mb-4 text-gray-800">{cat}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {products.filter(p => p.companyId === selectedCompany.id && p.category === cat).map(product => (
                                        <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 cursor-pointer hover:shadow-md transition-all active:scale-[0.99]" onClick={() => openProductModal(product)}>
                                            <div className="flex-1"><h3 className="font-bold text-gray-800">{product.name}</h3><p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p><div className="mt-2 font-medium text-brand">R$ {product.price.toFixed(2)}</div></div>
                                            {product.image && <img src={product.image} className="w-24 h-24 rounded-lg object-cover bg-gray-100" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
      }
      return (
          <div className="pb-32 bg-gray-50 min-h-screen">
             <div className="bg-white sticky top-0 z-30 shadow-sm">
                 <div className="px-4 py-4 max-w-3xl mx-auto">
                     <div className="flex justify-between items-center mb-4">
                         <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setSubView('addresses')}>
                             <div className="text-brand bg-brandLight p-2 rounded-full group-hover:bg-red-100 transition-colors"><MapPin className="w-5 h-5" /></div>
                             <div><div className="flex items-center gap-1"><span className="text-xs text-gray-500 font-bold uppercase">Entregar em</span><ChevronRight className="w-3 h-3 text-gray-400" /></div><span className="font-bold text-gray-900 text-sm truncate max-w-[200px] block">{user.address?.street}, {user.address?.number}</span></div>
                         </div>
                         <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => setActiveTab('profile')}>{user.name.charAt(0)}</div>
                     </div>
                     <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand w-5 h-5" /><input type="text" placeholder="Buscar pratos, restaurantes..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-brandLight focus:bg-white transition-all text-sm font-medium" /></div>
                 </div>
                 <div className="border-t border-gray-100"><div className="max-w-3xl mx-auto flex overflow-x-auto py-4 px-4 gap-4 no-scrollbar">{CATEGORIES.map(cat => { const Icon = cat.icon; const isSelected = selectedCategory === cat.name; return (<button key={cat.name} onClick={() => setSelectedCategory(cat.name)} className="flex flex-col items-center gap-2 min-w-[70px] group"><div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${isSelected ? 'bg-brand shadow-lg shadow-red-200 scale-105' : 'bg-gray-50 hover:bg-gray-100 group-hover:scale-105'}`}><Icon className={`w-8 h-8 ${isSelected ? 'text-white' : 'text-gray-400'}`} strokeWidth={1.5} /></div><span className={`text-[10px] font-bold ${isSelected ? 'text-brand' : 'text-gray-500'}`}>{cat.name}</span></button>)})}</div></div>
             </div>
             <div className="p-4 max-w-3xl mx-auto space-y-8 mt-4">
                 {!searchTerm && selectedCategory === 'Tudo' && (
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setSpecialFilter(specialFilter === 'free' ? 'none' : 'free')} className={`rounded-2xl p-4 text-white h-32 relative overflow-hidden shadow-lg flex flex-col justify-end border-4 transition-transform active:scale-95 ${specialFilter === 'free' ? 'border-white/50 bg-gradient-to-br from-green-600 to-teal-600' : 'border-transparent bg-gradient-to-br from-green-500 to-teal-500'}`}><span className="bg-white/20 w-fit px-2 py-1 rounded text-[10px] font-bold mb-1 backdrop-blur-sm flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Ver Lojas</span><h3 className="font-bold text-lg leading-tight">Entrega Grátis</h3></button>
                        <button onClick={() => setSpecialFilter(specialFilter === 'fast' ? 'none' : 'fast')} className={`rounded-2xl p-4 text-white h-32 relative overflow-hidden shadow-lg flex flex-col justify-end border-4 transition-transform active:scale-95 ${specialFilter === 'fast' ? 'border-white/50 bg-gradient-to-br from-orange-600 to-red-600' : 'border-transparent bg-gradient-to-br from-orange-500 to-red-500'}`}><span className="bg-white/20 w-fit px-2 py-1 rounded text-[10px] font-bold mb-1 backdrop-blur-sm flex items-center gap-1"><Bike className="w-3 h-3" /> Raio Curto</span><h3 className="font-bold text-lg leading-tight">Entrega Rápida</h3></button>
                    </div>
                 )}
                 <div>
                     <h2 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2"><Store className="w-5 h-5 text-gray-400" /> Lojas Próximas {specialFilter !== 'none' && <button onClick={() => setSpecialFilter('none')} className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600">Limpar</button>}</h2>
                     <div className="space-y-4">
                        {filteredCompanies.map(c => (
                            <div key={c.id} onClick={() => setSelectedCompany(c)} className="bg-white p-4 rounded-2xl border border-gray-100 flex gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer group active:scale-[0.99]">
                                <div className="relative"><img src={c.logo} className="w-24 h-24 rounded-xl object-cover bg-gray-100 group-hover:scale-105 transition-transform duration-500"/>{c.deliveryFeeCalc === 0 && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">GRÁTIS</span>}</div>
                                <div className="flex-1 flex flex-col justify-between py-1">
                                    <div><div className="flex justify-between items-start"><h3 className="font-bold text-gray-900 text-lg group-hover:text-brand transition-colors">{c.name}</h3><div className="flex items-center gap-1 bg-yellow-50 px-1.5 py-0.5 rounded text-xs font-bold text-yellow-700"><Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 4.8</div></div><div className="text-xs text-gray-500 mt-1 flex items-center gap-2"><span className="font-medium">{c.category}</span><span className="w-1 h-1 rounded-full bg-gray-300"></span><span>{c.distanceCalc.toFixed(1)} km</span></div></div>
                                    <div className="flex items-center gap-4 mt-2 text-xs"><div className="flex items-center gap-1 text-gray-500"><Clock className="w-3 h-3" /> 30-45 min</div><div className={`font-bold ${c.deliveryFeeCalc === 0 ? 'text-green-600' : 'text-gray-500'}`}>{c.deliveryFeeCalc === 0 ? 'Entrega Grátis' : `R$ ${c.deliveryFeeCalc.toFixed(2)}`}</div></div>
                                </div>
                            </div>
                        ))}
                     </div>
                 </div>
             </div>
          </div>
      );
  };

  const renderOrders = () => {
    const myOrders = orders.filter(o => o.customerId === user.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return (
        <div className="pb-24 bg-gray-50 min-h-screen">
            <div className="bg-white p-4 border-b border-gray-200 sticky top-0 z-10 shadow-sm flex justify-between items-center">
                <h1 className="text-lg font-bold text-gray-800">Meus Pedidos</h1>
            </div>
            
            {myOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[60vh] text-gray-400 p-8 text-center">
                    <ShoppingBag className="w-16 h-16 mb-4 opacity-20" />
                    <p className="font-medium text-lg text-gray-600">Nenhum pedido ainda</p>
                    <p className="text-sm">Que tal experimentar algo novo hoje?</p>
                    <button onClick={() => setActiveTab('home')} className="mt-6 bg-red-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all">
                        Ver Cardápio
                    </button>
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    {myOrders.map(order => {
                        // Estimated time logic: Order time + 45 mins
                        const estimateTime = new Date(new Date(order.timestamp).getTime() + 45*60000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                        return (
                            <div key={order.id} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 transition-all hover:shadow-md">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500">
                                            <Store className="w-5 h-5"/>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900 text-base">{order.companyName}</h3>
                                            <p className="text-xs text-gray-400">Pedido #{order.id.slice(-4)}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                                        ${order.status === 'delivered' ? 'bg-gray-100 text-gray-500' : ''}
                                        ${['pending', 'preparing', 'ready', 'waiting_courier', 'delivering'].includes(order.status) ? 'bg-green-100 text-green-700' : ''}
                                        ${order.status === 'waiting_payment' ? 'bg-yellow-100 text-yellow-700' : ''}
                                        ${order.status === 'cancelled' ? 'bg-red-100 text-red-700' : ''}
                                    `}>
                                        {(() => {
                                            switch (order.status) {
                                                case 'waiting_payment': return 'Aguardando Pagamento';
                                                case 'pending': return 'Confirmado';
                                                case 'preparing': return 'Preparando';
                                                case 'ready': return 'Pronto / Aguardando Retirada';
                                                case 'waiting_courier': return 'Aguardando Entregador';
                                                case 'delivering': return 'Saiu para Entrega';
                                                case 'delivered': return 'Concluído';
                                                case 'cancelled': return 'Cancelado';
                                                default: return 'Processando';
                                            }
                                        })()}
                                    </span>
                                </div>

                                {/* ESTIMATE & DELIVERY CODE */}
                                {order.status !== 'delivered' && order.status !== 'cancelled' && (
                                    <div className="flex justify-between items-center mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Previsão</span>
                                            <span className="text-sm font-bold text-gray-800 flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-gray-400"/> {estimateTime}
                                            </span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Código de Entrega</span>
                                            <span className="text-sm font-mono font-bold tracking-widest text-gray-900">
                                                {order.deliveryCode}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* --- PAYMENT AREA (PIX) --- */}
                                {order.status === 'waiting_payment' && (
                                    <div className="mb-5 animate-slide-up">
                                        {order.paymentMethod === 'pix' ? (
                                            order.paymentPixCode ? (
                                                <div className="bg-gradient-to-b from-green-50 to-white border border-green-200 rounded-2xl p-5 shadow-sm">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h4 className="font-bold text-green-800 text-sm flex items-center gap-2">
                                                            <div className="p-1.5 bg-green-100 rounded-lg">
                                                                <QrCode className="w-4 h-4 text-green-700"/>
                                                            </div>
                                                            Pagamento Pix
                                                        </h4>
                                                        <div className="text-right">
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase">Valor Total</p>
                                                            <p className="text-sm font-bold text-gray-900">R$ {order.total.toFixed(2)}</p>
                                                        </div>
                                                    </div>

                                                    {/* QR Code Image Display */}
                                                    {order.paymentPixImage && (
                                                        <div className="flex justify-center mb-6">
                                                            <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                                                                <img 
                                                                    src={`data:image/png;base64,${order.paymentPixImage}`} 
                                                                    alt="Pix QR Code" 
                                                                    className="w-48 h-48 object-contain"
                                                                />
                                                                <p className="text-[10px] text-center text-gray-400 mt-2 flex items-center justify-center gap-1">
                                                                    <ScanLine className="w-3 h-3" /> Escaneie com seu banco
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    <div className="relative mb-4">
                                                        <div className="bg-white border-2 border-dashed border-green-300 rounded-xl p-3 text-xs text-gray-500 font-mono break-all leading-relaxed select-all text-center">
                                                            {order.paymentPixCode}
                                                        </div>
                                                    </div>

                                                    <button 
                                                        onClick={() => handleCopyPix(order.paymentPixCode!)}
                                                        className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-300 shadow-lg 
                                                            ${copiedPix === order.paymentPixCode 
                                                                ? 'bg-green-700 text-white shadow-green-200 scale-[0.98]' 
                                                                : 'bg-green-600 text-white hover:bg-green-700 shadow-green-200 hover:-translate-y-0.5'
                                                            }
                                                        `}
                                                    >
                                                        {copiedPix === order.paymentPixCode ? (
                                                            <><ClipboardCheck className="w-4 h-4" /> Código Copiado!</>
                                                        ) : (
                                                            <><Copy className="w-4 h-4" /> Copiar Código Pix</>
                                                        )}
                                                    </button>

                                                    {/* Polling/Verification Indicator */}
                                                    <div className="mt-4 flex items-center justify-center gap-2 text-green-700 bg-green-100/50 p-2 rounded-lg border border-green-100">
                                                        <span className="relative flex h-2.5 w-2.5">
                                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                                        </span>
                                                        <span className="text-xs font-bold animate-pulse">Aguardando confirmação do banco...</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-500 gap-3 text-center">
                                                    <div className="relative">
                                                        <Loader2 className="w-8 h-8 animate-spin text-green-600"/>
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-700">Gerando seu Pix...</p>
                                                        <p className="text-xs mt-1">Conectando com o banco para gerar o QR Code.</p>
                                                    </div>
                                                </div>
                                            )
                                        ) : (
                                            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 flex items-center gap-3 text-sm text-yellow-800">
                                                <Clock className="w-5 h-5 shrink-0" /> 
                                                <div>
                                                    <p className="font-bold">Aguardando Pagamento</p>
                                                    <p className="text-xs opacity-80">Realize o pagamento para o restaurante iniciar o preparo.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-1 pl-3 border-l-2 border-gray-100 py-1 mb-4">
                                    {order.items.map((i, idx) => (
                                        <p key={idx} className="text-sm text-gray-600 flex justify-between">
                                            <span><span className="font-bold text-gray-800">{i.quantity}x</span> {i.productName}</span>
                                        </p>
                                    ))}
                                </div>
                                
                                <div className="flex justify-between items-center border-t border-gray-50 pt-4">
                                    <button className="text-xs font-bold text-gray-400 hover:text-red-600 transition-colors">
                                        Ajuda
                                    </button>
                                    <button onClick={() => openChat(order.id)} className="text-red-600 font-bold text-sm flex items-center gap-1.5 bg-red-50 px-4 py-2 rounded-xl border border-red-100 hover:bg-red-100 transition-colors">
                                        <MessageCircle className="w-4 h-4" /> Chat com Loja
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
  };

  const renderProfile = () => (
    <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="bg-white p-6 border-b border-gray-100 flex items-center gap-4"><div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-xl font-bold text-gray-600">{user.name.charAt(0)}</div><div><h2 className="text-xl font-bold text-gray-900">{user.name}</h2><p className="text-sm text-gray-500">{user.email}</p></div></div>
        <div className="p-4 space-y-4">
             <button onClick={() => setSubView('wallet')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Wallet className="w-5 h-5"/></div><span className="font-bold text-gray-700">Carteira</span></div><ChevronRight className="w-5 h-5 text-gray-300"/></button>
             <button onClick={() => setSubView('addresses')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div className="bg-brandLight p-2 rounded-lg text-brand"><MapPin className="w-5 h-5"/></div><span className="font-bold text-gray-700">Endereços</span></div><ChevronRight className="w-5 h-5 text-gray-300"/></button>
             <button onClick={() => setSubView('settings')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50"><div className="flex items-center gap-3"><div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Settings className="w-5 h-5"/></div><span className="font-bold text-gray-700">Meus Dados</span></div><ChevronRight className="w-5 h-5 text-gray-300"/></button>
             <button onClick={onLogout} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-red-50 group mt-4"><div className="flex items-center gap-3"><div className="bg-gray-100 p-2 rounded-lg text-gray-500 group-hover:bg-red-200 group-hover:text-red-700 transition-colors"><LogOut className="w-5 h-5"/></div><span className="font-bold text-gray-500 group-hover:text-brand transition-colors">Sair da Conta</span></div></button>
        </div>
    </div>
  );

  const renderAddressesView = () => {
      return (
        <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto animate-slide-up">
            <div className="bg-white p-4 border-b border-gray-100 sticky top-0 flex items-center gap-3">
                <button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
                <h2 className="font-bold text-lg">Endereços</h2>
            </div>
            <div className="p-4 space-y-4">
                {(user.savedAddresses||[]).map((a,i)=>(
                    <div key={i} className="bg-white p-4 rounded-xl border flex justify-between items-center" onClick={()=>handleSelectAddress(a)}>
                        <div className="flex items-center gap-3">
                            <MapPin className="text-gray-500"/>
                            <div><p className="font-bold">{a.name}</p><p className="text-xs">{a.street}</p></div>
                        </div>
                        <button onClick={(e)=>{e.stopPropagation();onRemoveAddress(i)}} className="text-red-500"><Trash2/></button>
                    </div>
                ))}
                
                {!isAddingAddress ? (
                    <button onClick={()=>setIsAddingAddress(true)} className="w-full py-4 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 text-gray-500 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all">
                        <Plus/> Novo Endereço
                    </button>
                ) : (
                    <div className="bg-white p-4 rounded-xl border space-y-3 shadow-sm animate-fade-in">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="font-bold text-gray-700 text-sm uppercase">Novo Endereço</h3>
                            <button onClick={() => setIsAddingAddress(false)} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X className="w-4 h-4" /></button>
                        </div>
                        
                        <div className="flex justify-end mb-2">
                             <button 
                                type="button" 
                                onClick={handleGetCurrentLocation}
                                disabled={loadingLocation}
                                className="text-xs text-brand font-bold hover:text-brandHover flex items-center gap-1 bg-white px-2 py-1 rounded transition-colors border border-gray-100"
                            >
                                {loadingLocation ? <Loader2 className="w-3 h-3 animate-spin"/> : <Crosshair className="w-3 h-3" />}
                                Usar localização atual
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <div className="relative w-1/3">
                                <input 
                                    placeholder="CEP" 
                                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" 
                                    value={newAddressForm.zipCode || ''} 
                                    onChange={handleCepChange}
                                    maxLength={8}
                                />
                                {loadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-brand" />}
                            </div>
                            <button onClick={()=>setShowMapModal(true)} className="flex-1 bg-brandLight text-brand font-bold rounded-lg text-xs flex items-center justify-center gap-2 border border-red-100 hover:bg-red-100">
                                <MapPin className="w-4 h-4" /> Abrir no Mapa
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <input placeholder="Rua" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" value={newAddressForm.street||''} onChange={e=>setNewAddressForm({...newAddressForm,street:e.target.value})}/>
                            <input placeholder="Nº" className="w-20 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" value={newAddressForm.number||''} onChange={e=>setNewAddressForm({...newAddressForm,number:e.target.value})}/>
                        </div>

                        <div className="flex gap-2">
                            <input placeholder="Bairro" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" value={newAddressForm.neighborhood||''} onChange={e=>setNewAddressForm({...newAddressForm,neighborhood:e.target.value})}/>
                            <input placeholder="Cidade" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" value={newAddressForm.city||''} onChange={e=>setNewAddressForm({...newAddressForm,city:e.target.value})}/>
                        </div>

                        <input placeholder="Nome (ex: Casa, Trabalho)" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brandLight outline-none" value={newAddressForm.name||''} onChange={e=>setNewAddressForm({...newAddressForm,name:e.target.value})}/>

                        <button onClick={confirmAddAddress} className="bg-brand text-white w-full py-3 rounded-xl font-bold shadow-lg shadow-red-200 mt-2 hover:bg-brandHover transition-colors">
                            Salvar Endereço
                        </button>
                    </div>
                )}
            </div>
        </div>
      );
  };

  return (
    <div className="bg-gray-50 min-h-screen">
       {subView === 'addresses' && renderAddressesView()}
       
       {subView === 'wallet' && (
            <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto animate-slide-up"><div className="bg-white p-4 border-b border-gray-100 sticky top-0 flex items-center gap-3"><button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button><h2 className="font-bold text-lg">Carteira</h2></div><div className="p-4"><div className="bg-gray-900 text-white p-6 rounded-2xl mb-6 shadow-xl"><p className="text-xs opacity-70">Saldo</p><h3 className="text-3xl font-bold">R$ 0,00</h3></div>{(user.savedCards||[]).map((c,i)=>(<div key={i} className="bg-white p-4 rounded-xl border mb-2 flex justify-between"><div className="flex items-center gap-2"><CreditCard/><p>•••• {c.last4}</p></div><Trash2 className="text-red-500 cursor-pointer" onClick={()=>onRemoveCard(i)}/></div>))}{!isAddingCard?<button onClick={()=>setIsAddingCard(true)} className="text-brand font-bold text-sm">+ Adicionar Cartão</button>:(<div className="bg-white p-4 rounded-xl border mt-2"><input placeholder="Número" className="w-full border p-2 mb-2 rounded" value={newCardForm.number||''} onChange={e=>setNewCardForm({...newCardForm,number:e.target.value})}/><button onClick={confirmAddCard} className="bg-brand text-white w-full py-2 rounded font-bold">Salvar</button></div>)}</div></div>
       )}

       {subView === 'chat' && chatOrderId && (
            <div className="fixed inset-0 bg-gray-50 z-[60] flex flex-col animate-slide-up"><div className="bg-white p-4 border-b flex items-center gap-3"><button onClick={()=>setSubView('none')}><ArrowLeft/></button><h2 className="font-bold">Chat</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#E5DDD5]">{(chats[chatOrderId]||[]).map(m=>(<div key={m.id} className={`flex ${m.senderRole==='client'?'justify-end':'justify-start'}`}><div className={`p-3 rounded-xl text-sm max-w-[80%] ${m.senderRole==='client'?'bg-[#DCF8C6]':'bg-white'}`}>{m.text}</div></div>))}<div ref={messagesEndRef}/></div><div className="p-3 bg-white border-t flex gap-2"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} className="flex-1 bg-gray-100 rounded-full px-4 py-3 outline-none" /><button onClick={handleSendMessage} className="bg-brand text-white p-3 rounded-full"><Send/></button></div></div>
       )}
       
       {isCartOpen && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
               <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center mb-6"><h2 className="font-bold text-xl text-gray-800">Sacola</h2><button onClick={() => setIsCartOpen(false)}><X/></button></div>
                    <div className="flex bg-gray-100 p-1 rounded-xl mb-4"><button onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${deliveryMethod === 'delivery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Entrega</button><button onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${deliveryMethod === 'pickup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Retirada</button></div>
                    
                    {/* RESTAURANT ADDRESS FOR PICKUP (Inside Cart) */}
                    {deliveryMethod === 'pickup' && activeCompanyData?.address && (
                        <div className="bg-orange-50 p-3 rounded-xl border border-orange-100 mb-4 text-sm animate-fade-in">
                            <p className="font-bold text-orange-800 flex items-center gap-1 mb-1">
                                <Store className="w-4 h-4"/> Retirar em:
                            </p>
                            <p className="text-gray-700">
                                {activeCompanyData.address.street}, {activeCompanyData.address.number}
                                <br/>
                                <span className="text-xs">{activeCompanyData.address.neighborhood} - {activeCompanyData.address.city}</span>
                            </p>
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto mb-4">{cart.map((i, idx) => (<div key={idx} className="flex justify-between border-b py-2"><div>{i.quantity}x {i.product.name}</div><div className="flex gap-2 font-bold">R$ {i.finalPrice.toFixed(2)} <Trash2 onClick={() => removeFromCart(idx)} className="w-4 h-4 text-red-500"/></div></div>))}</div>
                    <div className="space-y-2 border-t pt-4 text-sm text-gray-600">
                        <div className="flex justify-between">
                            <span>Subtotal</span>
                            <span>R$ {productTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Entrega</span>
                            <span className={activeDeliveryFee === 0 ? 'text-green-600 font-bold' : ''}>
                                {activeDeliveryFee === 0 ? 'Grátis' : `R$ ${activeDeliveryFee.toFixed(2)}`}
                            </span>
                        </div>
                        {serviceFeeValue > 0 && (
                            <div className="flex justify-between">
                                <span className="flex items-center gap-1 text-xs">
                                    Taxa de Serviço
                                    <span className="text-[10px] text-gray-400">({activeCompanyData?.serviceFeePercentage}%)</span>
                                </span>
                                <span>R$ {serviceFeeValue.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                    <div className="mt-4 border-t pt-4"><p className="text-xs font-bold text-gray-500 mb-2 uppercase">Pagamento</p><div className="flex gap-2 mb-4"><button onClick={() => setPaymentMethod('cash')} className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 ${paymentMethod === 'cash' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100'}`}><DollarSign/><span className="text-xs font-bold">Dinheiro</span></button><button onClick={() => setPaymentMethod('card')} className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100'}`}><CreditCard/><span className="text-xs font-bold">Cartão</span></button><button onClick={() => setPaymentMethod('pix')} className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 ${paymentMethod === 'pix' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100'}`}><QrCode/><span className="text-xs font-bold">Pix</span></button></div>{paymentMethod === 'cash' && (<div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4"><label className="text-xs font-bold text-yellow-800 block mb-1">Troco para quanto?</label><input type="number" placeholder="Ex: 50.00" value={changeAmount} onChange={e => setChangeAmount(e.target.value)} className="w-full py-2 outline-none text-gray-800 font-bold bg-transparent border-b border-yellow-300"/></div>)}</div>
                    <div className="mt-2 flex justify-between font-bold text-xl text-gray-900 border-t pt-2"><span>Total</span><span>R$ {finalTotal.toFixed(2)}</span></div>
                    <button onClick={handleFinalizeOrder} disabled={isProcessingPayment} className={`w-full text-white font-bold py-3.5 rounded-xl mt-4 transition-colors flex items-center justify-center gap-2 ${isProcessingPayment ? 'bg-gray-400' : 'bg-brand hover:bg-brandHover'}`}>{isProcessingPayment && <Loader2 className="w-5 h-5 animate-spin" />}{isProcessingPayment ? 'Processando...' : (paymentMethod === 'cash' ? 'Finalizar Pedido' : 'Pagar Agora')}</button>
               </div>
           </div>
       )}

       {customizingProduct && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
               {/* MODAL FIX: Flex col + max-height + overflow-y-auto on content */}
               <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
                   
                   {/* FIXED HEADER */}
                   <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white z-10 shrink-0">
                        <h2 className="font-bold text-xl truncate pr-8">{customizingProduct.name}</h2>
                        <button onClick={() => setCustomizingProduct(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X className="w-5 h-5"/></button>
                   </div>
                   
                   {/* SCROLLABLE CONTENT */}
                   <div className="p-4 overflow-y-auto flex-1">
                       {customizingProduct.groups.map(g => (
                           <div key={g.id} className="mb-4">
                               <h3 className="font-bold text-gray-800 mb-2">{g.name}</h3>
                               <p className="text-xs text-gray-400 mb-2">
                                   {g.min === 1 && g.max === 1 ? 'Escolha 1 opção' : `Escolha até ${g.max} opções`}
                               </p>
                               {g.options.map(o => (
                                   <div 
                                       key={o.id} 
                                       onClick={() => setSelections(prev => { 
                                           const curr = prev[g.id] || []; 
                                           const exists = curr.find(x => x.id === o.id); 
                                           
                                           // Toggle logic
                                           if (exists) return { ...prev, [g.id]: curr.filter(x => x.id !== o.id) }; 
                                           
                                           // Single choice logic
                                           if (curr.length >= g.max && g.max === 1) return { ...prev, [g.id]: [o] }; 
                                           
                                           // Max limit logic
                                           if (curr.length >= g.max) return prev; 
                                           
                                           return { ...prev, [g.id]: [...curr, o] }; 
                                       })} 
                                       className={`p-3 border rounded-xl mt-2 flex justify-between items-center cursor-pointer transition-all active:scale-[0.98] 
                                           ${(selections[g.id]||[]).some(s=>s.id===o.id) 
                                               ? 'bg-red-50 border-red-500 text-red-700 shadow-sm' 
                                               : 'bg-white border-gray-200 hover:bg-gray-50'
                                           }`
                                       }
                                   >
                                       <span>{o.name}</span>
                                       <span className="font-bold text-sm">
                                           {(selections[g.id]||[]).some(s=>s.id===o.id) && <CheckCircle className="inline w-4 h-4 mr-1"/>}
                                           {o.price > 0 ? `+ R$ ${o.price.toFixed(2)}` : 'Grátis'}
                                       </span>
                                   </div>
                               ))}
                           </div>
                       ))}
                   </div>
                   
                   {/* FIXED FOOTER */}
                   <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                       <button 
                           onClick={() => { 
                               const flatOptions: any[] = []; 
                               customizingProduct.groups.forEach(g => (selections[g.id] || []).forEach(o => flatOptions.push({groupName: g.name, optionName: o.name, price: o.price}))); 
                               addToCart(customizingProduct, currentPrice, flatOptions); 
                               setCustomizingProduct(null); 
                           }} 
                           className="w-full bg-brand text-white font-bold py-3.5 rounded-xl shadow-lg shadow-red-200 hover:bg-brandHover transition-colors flex justify-between px-6 items-center"
                       >
                           <span>Adicionar</span>
                           <span>R$ {currentPrice.toFixed(2)}</span>
                       </button>
                   </div>

               </div>
           </div>
       )}

       {activeTab === 'home' && renderHome()}
       {activeTab === 'orders' && renderOrders()}
       {activeTab === 'profile' && renderProfile()}
       {cart.length > 0 && !isCartOpen && (<div className="fixed bottom-20 left-0 right-0 px-4 z-20 flex justify-center animate-fade-in-up pointer-events-none"><button onClick={() => setIsCartOpen(true)} className="bg-brand text-white w-full max-w-md shadow-xl shadow-red-200/50 rounded-xl p-3 flex justify-between items-center font-bold pointer-events-auto transform active:scale-95 transition-all"><div className="flex items-center gap-3"><div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">{cart.reduce((acc, i) => acc + i.quantity, 0)}</div><span className="text-sm">Ver Sacola</span></div><div className="flex items-center gap-2"><span className="text-sm">R$ {productTotal.toFixed(2)}</span><ShoppingBag className="w-5 h-5 fill-white/20" /></div></button></div>)}
       <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-6 flex justify-between items-center z-30"><button onClick={() => { setActiveTab('home'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-brand' : 'text-gray-400'}`}><Home className={`w-6 h-6 ${activeTab === 'home' ? 'fill-current' : ''}`} /><span className="text-[10px] font-bold">Início</span></button><button onClick={() => { setActiveTab('orders'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'orders' ? 'text-brand' : 'text-gray-400'}`}><FileText className={`w-6 h-6 ${activeTab === 'orders' ? 'fill-current' : ''}`} /><span className="text-[10px] font-bold">Pedidos</span></button><button onClick={() => { setActiveTab('profile'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-brand' : 'text-gray-400'}`}><UserIcon className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-current' : ''}`} /><span className="text-[10px] font-bold">Perfil</span></button></div>
       
       {showMapModal && (<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in h-full"><div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90%] relative"><div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none"><div className="bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md border border-gray-100 pointer-events-auto"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Navigation className="w-4 h-4 text-brand" /> Definir Localização</h3><p className="text-xs text-gray-500">Mova o pin para o endereço correto.</p></div><button onClick={() => setShowMapModal(false)} className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 pointer-events-auto"><X className="w-6 h-6 text-gray-500" /></button></div><div className="flex-1 bg-gray-100 relative group overflow-hidden">{mapError ? (<div className="w-full h-full flex flex-col items-center justify-center text-center p-8"><MapIcon className="w-16 h-16 text-gray-300"/><p>Erro no Mapa</p></div>) : (<><div ref={mapContainerRef} className="w-full h-full" /><div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none transition-all duration-300 ease-out ${isMapDragging ? '-mt-16 scale-110' : '-mt-8'}`}><div className="w-12 h-12 bg-brand rounded-full flex items-center justify-center shadow-2xl border-[3px] border-white"><MapPin className="w-6 h-6 text-white fill-current" /></div><div className={`w-2 h-8 bg-black/80 rounded-full -mt-2 blur-[1px] transition-opacity duration-300 ${isMapDragging ? 'opacity-0' : 'opacity-20'}`}></div></div>{!isMapDragging && <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none flex items-center gap-2 animate-pulse"><MousePointer2 className="w-3 h-3" /> Arraste o mapa</div>}</>)}</div><div className="p-6 bg-white border-t border-gray-100 rounded-t-3xl -mt-6 relative z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]"><div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"><div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div><div className="flex items-start gap-3 mb-6"><div className="p-2 bg-brandLight rounded-lg shrink-0"><MapPin className="w-6 h-6 text-brand" /></div><div className="flex-1"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço Selecionado</p><h4 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">{mapAddress || 'Carregando endereço...'}</h4></div></div><button onClick={() => setShowMapModal(false)} className="w-full bg-brand text-white font-bold py-3.5 rounded-xl hover:bg-brandHover shadow-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Confirmar</button></div></div></div></div>)}
    </div>
  );
};

export default ClientView;
