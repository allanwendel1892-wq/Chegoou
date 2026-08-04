import React, { useState, useMemo, useEffect } from 'react';
import { Company, Product, ProductOption } from '../types';
import {
    ShoppingBag, MapPin, Bike, Clock, ChevronRight, ChevronLeft,
    X, CheckCircle, Store, DollarSign, CreditCard, QrCode, Loader2, 
    User, Truck, AlertTriangle, Search, RefreshCw, Copy, Utensils, 
    BookOpen, Menu, Check, Package
} from 'lucide-react';

export interface ActiveOrder {
    id: string;
    total: number;
    paymentMethod: 'cash' | 'card' | 'pix';
    customerName: string;
    status: 'pending_payment' | 'preparing' | 'ready' | 'out_for_delivery';
    timestamp: number;
    items?: { name: string; quantity: number; selectedOptions?: { groupName?: string; optionName: string; price?: number }[] }[];
}

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
        customerData?: { name: string, phone: string, address: any }
    ) => Promise<string | null>;
    onTrackOrderByPhone?: (phone: string) => Promise<ActiveOrder | null>;
    onTrackOrderById?: (orderId: string) => Promise<ActiveOrder | null>;
}

// --- GERADOR PIX (BR CODE EMV) - VALIDADO BACEN ---
const generatePixPayload = (pixKey: string, pixKeyType: string, merchantName: string, merchantCity: string, amount: number, customerName: string) => {
    if (!pixKey) return '';
    
    let formattedKey = pixKey.trim();
    if (pixKeyType === 'phone' || pixKeyType === 'celular') {
        formattedKey = formattedKey.replace(/\D/g, ''); 
        if (!formattedKey.startsWith('55')) formattedKey = '55' + formattedKey;
        formattedKey = '+' + formattedKey;
    } else if (pixKeyType === 'cpf' || pixKeyType === 'cnpj') {
        formattedKey = formattedKey.replace(/\D/g, '');
    }

    const format = (id: string, value: string) => {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    };
    
    const payloadKey = format('00', 'br.gov.bcb.pix') + format('01', formattedKey);
    const merchantAccInfo = format('26', payloadKey);
    const mcc = format('52', '0000');
    const currency = format('53', '986');
    const amt = format('54', amount.toFixed(2));
    const country = format('58', 'BR');
    
    const cleanStr = (s: string, max: number) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/gi, '').substring(0, max).toUpperCase().trim();
    
    const mName = format('59', cleanStr(merchantName || 'RESTAURANTE', 25));
    const mCity = format('60', cleanStr(merchantCity || 'CIDADE', 15));
    
    const txidStr = customerName ? customerName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, '').substring(0, 25).toUpperCase() : 'PGTOAPP';
    const txid = txidStr.length > 0 ? txidStr : 'PGTOAPP';
    
    const addData = format('62', format('05', txid));
    
    const payloadStart = `000201010211${merchantAccInfo}${mcc}${currency}${amt}${country}${mName}${mCity}${addData}6304`;
    
    let crc = 0xFFFF;
    for (let i = 0; i < payloadStart.length; i++) {
        crc ^= (payloadStart.charCodeAt(i) << 8);
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return payloadStart + crc.toString(16).toUpperCase().padStart(4, '0');
};

const CHECKOUT_STEPS = [
    { id: 1, label: 'Sacola' },
    { id: 2, label: 'Seus dados' },
    { id: 3, label: 'Entrega' },
    { id: 4, label: 'Pagamento' },
] as const;
const TOTAL_STEPS = CHECKOUT_STEPS.length;

// CONFIGURAÇÃO DO STEPPER DE STATUS
const ORDER_STATUS_FLOW = [
    { key: 'pending_payment', label: 'Pendente', icon: Clock },
    { key: 'preparing', label: 'Preparo', icon: Utensils },
    { key: 'ready', label: 'Pronto', icon: Package },
    { key: 'out_for_delivery', label: 'Em Rota', icon: Bike }
];

