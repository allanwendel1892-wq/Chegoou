import React, { useState, useMemo, useEffect } from 'react';
import { Company, Product, ProductOption } from '../types';
import { 
    ShoppingBag, MapPin, Bike, Clock, ChevronRight, 
    X, CheckCircle, Store, DollarSign, CreditCard, QrCode, Loader2
} from 'lucide-react';

interface DigitalMenuViewProps {
    company: Company;
    products: Product[];
    onPlaceOrder: (
        items: any[], 
        companyId: string, 
        total: number, 
        deliveryMethod: 'delivery' | 'pickup', 
        serviceFee: number, 
        deliveryFee: number, 
        subtotal: number, 
        paymentMethod: 'cash' | 'card' | 'pix', 
        changeFor?: number,
        couponCode?: string,
        discountAmount?: number,
        customerData?: { name: string, phone: string, address: any } // Adicionado para suportar clientes sem login
    ) => Promise<boolean>;
}

const DigitalMenuView: React.FC<DigitalMenuViewProps> = ({ company, products, onPlaceOrder }) => {
    // --- ESTADOS DO CARRINHO E CHECKOUT ---
    const [cart, setCart] = useState<{product: Product, quantity: number, selectedOptions?: { groupName: string, optionName: string, price: number }[], finalPrice: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    
    // --- ESTADOS DO CLIENTE (GUEST) ---
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
    
    // Endereço
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    
    // Pagamento
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('pix');
    const [changeAmount, setChangeAmount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);

    // --- ESTADOS DE PRODUTO E CUSTOMIZAÇÃO ---
    const [selectedCategory, setSelectedCategory] = useState<string>('Tudo');
    const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
    const [selections, setSelections] = useState<Record<string, ProductOption[]>>({});

    // Categorias únicas baseadas nos produtos disponíveis
    const categories = ['Tudo', ...Array.from(new Set(products.map(p => p.category)))];

    // --- CÁLCULOS FINANCEIROS ---
    const productTotal = cart.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0);
    const activeDeliveryFee = deliveryMethod === 'pickup' ? 0 : (company.deliveryType === 'own' ? (company.ownDeliveryFee || 0) : 5.00); // Ajuste a lógica de taxa padrão conforme necessário
    const serviceFeeValue = 0.00; // Taxa de serviço zerada para o cliente final neste modelo? Se não, altere.
    const finalTotal = productTotal + activeDeliveryFee + serviceFeeValue;

    // --- LÓGICA DE PRODUTOS ---
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
        const isPizzaMode = customizingProduct.isPizza || customizingProduct.name.toLowerCase().includes('pizza');

        customizingProduct.groups.forEach(group => {
            const selected = selections[group.id] || [];
            if (selected.length === 0) return;

            if (isPizzaMode && selected.length > 0) {
                total += selected.reduce((a,c) => a + (c.price || 0), 0) / selected.length;
            } else {
                if (group.max > 1 && customizingProduct.pricingMode === 'average') total += (selected.reduce((a,c)=>a+c.price,0)/selected.length);
                else if (group.max > 1 && customizingProduct.pricingMode === 'highest') total += Math.max(...selected.map(o=>o.price));
                else total += selected.reduce((a,c)=>a+c.price,0);
            }
        });
        return total;
    }, [customizingProduct, selections]);

    const addToCart = (product: Product, finalPrice: number, selectedOptions: any[]) => {
        setCart(prev => [...prev, {product, quantity: 1, selectedOptions, finalPrice}]);
        setIsCartOpen(true); 
    };

    const removeFromCart = (index: number) => {
        const newCart = [...cart];
        if (newCart[index].quantity > 1) newCart[index].quantity--; else newCart.splice(index, 1);
        setCart(newCart);
        if (newCart.length === 0) setIsCartOpen(false);
    };

    // --- SUBMISSÃO DO PEDIDO ---
    const handleFinalizeOrder = async () => {
        if (!customerName || !customerPhone) {
            alert("Por favor, preencha seu nome e WhatsApp.");
            return;
        }

        if (deliveryMethod === 'delivery' && (!street || !number || !neighborhood)) {
            alert("Por favor, preencha o endereço completo para entrega.");
            return;
        }

        let changeForValue = 0;
        if (paymentMethod === 'cash') {
            changeForValue = parseFloat(changeAmount.replace(',','.'));
            if (changeAmount && changeForValue < finalTotal) { 
                alert("O valor do troco deve ser maior que o total do pedido."); 
                return; 
            }
        }

        setIsProcessing(true);
        
        // Objeto de dados do cliente offline
        const guestData = {
            name: customerName,
            phone: customerPhone,
            address: deliveryMethod === 'delivery' ? { street, number, neighborhood, city: company.address?.city || '', zipCode: '', lat: 0, lng: 0 } : undefined
        };

        const success = await onPlaceOrder(
            cart, 
            company.id, 
            finalTotal, 
            deliveryMethod, 
            serviceFeeValue, 
            activeDeliveryFee, 
            productTotal, 
            paymentMethod, 
            changeForValue,
            undefined, // couponCode (cardápio digital não usa cupom por enquanto)
            undefined, // discountAmount
            guestData // Passando os dados do cliente para o App.tsx (agora na posição certa)
        ); 

        setIsProcessing(false);
        
        if (success) {
            setOrderSuccess(true);
            setCart([]);
            // Limpa o carrinho e mantem os dados do cliente para um próximo pedido
        } else {
            alert("Houve um erro ao processar seu pedido. Tente novamente.");
        }
    };

    // --- TELA DE SUCESSO ---
    if (orderSuccess) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">Pedido Enviado!</h1>
                <p className="text-gray-500 mb-8">O restaurante já recebeu seu pedido e iniciará o preparo em breve. Fique atento ao seu WhatsApp.</p>
                <button 
                    onClick={() => { setOrderSuccess(false); setIsCartOpen(false); }} 
                    className="bg-red-600 text-white font-bold px-8 py-3 rounded-xl shadow-lg hover:bg-red-700"
                >
                    Voltar ao Cardápio
                </button>
            </div>
        );
    }

    return (
        <div className="pb-32 bg-gray-50 min-h-screen font-sans">
            {/* HEADER E BANNER */}
            <div className="relative h-48 md:h-64 bg-gray-900">
                {company.coverImage ? (
                    <img src={company.coverImage} className="w-full h-full object-cover opacity-80" alt="Capa" />
                ) : (
                    <div className="w-full h-full bg-gradient-to-r from-red-600 to-red-900"></div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-50 via-transparent to-transparent"></div>
            </div>

            <div className="max-w-4xl mx-auto -mt-16 relative z-10 px-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col items-center text-center">
                    <img src={company.logo || 'https://via.placeholder.com/150'} className="w-24 h-24 rounded-full border-4 border-white bg-white object-cover shadow-md -mt-16 mb-3" alt="Logo" />
                    <h1 className="text-2xl font-bold text-gray-900">{company.name}</h1>
                    <p className="text-sm text-gray-500 mb-4">{company.category} • {company.status === 'open' ? <span className="text-green-500 font-bold">Aberto Agora</span> : <span className="text-red-500 font-bold">Fechado</span>}</p>
                    
                    <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 w-full">
                        <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-red-600"/> 30-45 min</div>
                        <div className="flex items-center gap-1.5"><Bike className="w-4 h-4 text-red-600"/> Entrega ou Retirada</div>
                    </div>
                </div>

                {/* CATEGORIAS */}
                <div className="mt-8 overflow-x-auto no-scrollbar flex gap-2 pb-2">
                    {categories.map(cat => (
                        <button 
                            key={cat} 
                            onClick={() => setSelectedCategory(cat)}
                            className={`whitespace-nowrap px-5 py-2 rounded-full font-bold text-sm transition-colors border ${selectedCategory === cat ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* LISTA DE PRODUTOS */}
                <div className="mt-6 space-y-8">
                    {categories.filter(c => c !== 'Tudo').map(cat => {
                        const catProducts = products.filter(p => p.category === cat && p.isAvailable);
                        if (catProducts.length === 0 || (selectedCategory !== 'Tudo' && selectedCategory !== cat)) return null;

                        return (
                            <div key={cat}>
                                <h2 className="text-xl font-bold mb-4 text-gray-800">{cat}</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {catProducts.map(product => (
                                        <div 
                                            key={product.id} 
                                            onClick={() => company.status === 'open' ? openProductModal(product) : alert("Restaurante fechado no momento.")}
                                            className={`bg-white p-4 rounded-xl border border-gray-100 flex gap-4 transition-all ${company.status === 'open' ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : 'opacity-60 cursor-not-allowed'}`}
                                        >
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="font-bold text-gray-900">{product.name}</h3>
                                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                                                </div>
                                                <div className="mt-2 font-bold text-red-600">R$ {product.price.toFixed(2)}</div>
                                            </div>
                                            {product.image && <img src={product.image} className="w-24 h-24 rounded-lg object-cover bg-gray-100 shrink-0" alt={product.name} />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* BOTÃO FLUTUANTE CARRINHO */}
            {cart.length > 0 && !isCartOpen && (
                <div className="fixed bottom-6 left-0 right-0 px-4 z-20 flex justify-center">
                    <button onClick={() => setIsCartOpen(true)} className="bg-red-600 text-white w-full max-w-md shadow-xl shadow-red-200 rounded-xl p-4 flex justify-between items-center font-bold hover:bg-red-700 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">{cart.reduce((acc, i) => acc + i.quantity, 0)}</div>
                            <span>Ver Sacola</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span>R$ {productTotal.toFixed(2)}</span>
                            <ShoppingBag className="w-5 h-5" />
                        </div>
                    </button>
                </div>
            )}

            {/* MODAL DE CUSTOMIZAÇÃO DE PRODUTO */}
            {customizingProduct && (
               <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
                   <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
                       <div className="p-4 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
                            <h2 className="font-bold text-xl truncate pr-4">{customizingProduct.name}</h2>
                            <button onClick={() => setCustomizingProduct(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 shrink-0"><X className="w-5 h-5"/></button>
                       </div>
                       
                       <div className="p-4 overflow-y-auto flex-1 bg-gray-50">
                           {customizingProduct.groups.map(g => (
                               <div key={g.id} className="mb-6 bg-white p-4 rounded-xl border border-gray-100">
                                   <div className="mb-3">
                                       <h3 className="font-bold text-gray-800">{g.name}</h3>
                                       <p className="text-xs text-gray-400">
                                           {g.min === g.max ? `Escolha ${g.min} opção` : `Escolha de ${g.min} a ${g.max} opções`}
                                       </p>
                                   </div>
                                   {g.options.map(o => {
                                       const isSelected = (selections[g.id]||[]).some(s=>s.id===o.id);
                                       return (
                                           <div 
                                               key={o.id} 
                                               onClick={() => setSelections(prev => { 
                                                   const curr = prev[g.id] || []; 
                                                   if (curr.find(x => x.id === o.id)) return { ...prev, [g.id]: curr.filter(x => x.id !== o.id) }; 
                                                   if (curr.length >= g.max && g.max === 1) return { ...prev, [g.id]: [o] }; 
                                                   if (curr.length >= g.max) return prev; 
                                                   return { ...prev, [g.id]: [...curr, o] }; 
                                               })} 
                                               className={`p-3 border rounded-xl mt-2 flex justify-between items-center cursor-pointer transition-all ${isSelected ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                                           >
                                               <span>{o.name}</span>
                                               <span className="font-bold text-sm">
                                                   {isSelected && <CheckCircle className="inline w-4 h-4 mr-1"/>}
                                                   {o.price > 0 ? `+ R$ ${o.price.toFixed(2)}` : 'Grátis'}
                                               </span>
                                           </div>
                                       );
                                   })}
                               </div>
                           ))}
                       </div>
                       
                       <div className="p-4 border-t border-gray-100 bg-white shrink-0">
                           <button 
                               onClick={() => { 
                                   for (const group of customizingProduct.groups) {
                                       if ((selections[group.id] || []).length < group.min) {
                                           alert(`Escolha pelo menos ${group.min} opção(ões) em "${group.name}".`);
                                           return; 
                                       }
                                   }
                                   
                                   const isPizzaMode = customizingProduct.isPizza || customizingProduct.name.toLowerCase().includes('pizza');
                                   const flatOptions: any[] = []; 
                                   let flavorsForTitle: string[] = [];

                                   customizingProduct.groups.forEach(g => {
                                       const selectedInGroup = selections[g.id] || [];
                                       selectedInGroup.forEach(o => {
                                           let finalOptionName = o.name;
                                           let finalOptionPrice = o.price || 0;

                                           if (isPizzaMode && selectedInGroup.length > 0) {
                                               const fraction = selectedInGroup.length > 1 ? `1/${selectedInGroup.length}` : '';
                                               finalOptionName = `${fraction} ${o.name}`.trim();
                                               finalOptionPrice = finalOptionPrice / selectedInGroup.length;
                                               flavorsForTitle.push(finalOptionName);
                                           }

                                           flatOptions.push({ groupName: g.name, optionName: finalOptionName, price: finalOptionPrice });
                                       });
                                   }); 

                                   let modifiedProduct = { ...customizingProduct };
                                   if (isPizzaMode && flavorsForTitle.length > 0) {
                                       modifiedProduct.name = `${customizingProduct.name} (${flavorsForTitle.join(', ')})`;
                                   }

                                   addToCart(modifiedProduct, currentPrice, flatOptions); 
                                   setCustomizingProduct(null); 
                               }} 
                               className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:bg-red-700 flex justify-between px-6"
                           >
                               <span>Adicionar à Sacola</span>
                               <span>R$ {currentPrice.toFixed(2)}</span>
                           </button>
                       </div>
                   </div>
               </div>
           )}

            {/* MODAL DO CARRINHO E CHECKOUT */}
            {isCartOpen && (
               <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
                   <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                        
                        <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
                            <h2 className="font-bold text-xl text-gray-900 flex items-center gap-2"><ShoppingBag className="w-5 h-5 text-red-600"/> Sacola e Pagamento</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 rounded-full"><X className="w-5 h-5 text-gray-600"/></button>
                        </div>

                        <div className="overflow-y-auto p-5 flex-1 bg-gray-50 space-y-6">
                            
                            {/* Itens do Pedido */}
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Seus Itens</h3>
                                {cart.map((i, idx) => (
                                    <div key={idx} className="flex justify-between items-start border-b border-gray-50 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
                                        <div>
                                            <div className="font-bold text-gray-800 text-sm">{i.quantity}x {i.product.name}</div>
                                            {i.selectedOptions && i.selectedOptions.length > 0 && !i.product.name.includes('1/') && (
                                                <div className="text-[11px] text-gray-500 mt-0.5">
                                                    {i.selectedOptions.map(o => `+ ${o.optionName}`).join(', ')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="font-bold text-red-600 text-sm">R$ {(i.finalPrice * i.quantity).toFixed(2)}</span>
                                            <button onClick={() => removeFromCart(idx)} className="text-[10px] text-gray-400 hover:text-red-500 underline">Remover</button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Seus Dados */}
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Seus Dados</h3>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Seu Nome Completo" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-red-400" />
                                    <input type="tel" placeholder="WhatsApp (DDD + Número)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-red-400" />
                                </div>
                            </div>

                            {/* Entrega ou Retirada */}
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Como deseja receber?</h3>
                                <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                                    <button onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${deliveryMethod === 'delivery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Entregar</button>
                                    <button onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${deliveryMethod === 'pickup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Vou Retirar</button>
                                </div>
                                
                                {deliveryMethod === 'delivery' ? (
                                    <div className="space-y-3 animate-fade-in">
                                        <div className="flex gap-2">
                                            <input placeholder="Rua" value={street} onChange={e=>setStreet(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"/>
                                            <input placeholder="Nº" value={number} onChange={e=>setNumber(e.target.value)} className="w-20 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"/>
                                        </div>
                                        <input placeholder="Bairro" value={neighborhood} onChange={e=>setNeighborhood(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"/>
                                    </div>
                                ) : (
                                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-100 text-sm">
                                        <p className="font-bold text-orange-800 flex items-center gap-1 mb-1"><Store className="w-4 h-4"/> Retirar em:</p>
                                        <p className="text-gray-700">{company.address?.street}, {company.address?.number} <br/> {company.address?.neighborhood}</p>
                                    </div>
                                )}
                            </div>

                            {/* Pagamento */}
                            <div className="bg-white p-4 rounded-xl border border-gray-100">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Como vai pagar?</h3>
                                <p className="text-[10px] text-gray-500 mb-3">O pagamento é feito diretamente ao restaurante (na entrega ou retirada).</p>
                                <div className="flex gap-2 mb-3">
                                    <button onClick={() => setPaymentMethod('pix')} className={`flex-1 flex flex-col items-center py-3 rounded-lg border-2 ${paymentMethod === 'pix' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-100 text-gray-500'}`}><QrCode className="w-5 h-5 mb-1"/><span className="text-[10px] font-bold">Pix</span></button>
                                    <button onClick={() => setPaymentMethod('card')} className={`flex-1 flex flex-col items-center py-3 rounded-lg border-2 ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-100 text-gray-500'}`}><CreditCard className="w-5 h-5 mb-1"/><span className="text-[10px] font-bold">Cartão</span></button>
                                    <button onClick={() => setPaymentMethod('cash')} className={`flex-1 flex flex-col items-center py-3 rounded-lg border-2 ${paymentMethod === 'cash' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-100 text-gray-500'}`}><DollarSign className="w-5 h-5 mb-1"/><span className="text-[10px] font-bold">Dinheiro</span></button>
                                </div>
                                
                                {paymentMethod === 'cash' && (
                                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 animate-fade-in">
                                        <label className="text-xs font-bold text-yellow-800 block mb-1">Precisa de troco para quanto?</label>
                                        <input type="number" placeholder="Ex: 50,00" value={changeAmount} onChange={e => setChangeAmount(e.target.value)} className="w-full bg-transparent border-b border-yellow-300 py-1 text-sm font-bold text-gray-800 outline-none"/>
                                    </div>
                                )}
                            </div>
                        </div>
                        
                        {/* Rodapé Total */}
                        <div className="p-5 border-t border-gray-100 bg-white shrink-0">
                            <div className="space-y-1 mb-4 text-sm text-gray-600">
                                <div className="flex justify-between"><span>Subtotal</span><span>R$ {productTotal.toFixed(2)}</span></div>
                                {deliveryMethod === 'delivery' && <div className="flex justify-between"><span>Taxa de Entrega</span><span>R$ {activeDeliveryFee.toFixed(2)}</span></div>}
                            </div>
                            <div className="flex justify-between font-bold text-xl text-gray-900 mb-4 border-t border-gray-100 pt-2">
                                <span>Total a Pagar</span>
                                <span>R$ {finalTotal.toFixed(2)}</span>
                            </div>
                            <button 
                                onClick={handleFinalizeOrder} 
                                disabled={isProcessing} 
                                className={`w-full text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all ${isProcessing ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700 shadow-red-200'}`}
                            >
                                {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
                                {isProcessing ? 'Enviando Pedido...' : 'Enviar Pedido para o Restaurante'}
                            </button>
                        </div>
                   </div>
               </div>
           )}
        </div>
    );
};

export default DigitalMenuView;
