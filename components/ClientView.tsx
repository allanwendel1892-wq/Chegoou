import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Company, Product, User, ProductGroup, ProductOption, Order, ChatMessage, Address, CreditCard as CreditCardType } from '../types';
import { Search, MapPin, Star, ShoppingBag, Plus, Minus, CreditCard, ChevronRight, Clock, Heart, LogOut, CheckCircle, X, AlertTriangle, Bike, Store, Home, FileText, User as UserIcon, Wallet, MessageCircle, Send, ArrowLeft, Trash2, Edit2, Lock, Mail, Phone, Settings, CircleDashed, Loader2, Navigation, Check, MousePointer2, Map as MapIcon, Crosshair, Pizza, Utensils, UtensilsCrossed, Fish, Coffee, Cake, ShoppingCart, Salad, Zap, Tag, DollarSign, QrCode } from 'lucide-react';

// Declaration to avoid TS errors with Google Maps
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
  // Chat Props
  chats: Record<string, ChatMessage[]>;
  onSendMessage: (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => void;
  // Management Props
  onAddAddress: (address: Address) => void;
  onRemoveAddress: (index: number) => void;
  onAddCard: (card: CreditCardType) => void;
  onRemoveCard: (index: number) => void;
}

// --- UTILS FOR SEARCH ---

// 1. Normalization (Remove accents, lowercase)
const normalizeText = (text: string) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
};

// 2. Levenshtein Distance (Calculate typo tolerance)
const levenshteinDistance = (a: string, b: string) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // increment along the first column of each row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // increment each column in the first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

// 3. Smart Search Matcher
const isMatch = (sourceText: string, searchTerm: string) => {
    if (!sourceText || !searchTerm) return false;
    const normSource = normalizeText(sourceText);
    const normSearch = normalizeText(searchTerm);

    // Direct substring match (High priority)
    if (normSource.includes(normSearch)) return true;

    // Fuzzy Match (Typo tolerance)
    const sourceWords = normSource.split(' ');
    const searchWords = normSearch.split(' ');

    return searchWords.some(sWord => {
        if (sWord.length < 3) return false; 
        
        return sourceWords.some(tWord => {
            const distance = levenshteinDistance(sWord, tWord);
            const allowedErrors = sWord.length > 5 ? 2 : 1;
            return distance <= allowedErrors;
        });
    });
};

// Haversine Formula
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; 
  return d;
};

const deg2rad = (deg: number) => {
  return deg * (Math.PI / 180);
};

