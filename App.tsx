import React, { useState, useEffect } from 'react';
import { User, Company, Product, Order, FinancialRecord, ChatMessage, CreditCard, Address, WithdrawalRequest } from './types';
import AuthView from './components/AuthView';
import AdminView from './components/AdminView';
import PartnerView from './components/PartnerView';
import CourierView from './components/CourierView';
import ClientView from './components/ClientView';
import { supabase } from './services/supabaseClient';
import { Loader2, AlertCircle, Database, Lock } from 'lucide-react';

// Helper for Distance Calculation
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<{title: string, message: string, type: 'network' | 'permission' | 'unknown'} | null>(null);
  
  // Shared State (Fetched from Supabase)
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // New States for Full Integration
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  // GLOBAL SETTINGS STATE (Lifted Up)
  const [globalSettings, setGlobalSettings] = useState({
      platformFee: 10,
      minWithdrawal: 50,
      maintenanceMode: false
  });

  // --- INITIAL DATA FETCHING ---
  useEffect(() => {
    fetchInitialData();

    // 1. Real-time subscription for Orders
    const ordersSub = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
          if (payload.eventType === 'INSERT') {
              setOrders(prev => [...prev, payload.new as Order]);
          } else if (payload.eventType === 'UPDATE') {
              setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as Order : o));
          } else if (payload.eventType === 'DELETE') {
              setOrders(prev => prev.filter(o => o.id !== payload.old.id));
          }
      })
      .subscribe();

    // 2. Real-time subscription for Messages (Chat)
    const messagesSub = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const newMsg = payload.new as ChatMessage;
          setChats(prev => ({
              ...prev,
              [newMsg.orderId]: [...(prev[newMsg.orderId] || []), newMsg]
          }));
      })
      .subscribe();
    
    // 3. Real-time subscription for Withdrawals
    const withdrawalsSub = supabase
      .channel('public:withdrawal_requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, (payload) => {
          if (payload.eventType === 'INSERT') {
             setWithdrawals(prev => [...prev, payload.new as WithdrawalRequest]);
          } else if (payload.eventType === 'UPDATE') {
             setWithdrawals(prev => prev.map(w => w.id === payload.new.id ? payload.new as WithdrawalRequest : w));
          }
      })
      .subscribe();

    return () => {
        supabase.removeChannel(ordersSub);
        supabase.removeChannel(messagesSub);
        supabase.removeChannel(withdrawalsSub);
    };
  }, []);

  const fetchInitialData = async () => {
      setIsLoading(true);
      setConnectionError(null);
      try {
          // 1. Fetch Companies
          const { data: companiesData, error: companiesError } = await supabase.from('companies').select('*');
          if (companiesError) throw companiesError;
          if (companiesData) setCompanies(companiesData);

          // 2. Fetch Products
          const { data: productsData, error: productsError } = await supabase.from('products').select('*');
          if (productsError) throw productsError;
          if (productsData) setProducts(productsData);

          // 3. Fetch Orders
          const { data: ordersData, error: ordersError } = await supabase.from('orders').select('*');
          if (ordersError) throw ordersError;
          if (ordersData) {
              const formattedOrders = ordersData.map(o => ({
                  ...o,
                  timestamp: new Date(o.timestamp)
              }));
              setOrders(formattedOrders);
          }

          // 4. Fetch Users
          const { data: usersData, error: usersError } = await supabase.from('users').select('*');
          if (usersError) throw usersError;
          if (usersData) setUsers(usersData);

          // 5. Fetch Withdrawals
          try {
            const { data: withdrawalData, error: wdError } = await supabase.from('withdrawal_requests').select('*');
            if (!wdError && withdrawalData) setWithdrawals(withdrawalData);
          } catch (e) {
              console.warn("Table withdrawal_requests might be missing or empty");
          }

          // 6. Fetch Messages & Group by OrderId
          try {
            const { data: messagesData, error: msgError } = await supabase.from('messages').select('*').order('timestamp', { ascending: true });
            if (!msgError && messagesData) {
                const groupedChats: Record<string, ChatMessage[]> = {};
                messagesData.forEach((msg: ChatMessage) => {
                    if (!groupedChats[msg.orderId]) groupedChats[msg.orderId] = [];
                    groupedChats[msg.orderId].push({
                        ...msg,
                        timestamp: new Date(msg.timestamp)
                    });
                });
                setChats(groupedChats);
            }
          } catch (e) {
              console.warn("Table messages might be missing or empty");
          }

      } catch (error: any) {
          console.error("Error fetching initial data:", error);
          
          let errorType: 'network' | 'permission' | 'unknown' = 'unknown';
          let title = "Erro de Conexão";
          let message = error.message || "Erro desconhecido ao conectar com Supabase";

          // DETECT RLS/PERMISSION ERROR (Code 42501 usually means Permission Denied/RLS)
          if (error.code === '42501' || (error.message && error.message.toLowerCase().includes('permission denied'))) {
              errorType = 'permission';
              title = "Acesso Bloqueado (RLS)";
              message = "O banco de dados recusou a conexão. Isso acontece quando as Políticas de Segurança (RLS) estão ativadas mas não configuradas para acesso público.";
          } else if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
              errorType = 'network';
              title = "Erro de Rede";
              message = "Não foi possível alcançar os servidores do Supabase. Verifique sua conexão com a internet.";
          }

          setConnectionError({ title, message, type: errorType });
      } finally {
          setIsLoading(false);
      }
  };

  // ACTIONS
  const handleLogout = () => {
    setCurrentUser(null);
  };

  const handleLogin = async (userAttempt: User) => {
    // 1. Explicit Login Action (AuthView sends id: 'login_action')
    if (userAttempt.id === 'login_action') {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', userAttempt.email)
                .eq('password', userAttempt.password) // Plaintext for MVP
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    alert("E-mail ou senha incorretos.");
                } else {
                    console.error("Login Error:", error);
                    alert("Erro ao conectar: " + error.message);
                }
                return;
            }

            if (data) {
                setCurrentUser(data);
                // Also update local list if stale
                if (!users.find(u => u.id === data.id)) {
                    setUsers([...users, data]);
                }
            }
        } catch (e: any) {
            alert("Erro fatal no login: " + e.message);
        }
    } 
    // 2. Registration Action (AuthView sends a specific ID starting with 'u-')
    // We only Insert if we are sure it's a new user (not 'login_action')
    else if (userAttempt.id.startsWith('u-')) {
        // Registration
        const { data, error } = await supabase.from('users').insert([userAttempt]).select();
        if (error) {
            console.error("Registration Error:", error);
            if (error.code === '23505') {
                 alert("Erro: Este usuário já existe. Tente fazer login.");
            } else {
                 alert("Erro ao criar conta: " + error.message);
            }
            return;
        }
        if (data) {
            setUsers([...users, data[0]]);
            setCurrentUser(data[0]);
        }
    }
  };

  // --- CRUD HANDLERS FOR ADMIN & USERS ---

  const handleUpdateUser = async (updatedUser: User) => {
      const { error } = await supabase.from('users').update(updatedUser).eq('id', updatedUser.id);
      
      if (!error) {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        // Only update currentUser if it's the one logged in
        if (currentUser && currentUser.id === updatedUser.id) {
            setCurrentUser(updatedUser);
        }
      } else {
          console.error("Error updating user:", error);
          alert("Erro ao atualizar usuário no banco de dados.");
      }
  };

  const handleDeleteUser = async (userId: string) => {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (!error) {
          setUsers(users.filter(u => u.id !== userId));
      } else {
          alert("Erro ao excluir usuário: " + error.message);
      }
  };

  const handleUpsertCompany = async (company: Company) => {
      const { data, error } = await supabase.from('companies').upsert(company).select();
      if (!error && data) {
           setCompanies(prev => {
               const exists = prev.find(c => c.id === company.id);
               if (exists) return prev.map(c => c.id === company.id ? data[0] : c);
               return [...prev, data[0]];
           });
      } else {
          console.error("Error saving company:", error);
          alert("Erro ao salvar empresa: " + (error?.message || ""));
      }
  };

  const handleDeleteCompany = async (companyId: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', companyId);
      if (!error) {
          setCompanies(companies.filter(c => c.id !== companyId));
      } else {
          alert("Erro ao excluir empresa: " + error.message);
      }
  };

  // --- GLOBAL SETTINGS HANDLER ---
  const handleUpdateGlobalSettings = (newSettings: typeof globalSettings) => {
      setGlobalSettings(newSettings);
      // Batch update companies
      companies.forEach(async (c) => {
          await supabase.from('companies').update({ serviceFeePercentage: newSettings.platformFee }).eq('id', c.id);
      });
      // Optimistic update
      setCompanies(prev => prev.map(c => ({ ...c, serviceFeePercentage: newSettings.platformFee })));
  };

  // --- CHAT HANDLER (PERSISTENT) ---
  const handleSendMessage = async (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => {
      const newMessage = {
          id: `msg-${Date.now()}`,
          orderId,
          senderId,
          senderRole: role,
          text,
          timestamp: new Date().toISOString() // Send as ISO string for DB
      };
      
      const { error } = await supabase.from('messages').insert([newMessage]);
      if (error) {
          console.error("Error sending message:", error);
      }
      // UI update handled by subscription
  };

  // --- WITHDRAWAL HANDLER ---
  const handleUpdateWithdrawal = async (id: string, status: 'paid' | 'rejected') => {
      const { error } = await supabase.from('withdrawal_requests').update({ status }).eq('id', id);
      if (error) {
          alert("Erro ao atualizar saque: " + error.message);
      }
      // UI update handled by subscription
  };

  const handlePlaceOrder = async (
      cartItems: any[], 
      companyId: string, 
      finalTotal: number, 
      deliveryMethod: 'delivery' | 'pickup', 
      serviceFee: number, 
      deliveryFee: number, 
      subtotal: number, 
      paymentMethod: 'cash' | 'card' | 'pix',
      changeFor?: number
  ): Promise<boolean> => {
    if (!currentUser || !currentUser.address) {
        alert("Erro: Você precisa selecionar um endereço de entrega.");
        return false;
    }
    
    const company = companies.find(c => c.id === companyId);
    if (!company) {
        alert("Erro: Restaurante não encontrado.");
        return false;
    }

    if (company.isSuspended) {
        alert("Este estabelecimento está temporariamente indisponível.");
        return false;
    }

    // Distance check only if delivery
    if (deliveryMethod === 'delivery' && company.address) {
        const distance = getDistanceFromLatLonInKm(
            currentUser.address.lat, currentUser.address.lng,
            company.address.lat, company.address.lng
        );

        if (distance > company.deliveryRadiusKm) {
            alert(`Erro: Você está fora da área de entrega deste restaurante (${distance.toFixed(1)}km > ${company.deliveryRadiusKm}km).`);
            return false;
        }
    }

    const code = currentUser.phone.slice(-4) || '0000';

    const newOrder: Order = {
        id: `ord-${Date.now()}`,
        companyId,
        companyName: company.name,
        customerId: currentUser.id,
        customerName: currentUser.name,
        customerPhone: currentUser.phone,
        items: cartItems.map((i: any) => ({
            productId: i.product.id,
            productName: i.product.name,
            quantity: i.quantity,
            price: i.finalPrice, 
            selectedOptions: i.selectedOptions
        })),
        total: finalTotal,
        subtotal: subtotal,
        deliveryFee: deliveryFee,
        serviceFee: serviceFee,
        deliveryMethod: deliveryMethod,
        paymentMethod: paymentMethod,
        changeFor: changeFor,
        status: 'pending',
        timestamp: new Date(),
        deliveryCode: code,
        deliveryAddress: currentUser.address,
        pickupAddress: company.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
        deliveryType: company.deliveryType
    };

    const { data, error } = await supabase.from('orders').insert([newOrder]).select();
    
    if (error) {
        alert("Erro ao realizar pedido: " + error.message);
        return false;
    }
    return true;
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    await supabase.from('orders').update({ status }).eq('id', orderId);
  };
  
  const handleUpdateFullOrder = async (updatedOrder: Order) => {
    await supabase.from('orders').update(updatedOrder).eq('id', updatedOrder.id);
  };

  const handleDeleteOrder = async (orderId: string) => {
    await supabase.from('orders').delete().eq('id', orderId);
  };

  // --- CRUD WRAPPERS ---
  const handleAddProduct = async (newProduct: Product) => {
      const { data, error } = await supabase.from('products').insert([newProduct]).select();
      if (!error && data) setProducts([...products, data[0]]);
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
      const { error } = await supabase.from('products').update(updatedProduct).eq('id', updatedProduct.id);
      if (!error) setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDeleteProduct = async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (!error) setProducts(prev => prev.filter(p => p.id !== productId));
  };
  
  const handleUpdateCompany = async (companyId: string, data: Partial<Company>) => {
      const { error } = await supabase.from('companies').update(data).eq('id', companyId);
      if(!error) setCompanies(companies.map(c => c.id === companyId ? {...c, ...data} : c));
  };

  const handleAddAddress = (address: Address) => {
      if (!currentUser) return;
      const updatedUser = { ...currentUser, address: address, savedAddresses: [...(currentUser.savedAddresses || []), address] };
      handleUpdateUser(updatedUser);
  };

  const handleRemoveAddress = (index: number) => {
      if (!currentUser || !currentUser.savedAddresses) return;
      const updatedAddresses = [...currentUser.savedAddresses];
      updatedAddresses.splice(index, 1);
      const updatedUser = { ...currentUser, savedAddresses: updatedAddresses };
      handleUpdateUser(updatedUser);
  };

  const handleAddCard = (card: CreditCard) => {
      if (!currentUser) return;
      const updatedUser = { ...currentUser, savedCards: [...(currentUser.savedCards || []), card] };
      handleUpdateUser(updatedUser);
  };

  const handleRemoveCard = (index: number) => {
      if (!currentUser || !currentUser.savedCards) return;
      const updatedCards = [...currentUser.savedCards];
      updatedCards.splice(index, 1);
      const updatedUser = { ...currentUser, savedCards: updatedCards };
      handleUpdateUser(updatedUser);
  };

  if (isLoading) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50">
              <Loader2 className="w-10 h-10 text-red-600 animate-spin mb-4" />
              <p className="text-gray-500 font-medium">Conectando ao Chegoou...</p>
          </div>
      );
  }

  if (connectionError) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
              <div className={`p-4 rounded-full mb-4 ${connectionError.type === 'permission' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                  {connectionError.type === 'permission' ? <Lock className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
              </div>
              
              <h2 className="text-xl font-bold text-gray-900">{connectionError.title}</h2>
              <p className="text-gray-500 mt-2 max-w-md">{connectionError.message}</p>
              
              {connectionError.type === 'permission' && (
                  <div className="mt-6 bg-gray-100 p-4 rounded-xl text-left max-w-lg w-full text-sm border border-gray-200">
                      <p className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                         <Database className="w-4 h-4"/> Como Resolver (Admin):
                      </p>
                      <p className="mb-2 text-gray-600">Rode o script SQL de liberação no painel do Supabase:</p>
                      <pre className="bg-black text-green-400 p-3 rounded-lg overflow-x-auto text-xs font-mono">
{`ALTER TABLE users DISABLE ROW LEVEL SECURITY;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;`}
                      </pre>
                  </div>
              )}
              
              <button onClick={() => window.location.reload()} className="mt-8 bg-gray-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-black transition-colors">
                  Tentar Conexão Novamente
              </button>
          </div>
      );
  }

  if (!currentUser) {
    return <AuthView onLogin={handleLogin} existingUsers={users} />;
  }

  // ROUTING
  switch (currentUser.role) {
    case 'admin':
        return <AdminView 
            users={users} setUsers={setUsers} 
            companies={companies} setCompanies={setCompanies} 
            orders={orders} 
            // Pass Withdrawals and Handler to Admin
            withdrawals={withdrawals}
            onUpdateWithdrawal={handleUpdateWithdrawal}
            onLogout={handleLogout}
            globalSettings={globalSettings} 
            onUpdateSettings={handleUpdateGlobalSettings}
            // PASS CRUD HANDLERS
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onUpsertCompany={handleUpsertCompany}
            onDeleteCompany={handleDeleteCompany}
        />;
    
    case 'partner':
        const myCompany = companies.find(c => c.id === currentUser.id);
        if (!myCompany) {
             return (
                 <div className="h-screen flex items-center justify-center bg-gray-50 text-center p-8">
                     <div>
                         <h1 className="text-3xl font-bold text-gray-800 mb-2">Configurando Loja...</h1>
                         <p className="text-gray-500 mb-4">Sua empresa ainda não foi vinculada. Aguarde ou contate o suporte.</p>
                         <button onClick={handleLogout} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-xl font-bold">Sair</button>
                     </div>
                 </div>
             );
        }
        if (myCompany.isSuspended) return <div className="h-screen flex items-center justify-center bg-gray-50 text-center p-8"><div><h1 className="text-3xl font-bold text-red-600 mb-2">Conta Suspensa</h1><button onClick={handleLogout} className="mt-4 bg-gray-200 px-4 py-2 rounded">Sair</button></div></div>;
        
        return <PartnerView 
            company={myCompany} 
            orders={orders.filter(o => o.companyId === myCompany.id)}
            products={products.filter(p => p.companyId === myCompany.id)}
            updateOrderStatus={updateOrderStatus}
            updateCompany={(data) => handleUpdateCompany(myCompany.id, data)}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct} 
            onDeleteProduct={handleDeleteProduct} 
            onLogout={handleLogout}
            chats={chats}
            onSendMessage={handleSendMessage}
            onUpdateFullOrder={handleUpdateFullOrder}
            onDeleteOrder={handleDeleteOrder}
        />;

    case 'courier':
        return <CourierView 
            courier={currentUser} 
            availableOrders={orders} 
            acceptOrder={(id) => updateOrderStatus(id, 'delivering')}
            confirmDelivery={(id, code) => updateOrderStatus(id, 'delivered')}
            onLogout={handleLogout}
        />;

    case 'client':
    default:
        return <ClientView 
            user={currentUser} 
            companies={companies} 
            products={products}
            onPlaceOrder={handlePlaceOrder}
            onLogout={handleLogout}
            orders={orders} 
            onUpdateUser={handleUpdateUser}
            chats={chats}
            onSendMessage={handleSendMessage}
            onAddAddress={handleAddAddress}
            onRemoveAddress={handleRemoveAddress}
            onAddCard={handleAddCard}
            onRemoveCard={handleRemoveCard}
        />;
  }
};

export default App;