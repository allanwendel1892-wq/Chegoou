import React, { useState, useEffect, useRef } from 'react';
import { User, Company, Product, Order, FinancialRecord, ChatMessage, CreditCard, Address, WithdrawalRequest, Coupon } from './types';
import AuthView from './components/AuthView';
import AdminView from './components/AdminView';
import PartnerView from './components/PartnerView';
import CourierView from './components/CourierView';
import ClientView from './components/ClientView';
import { supabase } from './services/supabaseClient';
import { PaymentService } from './services/paymentService';
import { Loader2, AlertCircle, Database, Lock } from 'lucide-react';

// >>> IMPORTA OS SONS DE NOTIFICAÇÕES <<<
import somMensagem from './somMensagem.mp3';
import somPedido from './somPedido.mp3';
import somEntrega from './somEntrega.mp3';

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

// --- FUNÇÃO DE NORMALIZAÇÃO DE WHATSAPP ---
const normalizeWhatsApp = (phone: string) => {
    if (!phone) return phone;
    let clean = phone.replace(/\D/g, ''); 

    if (clean.startsWith('0')) clean = clean.substring(1); 

    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }

    if (clean.length === 13 && clean.startsWith('55')) {
        const ddd = parseInt(clean.substring(2, 4), 10);
        if (ddd > 28 && clean[4] === '9') {
            clean = clean.substring(0, 4) + clean.substring(5); 
        }
    }

    return clean;
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<{title: string, message: string, type: 'network' | 'permission' | 'unknown'} | null>(null);
  
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  const [globalSettings, setGlobalSettings] = useState({
      platformFee: 0.49, 
      minWithdrawal: 50,
      maintenanceMode: false
  });

  const ordersRef = useRef<Order[]>([]);
  
  // Pede permissão para Notificações Push assim que o cliente entra
  useEffect(() => {
      if (currentUser && currentUser.role === 'client' && "Notification" in window) {
          if (Notification.permission === "default") {
              Notification.requestPermission();
          }
      }
  }, [currentUser]);

  useEffect(() => { ordersRef.current = orders; }, [orders]);

  useEffect(() => {
      const handlePaymentReturn = async () => {
          const query = new URLSearchParams(window.location.search);
          const collectionStatus = query.get('collection_status');
          const externalReference = query.get('external_reference');

          if (collectionStatus === 'approved' && externalReference) {
              try {
                  const { error } = await supabase
                      .from('orders')
                      .update({ 
                          status: 'pending',
                          paymentStatus: 'approved' 
                      })
                      .eq('id', externalReference);
                  
                  if (error) throw error;
                  alert("Pagamento confirmado com sucesso! Seu pedido foi enviado para a loja.");
                  setOrders(prev => prev.map(o => o.id === externalReference ? { ...o, status: 'pending', paymentStatus: 'approved' } : o));

              } catch (e) {
                  console.error("Erro ao confirmar pagamento no retorno:", e);
              } finally {
                  window.history.replaceState({}, document.title, window.location.pathname);
              }
          }
      };

      if (currentUser) {
          handlePaymentReturn();
      }
  }, [currentUser]);

  useEffect(() => {
    fetchInitialData();

    // LÓGICA DE REALTIME DAS MENSAGENS E SAQUES
    const messagesSub = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const newMsg = payload.new as any;
          const formattedMsg: ChatMessage = {
              ...newMsg,
              timestamp: new Date(newMsg.timestamp)
          };
          
          setChats(prev => {
              const currentChats = prev[formattedMsg.orderId] || [];
              if (currentChats.some(m => m.id === formattedMsg.id)) return prev;
              
              // >>> TOCA SOM DE MENSAGEM <<<
              new Audio(somMensagem).play().catch(() => console.log("Áudio bloqueado"));

              return {
                  ...prev,
                  [formattedMsg.orderId]: [...currentChats, formattedMsg]
              };
          });
      })
      .subscribe();
    
    // ONDE O ERRO ESTAVA: Essa função de saques foi restaurada
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

  // LÓGICA DE REALTIME DOS PEDIDOS (ONDE FICA A NOTIFICAÇÃO DE ENTREGA)
  useEffect(() => {
      if (!currentUser) return;

      let filter = undefined;
      
      if (currentUser.role === 'client') {
          filter = `customerId=eq.${currentUser.id}`;
      } else if (currentUser.role === 'partner') {
          filter = `companyId=eq.${currentUser.id}`;
      }

      const channel = supabase.channel(`orders_user_${currentUser.id}`)
          .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'orders',
              filter: filter 
          }, (payload) => {
              if (payload.eventType === 'INSERT') {
                  const newOrder = payload.new as Order;
                  newOrder.timestamp = new Date(newOrder.timestamp);

                  // >>> TOCA ALERTA DE NOVO PEDIDO PARA O RESTAURANTE <<<
                  if (currentUser.role === 'partner') {
                      new Audio(somPedido).play().catch(() => console.log("Áudio bloqueado"));
                  }

                  setOrders(prev => {
                      if (prev.some(o => o.id === newOrder.id)) return prev;
                      return [newOrder, ...prev]; 
                  });
              } else if (payload.eventType === 'UPDATE') {
                  const updatedOrder = payload.new as Order;
                  updatedOrder.timestamp = new Date(updatedOrder.timestamp);
                  
                  // --- NOTIFICAÇÃO DO CLIENTE: SAIU PARA ENTREGA ---
                  const oldOrder = ordersRef.current.find(o => o.id === updatedOrder.id);
                  if (currentUser.role === 'client' && oldOrder && oldOrder.status !== 'delivering' && updatedOrder.status === 'delivering') {
                      new Audio(somEntrega).play().catch(() => {});
                      
                      if ("Notification" in window && Notification.permission === "granted") {
                          new Notification(`Chegoou! 🛵`, { body: `Oba! Seu pedido de ${updatedOrder.companyName} saiu para entrega!` });
                      } else {
                          alert(`🛵 Oba! Seu pedido de ${updatedOrder.companyName} saiu para entrega!`);
                      }
                  }
                  // -------------------------------------------------

                  setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
              } else if (payload.eventType === 'DELETE') {
                  setOrders(prev => prev.filter(o => o.id !== payload.old.id));
              }
          })
          .subscribe();

      return () => {
          supabase.removeChannel(channel);
      };
  }, [currentUser]);

  // --- POLLING (Busca de Segurança) ---
  useEffect(() => {
      if (!currentUser) return;

      const interval = setInterval(async () => {
          const shouldFetch = currentUser.role === 'partner' || ordersRef.current.some(o => 
              o.status === 'waiting_payment' || o.status === 'pending' || o.status === 'preparing'
          );

          if (!shouldFetch) return;

          let query = supabase.from('orders').select('*');
          
          if (currentUser.role === 'client') {
              query = query.eq('customerId', currentUser.id).in('status', ['waiting_payment', 'pending', 'preparing', 'ready', 'delivering', 'cancelled']);
          } else if (currentUser.role === 'partner') {
              query = query.eq('companyId', currentUser.id).in('status', ['pending', 'preparing', 'ready', 'waiting_courier', 'delivering', 'delivered', 'cancelled', 'waiting_payment']);
          } else {
              return; 
          }

          query = query.order('timestamp', { ascending: false }).limit(50);

          const { data, error } = await query;

          if (!error && data) {
               setOrders((prevOrders) => {
                   const newOrdersMap = new Map<string, Order>(prevOrders.map(o => [o.id, o]));
                   let hasChanges = false;

                   (data as any[]).forEach((freshOrder: any) => {
                       const existing = newOrdersMap.get(freshOrder.id);
                       const formattedFreshOrder: Order = {
                           ...freshOrder,
                           timestamp: new Date(freshOrder.timestamp)
                       };

                       if (!existing) {
                           newOrdersMap.set(freshOrder.id, formattedFreshOrder);
                           hasChanges = true;
                           
                           // Alerta segurança de Novo Pedido (Restaurante)
                           if (currentUser.role === 'partner') {
                               new Audio(somPedido).play().catch(() => {});
                           }

                       } else if (existing.status !== freshOrder.status || existing.paymentStatus !== freshOrder.paymentStatus) {
                           newOrdersMap.set(freshOrder.id, formattedFreshOrder);
                           hasChanges = true;
                           
                           // Alerta segurança de Atualização de Pedido (Restaurante)
                           if (currentUser.role === 'partner') {
                               new Audio(somPedido).play().catch(() => {});
                           }
                           
                           // --- NOTIFICAÇÃO DO CLIENTE: SAIU PARA ENTREGA (GARANTIA NO POLLING) ---
                           if (currentUser.role === 'client' && existing.status !== 'delivering' && freshOrder.status === 'delivering') {
                               new Audio(somEntrega).play().catch(() => {});
                               
                               if ("Notification" in window && Notification.permission === "granted") {
                                   new Notification(`Chegoou! 🛵`, { body: `Oba! Seu pedido de ${freshOrder.companyName} saiu para entrega!` });
                               } else {
                                   alert(`🛵 Oba! Seu pedido de ${freshOrder.companyName} saiu para entrega!`);
                               }
                           }
                       }
                   });

                   if (hasChanges) {
                       return Array.from(newOrdersMap.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                   }
                   return prevOrders;
               });
          }
      }, 3000); 

      return () => clearInterval(interval);
  }, [currentUser]); 


  const fetchInitialData = async () => {
      setIsLoading(true);
      setConnectionError(null);
      try {
          const { data: companiesData, error: companiesError } = await supabase.from('companies').select('*');
          if (companiesError) throw companiesError;
          if (companiesData) setCompanies(companiesData);

          const { data: productsData, error: productsError } = await supabase.from('products').select('*');
          if (productsError) throw productsError;
          if (productsData) setProducts(productsData);

          const { data: ordersData, error: ordersError } = await supabase.from('orders').select('*');
          if (ordersError) throw ordersError;
          if (ordersData) {
              const formattedOrders = ordersData.map(o => ({
                  ...o,
                  timestamp: new Date(o.timestamp)
              }));
              formattedOrders.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              setOrders(formattedOrders);
          }

          const { data: usersData, error: usersError } = await supabase.from('users').select('*');
          if (usersError) throw usersError;
          if (usersData) setUsers(usersData);

          try {
            const { data: couponsData, error: couponsError } = await supabase.from('coupons').select('*');
            if (!couponsError && couponsData) setCoupons(couponsData);
          } catch(e) {}

          try {
            const { data: withdrawalData, error: wdError } = await supabase.from('withdrawal_requests').select('*');
            if (!wdError && withdrawalData) setWithdrawals(withdrawalData);
          } catch (e) {}

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
          } catch (e) {}

      } catch (error: any) {
          console.error("Error fetching initial data:", error);
          let errorType: 'network' | 'permission' | 'unknown' = 'unknown';
          let title = "Erro de Conexão";
          let message = error.message || "Erro desconhecido ao conectar com Supabase";

          if (error.code === '42501') {
              errorType = 'permission';
              title = "Acesso Bloqueado (RLS)";
              message = "O banco de dados recusou a conexão.";
          } else if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
              errorType = 'network';
              title = "Erro de Rede";
              message = "Não foi possível alcançar os servidores do Supabase.";
          }
          setConnectionError({ title, message, type: errorType });
      } finally {
          setIsLoading(false);
      }
  };

  const handleLogout = () => {
    setCurrentUser(null);
  };

  const handleLogin = async (userAttempt: User) => {
    // 1. Normalização e Trava de Segurança
    if (userAttempt.phone) {
        userAttempt.phone = normalizeWhatsApp(userAttempt.phone);
        
        if (userAttempt.phone.length < 12 && userAttempt.id.startsWith('u-')) {
            alert("Por favor, digite o seu número completo com o DDD (Ex: 81 99999-9999).");
            return;
        }
    }

    // 2. Lógica de LOGIN normal (já tem conta)
    if (userAttempt.id === 'login_action') {
        try {
            const { data, error } = await supabase.from('users').select('*').eq('email', userAttempt.email).eq('password', userAttempt.password).single();
            if (error) {
                alert("E-mail ou senha incorretos.");
                return;
            }
            if (data) {
                setCurrentUser(data);
                if (!users.find(u => u.id === data.id)) setUsers([...users, data]);
            }
        } catch (e: any) {
            alert("Erro fatal no login: " + e.message);
        }
    } 
    // 3. Lógica de CADASTRO (Novo usuário no App)
    else if (userAttempt.id.startsWith('u-')) {
        // PERGUNTA AO BANCO: Esse telefone já existe? (Foi criado pelo n8n?)
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('phone', userAttempt.phone)
            .single();

        if (existingUser) {
            // MESCLAGEM DE CONTAS: Atualiza a conta "fantasma" do n8n com os dados reais do app
            const updatedData = {
                name: userAttempt.name,
                email: userAttempt.email,
                password: userAttempt.password,
                role: 'client' 
            };

            const { data: updatedRecord, error: updateError } = await supabase
                .from('users')
                .update(updatedData)
                .eq('id', existingUser.id)
                .select();

            if (updateError) {
                alert("Erro ao sincronizar sua conta do WhatsApp: " + updateError.message);
                return;
            }

            if (updatedRecord) {
                setUsers(users.map(u => u.id === existingUser.id ? updatedRecord[0] : u));
                setCurrentUser(updatedRecord[0]);
                alert("Identificamos que você já pediu no nosso WhatsApp! Suas contas foram unificadas.");
            }
        } else {
            const { data, error } = await supabase.from('users').insert([userAttempt]).select();
            if (error) {
                 alert("Erro ao criar conta: " + error.message);
                 return;
            }
            if (data) {
                setUsers([...users, data[0]]);
                setCurrentUser(data[0]);
            }
        }
    }
  };
  
  const handleUpdateUser = async (updatedUser: User) => {
      if (updatedUser.phone) {
          updatedUser.phone = normalizeWhatsApp(updatedUser.phone);
          
          if (updatedUser.phone.length < 12) {
              alert("Número inválido. Digite o número completo com o DDD.");
              return; 
          }
      }
      
      const { error } = await supabase.from('users').update(updatedUser).eq('id', updatedUser.id);
      
      if (!error) {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        if (currentUser && currentUser.id === updatedUser.id) setCurrentUser(updatedUser);
      }
  };

  const handleDeleteUser = async (userId: string) => {
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (!error) setUsers(users.filter(u => u.id !== userId));
  };

  const handleUpsertCompany = async (company: Company) => {
      const { data, error } = await supabase.from('companies').upsert(company).select();
      if (!error && data) {
           setCompanies(prev => {
               const exists = prev.find(c => c.id === company.id);
               if (exists) return prev.map(c => c.id === company.id ? data[0] : c);
               return [...prev, data[0]];
           });
      }
  };

  const handleDeleteCompany = async (companyId: string) => {
      const { error } = await supabase.from('companies').delete().eq('id', companyId);
      if (!error) setCompanies(companies.filter(c => c.id !== companyId));
  };

  const handleUpdateGlobalSettings = (newSettings: typeof globalSettings) => {
      setGlobalSettings(newSettings);
      companies.forEach(async (c) => {
          await supabase.from('companies').update({ serviceFeePercentage: newSettings.platformFee }).eq('id', c.id);
      });
      setCompanies(prev => prev.map(c => ({ ...c, serviceFeePercentage: newSettings.platformFee })));
  };

  const handleSendMessage = async (orderId: string, text: string, senderId: string, role: 'client' | 'partner') => {
      const newMessageId = `msg-${Date.now()}`;
      const timestampIso = new Date().toISOString();
      
      const optimisticMessage: ChatMessage = {
          id: newMessageId,
          orderId,
          senderId,
          senderRole: role,
          text,
          timestamp: new Date(timestampIso)
      };

      setChats(prev => {
          const currentChats = prev[orderId] || [];
          if (currentChats.some(m => m.id === newMessageId)) return prev;
          return {
              ...prev,
              [orderId]: [...currentChats, optimisticMessage]
          };
      });

      const payloadToInsert = {
          id: newMessageId,
          orderId,
          senderId,
          senderRole: role,
          text,
          timestamp: timestampIso
      };
      
      await supabase.from('messages').insert([payloadToInsert]);
  };

  const handleUpdateWithdrawal = async (id: string, status: 'paid' | 'rejected') => {
      await supabase.from('withdrawal_requests').update({ status }).eq('id', id);
  };

  const handlePlaceOrder = async (
      cartItems: any[], companyId: string, finalTotal: number, deliveryMethod: 'delivery' | 'pickup', serviceFee: number, deliveryFee: number, subtotal: number, paymentMethod: 'cash' | 'card' | 'pix', changeFor?: number, couponCode?: string, discountAmount?: number
  ): Promise<boolean> => {
    if (!currentUser || !currentUser.address) {
        alert("Selecione um endereço.");
        return false;
    }
    
    const company = companies.find(c => c.id === companyId);
    if (!company) return false;

    const isOnlinePayment = paymentMethod !== 'cash';
    const FIXED_SERVICE_FEE = 0.49; 
    
    let repasseValue = 0;
    const subtotalAfterDiscount = subtotal - (discountAmount || 0);

    if (isOnlinePayment) {
        if (company.deliveryType === 'own') {
            repasseValue = subtotalAfterDiscount + deliveryFee;
        } else {
            repasseValue = subtotalAfterDiscount;
        }
    } else {
        if (company.deliveryType === 'chegoou') {
            repasseValue = -1 * (deliveryFee + FIXED_SERVICE_FEE);
        } else {
            repasseValue = 0;
        }
    }

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
        serviceFee: FIXED_SERVICE_FEE, 
        deliveryMethod: deliveryMethod,
        paymentMethod: paymentMethod,
        changeFor: changeFor,
        status: paymentMethod === 'cash' ? 'pending' : 'waiting_payment',
        timestamp: new Date(),
        deliveryCode: currentUser.phone.slice(-4),
        deliveryAddress: currentUser.address,
        pickupAddress: company.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
        deliveryType: company.deliveryType,
        paymentStatus: 'pending',
        repasseValue: repasseValue,
        repasseStatus: 'pending',
        couponCode: couponCode,
        discountAmount: discountAmount
    };

    const { error } = await supabase.from('orders').insert([newOrder]);
    
    if (error) {
        alert("Erro ao realizar pedido: " + error.message);
        return false;
    }

    if (paymentMethod !== 'cash') {
        try {
            const paymentResponse = await PaymentService.processPayment(
                finalTotal,
                paymentMethod,
                currentUser,
                `Pedido #${newOrder.id} - ${company.name}`,
                newOrder.id
            );

            if (paymentResponse.ticketUrl && !paymentResponse.copyPaste && !paymentResponse.qrCodeBase64) {
                window.location.assign(paymentResponse.ticketUrl);
                return true; 
            }

            if (paymentMethod === 'pix' && (paymentResponse.copyPaste || paymentResponse.qrCodeBase64)) {
                 await supabase.from('orders').update({
                    paymentPixCode: paymentResponse.copyPaste,
                    paymentPixImage: paymentResponse.qrCodeBase64,
                    paymentId: paymentResponse.paymentId
                 }).eq('id', newOrder.id);
            }

            if (!paymentResponse.success) {
                alert("Pagamento não aprovado: " + paymentResponse.message);
                await supabase.from('orders').update({ status: 'cancelled' }).eq('id', newOrder.id);
                return false;
            }

        } catch (e: any) {
            alert("Erro ao iniciar pagamento: " + (e.message || "Erro desconhecido."));
            return false;
        }
    }

    return true;
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    if (status === 'cancelled') {
        const orderToCancel = orders.find(o => o.id === orderId);
        
        if (orderToCancel && orderToCancel.paymentId && orderToCancel.paymentMethod !== 'cash') {
            console.log("Cancelamento detectado. Iniciando estorno...", orderToCancel.paymentId);
            try {
                const refundResult = await PaymentService.refundPayment(orderToCancel.paymentId);
                if (refundResult.success) {
                    alert("Pedido cancelado e estorno processado com sucesso!");
                    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, paymentStatus: 'refunded' } : o));
                    await supabase.from('orders').update({ status, paymentStatus: 'refunded' }).eq('id', orderId);
                    return;
                } else {
                    alert("Aviso: O pedido foi cancelado, mas houve erro no estorno automático: " + refundResult.message);
                }
            } catch (e) {
                console.error("Refund error", e);
            }
        }
    }

    let updateData: Partial<Order> = { status };
    
    if (status === 'delivered') {
        updateData.repasseStatus = 'blocked';
        updateData.repasseDate = new Date().toISOString();
    }

    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
    await supabase.from('orders').update(updateData).eq('id', orderId);
  };

  const handleCourierAcceptOrder = async (orderId: string) => {
      if (!currentUser) return;
      
      const updateData: { status: Order['status']; courierId: string } = {
          status: 'delivering',
          courierId: currentUser.id
      };

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
      await supabase.from('orders').update(updateData).eq('id', orderId);
  };

  const handleCancelOrder = async (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;
      if (!currentUser) return;

      if (currentUser.role === 'client') {
          if (order.status !== 'pending' && order.status !== 'waiting_payment') {
              alert("Não é possível cancelar. O restaurante já começou a preparar seu pedido. Entre em contato com a loja.");
              return;
          }
      }
      
      if (window.confirm("Tem certeza que deseja cancelar este pedido? Se houve pagamento online, o estorno será processado.")) {
          await updateOrderStatus(orderId, 'cancelled');
      }
  };
  
  const handleUpdateFullOrder = async (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    await supabase.from('orders').update(updatedOrder).eq('id', updatedOrder.id);
  };

  const handleDeleteOrder = async (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('orders').delete().eq('id', orderId);
  };

  const handleAddProduct = async (newProduct: Product) => {
      const payload = prepareProductPayload(newProduct);
      const { data, error } = await supabase.from('products').insert([payload]).select();
      if (!error && data) setProducts([...products, data[0]]);
  };

  const handleUpdateProduct = async (updatedProduct: Product) => {
      const payload = prepareProductPayload(updatedProduct);
      const { error } = await supabase.from('products').update(payload).eq('id', updatedProduct.id);
      if (!error) setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
  };

  const handleDeleteProduct = async (productId: string) => {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (!error) setProducts(prev => prev.filter(p => p.id !== productId));
  };
  
  const handleUpdateCompany = async (companyId: string, data: Partial<Company>) => {
      const { error } = await supabase.from('companies').update(data).eq('id', companyId);
      if(!error) {
        setCompanies(prevCompanies => 
            prevCompanies.map(c => c.id === companyId ? {...c, ...data} : c)
        );
      }
  };

  const handleAddAddress = (address: Address) => {
      if (!currentUser) return;
      handleUpdateUser({ ...currentUser, address: address, savedAddresses: [...(currentUser.savedAddresses || []), address] });
  };

  const handleRemoveAddress = (index: number) => {
      if (!currentUser || !currentUser.savedAddresses) return;
      const updatedAddresses = [...currentUser.savedAddresses];
      updatedAddresses.splice(index, 1);
      handleUpdateUser({ ...currentUser, savedAddresses: updatedAddresses });
  };

  const handleAddCard = (card: CreditCard) => {
      if (!currentUser) return;
      handleUpdateUser({ ...currentUser, savedCards: [...(currentUser.savedCards || []), card] });
  };

  const handleRemoveCard = (index: number) => {
      if (!currentUser || !currentUser.savedCards) return;
      const updatedCards = [...currentUser.savedCards];
      updatedCards.splice(index, 1);
      handleUpdateUser({ ...currentUser, savedCards: updatedCards });
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
              <AlertCircle className="w-10 h-10 text-red-600 mb-4 mx-auto" />
              <h2 className="text-xl font-bold text-gray-900">{connectionError.title}</h2>
              <p className="text-gray-500 mt-2 max-w-md">{connectionError.message}</p>
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
        if (!myCompany) return <div className="h-screen flex items-center justify-center">Loja não encontrada. <button onClick={handleLogout}>Sair</button></div>;
        
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
            acceptOrder={handleCourierAcceptOrder}
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
            coupons={coupons}
            onUpdateUser={handleUpdateUser}
            chats={chats}
            onSendMessage={handleSendMessage}
            onAddAddress={handleAddAddress}
            onRemoveAddress={handleRemoveAddress}
            onAddCard={handleAddCard}
            onRemoveCard={handleRemoveCard}
            onCancelOrder={handleCancelOrder} 
        />;
  }
};

export default App;
