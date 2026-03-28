import React, { useState, useMemo } from 'react';
import { Product, Company, Order, ProductOption } from '../types';
import { Search, ShoppingCart, Plus, Minus, Trash2, X, User, Phone, CreditCard, Banknote, Store, ChevronRight } from 'lucide-react';

interface POSViewProps {
    products: Product[];
    company: Company;
    onPlaceOrder: (order: any) => void;
}

interface CartItem {
    id: string;
    product: Product;
    quantity: number;
    selectedOptions: any[]; // Usando any[] localmente para acomodar as propriedades estendidas do grupo
    finalPrice: number;
    displayName: string;
}

const POSView: React.FC<POSViewProps> = ({ products, company, onPlaceOrder }) => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'delivery'>('pickup');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card'>('cash');
    const [changeFor, setChangeFor] = useState<number | ''>('');

    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [currentOptions, setCurrentOptions] = useState<any[]>([]); // Armazena a opção + configs do grupo

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];
    
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [products, searchQuery, selectedCategory]);

    const subtotal = cart.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0);
    const total = subtotal;

    // --- NOVA LÓGICA CORE DE CÁLCULO POR GRUPO ---
    const processGroupedOptions = (options: any[]) => {
        let optionsTotal = 0;
        let formattedOptions: any[] = [];

        // Agrupa as opções pelo índice do grupo
        const optionsByGroup = options.reduce((acc, opt) => {
            const key = opt.groupIndex !== undefined ? opt.groupIndex : 'default';
            if (!acc[key]) acc[key] = [];
            acc[key].push(opt);
            return acc;
        }, {} as Record<string, any[]>);

        // Calcula o valor de cada grupo separadamente
        Object.values(optionsByGroup).forEach((groupOptions: any[]) => {
            // Verifica se este grupo específico tem a regra de dividir preço
            const isDivided = groupOptions[0]?.dividePrice;
            const numItems = groupOptions.length;

            if (isDivided && numItems > 0) {
                // Rachar o valor apenas deste grupo
                const groupSum = groupOptions.reduce((sum, o) => sum + (o.price || 0), 0);
                optionsTotal += (groupSum / numItems);
                
                const fraction = numItems > 1 ? `1/${numItems}` : '';
                
                groupOptions.forEach(o => {
                    formattedOptions.push({
                        ...o,
                        name: `${fraction} ${o.name}`.trim(),
                        price: (o.price || 0) / numItems
                    });
                });
            } else {
                // Grupo normal (ex: Borda, Bebida), soma integral
                const groupSum = groupOptions.reduce((sum, o) => sum + (o.price || 0), 0);
                optionsTotal += groupSum;
                groupOptions.forEach(o => formattedOptions.push(o));
            }
        });

        return { optionsTotal, formattedOptions };
    };

    const handleProductClick = (product: Product) => {
        if (product.groups && product.groups.length > 0) {
            setSelectedProduct(product);
            setCurrentOptions([]);
        } else {
            addToCart(product, []);
        }
    };

    const addToCart = (product: Product, options: any[]) => {
        // Passa as opções para a nova calculadora inteligente
        const { optionsTotal, formattedOptions } = processGroupedOptions(options);

        const finalPrice = product.price + optionsTotal;

        const newItem: CartItem = {
            id: Date.now().toString(),
            product,
            quantity: 1,
            selectedOptions: formattedOptions, 
            finalPrice,
            displayName: product.name
        };

        setCart(prev => [...prev, newItem]);
        setSelectedProduct(null);
        setCurrentOptions([]);
    };

    const updateQuantity = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newQ = Math.max(1, item.quantity + delta);
                return { ...item, quantity: newQ };
            }
            return item;
        }));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id));
        if (cart.length === 1) setIsMobileCartOpen(false);
    };

    // --- NOVA LÓGICA DE FORMATAÇÃO DE TELEFONE ---
    const formatPhoneNumber = (phone: string) => {
        if (!phone) return '';
        
        // Remove tudo que não for dígito
        let cleaned = phone.replace(/\D/g, '');
        
        if (cleaned.length === 0) return '';
        
        // Se já está no formato internacional (ex: 5581988887777)
        if (cleaned.length >= 12 && cleaned.startsWith('55')) {
            return cleaned;
        }
        
        // Se tem 11 dígitos (ex: 81988887777) ou 10 dígitos, assume que falta o 55
        if (cleaned.length === 11 || cleaned.length === 10) {
            return '55' + cleaned;
        }
        
        // Se tem 9 ou 8 dígitos (digitou só o número), adiciona 55 + DDD 81
        if (cleaned.length === 9 || cleaned.length === 8) {
            return '5581' + cleaned;
        }
        
        return cleaned; // Caso caia em um formato muito atípico, devolve o que foi limpo
    };

    const handleCheckout = () => {
        if (cart.length === 0) return alert("O carrinho está vazio!");

        const finalCustomerName = customerName.trim() !== '' ? customerName.trim() : 'Cliente Balcão';
        
        // Aplica a formatação no telefone digitado
        const formattedPhone = formatPhoneNumber(customerPhone);

        const newOrder = {
            id: `ord-${Date.now()}`,
            companyId: company.id,
            companyName: company.name,
            customerId: 'pos-local',
            customerName: finalCustomerName,
            customerPhone: formattedPhone || 'Não informado', // Usa o telefone limpo e formatado
            items: cart.map(item => ({
                id: item.id,
                productId: item.product.id,
                name: item.displayName, 
                productName: item.displayName, 
                quantity: item.quantity,
                price: item.finalPrice,
                options: item.selectedOptions,
                selectedOptions: item.selectedOptions,
                complements: item.selectedOptions
            })),
            subtotal,
            deliveryFee: 0,
            serviceFee: 0,
            total,
            deliveryMethod,
            paymentMethod,
            changeFor: changeFor ? Number(changeFor) : undefined,
            status: 'pending',
            paymentStatus: 'pending',
            timestamp: new Date().toISOString(),
            origin: 'pos' 
        };

        onPlaceOrder(newOrder);
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setChangeFor('');
        setIsMobileCartOpen(false);
    };

    const getModalCurrentPrice = () => {
        if (!selectedProduct) return 0;
        // Usa a mesma calculadora para o preview do modal bater centavo por centavo com o carrinho
        const { optionsTotal } = processGroupedOptions(currentOptions);
        return selectedProduct.price + optionsTotal;
    };

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)] bg-gray-100 relative overflow-hidden">
            
            {/* LADO ESQUERDO: PRODUTOS */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="bg-white p-4 border-b border-gray-200 shadow-sm z-10">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3.5 w-5 h-5 text-gray-400" />
                            <input 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Buscar produto..."
                                className="w-full bg-gray-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-red-500 transition-all"
                            />
                        </div>
                        <div className="overflow-x-auto pb-1 flex items-center gap-2 no-scrollbar">
                            {categories.map(cat => (
                                <button 
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${selectedCategory === cat ? 'bg-gray-900 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar pb-24 md:pb-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                        {filteredProducts.map(product => (
                            <div 
                                key={product.id} 
                                onClick={() => handleProductClick(product)}
                                className={`bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer hover:shadow-md hover:border-red-200 transition-all active:scale-95 flex flex-col h-full ${!product.isAvailable ? 'opacity-50 grayscale' : ''}`}
                            >
                                <div className="h-24 sm:h-32 bg-gray-100 relative">
                                    <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
                                    {!product.isAvailable && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                            <span className="text-white font-bold text-xs uppercase tracking-wider bg-red-600 px-2 py-1 rounded">Esgotado</span>
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 flex-1 flex flex-col justify-between">
                                    <h3 className="font-bold text-gray-800 text-xs sm:text-sm line-clamp-2 leading-tight">{product.name}</h3>
                                    <div className="mt-2 flex justify-between items-center">
                                        <span className="font-black text-gray-900 text-sm sm:text-base">R$ {product.price.toFixed(2)}</span>
                                        <div className="w-6 h-6 rounded-full bg-red-50 text-red-600 flex items-center justify-center"><Plus className="w-4 h-4"/></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* LADO DIREITO: CARRINHO DESKTOP */}
            <div className="hidden md:flex w-96 bg-white border-l border-gray-200 shadow-xl z-20 flex-col h-full">
                <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 shrink-0">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <ShoppingCart className="w-5 h-5 text-red-600" /> Resumo do Pedido
                    </h2>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {cart.length === 0 ? (
                        <div className="text-center text-gray-400 mt-10">
                            <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>Nenhum item adicionado</p>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-gray-800 text-sm leading-tight pr-2">{item.displayName}</span>
                                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 p-1">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                {item.selectedOptions.length > 0 && (
                                    <div className="text-[10px] text-gray-500 mb-2 leading-tight">
                                        {item.selectedOptions.map(o => `+ ${o.name}`).join(', ')}
                                    </div>
                                )}
                                
                                <div className="flex justify-between items-center mt-2">
                                    <span className="font-bold text-red-600 text-sm">R$ {(item.finalPrice * item.quantity).toFixed(2)}</span>
                                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-1">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded"><Minus className="w-3 h-3" /></button>
                                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded"><Plus className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}

                    {cart.length > 0 && (
                        <>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3 mt-4">
                                <h3 className="font-bold text-gray-800 text-sm mb-2 uppercase tracking-wide">Dados do Cliente</h3>
                                <div className="relative">
                                    <User className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                    <input 
                                        value={customerName} 
                                        onChange={e => setCustomerName(e.target.value)}
                                        placeholder="Nome (Opcional)" 
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500"
                                    />
                                </div>
                                <div className="relative">
                                    <Phone className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                    <input 
                                        value={customerPhone} 
                                        onChange={e => setCustomerPhone(e.target.value)}
                                        placeholder="WhatsApp (Opcional)" 
                                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500"
                                    />
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                                <div>
                                    <label className="font-bold text-gray-800 text-xs uppercase tracking-wide mb-2 block">Retirada / Entrega</label>
                                    <div className="flex bg-gray-100 rounded-lg p-1">
                                        <button onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex justify-center items-center gap-1 ${deliveryMethod === 'pickup' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Store className="w-3 h-3"/> Balcão</button>
                                        <button onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex justify-center items-center gap-1 ${deliveryMethod === 'delivery' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Entrega</button>
                                    </div>
                                </div>

                                <div>
                                    <label className="font-bold text-gray-800 text-xs uppercase tracking-wide mb-2 block">Método de Pagamento</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => setPaymentMethod('cash')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'cash' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}><Banknote className="w-4 h-4"/> Dinheiro</button>
                                        <button onClick={() => setPaymentMethod('pix')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'pix' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>PIX</button>
                                        <button onClick={() => setPaymentMethod('card')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}><CreditCard className="w-4 h-4"/> Cartão</button>
                                    </div>
                                    
                                    {paymentMethod === 'cash' && (
                                        <div className="mt-3">
                                            <input type="number" value={changeFor} onChange={e => setChangeFor(e.target.value)} placeholder="Troco para? (Ex: 100)" className="w-full px-3 py-2 bg-gray-50 border border-green-200 rounded-lg text-sm outline-none focus:border-green-500"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0">
                    <div className="flex justify-between items-center mb-4">
                        <span className="text-sm font-bold text-gray-500 uppercase">Total a Cobrar</span>
                        <span className="text-2xl font-black text-gray-900">R$ {total.toFixed(2)}</span>
                    </div>
                    <button onClick={handleCheckout} disabled={cart.length === 0} className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${cart.length === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 hover:-translate-y-0.5'}`}>
                        Lançar Pedido <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* BARRA FLUTUANTE CARRINHO (MOBILE) */}
            {cart.length > 0 && (
                <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 pb-safe shadow-[0_-10px_20px_rgba(0,0,0,0.1)] z-30 animate-slide-up">
                    <button onClick={() => setIsMobileCartOpen(true)} className="w-full bg-red-600 text-white rounded-xl p-4 flex justify-between items-center font-bold shadow-lg shadow-red-200 active:scale-95 transition-transform">
                        <div className="flex items-center gap-2"><div className="bg-red-700 px-2 py-1 rounded text-sm">{cart.length}</div><span>Ver Carrinho</span></div>
                        <span>R$ {total.toFixed(2)}</span>
                    </button>
                </div>
            )}

            {/* MODAL CARRINHO FULLSCREEN MOBILE */}
            {isMobileCartOpen && (
                <div className="md:hidden fixed inset-0 z-50 bg-white flex flex-col animate-slide-up">
                    <div className="p-4 bg-gray-900 text-white flex justify-between items-center pb-safe-top pt-safe-top shrink-0">
                        <h2 className="font-bold text-lg">Seu Carrinho</h2>
                        <button onClick={() => setIsMobileCartOpen(false)} className="p-2 hover:bg-gray-800 rounded-full"><X className="w-6 h-6" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                        {cart.map(item => (
                            <div key={item.id} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-gray-800 text-sm leading-tight pr-2">{item.displayName}</span>
                                    <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                {item.selectedOptions.length > 0 && (
                                    <div className="text-[10px] text-gray-500 mb-2 leading-tight">
                                        {item.selectedOptions.map((o: any) => `+ ${o.name}`).join(', ')}
                                    </div>
                                )}
                                <div className="flex justify-between items-center mt-2">
                                    <span className="font-bold text-red-600 text-sm">R$ {(item.finalPrice * item.quantity).toFixed(2)}</span>
                                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-1">
                                        <button onClick={() => updateQuantity(item.id, -1)} className="p-1 hover:bg-white rounded"><Minus className="w-3 h-3" /></button>
                                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                                        <button onClick={() => updateQuantity(item.id, 1)} className="p-1 hover:bg-white rounded"><Plus className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-3 mt-4">
                            <h3 className="font-bold text-gray-800 text-sm mb-2 uppercase tracking-wide">Dados do Cliente</h3>
                            <div className="relative">
                                <User className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome (Opcional)" className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500"/>
                            </div>
                            <div className="relative">
                                <Phone className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                                <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="WhatsApp (Opcional)" className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-red-500"/>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 space-y-4">
                            <div>
                                <label className="font-bold text-gray-800 text-xs uppercase tracking-wide mb-2 block">Retirada / Entrega</label>
                                <div className="flex bg-gray-100 rounded-lg p-1">
                                    <button onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex justify-center items-center gap-1 ${deliveryMethod === 'pickup' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}><Store className="w-3 h-3"/> Balcão</button>
                                    <button onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex justify-center items-center gap-1 ${deliveryMethod === 'delivery' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>Entrega</button>
                                </div>
                            </div>
                            <div>
                                <label className="font-bold text-gray-800 text-xs uppercase tracking-wide mb-2 block">Método de Pagamento</label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button onClick={() => setPaymentMethod('cash')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'cash' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}><Banknote className="w-4 h-4"/> Dinheiro</button>
                                    <button onClick={() => setPaymentMethod('pix')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'pix' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>PIX</button>
                                    <button onClick={() => setPaymentMethod('card')} className={`py-2 flex flex-col items-center justify-center gap-1 border rounded-lg text-xs font-bold transition-all ${paymentMethod === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}><CreditCard className="w-4 h-4"/> Cartão</button>
                                </div>
                                {paymentMethod === 'cash' && (
                                    <div className="mt-3">
                                        <input type="number" value={changeFor} onChange={e => setChangeFor(e.target.value)} placeholder="Troco para? (Ex: 100)" className="w-full px-3 py-2 bg-gray-50 border border-green-200 rounded-lg text-sm outline-none focus:border-green-500"/>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] shrink-0 pb-safe">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-bold text-gray-500 uppercase">Total a Cobrar</span>
                            <span className="text-2xl font-black text-gray-900">R$ {total.toFixed(2)}</span>
                        </div>
                        <button onClick={handleCheckout} disabled={cart.length === 0} className={`w-full py-4 rounded-xl font-black text-lg flex items-center justify-center gap-2 transition-all ${cart.length === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 active:scale-95'}`}>
                            Lançar Pedido <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* MODAL DE COMPLEMENTOS (PRODUTO) */}
            {selectedProduct && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
                    <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up sm:animate-scale-in">
                        <div className="relative h-48 bg-gray-100 shrink-0">
                            <img src={selectedProduct.image} className="w-full h-full object-cover" />
                            <button onClick={() => setSelectedProduct(null)} className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 backdrop-blur-md">
                                <X className="w-5 h-5"/>
                            </button>
                        </div>
                        
                        <div className="p-5 border-b border-gray-100 shrink-0 bg-white">
                            <h2 className="text-xl font-black text-gray-900 leading-tight">{selectedProduct.name}</h2>
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{selectedProduct.description}</p>
                            <p className="text-lg font-bold text-red-600 mt-2">R$ {selectedProduct.price.toFixed(2)}</p>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 bg-gray-50 space-y-5">
                            {selectedProduct.groups?.map((group: any, idx) => (
                                <div key={idx} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                    <div className="bg-gray-100 px-4 py-3 border-b border-gray-200">
                                        <h4 className="font-bold text-gray-800 text-sm uppercase">{group.name}</h4>
                                        <p className="text-xs text-gray-500">Escolha até {group.max} opção(ões)</p>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {group.options.map((opt: any, oIdx: number) => {
                                            const isSelected = currentOptions.some(co => co.name === opt.name && co.groupIndex === idx);
                                            return (
                                                <label key={oIdx} className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${isSelected ? 'bg-red-50/50' : 'hover:bg-gray-50'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input 
                                                            type={group.max === 1 ? "radio" : "checkbox"}
                                                            name={`group-${idx}`}
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                const optionToSave = {
                                                                    name: opt.name, 
                                                                    optionName: opt.name,
                                                                    price: opt.price || 0,
                                                                    groupIndex: idx,
                                                                    groupName: group.name,
                                                                    dividePrice: group.dividePrice || false 
                                                                };

                                                                if (e.target.checked) {
                                                                    if (group.max === 1) {
                                                                        const filtered = currentOptions.filter(co => co.groupIndex !== idx);
                                                                        setCurrentOptions([...filtered, optionToSave]);
                                                                    } else {
                                                                        const currentInGroup = currentOptions.filter(co => co.groupIndex === idx);
                                                                        if (currentInGroup.length < group.max) {
                                                                            setCurrentOptions([...currentOptions, optionToSave]);
                                                                        }
                                                                    }
                                                                } else {
                                                                    setCurrentOptions(currentOptions.filter(co => !(co.name === opt.name && co.groupIndex === idx)));
                                                                }
                                                            }}
                                                            className={`w-5 h-5 text-red-600 border-gray-300 focus:ring-red-500 ${group.max === 1 ? 'rounded-full' : 'rounded'}`}
                                                        />
                                                        <span className="text-sm font-medium text-gray-800">{opt.name}</span>
                                                    </div>
                                                    {opt.price ? <span className="text-sm text-gray-500 font-medium">+ R$ {opt.price.toFixed(2)}</span> : <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Grátis</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-4 bg-white border-t border-gray-200 shadow-[0_-10px_20px_rgba(0,0,0,0.05)] pb-safe shrink-0">
                            <button 
                                onClick={() => addToCart(selectedProduct, currentOptions)}
                                className="w-full bg-red-600 text-white font-bold py-4 rounded-xl flex justify-between items-center px-6 hover:bg-red-700 active:scale-95 transition-all shadow-lg shadow-red-200"
                            >
                                <span>Adicionar Item</span>
                                <span>R$ {getModalCurrentPrice().toFixed(2)}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default POSView;