const DigitalMenuView: React.FC<DigitalMenuViewProps> = ({ company, products, onPlaceOrder, onTrackOrderByPhone, onTrackOrderById }) => {
    const [cart, setCart] = useState<{ product: Product, quantity: number, selectedOptions?: { groupName: string, optionName: string, price: number }[], finalPrice: number }[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [checkoutStep, setCheckoutStep] = useState(1);
    const [stepError, setStepError] = useState<string | null>(null);

    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('delivery');
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [complement, setComplement] = useState('');
    const [neighborhood, setNeighborhood] = useState('');

    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'pix'>('pix');
    const [changeAmount, setChangeAmount] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);

    const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
    const [isTrackingViewOpen, setIsTrackingViewOpen] = useState(false);
    const [isTrackModalOpen, setIsTrackModalOpen] = useState(false);
    const [trackPhoneInput, setTrackPhoneInput] = useState('');
    const [isSearchingPhone, setIsSearchingPhone] = useState(false);
    const [trackModalError, setTrackModalError] = useState('');
    const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);

    const handleRefreshStatus = async () => {
        if (!activeOrder || !onTrackOrderById) return;
        setIsRefreshingStatus(true);
        try {
            const freshOrder = await onTrackOrderById(activeOrder.id);
            if (freshOrder) {
                setActiveOrder(freshOrder);
                localStorage.setItem('@MenuApp:activeOrder', JSON.stringify(freshOrder));
            } else {
                alert("Nenhum pedido em andamento foi encontrado.");
                localStorage.removeItem('@MenuApp:activeOrder');
                setActiveOrder(null);
                setIsTrackingViewOpen(false);
            }
        } catch (error) {
            console.error("Erro ao atualizar status", error);
        } finally {
            setIsRefreshingStatus(false);
        }
    };

    const [selectedCategory, setSelectedCategory] = useState<string>('Tudo');
    const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
    const [selections, setSelections] = useState<Record<string, ProductOption[]>>({});

    const categories = useMemo(() => ['Tudo', ...Array.from(new Set(products.map(p => p.category)))], [products]);
    const productTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.finalPrice * item.quantity), 0), [cart]);
    
    const activeDeliveryFee = useMemo(() => {
        if (deliveryMethod === 'pickup') return 0;
        const neighborhoodFees = (company as any).neighborhood_fees || (company as any).neighborhoodFees || [];
        if (neighborhood && neighborhoodFees.length > 0) {
            const found = neighborhoodFees.find((n: any) => n.neighborhood === neighborhood);
            if (found) return found.fee;
        }
        return company.deliveryType === 'own' ? (company.ownDeliveryFee || 0) : 5.00;
    }, [deliveryMethod, neighborhood, company]);

    const serviceFeeValue = 0.00; 
    const finalTotal = useMemo(() => productTotal + activeDeliveryFee + serviceFeeValue, [productTotal, activeDeliveryFee]);

    const trackingPixPayload = useMemo(() => {
        if (!activeOrder || activeOrder.paymentMethod !== 'pix' || !company.pixKey) return '';
        return generatePixPayload(company.pixKey, company.pixKeyType || 'email', company.name, company.address?.city || 'Brasil', activeOrder.total, activeOrder.customerName);
    }, [activeOrder, company]);

    useEffect(() => {
        const checkCache = async () => {
            const savedOrderStr = localStorage.getItem('@MenuApp:activeOrder');
            if (savedOrderStr) {
                try {
                    const savedOrder: ActiveOrder = JSON.parse(savedOrderStr);
                    const now = Date.now();
                    const diffHours = (now - savedOrder.timestamp) / (1000 * 60 * 60);
                    
                    if (diffHours < 2) {
                        setActiveOrder(savedOrder); 
                        if (onTrackOrderById) {
                            const freshOrder = await onTrackOrderById(savedOrder.id);
                            if (freshOrder) {
                                setActiveOrder(freshOrder);
                                localStorage.setItem('@MenuApp:activeOrder', JSON.stringify(freshOrder));
                            } else {
                                localStorage.removeItem('@MenuApp:activeOrder');
                                setActiveOrder(null);
                            }
                        }
                    } else {
                        localStorage.removeItem('@MenuApp:activeOrder');
                    }
                } catch (e) {
                    localStorage.removeItem('@MenuApp:activeOrder');
                }
            }
        };
        checkCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    useEffect(() => {
        if (isCartOpen) { setCheckoutStep(1); setStepError(null); }
    }, [isCartOpen]);

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
                total += selected.reduce((a, c) => a + (c.price || 0), 0) / selected.length;
            } else {
                if (group.max > 1 && customizingProduct.pricingMode === 'average') total += (selected.reduce((a, c) => a + c.price, 0) / selected.length);
                else if (group.max > 1 && customizingProduct.pricingMode === 'highest') total += Math.max(...selected.map(o => o.price));
                else total += selected.reduce((a, c) => a + c.price, 0);
            }
        });
        return total;
    }, [customizingProduct, selections]);

    const addToCart = (product: Product, finalPrice: number, selectedOptions: any[]) => {
        setCart(prev => [...prev, { product, quantity: 1, selectedOptions, finalPrice }]);
        setIsCartOpen(true);
    };

    const removeFromCart = (index: number) => {
        const newCart = [...cart];
        if (newCart[index].quantity > 1) newCart[index].quantity--; else newCart.splice(index, 1);
        setCart(newCart);
        if (newCart.length === 0) setIsCartOpen(false);
    };

    const validateStep = (step: number): string | null => {
        if (step === 1 && cart.length === 0) return "Sua sacola está vazia.";
        if (step === 2) {
            if (!customerName.trim()) return "Informe seu nome completo.";
            if (!customerPhone.trim()) return "Informe seu WhatsApp.";
        }
        if (step === 3 && deliveryMethod === 'delivery') {
            if (!neighborhood.trim()) return "Selecione o bairro para entrega.";
            if (!street.trim() || !number.trim()) return "Preencha a rua e o número para entrega.";
        }
        if (step === 4 && paymentMethod === 'cash' && changeAmount) {
            const changeForValue = parseFloat(changeAmount.replace(',', '.'));
            if (changeForValue < finalTotal) return "O valor do troco deve ser maior que o total do pedido.";
        }
        return null;
    };

    const goToNextStep = () => {
        const error = validateStep(checkoutStep);
        if (error) { setStepError(error); return; }
        setStepError(null);
        setCheckoutStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    };

    const goToPreviousStep = () => {
        setStepError(null);
        setCheckoutStep(prev => Math.max(prev - 1, 1));
    };

    const handleFinalizeOrder = async () => {
        const error = validateStep(4);
        if (error) { setStepError(error); return; }

        let changeForValue = 0;
        if (paymentMethod === 'cash' && changeAmount) {
            changeForValue = parseFloat(changeAmount.replace(',', '.'));
        }

        setIsProcessing(true);
        setStepError(null);

        const guestData = {
            name: `${customerName.trim()} (Cardápio Digital)`,
            phone: customerPhone,
            address: deliveryMethod === 'delivery'
                ? { street, number, complement, neighborhood, city: company.address?.city || '', zipCode: '', lat: 0, lng: 0 }
                : undefined
        };

        const generatedOrderId = await onPlaceOrder(
            cart,
            company.id,
            finalTotal,
            deliveryMethod,
            serviceFeeValue,
            activeDeliveryFee,
            productTotal,
            paymentMethod,
            changeForValue,
            undefined, 
            undefined, 
            guestData 
        );

        setIsProcessing(false);

        if (generatedOrderId) {
            const newActiveOrder: ActiveOrder = {
                id: generatedOrderId,
                total: finalTotal,
                paymentMethod,
                customerName: customerName.trim(),
                status: 'pending_payment',
                timestamp: Date.now()
            };

            setActiveOrder(newActiveOrder);
            localStorage.setItem('@MenuApp:activeOrder', JSON.stringify(newActiveOrder));
            
            setCart([]);
            setIsCartOpen(false);
            setIsTrackingViewOpen(true);
        } else {
            setStepError("Houve um erro ao gerar seu pedido. Tente novamente.");
        }
    };

    const handleTrackByPhone = async () => {
        if (!trackPhoneInput.trim() || !onTrackOrderByPhone) return;
        setIsSearchingPhone(true);
        setTrackModalError('');

        try {
            const fetchedOrder = await onTrackOrderByPhone(trackPhoneInput);
            if (fetchedOrder) {
                const refreshedOrder: ActiveOrder = { ...fetchedOrder, timestamp: Date.now() };
                setActiveOrder(refreshedOrder);
                localStorage.setItem('@MenuApp:activeOrder', JSON.stringify(refreshedOrder));
                setIsTrackModalOpen(false);
                setIsTrackingViewOpen(true);
            } else {
                setTrackModalError('Nenhum pedido ativo encontrado para este número.');
            }
        } catch (error) {
            setTrackModalError('Erro ao buscar o pedido. Tente novamente.');
        } finally {
            setIsSearchingPhone(false);
        }
    };

    return (
        <div className="pb-32 bg-gray-50 min-h-screen font-sans relative">
            
            {/* BOTÃO FLUTUANTE DE ACOMPANHAR PEDIDO */}
            <button 
                onClick={() => activeOrder ? setIsTrackingViewOpen(true) : setIsTrackModalOpen(true)} 
                className="fixed top-4 right-4 z-40 bg-white text-red-600 px-4 py-2 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.1)] font-bold flex items-center gap-2 text-sm border border-red-100 hover:bg-gray-50 transition-colors"
            >
                <Search className="w-4 h-4" /> Acompanhar Pedido
            </button>

            {/* HEADER DO CARDÁPIO */}
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
                        <div className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-red-600" /> 30-45 min</div>
                        <div className="flex items-center gap-1.5"><Bike className="w-4 h-4 text-red-600" /> Entrega ou Retirada</div>
                    </div>
                </div>

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

            {/* BARRA FIXA DO CARRINHO */}
            {cart.length > 0 && !isCartOpen && !isTrackingViewOpen && (
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

            {/* MODAL DE CUSTOMIZAÇÃO DE PRODUTO (Mantido Inalterado) */}
            {customizingProduct && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
                    {/* ... (Conteúdo do customizingProduct mantido idêntico) ... */}
                    <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
                        <div className="p-4 border-b border-gray-100 bg-white flex justify-between items-center shrink-0">
                            <h2 className="font-bold text-xl truncate pr-4">{customizingProduct.name}</h2>
                            <button onClick={() => setCustomizingProduct(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 shrink-0"><X className="w-5 h-5" /></button>
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
                                        const isSelected = (selections[g.id] || []).some(s => s.id === o.id);
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
                                                <div className="flex flex-col flex-1 pr-4 overflow-hidden">
                                                    <span className="font-medium text-gray-800">{o.name}</span>
                                                </div>
                                                <span className="font-bold text-sm shrink-0">
                                                    {isSelected && <CheckCircle className="inline w-4 h-4 mr-1" />}
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
                                    customizingProduct.groups.forEach(g => {
                                        const selectedInGroup = selections[g.id] || [];
                                        selectedInGroup.forEach(o => {
                                            let finalOptionName = o.name;
                                            let finalOptionPrice = o.price || 0;
                                            if (isPizzaMode && selectedInGroup.length > 0) {
                                                const fraction = selectedInGroup.length > 1 ? `1/${selectedInGroup.length}` : '';
                                                finalOptionName = `${fraction} ${o.name}`.trim();
                                                finalOptionPrice = finalOptionPrice / selectedInGroup.length;
                                            }
                                            flatOptions.push({ groupName: g.name, optionName: finalOptionName, price: finalOptionPrice });
                                        });
                                    });
                                    addToCart(customizingProduct, currentPrice, flatOptions);
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

            {/* MODAL DO CARRINHO E CHECKOUT (Mantido Inalterado) */}
            {isCartOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
                    {/* ... (Checkout mantido sem alterações visuais profundas para focar no Tracking Hub pedido) ... */}
                    <div className="bg-white w-full max-w-md h-[100dvh] sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl shadow-2xl flex flex-col">
                        <div className="px-5 pt-6 sm:pt-4 pb-3 border-b border-gray-100 shrink-0">
                            <div className="flex justify-between items-center mb-3">
                                <h2 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    {checkoutStep === 1 && <><ShoppingBag className="w-5 h-5 text-red-600" /> Sua Sacola</>}
                                    {checkoutStep === 2 && <><User className="w-5 h-5 text-red-600" /> Seus Dados</>}
                                    {checkoutStep === 3 && <><Truck className="w-5 h-5 text-red-600" /> Entrega</>}
                                    {checkoutStep === 4 && <><CreditCard className="w-5 h-5 text-red-600" /> Pagamento</>}
                                </h2>
                                <button onClick={() => setIsCartOpen(false)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full shrink-0"><X className="w-5 h-5 text-gray-600" /></button>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Etapa {checkoutStep}/{TOTAL_STEPS}</span>
                                    <span className="text-[11px] font-bold text-red-600">{CHECKOUT_STEPS[checkoutStep - 1].label}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex gap-1">
                                    {CHECKOUT_STEPS.map(s => (<div key={s.id} className={`h-full flex-1 rounded-full transition-colors duration-300 ${s.id <= checkoutStep ? 'bg-red-600' : 'bg-gray-100'}`} />))}
                                </div>
                            </div>
                        </div>

                        <div className="overflow-y-auto p-5 flex-1 bg-gray-50">
                            <div key={checkoutStep} className="animate-fade-in space-y-4">
                                {checkoutStep === 1 && (
                                    <div className="bg-white p-4 rounded-xl border border-gray-100">
                                        {cart.map((i, idx) => (
                                            <div key={idx} className="flex justify-between items-start border-b border-gray-50 pb-4 mb-4 last:border-0 last:pb-0 last:mb-0">
                                                <div className="flex-1 pr-4">
                                                    <div className="font-bold text-gray-800 text-sm">{i.quantity}x {i.product.name}</div>
                                                    {i.selectedOptions && i.selectedOptions.length > 0 && !i.product.name.includes('1/') && (
                                                        <div className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                                                            {i.selectedOptions.map(o => `+ ${o.optionName}`).join(', ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2 shrink-0">
                                                    <span className="font-bold text-red-600 text-sm">R$ {(i.finalPrice * i.quantity).toFixed(2)}</span>
                                                    <button onClick={() => removeFromCart(idx)} className="text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors border border-red-100">
                                                        Remover
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {checkoutStep === 2 && (
                                     <div className="bg-white p-4 rounded-xl border border-gray-100 space-y-3">
                                         <input type="text" placeholder="Seu Nome Completo" value={customerName} onChange={e => setCustomerName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-red-400" />
                                         <input type="tel" placeholder="WhatsApp (DDD + Número)" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-red-400" />
                                     </div>
                                )}
                                {checkoutStep === 3 && (
                                    <div className="bg-white p-4 rounded-xl border border-gray-100">
                                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                                            <button onClick={() => setDeliveryMethod('delivery')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${deliveryMethod === 'delivery' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Entregar</button>
                                            <button onClick={() => setDeliveryMethod('pickup')} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all ${deliveryMethod === 'pickup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Vou Retirar</button>
                                        </div>
                                        {deliveryMethod === 'delivery' ? (
                                            <div className="space-y-3 animate-fade-in">
                                                <select value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm outline-none focus:border-red-400 text-gray-700">
                                                    <option value="">Selecione o Bairro da Entrega...</option>
                                                    {((company as any).neighborhood_fees || (company as any).neighborhoodFees || []).map((n: any) => (
                                                        <option key={n.neighborhood} value={n.neighborhood}>{n.neighborhood} (Taxa: R$ {n.fee.toFixed(2)})</option>
                                                    ))}
                                                </select>
                                                <div className="flex gap-2">
                                                    <input placeholder="Rua" value={street} onChange={e => setStreet(e.target.value)} className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm outline-none focus:border-red-400" />
                                                    <input placeholder="Nº" value={number} onChange={e => setNumber(e.target.value)} className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm outline-none focus:border-red-400" />
                                                </div>
                                                <input placeholder="Complemento (opcional)" value={complement} onChange={e => setComplement(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-3 text-sm outline-none focus:border-red-400" />
                                            </div>
                                        ) : (
                                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 text-sm">
                                                <p className="font-bold text-orange-800 flex items-center gap-1 mb-2"><Store className="w-4 h-4" /> Retirar no Endereço:</p>
                                                <p className="text-gray-700 leading-relaxed">{company.address?.street}, {company.address?.number} <br /> {company.address?.neighborhood}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {checkoutStep === 4 && (
                                    <div className="bg-white p-4 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-3 font-medium">Como você deseja pagar o pedido?</p>
                                        <div className="flex gap-2 mb-3">
                                            <button onClick={() => setPaymentMethod('pix')} className={`flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all ${paymentMethod === 'pix' ? 'border-teal-500 bg-teal-50 text-teal-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}><QrCode className="w-6 h-6 mb-1.5" /><span className="text-[11px] font-bold">Pix</span></button>
                                            <button onClick={() => setPaymentMethod('card')} className={`flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all ${paymentMethod === 'card' ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}><CreditCard className="w-6 h-6 mb-1.5" /><span className="text-[11px] font-bold">Cartão</span></button>
                                            <button onClick={() => setPaymentMethod('cash')} className={`flex-1 flex flex-col items-center py-4 rounded-xl border-2 transition-all ${paymentMethod === 'cash' ? 'border-green-500 bg-green-50 text-green-700 shadow-sm' : 'border-gray-100 text-gray-500 hover:bg-gray-50'}`}><DollarSign className="w-6 h-6 mb-1.5" /><span className="text-[11px] font-bold">Dinheiro</span></button>
                                        </div>
                                        {paymentMethod === 'cash' && (
                                            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 animate-fade-in mt-4">
                                                <label className="text-sm font-bold text-yellow-900 block mb-2">Precisa de troco para quanto?</label>
                                                <input type="number" placeholder="Ex: 50.00" value={changeAmount} onChange={e => setChangeAmount(e.target.value)} className="w-full bg-white border border-yellow-300 rounded-lg px-4 py-3 text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-yellow-400" />
                                            </div>
                                        )}
                                    </div>
                                )}
                                {stepError && (
                                    <div className="bg-red-50 border border-red-100 text-red-600 text-xs font-bold rounded-lg px-4 py-3 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0" /> {stepError}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-5 pb-8 sm:pb-5 border-t border-gray-100 bg-white shrink-0 space-y-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] sm:shadow-none">
                            <div className="space-y-1.5 text-sm text-gray-600">
                                <div className="flex justify-between"><span>Subtotal</span><span>R$ {productTotal.toFixed(2)}</span></div>
                                {deliveryMethod === 'delivery' && <div className="flex justify-between"><span>Taxa de Entrega</span><span>R$ {activeDeliveryFee.toFixed(2)}</span></div>}
                            </div>
                            <div className="flex justify-between font-bold text-xl text-gray-900 border-t border-gray-100 pt-3">
                                <span>Total a Pagar</span>
                                <span>R$ {finalTotal.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-3 pt-2">
                                {checkoutStep > 1 && (
                                    <button onClick={goToPreviousStep} disabled={isProcessing} className="flex items-center justify-center gap-1 px-5 py-4 rounded-xl font-bold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all shrink-0">
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                )}
                                {checkoutStep < TOTAL_STEPS ? (
                                    <button onClick={goToNextStep} className="flex-1 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all bg-red-600 hover:bg-red-700 shadow-red-200 text-lg">
                                        Avançar <ChevronRight className="w-5 h-5" />
                                    </button>
                                ) : (
                                    <button onClick={handleFinalizeOrder} disabled={isProcessing} className={`flex-1 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all text-lg ${isProcessing ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700 shadow-green-200'}`}>
                                        {isProcessing && <Loader2 className="w-5 h-5 animate-spin" />}
                                        {isProcessing ? 'Processando...' : 'Confirmar Pedido'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- NOVO TRACKING HUB: ESTRUTURA VISUAL E LÓGICA REFATORADA --- */}
            {isTrackingViewOpen && activeOrder && (
                <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col animate-fade-in overflow-y-auto font-sans">
                    {/* Header Premium */}
                    <div className="bg-white px-5 py-4 sticky top-0 z-20 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex justify-between items-center">
                        <div>
                            <h2 className="font-bold text-gray-900 text-lg leading-tight">Acompanhar Pedido</h2>
                            <p className="text-sm text-gray-500 font-medium">#{activeOrder.id.slice(-6).toUpperCase()}</p>
                        </div>
                        <button onClick={() => setIsTrackingViewOpen(false)} className="p-2.5 bg-gray-50 border border-gray-100 hover:bg-gray-100 rounded-full transition-colors">
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>

                    <div className="flex-1 p-5 space-y-6 flex flex-col max-w-md mx-auto w-full pb-10">
                        
                        {/* Stepper de Status do Pedido */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-800 mb-6 uppercase tracking-wider">Progresso Atual</h3>
                            
                            <div className="relative">
                                {/* Linhas conectando os pontos */}
                                <div className="absolute left-6 top-6 bottom-6 w-0.5 bg-gray-100" />
                                
                                <div className="space-y-6 relative z-10">
                                    {ORDER_STATUS_FLOW.map((step, index) => {
                                        const currentIndex = ORDER_STATUS_FLOW.findIndex(s => s.key === activeOrder.status);
                                        const isCompleted = index < currentIndex;
                                        const isCurrent = index === currentIndex;
                                        
                                        let iconBgClass = "bg-gray-50 border-gray-200 text-gray-400";
                                        if (isCompleted) iconBgClass = "bg-green-500 border-green-500 text-white";
                                        else if (isCurrent) iconBgClass = "bg-red-600 border-red-600 text-white shadow-md shadow-red-200";

                                        const StepIcon = isCompleted ? Check : step.icon;

                                        return (
                                            <div key={step.key} className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${iconBgClass}`}>
                                                    <StepIcon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className={`font-bold text-base ${isCurrent ? 'text-gray-900' : isCompleted ? 'text-gray-700' : 'text-gray-400'}`}>
                                                        {step.label}
                                                    </h4>
                                                    {isCurrent && (
                                                        <span className="text-xs text-red-500 font-medium animate-pulse">Atualizado agora</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Área de Pagamento (PIX) - Estilo Recibo/Ticket */}
                        {activeOrder.status === 'pending_payment' && activeOrder.paymentMethod === 'pix' && trackingPixPayload && (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden relative">
                                {/* Detalhe serrilhado de recibo visual no topo */}
                                <div className="h-2 w-full bg-teal-50 flex" style={{ backgroundImage: 'radial-gradient(circle, #fff 4px, transparent 5px)', backgroundSize: '12px 12px', backgroundPosition: 'top left', marginTop: '-4px' }}></div>
                                
                                <div className="bg-teal-50 p-5 border-b border-teal-100 text-center relative">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                                        <QrCode className="w-6 h-6 text-teal-600" />
                                    </div>
                                    <h3 className="font-bold text-teal-900 text-lg">Aguardando Pagamento</h3>
                                    <p className="text-sm text-teal-700 mt-1">Escaneie o QR Code ou copie o código Pix para iniciarmos o preparo.</p>
                                </div>
                                
                                <div className="p-6 flex flex-col items-center">
                                    <div className="bg-white p-3 rounded-2xl border-2 border-dashed border-gray-200 mb-6 inline-block">
                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(trackingPixPayload)}`} alt="PIX QR Code" className="w-44 h-44" />
                                    </div>
                                    
                                    <div className="w-full mb-6">
                                        <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide">Pix Copia e Cola</p>
                                        <div className="flex bg-gray-50 border border-gray-200 rounded-xl p-1 overflow-hidden">
                                            <input type="text" readOnly value={trackingPixPayload} className="flex-1 text-sm bg-transparent px-3 font-mono text-gray-600 outline-none truncate" />
                                            <button onClick={() => { navigator.clipboard.writeText(trackingPixPayload); alert('Código PIX Copiado!'); }} className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm flex items-center justify-center px-4 py-2.5 rounded-lg transition-colors shadow-sm gap-2 shrink-0">
                                                Copiar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="w-full flex justify-between items-center border-t border-dashed border-gray-200 pt-5 mt-2">
                                        <span className="text-gray-500 font-medium">Valor Total</span>
                                        <span className="font-bold text-2xl text-gray-900">R$ {activeOrder.total.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Informação Dinheiro/Cartão */}
                        {activeOrder.status === 'pending_payment' && activeOrder.paymentMethod !== 'pix' && (
                            <div className="w-full bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
                                    <CheckCircle className="w-8 h-8 text-green-500" />
                                </div>
                                <h3 className="font-bold text-gray-900 text-xl mb-2">Pedido Recebido!</h3>
                                <p className="text-gray-500 mb-5">Seu pedido já foi enviado ao restaurante e o preparo será iniciado em breve.</p>
                                
                                <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-4 text-left">
                                    <div className="bg-white p-2 rounded-lg shadow-sm">
                                        {activeOrder.paymentMethod === 'card' ? <CreditCard className="w-6 h-6 text-blue-600" /> : <DollarSign className="w-6 h-6 text-green-600" />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase">Pagamento na Entrega</p>
                                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                                            {activeOrder.paymentMethod === 'card' ? "Entregador levará a maquineta" : "Entregador levará o seu troco"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Resumo dos Itens do Pedido */}
                        {activeOrder.items && activeOrder.items.length > 0 && (
                            <div className="w-full bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider border-b border-gray-100 pb-3">Resumo da Compra</h3>
                                <div className="space-y-4">
                                    {activeOrder.items.map((item, idx) => (
                                        <div key={idx} className="flex gap-3 text-sm">
                                            <div className="bg-gray-100 font-bold text-gray-700 px-2 py-0.5 rounded h-fit">
                                                {item.quantity}x
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{item.name}</p>
                                                {item.selectedOptions && item.selectedOptions.length > 0 && (
                                                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                                                        {item.selectedOptions.map(o => o.optionName).join(', ')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Botões de Ação do Tracking Hub */}
                        <div className="w-full grid grid-cols-2 gap-3 mt-auto pt-2">
                            <button 
                                onClick={() => window.location.reload()} 
                                className="bg-white border border-gray-200 text-gray-700 font-bold py-3.5 px-4 rounded-xl shadow-sm hover:bg-gray-50 flex justify-center items-center gap-2 transition-colors"
                            >
                                <BookOpen className="w-4 h-4 text-gray-500" /> Cardápio
                            </button>
                            <button 
                                onClick={handleRefreshStatus} 
                                disabled={isRefreshingStatus}
                                className="bg-red-50 border border-red-100 text-red-700 font-bold py-3.5 px-4 rounded-xl hover:bg-red-100 flex justify-center items-center gap-2 transition-colors"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshingStatus ? 'animate-spin' : ''}`} /> 
                                {isRefreshingStatus ? 'Buscando...' : 'Atualizar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL PLANO B: BUSCA POR WHATSAPP (Mantido inalterado) */}
            {isTrackModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 relative">
                        <button onClick={() => setIsTrackModalOpen(false)} className="absolute top-4 right-4 p-2 bg-gray-100 hover:bg-gray-200 rounded-full">
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                        <div className="text-center mb-6">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <Search className="w-6 h-6 text-red-600" />
                            </div>
                            <h2 className="font-bold text-xl text-gray-900">Buscar Pedido</h2>
                            <p className="text-sm text-gray-500 mt-1">Informe o seu número de WhatsApp para recuperar o seu pedido ativo.</p>
                        </div>
                        <div className="space-y-4">
                            <input 
                                type="tel" 
                                placeholder="WhatsApp (DDD + Número)" 
                                value={trackPhoneInput} 
                                onChange={e => setTrackPhoneInput(e.target.value)} 
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-red-400" 
                            />
                            {trackModalError && (
                                <p className="text-xs text-red-600 font-bold text-center">{trackModalError}</p>
                            )}
                            <button 
                                onClick={handleTrackByPhone} 
                                disabled={isSearchingPhone || !trackPhoneInput.trim()} 
                                className={`w-full text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all ${
                                    isSearchingPhone || !trackPhoneInput.trim() ? 'bg-gray-400' : 'bg-red-600 hover:bg-red-700 shadow-red-200'
                                }`}
                            >
                                {isSearchingPhone ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Buscar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DigitalMenuView;
