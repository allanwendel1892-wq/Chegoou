
import React, { useState, useEffect } from 'react';
import { User, Company, Product, Order, FinancialRecord, ChatMessage, CreditCard, Address, WithdrawalRequest } from './types';
import AuthView from './components/AuthView';
import AdminView from './components/AdminView';
import PartnerView from './components/PartnerView';
import CourierView from './components/CourierView';
import ClientView from './components/ClientView';
import { supabase } from './services/supabaseClient';
import { Loader2, AlertCircle, Database, Lock } from 'lucide-react';

// --- CONFIGURAÇÃO DO WEBHOOK N8N ---
// Link de produção fornecido
const N8N_WEBHOOK_URL = 'https://n8n-n8n.znzrqn.easypanel.host/webhook-test/chegooupay';

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

// --- HELPER: SANITIZAÇÃO DE PAYLOAD ---
const prepareProductPayload = (product: Product) => {
    return {
        id: product.id,
        companyId: product.companyId,
        name: product.name,
        description: product.description || '',
        category: product.category,
        price: product.price,
        image: product.image,
        isAvailable: product.isAvailable,
        pricingMode: product.pricingMode || 'default',
        groups: product.groups ? JSON.parse(JSON.stringify(product.groups)) : [],
        stock: product.stock !== undefined ? product.stock : null
    };
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<{title: string, message: string, type: 'network' | 'permission' | 'unknown'} | null>(null);
  
  // Shared State
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  const [globalSettings, setGlobalSettings] = useState({
      platformFee: 10,
      minWithdrawal: 50,
      maintenanceMode: false
  });

  // --- INITIAL DATA FETCHING (Static Data) ---
  useEffect(() => {
    fetchInitialData();

    // Global Subscriptions (Withdrawals & Messages)
    // Note: In a production app, these should also be filtered by permission.
    
    // 1. Real-time subscription for Messages (Chat)
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
    
    // 2. Real-time subscription for Withdrawals
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
        supabase.removeChannel(messagesSub);
        supabase.removeChannel(withdrawalsSub);
    };
  }, []);

  // --- SMART ORDER SUBSCRIPTION (Based on User Role) ---
  useEffect(() => {
      // Se não estiver logado, não escuta pedidos (segurança)
      if (!currentUser) return;

      // Determina o filtro baseado na Role (A "Opção Recomendada")
      let filter = undefined;
      
      if (currentUser.role === 'client') {
          // 🔒 Segurança: Clientes só recebem updates dos SEUS pedidos
          // O Supabase filtra no servidor antes de enviar o WebSocket
          filter = `customerId=eq.${currentUser.id}`;
      } else if (currentUser.role === 'partner') {
          // 🔒 Segurança: Parceiros só recebem updates da SUA loja
          filter = `companyId=eq.${currentUser.id}`;
      }
      // Admin e Courier recebem todos (filter = undefined)

      console.log(`[Realtime] Iniciando canal de pedidos. Filtro: ${filter || 'TODOS (Admin/Courier)'}`);

      const channel = supabase.channel(`orders_user_${currentUser.id}`)
          .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'orders',
              filter: filter 
          }, (payload) => {
              // Handle Realtime Updates
              if (payload.eventType === 'INSERT') {
                  setOrders(prev => {
                      if (prev.some(o => o.id === payload.new.id)) return prev;
                      return [payload.new as Order, ...prev]; // Newest first
                  });
              } else if (payload.eventType === 'UPDATE') {
                  setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new as Order : o));
              } else if (payload.eventType === 'DELETE') {
                  setOrders(prev => prev.filter(o => o.id !== payload.old.id));
              }
          })
          .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                  console.log('[Realtime] Conectado com sucesso.');
              }
          });

      return () => {
          supabase.removeChannel(channel);
      };
  }, [currentUser]);

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

          // 3. Fetch Orders (Initial Load - In prod, filter this too!)
          // Nota: Em produção, você deve adicionar .eq('customerId', currentUser.id) aqui também no fetch inicial
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
    if (userAttempt.id === 'login_action') {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', userAttempt.email)
                .eq('password', userAttempt.password)
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
                if (!users.find(u => u.id === data.id)) {
                    setUsers([...users, data]);
                }
            }
        } catch (e: any) {
            alert("Erro fatal no login: " + e.message);
        }
    } 
    else if (userAttempt.id.startsWith('u-')) {
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

  const handleUpdateGlobalSettings = (newSettings: typeof globalSettings) => {
      setGlobalSettings(newSettings);
      companies.forEach(async (c) => {
          await supabase.from('companies').update({ serviceFeePercentage: newSettings.platformFee }).eq('id', c.id);
      });
      setCompanies(prev => prev.map(c => ({ ...c, serviceFeePercentage: newSettings.platformFee })));
  };

  const handleSendMessage = async (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => {
      const newMessage = {
          id: `msg-${Date.now()}`,
          orderId,
          senderId,
          senderRole: role,
          text,
          timestamp: new Date().toISOString()
      };
      const { error } = await supabase.from('messages').insert([newMessage]);
      if (error) console.error("Error sending message:", error);
  };

  const handleUpdateWithdrawal = async (id: string, status: 'paid' | 'rejected') => {
      const { error } = await supabase.from('withdrawal_requests').update({ status }).eq('id', id);
      if (error) {
          alert("Erro ao atualizar saque: " + error.message);
      }
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
    const initialStatus = paymentMethod === 'cash' ? 'pending' : 'waiting_payment';

    // --- CÁLCULO FINANCEIRO PARA O N8N ---
    const repasseValue = Math.max(0, finalTotal - serviceFee);

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
        status: initialStatus,
        timestamp: new Date(),
        deliveryCode: code,
        deliveryAddress: currentUser.address,
        pickupAddress: company.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
        deliveryType: company.deliveryType,
        
        // --- NOVOS CAMPOS FINANCEIROS ---
        paymentStatus: paymentMethod === 'cash' ? 'pending' : 'pending',
        repasseStatus: 'pending',
        repasseValue: repasseValue,
        waitingFunds: true
    };

    const { data, error } = await supabase.from('orders').insert([newOrder]).select();
    
    if (error) {
        alert("Erro ao realizar pedido: " + error.message);
        return false;
    }

    // Disparar Webhook para o n8n
    if (paymentMethod !== 'cash') {
        try {
            console.log("🚀 Enviando para n8n:", N8N_WEBHOOK_URL);
            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: newOrder.id, // A CHAVE para o n8n buscar no banco
                    
                    // Dados básicos para notificação
                    customer: {
                        id: currentUser.id,
                        name: currentUser.name,
                        email: currentUser.email,
                        phone: currentUser.phone
                    },
                    items: newOrder.items,
                    companyName: newOrder.companyName,
                    status: newOrder.status,
                    paymentMethod: newOrder.paymentMethod,
                    deliveryMethod: newOrder.deliveryMethod,

                    // DADOS FINANCEIROS (O n8n deve validar isso com o banco)
                    validationStrategy: 'database_lookup',
                    total: newOrder.total,
                    financial: {
                        subtotal: subtotal,
                        deliveryFee: deliveryFee,
                        serviceFee: serviceFee,
                        repasseValue: repasseValue,
                        companyPixKey: company.pixKey, 
                        companyPixType: company.pixKeyType
                    }
                })
            }).catch(err => {
                console.error("Erro no Webhook n8n:", err);
            });
        } catch (e) {
            console.warn("Falha ao disparar Webhook n8n", e);
        }
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
      // Usar a função de sanitização para evitar erros de colunas inexistentes ou loops
      const payload = prepareProductPayload(newProduct);

      const { data, error } = await supabase.from('products').insert([payload]).select();
      
      if (error) {
          console.error("Erro ao salvar produto:", error);
          if (error.code === '42703') {
              alert("Erro de Coluna (42703): Verifique se há Triggers no banco exigindo colunas antigas.");
          } else {
              alert(`Erro ao salvar: ${error.message} (Código: ${error.code})`);
          }
      } else if (data) {
          setProducts([...products, data[0]]);
      }
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
      const payload = prepareProductPayload(updatedProduct);
      
      const { error } = await supabase.from('products').update(payload).eq('id', updatedProduct.id);
      
      if (error) {
          console.error("Erro ao atualizar produto:", error);
          alert(`Erro ao atualizar: ${error.message}`);
      } else {
          setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      }
  };

  const handleDeleteProduct = async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (!error) setProducts(prev => prev.filter(p => p.id !== productId));
      else alert("Erro ao excluir: " + error.message);
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

  switch (currentUser.role) {
    case 'admin':
        return <AdminView 
            users={users} setUsers={setUsers} 
            companies={companies} setCompanies={setCompanies} 
            orders={orders} 
            withdrawals={withdrawals}
            onUpdateWithdrawal={handleUpdateWithdrawal}
            onLogout={handleLogout}
            globalSettings={globalSettings} 
            onUpdateSettings={handleUpdateGlobalSettings}
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
