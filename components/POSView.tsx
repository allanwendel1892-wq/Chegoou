import React, { useState, useMemo } from 'react';
import { Product, Order, OrderItem, Company } from '../types';
import { Search, Plus, Minus, Trash2, ShoppingCart, User, CreditCard, CheckCircle, MonitorStop, X, Banknote } from 'lucide-react';

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

  // Derivando as categorias com segurança (fallback para produtos sem categoria)
  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category || 'Geral'));
    return ['Todas', ...Array.from(cats)];
  }, [products]);

  // Filtragem segura (fallback para produtos sem nome)
  const filteredProducts = products.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes((searchTerm || '').toLowerCase());
    const matchesCategory = selectedCategory === 'Todas' || (p.category || 'Geral') === selectedCategory;
    return matchesSearch && matchesCategory && p.isAvailable !== false;
  });

  const cartTotal = cart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);

  const handleAddToCart = (product: Product) => {
    const existingItemIndex = cart.findIndex(item => item.productId === product.id);
    
    if (existingItemIndex >= 0) {
      const newCart = [...cart];
      newCart[existingItemIndex].quantity += 1;
      setCart(newCart);
    } else {
      setCart([...cart, {
        productId: product.id,
        productName: product.name || 'Produto sem nome',
        quantity: 1,
        price: product.price || 0,
        selectedOptions: []
      }]);
    }
  };

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
      id: self.crypto.randomUUID ? self.crypto.randomUUID() : Date.now().toString(), // Compatibilidade garantida
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
      alert('Pedido lançado com sucesso! Ele já está no seu Kanban.');
    }, 600);
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col md:flex-row gap-6">
      
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

        <div className="flex gap-2 overflow-x-auto p-4 border-b border-gray-50 scrollbar-hide">
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

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map(product => (
            <button
              key={product.id}
              onClick={() => handleAddToCart(product)}
              className="flex flex-col text-left bg-white border border-gray-100 rounded-xl p-3 hover:border-red-300 hover:shadow-md transition-all group"
            >
              <div className="w-full h-24 bg-gray-50 rounded-lg mb-3 overflow-hidden">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300"><ShoppingCart className="w-8 h-8"/></div>
                )}
              </div>
              <h4 className="font-bold text-gray-800 text-sm line-clamp-2 leading-tight">{product.name || 'Sem nome'}</h4>
              <p className="text-xs text-gray-400 mt-1 uppercase font-semibold">{product.category || 'Geral'}</p>
              <div className="mt-auto pt-2 flex justify-between items-center">
                <span className="font-bold text-green-600">R$ {(product.price || 0).toFixed(2)}</span>
                <span className="bg-red-50 text-red-600 w-6 h-6 rounded-full flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors">
                  <Plus className="w-4 h-4" />
                </span>
              </div>
            </button>
          ))}
          {filteredProducts.length === 0 && (
             <div className="col-span-full py-12 text-center text-gray-400">Nenhum produto encontrado.</div>
          )}
        </div>
      </div>

      {/* LADO DIREITO: Carrinho e Checkout */}
      <div className="w-full md:w-96 flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
          <h3 className="font-bold flex items-center gap-2"><ShoppingCart className="w-5 h-5"/> Pedido Atual</h3>
          <span className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{cart.length} itens</span>
        </div>

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
                  <span className="text-sm font-bold text-gray-800 leading-tight pr-2">{item.productName}</span>
                  <span className="font-bold text-sm">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-50 pt-2">
                  <div className="flex items-center bg-gray-100 rounded-lg">
                    <button onClick={() => updateQuantity(idx, -1)} className="p-1.5 hover:bg-gray-200 rounded-l-lg text-gray-600"><Minus className="w-4 h-4"/></button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQuantity(idx, 1)} className="p-1.5 hover:bg-gray-200 rounded-r-lg text-gray-600"><Plus className="w-4 h-4"/></button>
                  </div>
                  <button onClick={() => { const newCart = [...cart]; newCart.splice(idx, 1); setCart(newCart); }} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-100 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-1"><User className="w-3 h-3"/> Nome do Cliente (Opcional)</label>
            <input 
              type="text" 
              placeholder="Ex: Mesa 04, João..." 
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-300"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Forma de Pagamento</label>
            <div className="grid grid-cols-3 gap-2">
              <button 
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 rounded-lg text-xs font-bold border transition-colors flex flex-col items-center gap-1 ${paymentMethod === 'cash' ? 'bg-green-50 border-green-500 text-green-700' : 'bg-white border-gray-200 text-gray-500'}`}
              >
                <Banknote className="w-4 h-4"/> Dinheiro
              </button>
              <button 
                onClick={() => setPaymentMethod('pix')}
                className={`py-2 rounded-lg text-xs font-bold border transition-colors flex flex-col items-center gap-1 ${paymentMethod === 'pix' ? 'bg-teal-50 border-teal-500 text-teal-700' : 'bg-white border-gray-200 text-gray-500'}`}
              >
                <span className="font-serif">❖</span> Pix
              </button>
              <button 
                onClick={() => setPaymentMethod('card')}
                className={`py-2 rounded-lg text-xs font-bold border transition-colors flex flex-col items-center gap-1 ${paymentMethod === 'card' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-500'}`}
              >
                <CreditCard className="w-4 h-4"/> Cartão
              </button>
            </div>
          </div>

          {paymentMethod === 'cash' && (
            <div className="animate-fade-in">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Troco para quanto?</label>
              <input 
                type="number" 
                placeholder="Ex: 50" 
                value={changeFor}
                onChange={e => setChangeFor(Number(e.target.value))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-300"
              />
            </div>
          )}

          <div className="pt-2">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-500 font-bold uppercase text-sm">Total a cobrar</span>
              <span className="text-2xl font-bold text-gray-900">R$ {cartTotal.toFixed(2)}</span>
            </div>
            
            <button 
              onClick={handleFinalizeOrder}
              disabled={cart.length === 0 || isProcessing}
              className={`w-full py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg
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
    </div>
  );
};

export default POSView;
