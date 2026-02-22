import React, { useState, useMemo } from 'react';
import { Product, Order, OrderItem, Company, ProductGroup, ProductOption } from '../types';
import { Search, Plus, Minus, Trash2, ShoppingCart, User, CreditCard, CheckCircle, MonitorStop, X, Banknote, ChevronRight } from 'lucide-react';

interface POSViewProps {
  products: Product[];
  company: Company;
  onPlaceOrder: (order: Order) => void;
}

const POSView: React.FC<POSViewProps> = ({ products = [], company, onPlaceOrder }) => {
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  
  // Checkout State
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'pix' | 'card'>('cash');
  const [changeFor, setChangeFor] = useState<number | ''>('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Modal State para Complementos / Sabores
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [groupSelections, setGroupSelections] = useState<Record<string, ProductOption[]>>({});

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Geral'));
    return ['Todas', ...Array.from(cats)];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || (p.category || 'Geral') === selectedCategory;
    return matchesSearch && matchesCategory && p.isAvailable !== false;
  });

  const cartTotal = cart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);

  // --- LÓGICA DE COMPLEMENTOS E PREÇO ---

  const handleProductClick = (product: Product) => {
    if (product.groups && product.groups.length > 0) {
      // Abre o modal de complementos
      setSelectedProduct(product);
      setGroupSelections({});
    } else {
      // Adiciona direto ao carrinho se não tiver complementos
      addCartItem(product, product.price, []);
    }
  };

  const handleToggleOption = (group: ProductGroup, option: ProductOption) => {
    const currentSelected = groupSelections[group.id] || [];
    const isSelected = currentSelected.some(o => o.id === option.id);

    if (isSelected) {
      setGroupSelections({
        ...groupSelections,
        [group.id]: currentSelected.filter(o => o.id !== option.id)
      });
    } else {
      if (currentSelected.length >= group.max) {
        // Se o máximo for 1, troca automaticamente a opção (comportamento de Radio Button)
        if (group.max === 1) {
          setGroupSelections({
            ...groupSelections,
            [group.id]: [option]
          });
        }
        return; 
      }
      setGroupSelections({
        ...groupSelections,
        [group.id]: [...currentSelected, option]
      });
    }
  };

  const currentModalPrice = useMemo(() => {
    if (!selectedProduct) return 0;
    
    let allSelectedOptions: ProductOption[] = [];
    Object.values(groupSelections).forEach(opts => allSelectedOptions.push(...opts));

    let finalPrice = selectedProduct.price || 0;

    if (selectedProduct.pricingMode === 'highest' && allSelectedOptions.length > 0) {
      finalPrice = Math.max(...allSelectedOptions.map(o => o.price));
    } else if (selectedProduct.pricingMode === 'average' && allSelectedOptions.length > 0) {
      finalPrice = allSelectedOptions.reduce((acc, o) => acc + o.price, 0) / allSelectedOptions.length;
    } else {
      finalPrice += allSelectedOptions.reduce((acc, o) => acc + o.price, 0);
    }

    return finalPrice;
  }, [selectedProduct, groupSelections]);

  const isModalValid = useMemo(() => {
    if (!selectedProduct || !selectedProduct.groups) return false;
    return selectedProduct.groups.every(g => {
      const count = (groupSelections[g.id] || []).length;
      return count >= g.min && count <= g.max;
    });
  }, [selectedProduct, groupSelections]);

  const handleConfirmOptions = () => {
    if (!selectedProduct || !isModalValid) return;

    const optionsToSave: { groupName: string; optionName: string; price: number }[] = [];
    
    selectedProduct.groups.forEach(g => {
      const selected = groupSelections[g.id] || [];
      selected.forEach(opt => {
        optionsToSave.push({ groupName: g.name, optionName: opt.name, price: opt.price });
      });
    });

    addCartItem(selectedProduct, currentModalPrice, optionsToSave);
    setSelectedProduct(null);
    setGroupSelections({});
  };

  const addCartItem = (product: Product, finalPrice: number, options: { groupName: string; optionName: string; price: number }[]) => {
    // Se não tem opções, tenta empilhar com outro item igual
    if (options.length === 0) {
      const existingItemIndex = cart.findIndex(item => item.productId === product.id && (!item.selectedOptions || item.selectedOptions.length === 0));
      if (existingItemIndex >= 0) {
        const newCart = [...cart];
        newCart[existingItemIndex].quantity += 1;
        setCart(newCart);
        return;
      }
    }
    
    // Caso contrário (ou se tiver opções), cria uma linha nova no carrinho
    setCart([...cart, {
      productId: product.id,
      productName: product.name || 'Produto',
      quantity: 1,
      price: finalPrice,
      selectedOptions: options
    }]);
  };

  // --- CARRINHO E CHECKOUT ---

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    newCart[index].quantity += delta;
    if (newCart[index].quantity <= 0) {
      newCart.splice(index, 1);
    }
    setCart(newCart);
  };

  const handleFinalizeOrder = () => {
    if (cart.length === 0) return alert('Adicione itens ao carrinho.');
    if (paymentMethod === 'cash' && changeFor && Number(changeFor) < cartTotal) {
      return alert('O valor do troco não pode ser menor que o total do pedido.');
    }

    setIsProcessing(true);

    const newOrder: Order = {
      id: self.crypto.randomUUID ? self.crypto.randomUUID() : Date.now().toString(),
      companyId: company?.id || 'pdv',
      companyName: company?.name || 'Chegoou PDV',
      customerId: '',
      customerName: customerName.trim() || 'Cliente Balcão',
      customerPhone: '00000000000',
      items: cart,
      total: cartTotal,
      subtotal: cartTotal,
      deliveryFee: 0,
      serviceFee: 0,
      status: 'pending',
      paymentMethod: paymentMethod,
      changeFor: paymentMethod === 'cash' ? Number(changeFor) : undefined,
      timestamp: new Date(),
      deliveryCode: Math.floor(1000 + Math.random() * 9000).toString(),
      deliveryAddress: { street: 'Retirada no Local', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
      pickupAddress: company?.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
      deliveryType: 'own',
      deliveryMethod: 'pickup',
      origin: 'pdv',
      repasseStatus: 'ignored',
      repasseValue: 0
    };

    setTimeout(() => {
      onPlaceOrder(newOrder);
      setCart([]);
      setCustomerName('');
      setChangeFor('');
      setPaymentMethod('cash');
      setIsProcessing(false);
    }, 600);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6 relative">
      
      {/* MODAL DE COMPLEMENTOS (SOBREPOSTO AO CATÁLOGO) */}
      {selectedProduct && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 rounded-2xl">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90%] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-bold text-lg text-gray-900">{selectedProduct.name}</h3>
                <p className="text-sm font-medium text-gray-500">
                  {selectedProduct.pricingMode === 'highest' ? 'Cobrado pelo maior valor' : 
                   selectedProduct.pricingMode === 'average' ? 'Cobrado pela média' : 
                   'Soma dos valores'}
                </p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {selectedProduct.groups.map(group => {
                const selectedCount = (groupSelections[group.id] || []).length;
                const isValid = selectedCount >= group.min && selectedCount <= group.max;

                return (
                  <div key={group.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="bg-gray-50 p-3 border-b border-gray-200 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-gray-800">{group.name}</h4>
                        <span className="text-xs font-medium text-gray-500">Escolha de {group.min} a {group.max} opções</span>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${isValid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-800'}`}>
                        {selectedCount} / {group.max}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.options.filter(o => o.isAvailable).map(option => {
                        const isSelected = (groupSelections[group.id] || []).some(o => o.id === option.id);
                        return (
                          <div 
                            key={option.id} 
                            onClick={() => handleToggleOption(group, option)}
                            className="p-3 flex justify-between items-center hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors
                                ${isSelected ? 'bg-red-600 border-red-600' : 'border-gray-300'}
                                ${group.max === 1 ? 'rounded-full' : 'rounded'}
                              `}>
                                {isSelected && <CheckCircle className="w-3 h-3 text-white" />}
                              </div>
                              <span className="text-sm font-medium text-gray-700">{option.name}</span>
                            </div>
                            {option.price > 0 && (
                              <span className="text-sm font-bold text-gray-900">+ R$ {option.price.toFixed(2)}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="p-4 border-t border-gray-100 bg-white">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold text-gray-600 uppercase text-sm">Total do Item</span>
                <span className="text-2xl font-bold text-gray-900">R$ {currentModalPrice.toFixed(2)}</span>
              </div>
              <button 
                onClick={handleConfirmOptions}
                disabled={!isModalValid}
                className={`w-full py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-md
                  ${isModalValid ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}
                `}
              >
                Adicionar ao Carrinho
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LADO ESQUERDO: Catálogo */}
      <div className="flex-1 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 text-gray-800">
            <MonitorStop className="w-6 h-6 text-red-600" />
            <h2 className="text-xl font-bold">Frente de Caixa</h2>
          </div>
          <div className="relative w-full sm:w-64">
            <input 
              type="text" 
              placeholder="Buscar produto..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-500 transition-shadow"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto p-3 border-b border-gray-50 scrollbar-hide">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                selectedCategory === cat ? 'bg-red-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProducts.map(product => {
            const hasOptions = product.groups && product.groups.length > 0;
            return (
              <button
                key={product.id}
                onClick={() => handleProductClick(product)}
                className="flex flex-col text-left bg-white border border-gray-100 rounded-xl p-3 hover:border-red-300 hover:shadow-md transition-all group relative"
              >
                {hasOptions && (
                  <div className="absolute top-2 right-2 bg-yellow-100 text-yellow-800 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 z-10">
                    Opções
                  </div>
                )}
                <div className="w-full h-24 bg-gray-50 rounded-lg mb-2 overflow-hidden">
                  {product.image ? (
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300"><ShoppingCart className="w-8 h-8"/></div>
                  )}
                </div>
                <h4 className="font-bold text-gray-800 text-sm line-clamp-2 leading-tight">{product.name || 'Sem nome'}</h4>
                <div className="mt-auto pt-2 flex justify-between items-center w-full">
                  <span className="font-bold text-green-600 text-sm">R$ {(product.price || 0).toFixed(2)}</span>
                  <span className="bg-gray-50 text-red-600 w-7 h-7 rounded-lg flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors border border-gray-100">
                    <Plus className="w-4 h-4" />
                  </span>
                </div>
              </button>
            );
          })}
          {filteredProducts.length === 0 && (
             <div className="col-span-full py-12 text-center text-gray-400">Nenhum produto encontrado.</div>
          )}
        </div>
      </div>

      {/* LADO DIREITO: Carrinho e Checkout (AGORA MAIS LARGO E ESPAÇOSO) */}
      <div className="w-full md:w-[450px] flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5"/> Pedido Atual</h3>
          <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{cart.length} itens</span>
        </div>

        {/* Lista do Carrinho */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50">
              <ShoppingCart className="w-12 h-12 mb-2" />
              <p className="text-sm font-medium">O pedido está vazio</p>
            </div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="bg-white p-3 rounded-xl border border-gray-100 flex flex-col gap-2 shadow-sm">
                <div className="flex justify-between items-start">
                  <span className="text-sm font-bold text-gray-800 leading-tight pr-2 flex-1">{item.productName}</span>
                  <span className="font-bold text-sm">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                </div>
                
                {/* Exibição dos adicionais escolhidos */}
                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-2 mt-1 mb-1 border border-gray-100">
                    {item.selectedOptions.map((opt, oIdx) => (
                      <div key={oIdx} className="text-[11px] text-gray-500 flex justify-between">
                        <span>• {opt.optionName}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center border-t border-gray-50 pt-2 mt-1">
                  <div className="flex items-center bg-gray-100 rounded-lg">
                    <button onClick={() => updateQuantity(idx, -1)} className="p-1.5 hover:bg-gray-200 rounded-l-lg text-gray-600"><Minus className="w-4 h-4"/></button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(idx, 1)} className="p-1.5 hover:bg-gray-200 rounded-r-lg text-gray-600"><Plus className="w-4 h-4"/></button>
                  </div>
                  <button onClick={() => { const newCart = [...cart]; newCart.splice(idx, 1); setCart(newCart); }} className="text-red-400 hover:text-red-600 p-1 bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Checkout Form - Mais compacto para dar espaço ao carrinho */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <input 
                type="text" 
                placeholder="Nome do Cliente (Opcional)" 
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-300"
              />
            </div>
            {paymentMethod === 'cash' && (
              <div className="w-28 animate-fade-in">
                <input 
                  type="number" 
                  placeholder="Troco p/?" 
                  value={changeFor}
                  onChange={e => setChangeFor(Number(e.target.value))}
                  className="w-full bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-green-400 text-green-800 placeholder-green-600/50"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <button 
              onClick={() => setPaymentMethod('cash')}
              className={`py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${paymentMethod === 'cash' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            >
              <Banknote className="w-3.5 h-3.5"/> Dinheiro
            </button>
            <button 
              onClick={() => setPaymentMethod('pix')}
              className={`py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${paymentMethod === 'pix' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            >
              <span className="font-serif">❖</span> Pix
            </button>
            <button 
              onClick={() => setPaymentMethod('card')}
              className={`py-2 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-1.5 ${paymentMethod === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
            >
              <CreditCard className="w-3.5 h-3.5"/> Cartão
            </button>
          </div>

          <div className="flex justify-between items-center mb-3">
            <span className="text-gray-500 font-bold uppercase text-xs tracking-wider">Total a cobrar</span>
            <span className="text-2xl font-black text-gray-900">R$ {cartTotal.toFixed(2)}</span>
          </div>
          
          <button 
            onClick={handleFinalizeOrder}
            disabled={cart.length === 0 || isProcessing}
            className={`w-full py-3.5 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg
              ${cart.length === 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700 shadow-red-200 hover:-translate-y-0.5'}
            `}
          >
            {isProcessing ? (
              <span className="animate-pulse">Processando...</span>
            ) : (
              <><CheckCircle className="w-5 h-5"/> Lançar Pedido</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default POSView;