// --- CATEGORY ICONS MAP ---
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
  // Navigation State
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'profile'>('home');
  const [subView, setSubView] = useState<'none' | 'wallet' | 'addresses' | 'settings' | 'chat'>('none');
  
  // New States for Forms
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newAddressForm, setNewAddressForm] = useState<Partial<Address>>({});
  
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [newCardForm, setNewCardForm] = useState<Partial<CreditCardType>>({});

  const [chatOrderId, setChatOrderId] = useState<string | null>(null);

  // Home Logic State
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [cart, setCart] = useState<{product: Product, quantity: number, selectedOptions?: { groupName: string, optionName: string, price: number }[], finalPrice: number }[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery'); // Delivery vs Pickup Toggle
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>("Tudo");
  const [specialFilter, setSpecialFilter] = useState<'none' | 'free' | 'fast'>('none');
  
  // Payment State
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('card');
  const [changeAmount, setChangeAmount] = useState<string>('');

  // Customization Modal
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [selections, setSelections] = useState<Record<string, ProductOption[]>>({});

  // Chat Local State
  const [chatInput, setChatInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- MAP & ADDRESS LOGIC STATES ---
  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false); // State for GPS loading
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);

  // ... (Keep existing Map Effects and GPS Logic) ...
  useEffect(() => {
    let map: any;
    
    const initMap = () => {
        if (!mapContainerRef.current || !window.google || mapError) return;

        try {
            const initialPos = { 
                lat: newAddressForm.lat || -23.550520, 
                lng: newAddressForm.lng || -46.633308 
            };
            
            map = new window.google.maps.Map(mapContainerRef.current, {
                center: initialPos,
                zoom: 17,
                disableDefaultUI: true,
                zoomControl: false,
                gestureHandling: 'greedy',
                styles: [{ "featureType": "poi", "stylers": [{ "visibility": "off" }] }]
            });

            const geocoder = new window.google.maps.Geocoder();

            const isDefaultCoords = (initialPos.lat === -23.550520 && initialPos.lng === -46.633308);
            if (isDefaultCoords && newAddressForm.street && newAddressForm.city) {
                 const fullAddress = `${newAddressForm.street}, ${newAddressForm.number || ''} - ${newAddressForm.neighborhood}, ${newAddressForm.city}, Brasil`;
                 geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                     if (status === 'OK' && results[0]) {
                         map.setCenter(results[0].geometry.location);
                     }
                 });
            }

            map.addListener('dragstart', () => setIsMapDragging(true));
            map.addListener('idle', () => {
                setIsMapDragging(false);
                const center = map.getCenter();
                if (center) {
                    const lat = center.lat();
                    const lng = center.lng();
                    
                    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                        if (status === 'OK' && results[0]) {
                            const addressComponents = results[0].address_components;
                            let route = '';
                            let streetNumber = '';
                            let sublocality = '';
                            let locality = '';
                            let postalCode = '';

                            addressComponents.forEach((component: any) => {
                                if (component.types.includes('route')) route = component.long_name;
                                if (component.types.includes('street_number')) streetNumber = component.long_name;
                                if (component.types.includes('sublocality')) sublocality = component.long_name;
                                if (component.types.includes('administrative_area_level_2') || component.types.includes('locality')) locality = component.long_name;
                                if (component.types.includes('postal_code')) postalCode = component.long_name;
                            });

                            setMapAddress(`${route}, ${streetNumber || 'S/N'}`);
                            
                            setNewAddressForm(prev => ({
                                ...prev,
                                lat,
                                lng,
                                street: route || prev.street,
                                neighborhood: sublocality || prev.neighborhood,
                                city: locality || prev.city,
                                zipCode: postalCode ? postalCode.replace('-', '') : prev.zipCode
                            }));
                        }
                    });
                }
            });
        } catch (e) {
            console.error("Map initialization error:", e);
            setMapError(true);
        }
    };

    if (showMapModal && !mapError) {
        if (window.google && window.google.maps) {
            initMap();
        } else {
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    initMap();
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }
  }, [showMapModal, mapError]);

  const handleGetCurrentLocation = () => {
      if (!navigator.geolocation) {
          alert('Geolocalização não é suportada pelo seu navegador.');
          return;
      }
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const { latitude, longitude } = position.coords;
              if (window.google && window.google.maps) {
                  const geocoder = new window.google.maps.Geocoder();
                  geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
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
                          setNewAddressForm(prev => ({ ...prev, lat: latitude, lng: longitude, street: route || prev.street, number: streetNumber || prev.number, neighborhood: sublocality || prev.neighborhood, city: locality || prev.city, zipCode: postalCode ? postalCode.replace('-', '') : prev.zipCode }));
                      }
                      setLoadingLocation(false);
                  });
              } else {
                  setNewAddressForm(prev => ({ ...prev, lat: latitude, lng: longitude }));
                  setLoadingLocation(false);
                  alert("Localização obtida! Confirme os detalhes do endereço.");
              }
          },
          (error) => { console.error("Error getting location:", error); alert("Não foi possível obter sua localização."); setLoadingLocation(false); },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, '');
      setNewAddressForm(prev => ({...prev, zipCode: value}));
      if (value.length === 8) {
          setLoadingCep(true);
          try {
              const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
              const data = await response.json();
              if (!data.erro) {
                  setNewAddressForm(prev => ({ ...prev, street: data.logradouro, city: data.localidade, neighborhood: data.bairro }));
                  if (window.google && window.google.maps) {
                      const geocoder = new window.google.maps.Geocoder();
                      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, Brasil`;
                      geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                          if (status === 'OK' && results[0]) {
                              const location = results[0].geometry.location;
                              setNewAddressForm(prev => ({ ...prev, lat: location.lat(), lng: location.lng() }));
                          }
                      });
                  }
              }
          } catch (err) { console.error("Erro ao buscar CEP", err); } finally { setLoadingCep(false); }
      }
  };


  // Filtered Companies Logic... 
  const filteredCompanies = useMemo(() => {
      if (!user.address) return [];
      
      return companies
        .map(c => {
            const dist = getDistanceFromLatLonInKm(
                user.address!.lat, user.address!.lng, 
                c.address?.lat || 0, c.address?.lng || 0
            );

            let fee = 0;
            if (c.deliveryType === 'own') {
                fee = c.ownDeliveryFee || 0;
            } else {
                if (c.customPlatformFee !== undefined && c.customPlatformFee > 0) {
                    fee = c.customPlatformFee;
                } else {
                    fee = 5.00 + (dist * 1.50);
                }
            }

            return { ...c, distanceCalc: dist, deliveryFeeCalc: fee };
        })
        .filter(c => {
            if (c.status !== 'open') return false;
            if (c.distanceCalc > c.deliveryRadiusKm) return false;
            if (specialFilter === 'free' && c.deliveryFeeCalc > 0) return false;
            if (specialFilter === 'fast' && c.distanceCalc > 5) return false; 
            if (selectedCategory !== 'Tudo' && c.category !== selectedCategory) return false;
            if (searchTerm) {
                const companyMatch = isMatch(c.name, searchTerm) || isMatch(c.category, searchTerm);
                const companyProducts = products.filter(p => p.companyId === c.id);
                const productMatch = companyProducts.some(p => isMatch(p.name, searchTerm) || isMatch(p.description, searchTerm) || isMatch(p.category, searchTerm));
                if (!companyMatch && !productMatch) return false;
            }
            return true;
        })
        .sort((a, b) => a.distanceCalc - b.distanceCalc);
  }, [companies, user.address?.lat, user.address?.lng, searchTerm, selectedCategory, products, specialFilter]);

  // --- CART HANDLERS ---
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
          if (group.max > 1) {
              if (customizingProduct.pricingMode === 'average') {
                  const sum = selected.reduce((acc, curr) => acc + curr.price, 0);
                  total += (sum / selected.length);
              } else if (customizingProduct.pricingMode === 'highest') {
                  const max = Math.max(...selected.map(o => o.price));
                  total += max;
              } else {
                  total += selected.reduce((acc, curr) => acc + curr.price, 0);
              }
          } else {
              total += selected.reduce((acc, curr) => acc + curr.price, 0);
          }
      });
      return total;
  }, [customizingProduct, selections]);

  const addToCart = (product: Product, finalPrice: number, selectedOptions: any[]) => {
    if (cart.length > 0 && cart[0].product.companyId !== product.companyId) {
        if (!window.confirm("Você tem itens de outro restaurante. Deseja limpar o carrinho?")) return;
        setCart([]);
    }
    setCart([...cart, {product, quantity: 1, selectedOptions, finalPrice}]);
    setIsCartOpen(true); 
  };

  const removeFromCart = (index: number) => {
      const newCart = [...cart];
      if (newCart[index].quantity > 1) {
          newCart[index].quantity--;
          setCart(newCart);
      } else {
          newCart.splice(index, 1);
          setCart(newCart);
      }
  };

  // --- CALCULATION LOGIC (UPDATED AS REQUESTED) ---
  const activeCompanyData = selectedCompany ? filteredCompanies.find(c => c.id === selectedCompany.id) : null;
  const productTotal = cart.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0); // Subtotal
  
  // Logic: Pickup = 0 Fee. Delivery = Calculated Fee.
  const activeDeliveryFee = deliveryMethod === 'pickup' ? 0 : (activeCompanyData ? activeCompanyData.deliveryFeeCalc : 0);
  
  // Logic A: Sum Product + Delivery (NOT used for Service Fee base anymore based on request)
  
  // Logic B: Service Fee % 
  // FIX: Service Fee should be calculated on the PRODUCTS SUBTOTAL, not including delivery fee.
  const serviceFeePercentage = activeCompanyData ? activeCompanyData.serviceFeePercentage : 0;
  const serviceFeeValue = productTotal * (serviceFeePercentage / 100);
  
  // Logic C: Total for Customer
  const finalTotal = productTotal + activeDeliveryFee + serviceFeeValue;

  // --- CHAT LOGIC ---
  const openChat = (orderId: string) => {
      setChatOrderId(orderId);
      setSubView('chat');
  };

  const handleSendMessage = () => {
      if (!chatInput.trim() || !chatOrderId) return;
      onSendMessage(chatOrderId, chatInput, user.id, 'client');
      setChatInput('');
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chats, chatOrderId]);

  // --- FORM HANDLERS ---
  const handleSelectAddress = (addr: Address) => {
      onUpdateUser({ ...user, address: addr });
      setSubView('none');
  };

  const confirmAddAddress = () => {
      if (!newAddressForm.street || !newAddressForm.number) {
          alert("Preencha rua e número.");
          return;
      }
      onAddAddress({
          street: newAddressForm.street,
          number: newAddressForm.number,
          neighborhood: newAddressForm.neighborhood || '',
          city: newAddressForm.city || '',
          zipCode: newAddressForm.zipCode || '',
          lat: newAddressForm.lat || 0, 
          lng: newAddressForm.lng || 0,
          name: newAddressForm.name || 'Outro'
      });
      setIsAddingAddress(false);
      setNewAddressForm({});
  };

  const confirmAddCard = () => {
      if (!newCardForm.number || !newCardForm.expiry || !newCardForm.cvv) {
          alert("Preencha os dados do cartão.");
          return;
      }
      onAddCard({
          id: Date.now().toString(),
          number: newCardForm.number,
          holderName: newCardForm.holderName || user.name,
          expiry: newCardForm.expiry,
          cvv: newCardForm.cvv,
          brand: 'mastercard', // Mock
          last4: newCardForm.number.slice(-4)
      });
      setIsAddingCard(false);
      setNewCardForm({});
  };

  const handleSaveSettings = (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const formData = new FormData(form);
      const updatedUser: User = {
          ...user,
          name: formData.get('name') as string || user.name,
          email: formData.get('email') as string || user.email,
          phone: formData.get('phone') as string || user.phone,
          password: formData.get('password') as string || user.password || ''
      };
      onUpdateUser(updatedUser);
      setSubView('none');
      alert('Dados atualizados com sucesso!');
  };

  const handleFinalizeOrder = async () => {
      // Validation for Cash Change
      let changeForValue = 0;
      if (paymentMethod === 'cash') {
          changeForValue = parseFloat(changeAmount.replace(',','.'));
          if (changeForValue < finalTotal) {
              alert(`O valor para troco deve ser maior que o total (R$ ${finalTotal.toFixed(2)})`);
              return;
          }
      }

      // Mercado Pago Simulation
      if (paymentMethod === 'card' || paymentMethod === 'pix') {
          const w = window.open('', '_blank');
          if (w) {
              w.document.write(`
                <html>
                    <head><title>Mercado Pago Checkout</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
                        <h1 style="color: #009EE3;">Mercado Pago</h1>
                        <p>Simulando pagamento de <strong>R$ ${finalTotal.toFixed(2)}</strong> via ${paymentMethod === 'pix' ? 'PIX' : 'Cartão'}.</p>
                        <p>Processando...</p>
                        <script>
                            setTimeout(() => {
                                document.body.innerHTML += '<h2 style="color: green;">Pagamento Aprovado!</h2><p>Você pode fechar esta janela.</p>';
                            }, 2000);
                        </script>
                    </body>
                </html>
              `);
          }
      }

      const success = await onPlaceOrder(
          cart, 
          cart[0].product.companyId, 
          finalTotal, 
          deliveryMethod, 
          serviceFeeValue, 
          activeDeliveryFee, 
          productTotal,
          paymentMethod,
          changeForValue
      ); 

      if (success) {
          setIsCartOpen(false); 
          setCart([]); 
          setSelectedCompany(null);
          setChangeAmount('');
          alert("Pedido realizado com sucesso!");
      }
  };

  // --- RENDER FUNCTIONS (REUSED LAYOUT) ---

  const renderHome = () => {
      if (selectedCompany) {
          const companyProducts = products.filter(p => p.companyId === selectedCompany.id);
        const categories = Array.from(new Set(companyProducts.map(p => p.category)));
        const feeDisplay = filteredCompanies.find(c => c.id === selectedCompany.id)?.deliveryFeeCalc || 0;
        
        return (
            <div className="pb-32 bg-gray-50 min-h-screen animate-fade-in">
                 {/* Header Image */}
                <div className="relative h-48 md:h-64">
                    <img 
                        src={selectedCompany.coverImage || selectedCompany.logo || "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=2070&auto=format&fit=crop"} 
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                    <button 
                        onClick={() => setSelectedCompany(null)} 
                        className="absolute top-6 left-6 bg-white/20 backdrop-blur-md rounded-full p-2 hover:bg-white/40 transition text-white"
                    >
                        <ChevronRight className="rotate-180 w-6 h-6" />
                    </button>
                </div>
                {/* Info Card */}
                <div className="max-w-4xl mx-auto -mt-12 relative z-10 px-4">
                    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
                         <div className="flex gap-4 items-center mb-2">
                             <img src={selectedCompany.logo} className="w-16 h-16 rounded-full border-2 border-gray-100 bg-white object-cover" />
                             <div>
                                 <h1 className="text-2xl font-bold text-gray-900">{selectedCompany.name}</h1>
                                 <p className="text-sm text-gray-500 mt-1">{selectedCompany.category}</p>
                             </div>
                         </div>
                         <div className="flex gap-4 text-sm text-gray-600 border-t pt-4 mt-2">
                             <div className="flex items-center gap-1"><Clock className="w-4 h-4"/> 30-45 min</div>
                             <div className="flex items-center gap-1"><Bike className="w-4 h-4"/> {feeDisplay === 0 ? 'Grátis' : `R$ ${feeDisplay.toFixed(2)}`}</div>
                             <div className="flex items-center gap-1"><MapPin className="w-4 h-4"/> {selectedCompany.address?.neighborhood}</div>
                         </div>
                    </div>
                    {/* Menu */}
                    <div className="mt-8 space-y-8">
                        {categories.map(cat => (
                            <div key={cat}>
                                <h2 className="text-xl font-bold mb-4 text-gray-800">{cat}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {companyProducts.filter(p => p.category === cat).map(product => (
                                        <div key={product.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 cursor-pointer" onClick={() => openProductModal(product)}>
                                            <div className="flex-1">
                                                <h3 className="font-bold text-gray-800">{product.name}</h3>
                                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                                                <div className="mt-2 font-medium">R$ {product.price.toFixed(2)}</div>
                                            </div>
                                            {product.image && <img src={product.image} className="w-24 h-24 rounded-lg object-cover bg-gray-100" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )
      }

      // Default Home Feed
      return (
          <div className="pb-32 bg-gray-50 min-h-screen">
             
             {/* Header */}
             <div className="bg-white sticky top-0 z-30 shadow-sm">
                 <div className="px-4 py-4 max-w-3xl mx-auto">
                     {/* Address Bar */}
                     <div className="flex justify-between items-center mb-4">
                         <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setSubView('addresses')}>
                             <div className="text-red-600 bg-red-50 p-2 rounded-full group-hover:bg-red-100 transition-colors">
                                <MapPin className="w-5 h-5" />
                             </div>
                             <div>
                                 <div className="flex items-center gap-1">
                                    <span className="text-xs text-gray-500 font-bold uppercase">Entregar em</span>
                                    <ChevronRight className="w-3 h-3 text-gray-400" />
                                 </div>
                                 <span className="font-bold text-gray-900 text-sm truncate max-w-[200px] block">{user.address?.street}, {user.address?.number}</span>
                             </div>
                         </div>
                         <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold hover:bg-gray-200 transition-colors cursor-pointer" onClick={() => setActiveTab('profile')}>
                             {user.name.charAt(0)}
                         </div>
                     </div>

                     {/* Search Bar */}
                     <div className="relative">
                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                         <input 
                            type="text" 
                            placeholder="Buscar item ou loja..." 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="w-full pl-12 pr-4 py-3 bg-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-red-100 focus:bg-white transition-all text-sm font-medium" 
                         />
                     </div>
                 </div>

                 {/* CATEGORIES SCROLL */}
                 <div className="border-t border-gray-100">
                     <div className="max-w-3xl mx-auto flex overflow-x-auto py-4 px-4 gap-4 no-scrollbar">
                         {CATEGORIES.map(cat => {
                             const Icon = cat.icon;
                             const isSelected = selectedCategory === cat.name;
                             return (
                                 <button 
                                    key={cat.name}
                                    onClick={() => setSelectedCategory(cat.name)}
                                    className="flex flex-col items-center gap-2 min-w-[70px] group"
                                 >
                                     <div className={`
                                        w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                                        ${isSelected ? 'bg-red-600 shadow-lg shadow-red-200 scale-105' : 'bg-gray-50 hover:bg-gray-100 group-hover:scale-105'}
                                     `}>
                                         <Icon className={`w-8 h-8 ${isSelected ? 'text-white' : 'text-gray-400'}`} strokeWidth={1.5} />
                                     </div>
                                     <span className={`text-[10px] font-bold ${isSelected ? 'text-red-600' : 'text-gray-500'}`}>{cat.name}</span>
                                 </button>
                             )
                         })}
                     </div>
                 </div>
             </div>

             {/* Content Body */}
             <div className="p-4 max-w-3xl mx-auto space-y-8 mt-4">
                 
                 {/* Banners Grid (FUNCTIONAL FILTERS) */}
                 {!searchTerm && selectedCategory === 'Tudo' && (
                    <div className="grid grid-cols-2 gap-3">
                        <button 
                            onClick={() => setSpecialFilter(specialFilter === 'free' ? 'none' : 'free')}
                            className={`
                                rounded-2xl p-4 text-white h-32 relative overflow-hidden shadow-lg flex flex-col justify-end group cursor-pointer transition-transform transform active:scale-95 text-left border-4
                                ${specialFilter === 'free' ? 'border-white/50 bg-gradient-to-br from-green-600 to-teal-600' : 'border-transparent bg-gradient-to-br from-green-500 to-teal-500 hover:scale-[1.02]'}
                            `}
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
                                <Tag className="w-24 h-24" />
                            </div>
                            <span className="bg-white/20 w-fit px-2 py-1 rounded text-[10px] font-bold mb-1 backdrop-blur-sm flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" /> Ver Lojas
                            </span>
                            <h3 className="font-bold text-lg leading-tight">Entrega Grátis</h3>
                        </button>

                        <button 
                            onClick={() => setSpecialFilter(specialFilter === 'fast' ? 'none' : 'fast')}
                            className={`
                                rounded-2xl p-4 text-white h-32 relative overflow-hidden shadow-lg flex flex-col justify-end group cursor-pointer transition-transform transform active:scale-95 text-left border-4
                                ${specialFilter === 'fast' ? 'border-white/50 bg-gradient-to-br from-orange-600 to-red-600' : 'border-transparent bg-gradient-to-br from-orange-500 to-red-500 hover:scale-[1.02]'}
                            `}
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
                                <Zap className="w-24 h-24" />
                            </div>
                            <span className="bg-white/20 w-fit px-2 py-1 rounded text-[10px] font-bold mb-1 backdrop-blur-sm flex items-center gap-1">
                                <Bike className="w-3 h-3" /> Raio Curto
                            </span>
                            <h3 className="font-bold text-lg leading-tight">Entrega Rápida</h3>
                        </button>
                    </div>
                 )}

                 {/* Restaurant List */}
                 <div>
                     <h2 className="font-bold text-lg text-gray-800 mb-4 flex items-center gap-2">
                         <Store className="w-5 h-5 text-gray-400" />
                         {searchTerm ? 'Resultados da Busca' : 
                          specialFilter === 'free' ? 'Lojas com Entrega Grátis' :
                          specialFilter === 'fast' ? 'Lojas com Entrega Rápida (<5km)' :
                          'Lojas Próximas'
                         }
                         {specialFilter !== 'none' && (
                             <button onClick={() => setSpecialFilter('none')} className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600 hover:bg-gray-300 ml-2">
                                 Limpar Filtro
                             </button>
                         )}
                     </h2>
                     
                     {filteredCompanies.length === 0 && (
                         <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 shadow-sm">
                             <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Search className="w-8 h-8 text-gray-300" />
                             </div>
                             <h3 className="font-bold text-gray-900">Nenhum resultado</h3>
                             <p className="text-gray-500 text-sm mt-1">Tente mudar o filtro ou buscar outro termo.</p>
                         </div>
                     )}

                     <div className="space-y-4">
                        {filteredCompanies.map(c => (
                            <div 
                                key={c.id} 
                                onClick={() => setSelectedCompany(c)} 
                                className="bg-white p-4 rounded-2xl border border-gray-100 flex gap-4 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                            >
                                <div className="relative">
                                    <img src={c.logo} className="w-24 h-24 rounded-xl object-cover bg-gray-100 group-hover:scale-105 transition-transform duration-500"/>
                                    {c.deliveryFeeCalc === 0 && (
                                        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
                                            GRÁTIS
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 flex flex-col justify-between py-1">
                                    <div>
                                        <div className="flex justify-between items-start">
                                            <h3 className="font-bold text-gray-900 text-lg group-hover:text-red-600 transition-colors">{c.name}</h3>
                                            <div className="flex items-center gap-1 bg-yellow-50 px-1.5 py-0.5 rounded text-xs font-bold text-yellow-700">
                                                <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" /> 4.8
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                                            <span className="font-medium">{c.category}</span>
                                            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                            <span>{c.distanceCalc.toFixed(1)} km</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs">
                                        <div className="flex items-center gap-1 text-gray-500">
                                            <Clock className="w-3 h-3" /> 30-45 min
                                        </div>
                                        <div className={`font-bold ${c.deliveryFeeCalc === 0 ? 'text-green-600' : 'text-gray-500'}`}>
                                            {c.deliveryFeeCalc === 0 ? 'Entrega Grátis' : `R$ ${c.deliveryFeeCalc.toFixed(2)}`}
                                        </div>
                                    </div>
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
              <div className="bg-white p-4 border-b border-gray-200 sticky top-0 z-10">
                  <h1 className="text-xl font-bold">Meus Pedidos</h1>
              </div>
              <div className="p-4 space-y-4">
                  {myOrders.length === 0 && <div className="text-center text-gray-400 mt-10">Você ainda não fez pedidos.</div>}
                  {myOrders.map(order => (
                      <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                          <div className="flex justify-between items-start mb-3">
                              <h3 className="font-bold text-gray-900">{order.companyName}</h3>
                              <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase
                                ${order.status === 'delivered' ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}
                              `}>
                                  {order.status === 'delivered' ? 'Concluído' : 'Em Andamento'}
                              </span>
                          </div>
                          
                          {/* SHOW PICKUP ADDRESS IF APPLICABLE */}
                          {order.deliveryMethod === 'pickup' && (
                              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 mb-3 text-sm">
                                  <p className="font-bold text-orange-800 flex items-center gap-1 mb-1"><Store className="w-4 h-4"/> Retirar em:</p>
                                  <p className="text-orange-700">{order.pickupAddress?.street}, {order.pickupAddress?.number} - {order.pickupAddress?.neighborhood}</p>
                              </div>
                          )}

                          <div className="space-y-1 mb-4">
                              {order.items.map((i, idx) => (
                                  <p key={idx} className="text-sm text-gray-600">{i.quantity}x {i.productName}</p>
                              ))}
                          </div>
                          <div className="flex justify-between items-center border-t border-gray-50 pt-3">
                              <div>
                                  <span className="font-bold text-sm block">Total: R$ {order.total.toFixed(2)}</span>
                                  <span className="text-xs text-gray-500">{order.paymentMethod === 'cash' ? 'Pagamento em Dinheiro' : 'Pagamento Online'}</span>
                              </div>
                              {/* CHAT ENTRY POINT */}
                              <button 
                                onClick={() => openChat(order.id)}
                                className="text-red-600 font-bold text-sm flex items-center gap-1 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100"
                              >
                                  <MessageCircle className="w-4 h-4" /> Chat com Loja
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      );
  };

  const renderProfile = () => (
    <div className="pb-24 bg-gray-50 min-h-screen">
        <div className="bg-white p-6 border-b border-gray-100 flex items-center gap-4">
             <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-xl font-bold text-gray-600">
                 {user.name.charAt(0)}
             </div>
             <div>
                 <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
                 <p className="text-sm text-gray-500">{user.email}</p>
             </div>
        </div>
        
        <div className="p-4 space-y-4">
             {/* Wallet */}
             <button onClick={() => setSubView('wallet')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50">
                 <div className="flex items-center gap-3">
                     <div className="bg-orange-100 p-2 rounded-lg text-orange-600"><Wallet className="w-5 h-5"/></div>
                     <span className="font-bold text-gray-700">Carteira</span>
                 </div>
                 <ChevronRight className="w-5 h-5 text-gray-300"/>
             </button>

             {/* Addresses */}
             <button onClick={() => setSubView('addresses')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50">
                 <div className="flex items-center gap-3">
                     <div className="bg-red-100 p-2 rounded-lg text-red-600"><MapPin className="w-5 h-5"/></div>
                     <span className="font-bold text-gray-700">Endereços</span>
                 </div>
                 <ChevronRight className="w-5 h-5 text-gray-300"/>
             </button>

             {/* Settings */}
             <button onClick={() => setSubView('settings')} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-gray-50">
                 <div className="flex items-center gap-3">
                     <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><Settings className="w-5 h-5"/></div>
                     <span className="font-bold text-gray-700">Meus Dados</span>
                 </div>
                 <ChevronRight className="w-5 h-5 text-gray-300"/>
             </button>
             
             {/* Logout */}
             <button onClick={onLogout} className="w-full bg-white p-4 rounded-xl border border-gray-100 flex items-center justify-between hover:bg-red-50 group mt-4">
                 <div className="flex items-center gap-3">
                     <div className="bg-gray-100 p-2 rounded-lg text-gray-500 group-hover:bg-red-200 group-hover:text-red-700 transition-colors"><LogOut className="w-5 h-5"/></div>
                     <span className="font-bold text-gray-500 group-hover:text-red-600 transition-colors">Sair da Conta</span>
                 </div>
             </button>
        </div>
    </div>
  );

  const renderSubView = () => {
    if (subView === 'wallet') {
        return (
            <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto animate-slide-up">
                <div className="bg-white p-4 border-b border-gray-100 sticky top-0 flex items-center gap-3">
                    <button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
                    <h2 className="font-bold text-lg">Carteira</h2>
                </div>
                <div className="p-4 space-y-4">
                    <div className="bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl p-6 text-white shadow-lg">
                        <p className="text-xs opacity-70 mb-1">Saldo em Carteira</p>
                        <h3 className="text-3xl font-bold">R$ 0,00</h3>
                        <p className="text-xs mt-4 opacity-70">Adicione saldo via PIX para descontos exclusivos.</p>
                    </div>

                    <div className="flex justify-between items-center mt-6">
                        <h3 className="font-bold text-gray-700">Meus Cartões</h3>
                        <button onClick={() => setIsAddingCard(true)} className="text-xs text-red-600 font-bold bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100">+ Adicionar</button>
                    </div>

                    {(user.savedCards || []).map((card, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <CreditCard className="w-6 h-6 text-gray-400"/>
                                <div>
                                    <p className="font-bold text-gray-800">•••• {card.last4}</p>
                                    <p className="text-xs text-gray-500 uppercase">{card.brand}</p>
                                </div>
                            </div>
                            <button onClick={() => onRemoveCard(idx)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    ))}
                    
                    {isAddingCard && (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 animate-fade-in">
                            <input placeholder="Número do Cartão" className="w-full border rounded-lg px-3 py-2" value={newCardForm.number || ''} onChange={e => setNewCardForm({...newCardForm, number: e.target.value})} maxLength={16}/>
                            <div className="flex gap-2">
                                <input placeholder="MM/AA" className="flex-1 border rounded-lg px-3 py-2" value={newCardForm.expiry || ''} onChange={e => setNewCardForm({...newCardForm, expiry: e.target.value})} maxLength={5}/>
                                <input placeholder="CVV" className="w-24 border rounded-lg px-3 py-2" value={newCardForm.cvv || ''} onChange={e => setNewCardForm({...newCardForm, cvv: e.target.value})} maxLength={3}/>
                            </div>
                            <input placeholder="Nome no Cartão" className="w-full border rounded-lg px-3 py-2" value={newCardForm.holderName || ''} onChange={e => setNewCardForm({...newCardForm, holderName: e.target.value})}/>
                            <div className="flex gap-2 justify-end">
                                <button onClick={() => setIsAddingCard(false)} className="px-4 py-2 text-gray-500 text-sm">Cancelar</button>
                                <button onClick={confirmAddCard} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm">Salvar Cartão</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    if (subView === 'addresses') {
        return (
            <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto animate-slide-up">
                <div className="bg-white p-4 border-b border-gray-100 sticky top-0 flex items-center gap-3">
                    <button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
                    <h2 className="font-bold text-lg">Meus Endereços</h2>
                </div>
                <div className="p-4 space-y-4">
                    {(user.savedAddresses || []).map((addr, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 flex justify-between items-center group cursor-pointer" onClick={() => handleSelectAddress(addr)}>
                            <div className="flex items-center gap-3">
                                <div className="bg-gray-100 p-2 rounded-full"><MapPin className="w-5 h-5 text-gray-500"/></div>
                                <div>
                                    <p className="font-bold text-gray-800">{addr.name || 'Endereço'}</p>
                                    <p className="text-xs text-gray-500">{addr.street}, {addr.number}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {user.address?.street === addr.street && user.address?.number === addr.number && (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Ativo</span>
                                )}
                                <button onClick={(e) => {e.stopPropagation(); onRemoveAddress(idx);}} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4"/></button>
                            </div>
                        </div>
                    ))}

                    {!isAddingAddress ? (
                        <button onClick={() => setIsAddingAddress(true)} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 font-bold hover:border-red-400 hover:text-red-500 transition-colors flex items-center justify-center gap-2">
                            <Plus className="w-5 h-5"/> Adicionar Novo Endereço
                        </button>
                    ) : (
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 animate-fade-in">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        placeholder="CEP" 
                                        className="w-full border rounded-lg px-3 py-2" 
                                        value={newAddressForm.zipCode || ''} 
                                        onChange={handleCepChange}
                                        maxLength={8}
                                    />
                                    {loadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-red-500"/>}
                                </div>
                                <button onClick={() => setShowMapModal(true)} className="px-3 bg-red-50 text-red-600 rounded-lg border border-red-100 text-xs font-bold flex items-center gap-1">
                                    <MapPin className="w-4 h-4"/> Mapa
                                </button>
                                <button onClick={handleGetCurrentLocation} className="px-3 bg-gray-100 text-gray-600 rounded-lg border border-gray-200" title="Usar GPS">
                                    {loadingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Crosshair className="w-4 h-4"/>}
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <input placeholder="Rua" className="flex-1 border rounded-lg px-3 py-2" value={newAddressForm.street || ''} onChange={e => setNewAddressForm({...newAddressForm, street: e.target.value})}/>
                                <input placeholder="Nº" className="w-20 border rounded-lg px-3 py-2" value={newAddressForm.number || ''} onChange={e => setNewAddressForm({...newAddressForm, number: e.target.value})}/>
                            </div>
                            <input placeholder="Bairro" className="w-full border rounded-lg px-3 py-2" value={newAddressForm.neighborhood || ''} onChange={e => setNewAddressForm({...newAddressForm, neighborhood: e.target.value})}/>
                            <input placeholder="Cidade" className="w-full border rounded-lg px-3 py-2" value={newAddressForm.city || ''} onChange={e => setNewAddressForm({...newAddressForm, city: e.target.value})}/>
                            <input placeholder="Apelido (Ex: Casa, Trabalho)" className="w-full border rounded-lg px-3 py-2" value={newAddressForm.name || ''} onChange={e => setNewAddressForm({...newAddressForm, name: e.target.value})}/>
                            
                            {newAddressForm.lat && newAddressForm.lat !== 0 && (
                                <div className="text-[10px] text-green-600 flex items-center gap-1 bg-green-50 p-2 rounded">
                                    <CheckCircle className="w-3 h-3"/> Localização GPS confirmada.
                                </div>
                            )}

                            <div className="flex gap-2 justify-end pt-2">
                                <button onClick={() => setIsAddingAddress(false)} className="px-4 py-2 text-gray-500 text-sm">Cancelar</button>
                                <button onClick={confirmAddAddress} className="px-4 py-2 bg-red-600 text-white rounded-lg font-bold text-sm">Salvar Endereço</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (subView === 'settings') {
        return (
            <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto animate-slide-up">
                <div className="bg-white p-4 border-b border-gray-100 sticky top-0 flex items-center gap-3">
                    <button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
                    <h2 className="font-bold text-lg">Meus Dados</h2>
                </div>
                <div className="p-6">
                    <form onSubmit={handleSaveSettings} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nome Completo</label>
                            <input name="name" defaultValue={user.name} className="w-full border rounded-xl px-4 py-3 mt-1 bg-white"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                            <input name="email" defaultValue={user.email} className="w-full border rounded-xl px-4 py-3 mt-1 bg-white"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Celular</label>
                            <input name="phone" defaultValue={user.phone} className="w-full border rounded-xl px-4 py-3 mt-1 bg-white"/>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Senha</label>
                            <input name="password" type="password" defaultValue={user.password} className="w-full border rounded-xl px-4 py-3 mt-1 bg-white"/>
                        </div>
                        <button type="submit" className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl mt-4">Salvar Alterações</button>
                    </form>
                </div>
            </div>
        );
    }

    if (subView === 'chat' && chatOrderId) {
        return (
             <div className="fixed inset-0 bg-gray-50 z-[60] flex flex-col animate-slide-up">
                 <div className="bg-white p-4 border-b border-gray-100 flex items-center gap-3 shadow-sm z-10">
                    <button onClick={() => setSubView('none')} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5"/></button>
                    <div className="flex-1">
                        <h2 className="font-bold text-lg leading-tight">Chat com a Loja</h2>
                        <p className="text-xs text-gray-500">Pedido #{chatOrderId.slice(-4)}</p>
                    </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#E5DDD5]">
                     {(chats[chatOrderId] || []).map(msg => (
                         <div key={msg.id} className={`flex ${msg.senderRole === 'client' ? 'justify-end' : 'justify-start'}`}>
                             <div className={`max-w-[80%] p-3 rounded-xl text-sm shadow-sm ${msg.senderRole === 'client' ? 'bg-[#DCF8C6] text-gray-900 rounded-tr-none' : 'bg-white text-gray-900 rounded-tl-none'}`}>
                                 {msg.text}
                                 <span className="block text-[10px] text-gray-500 text-right mt-1 opacity-70">
                                     {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                 </span>
                             </div>
                         </div>
                     ))}
                     <div ref={messagesEndRef} />
                 </div>
                 <div className="p-3 bg-white border-t border-gray-200 flex gap-2">
                     <input 
                        value={chatInput} onChange={e => setChatInput(e.target.value)}
                        placeholder="Digite sua mensagem..."
                        className="flex-1 bg-gray-100 rounded-full px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                     />
                     <button onClick={handleSendMessage} className="bg-[#00897B] text-white p-3 rounded-full hover:bg-[#00756A] shadow-md transition-colors"><Send className="w-5 h-5"/></button>
                 </div>
             </div>
        );
    }

    return null;
  };

  // --- MAIN RENDER ---
  return (
    <div className="bg-gray-50 min-h-screen">
       {subView !== 'none' && renderSubView()}
       
       {/* Modals for Product/Cart are here (omitted for brevity, assume existing structure) */}
       {isCartOpen && (
           <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
               {/* Cart UI */}
               <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl animate-slide-up flex flex-col max-h-[90vh]">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="font-bold text-xl">Sacola</h2>
                        <button onClick={() => setIsCartOpen(false)}><X/></button>
                    </div>
                    
                    {/* Delivery Method Toggle */}
                    <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                        <button 
                            onClick={() => setDeliveryMethod('delivery')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${deliveryMethod === 'delivery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                        >
                            Entrega
                        </button>
                        <button 
                            onClick={() => setDeliveryMethod('pickup')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${deliveryMethod === 'pickup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                        >
                            Retirada (Sem Taxa)
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto mb-4">
                        {cart.map((i, idx) => (
                            <div key={idx} className="flex justify-between border-b py-2">
                                <div>{i.quantity}x {i.product.name}</div>
                                <div className="flex gap-2 font-bold">R$ {i.finalPrice.toFixed(2)} <Trash2 onClick={() => removeFromCart(idx)} className="w-4 h-4 text-red-500"/></div>
                            </div>
                        ))}
                    </div>

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
                        <div className="flex justify-between">
                            <span>Taxa de Serviço ({serviceFeePercentage}%)</span>
                            <span>R$ {serviceFeeValue.toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="mt-4 border-t pt-4">
                        <p className="text-xs font-bold text-gray-500 mb-2 uppercase">Forma de Pagamento</p>
                        <div className="flex gap-2 mb-4">
                            <button 
                                onClick={() => setPaymentMethod('cash')}
                                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${paymentMethod === 'cash' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                            >
                                <DollarSign className="w-5 h-5 mb-1"/>
                                <span className="text-xs font-bold">Dinheiro</span>
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('card')}
                                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                            >
                                <CreditCard className="w-5 h-5 mb-1"/>
                                <span className="text-xs font-bold">Cartão</span>
                            </button>
                            <button 
                                onClick={() => setPaymentMethod('pix')}
                                className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${paymentMethod === 'pix' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100 bg-gray-50 text-gray-400'}`}
                            >
                                <QrCode className="w-5 h-5 mb-1"/>
                                <span className="text-xs font-bold">Pix</span>
                            </button>
                        </div>

                        {paymentMethod === 'cash' && (
                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 mb-4 animate-fade-in">
                                <label className="text-xs font-bold text-yellow-800 block mb-1">Troco para quanto?</label>
                                <div className="flex items-center bg-white border border-yellow-300 rounded-lg px-3">
                                    <span className="text-gray-500 mr-2">R$</span>
                                    <input 
                                        type="number" 
                                        placeholder="Ex: 50.00" 
                                        value={changeAmount}
                                        onChange={e => setChangeAmount(e.target.value)}
                                        className="w-full py-2 outline-none text-gray-800 font-bold"
                                    />
                                </div>
                                <p className="text-[10px] text-yellow-700 mt-1">Deixe em branco se não precisar de troco.</p>
                            </div>
                        )}
                        
                        {(paymentMethod === 'card' || paymentMethod === 'pix') && (
                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-4 flex items-center gap-2 text-blue-800 text-xs">
                                <ShieldIcon className="w-4 h-4" /> Pagamento seguro via Mercado Pago
                            </div>
                        )}
                    </div>

                    <div className="mt-2 flex justify-between font-bold text-xl text-gray-900 border-t pt-2">
                        <span>Total</span>
                        <span>R$ {finalTotal.toFixed(2)}</span>
                    </div>
                    
                    <button 
                        onClick={handleFinalizeOrder} 
                        className="w-full bg-red-600 text-white font-bold py-3 rounded-xl mt-4 hover:bg-red-700 transition-colors"
                    >
                        {paymentMethod === 'cash' ? 'Finalizar Pedido' : 'Ir para Pagamento'}
                    </button>
               </div>
           </div>
       )}
       {customizingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-white w-full max-w-md rounded-2xl p-6 relative">
                  <button onClick={() => setCustomizingProduct(null)} className="absolute top-4 right-4"><X/></button>
                  <h2 className="font-bold text-xl mb-4">{customizingProduct.name}</h2>
                  {/* Groups Logic */}
                  {customizingProduct.groups.map(g => (
                      <div key={g.id} className="mb-4">
                          <h3 className="font-bold">{g.name}</h3>
                          {g.options.map(o => (
                              <div key={o.id} onClick={() => {
                                  // Simplified toggle logic for brevity
                                  setSelections(prev => {
                                      const curr = prev[g.id] || [];
                                      const exists = curr.find(x => x.id === o.id);
                                      if (exists) return { ...prev, [g.id]: curr.filter(x => x.id !== o.id) };
                                      if (curr.length >= g.max && g.max === 1) return { ...prev, [g.id]: [o] };
                                      if (curr.length >= g.max) return prev;
                                      return { ...prev, [g.id]: [...curr, o] };
                                  });
                              }} className={`p-2 border rounded mt-1 ${(selections[g.id]||[]).some(s=>s.id===o.id) ? 'bg-red-50 border-red-500':''}`}>{o.name} +R${o.price}</div>
                          ))}
                      </div>
                  ))}
                  <button onClick={() => {
                      const flatOptions: any[] = [];
                      customizingProduct.groups.forEach(g => (selections[g.id] || []).forEach(o => flatOptions.push({groupName: g.name, optionName: o.name, price: o.price})));
                      addToCart(customizingProduct, currentPrice, flatOptions);
                      setCustomizingProduct(null);
                  }} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl mt-4">Adicionar R$ {currentPrice.toFixed(2)}</button>
              </div>
          </div>
       )}


       {/* CONTENT AREA */}
       {activeTab === 'home' && renderHome()}
       {activeTab === 'orders' && renderOrders()}
       {activeTab === 'profile' && renderProfile()}

       {/* FLOATING CART BUTTON */}
       {cart.length > 0 && !isCartOpen && (
           <div className="fixed bottom-20 left-0 right-0 px-4 z-20 flex justify-center animate-fade-in-up pointer-events-none">
               <button 
                   onClick={() => setIsCartOpen(true)}
                   className="bg-red-600 text-white w-full max-w-md shadow-xl shadow-red-200/50 rounded-xl p-3 flex justify-between items-center font-bold pointer-events-auto transform active:scale-95 transition-all"
               >
                   <div className="flex items-center gap-3">
                       <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">
                           {cart.reduce((acc, i) => acc + i.quantity, 0)}
                       </div>
                       <span className="text-sm">Ver Sacola</span>
                   </div>
                   <div className="flex items-center gap-2">
                       <span className="text-sm">R$ {productTotal.toFixed(2)}</span>
                       <ShoppingBag className="w-5 h-5 fill-white/20" />
                   </div>
               </button>
           </div>
       )}

       {/* BOTTOM NAVIGATION */}
       <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-2 px-6 flex justify-between items-center z-30">
            <button onClick={() => { setActiveTab('home'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-red-600' : 'text-gray-400'}`}>
                <Home className={`w-6 h-6 ${activeTab === 'home' ? 'fill-current' : ''}`} />
                <span className="text-[10px] font-bold">Início</span>
            </button>
            <button onClick={() => { setActiveTab('orders'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'orders' ? 'text-red-600' : 'text-gray-400'}`}>
                <FileText className={`w-6 h-6 ${activeTab === 'orders' ? 'fill-current' : ''}`} />
                <span className="text-[10px] font-bold">Pedidos</span>
            </button>
            <button onClick={() => { setActiveTab('profile'); setSubView('none'); }} className={`flex flex-col items-center gap-1 ${activeTab === 'profile' ? 'text-red-600' : 'text-gray-400'}`}>
                <UserIcon className={`w-6 h-6 ${activeTab === 'profile' ? 'fill-current' : ''}`} />
                <span className="text-[10px] font-bold">Perfil</span>
            </button>
       </div>
    </div>
  );
};

// Helper Icon for visual only
const ShieldIcon = ({className}:{className?:string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
);

export default ClientView;