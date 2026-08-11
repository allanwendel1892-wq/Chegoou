/**
 * SISTEMA CHEGOOU - CORE APPLICATION
 * Versão: 2.0.0 (PWA Optimized)
 * Descrição: Gestão completa de delivery, marketplace e logística.
 */

import DigitalMenuView from './components/DigitalMenuView';

import React, { 
    useState,
    lazy,
    Suspense,
    useEffect, 
    useRef,
    useMemo
} from 'react';

// --- DEFINIÇÕES DE TIPOS E INTERFACES ---
import { 
    User, 
    Company, 
    Product, 
    Order, 
    FinancialRecord, 
    ChatMessage, 
    CreditCard, 
    Address, 
    WithdrawalRequest, 
    Coupon 
} from './types';

// --- COMPONENTES DE VISUALIZAÇÃO ---
const AuthView = lazy(() => import('./components/AuthView'));
const AdminView = lazy(() => import('./components/AdminView'));
const PartnerView = lazy(() => import('./components/PartnerView'));
const CourierView = lazy(() => import('./components/CourierView'));
const ClientView = lazy(() => import('./components/ClientView'));

// --- SERVIÇOS E UTILITÁRIOS ---
import { supabase } from './services/supabaseClient';
import { PaymentService } from './services/paymentService';
import { 
    Loader2, 
    AlertCircle, 
    Database, 
    Lock,
    Store, // Usado na tela de "Loja não encontrada" do Cardápio Digital
    Download // Adicionado para o botão de instalação
} from 'lucide-react';

// >>> MOTOR DO PWA (Registro do Service Worker) <<<
import { registerSW } from 'virtual:pwa-register';

// O PWA só vai tentar baixar o cache offline DEPOIS que o app abrir
window.addEventListener('load', () => {
    registerSW({ immediate: true });
});

// >>> RECURSOS DE ÁUDIO PARA NOTIFICAÇÕES <<<
import somMensagem from './somMensagem.mp3';
import somPedido from './somPedido.mp3';
import somEntrega from './somEntrega.mp3';

// -----------------------------------------------------------------------------
// FUNÇÕES UTILITÁRIAS GLOBAIS
// -----------------------------------------------------------------------------

/**
 * Cálculo de distância entre dois pontos (Haversine)
 */
const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; // Raio da Terra em Km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
};

/**
 * Preparação de payload de produto para o banco de dados
 */
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

/**
 * Enriquece os produtos buscados com os ingredientes (ficha técnica),
 * lendo `compositions` + `inventory_items` e injetando o resultado
 * na propriedade `description` de cada `option` dentro de `groups`.
 */
const enrichProductsWithIngredients = async (fetchedProducts: Product[]): Promise<Product[]> => {
    if (!fetchedProducts || fetchedProducts.length === 0) return fetchedProducts;

    try {
        // Monta a lista de "reference_id" possíveis (id do produto base + id/nome
        // de cada opção/sabor dentro dos grupos), apenas para os produtos que
        // realmente estão em tela — evita baixar a ficha técnica inteira do banco.
        const referenceIds = new Set<string>();
        fetchedProducts.forEach((product) => {
            referenceIds.add(String(product.id));
            if (product.groups && Array.isArray(product.groups)) {
                (product.groups as any[]).forEach((group) => {
                    if (group.options && Array.isArray(group.options)) {
                        group.options.forEach((option: any) => {
                            if (option.id) referenceIds.add(String(option.id));
                            if (option.name) referenceIds.add(String(option.name));
                        });
                    }
                });
            }
        });
        const referenceIdsArray = Array.from(referenceIds);

        if (referenceIdsArray.length === 0) return fetchedProducts;

        // 1ª consulta: só as composições cujo reference_id pertence aos produtos em tela.
        const { data: compositions, error: compositionsError } = await supabase
            .from('compositions')
            .select('*')
            .in('referenceId', referenceIdsArray);

        if (compositionsError) throw compositionsError;
        if (!compositions || compositions.length === 0) return fetchedProducts;

        // 2ª consulta: só os insumos de estoque realmente usados nessas composições.
        const inventoryIds = Array.from(new Set(
            compositions
                .map((comp: any) => String(comp.inventory_item_id ?? comp.inventoryItemId ?? ''))
                .filter(Boolean)
        ));

        const { data: inventoryItems, error: inventoryError } = inventoryIds.length > 0
            ? await supabase.from('inventory_items').select('id, name').in('id', inventoryIds)
            : { data: [] as any[], error: null };

        if (inventoryError) throw inventoryError;
        if (!compositions || !inventoryItems) return fetchedProducts;

        // Mapa id -> name dos insumos
        const inventoryMap = new Map<string, string>();
        inventoryItems.forEach((item: any) => {
            inventoryMap.set(String(item.id), item.name);
        });

        // Agrupa os nomes de ingredientes por reference_id (sabor/opção)
        const ingredientsByReference = new Map<string, string[]>();
        compositions.forEach((comp: any) => {
            const referenceId = comp.reference_id ?? comp.referenceId;
            const inventoryItemId = comp.inventory_item_id ?? comp.inventoryItemId;
            if (!referenceId || !inventoryItemId) return;

            const ingredientName = inventoryMap.get(String(inventoryItemId));
            if (!ingredientName) return;

            const key = String(referenceId);
            if (!ingredientsByReference.has(key)) {
                ingredientsByReference.set(key, []);
            }
            ingredientsByReference.get(key)!.push(ingredientName);
        });

        // Mapeia os produtos, injetando os ingredientes em cada option
        return fetchedProducts.map((product) => {
            if (!product.groups || !Array.isArray(product.groups)) return product;

            const updatedGroups = product.groups.map((group: any) => {
                if (!group.options || !Array.isArray(group.options)) return group;

                const updatedOptions = group.options.map((option: any) => {
                    const ingredientsByName = option.name ? ingredientsByReference.get(String(option.name)) : undefined;
                    const ingredientsById = option.id ? ingredientsByReference.get(String(option.id)) : undefined;
                    const ingredients = ingredientsByName || ingredientsById;

                    if (ingredients && ingredients.length > 0) {
                        return {
                            ...option,
                            description: ingredients.join(', ')
                        };
                    }
                    return option;
                });

                return { ...group, options: updatedOptions };
            });

            return { ...product, groups: updatedGroups };
        });
    } catch (error) {
        console.error("Erro ao enriquecer produtos com ingredientes:", error);
        return fetchedProducts;
    }
};

/**
 * Normalização de números de WhatsApp para o formato internacional
 */
const normalizeWhatsApp = (phone: string) => {
    if (!phone) return phone;
    let clean = phone.replace(/\D/g, ''); 

    // Remove zero inicial se houver
    if (clean.startsWith('0')) {
        clean = clean.substring(1);
    }

    // Adiciona código do país se faltar
    if (clean.length === 10 || clean.length === 11) {
        clean = '55' + clean;
    }

    // Ajuste de nono dígito para regiões específicas
    if (clean.length === 13 && clean.startsWith('55')) {
        const ddd = parseInt(clean.substring(2, 4), 10);
        if (ddd > 28 && clean[4] === '9') {
            clean = clean.substring(0, 4) + clean.substring(5); 
        }
    }

    return clean;
};

/**
 * Função Global de Geolocalização via Navegador (PWA Ready)
 */
export const getDeviceLocation = async () => {
    console.log("Iniciando captura de localização via navegador...");
    return new Promise<{lat: number, lng: number}>((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocalização não suportada pelo navegador."));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                console.log("Localização obtida com sucesso.");
                resolve({ 
                    lat: pos.coords.latitude, 
                    lng: pos.coords.longitude 
                });
            },
            (err) => {
                console.error("Erro ao obter localização:", err);
                reject(err);
            },
            { 
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
};

// -----------------------------------------------------------------------------
// COMPONENTE PRINCIPAL
// -----------------------------------------------------------------------------

// >>> MOTOR DE CÁLCULO DE ESTOQUE (FICHA TÉCNICA) <<<
const processInventoryDeduction = async (orderItems: any[], dbCompositions: any[]) => {
  const stockDeductions: Record<string, number> = {};

  orderItems.forEach(item => {
    // 1. Desconta insumos ligados DIRETAMENTE ao produto base
    const baseCompositions = dbCompositions.filter(c => c.referenceId === item.productId);
    baseCompositions.forEach(comp => {
      const totalToDeduct = comp.amount_needed * item.quantity;
      stockDeductions[comp.inventory_item_id] = (stockDeductions[comp.inventory_item_id] || 0) + totalToDeduct;
    });

    // 2. Desconta insumos ligados às OPÇÕES/SABORES (ex: Calabresa)
    if (item.selectedOptions && item.selectedOptions.length > 0) {
      // Conta quantos sabores a pizza tem para saber se é 1/2, 1/3, etc.
      const fractions = item.selectedOptions.length;
      const fractionMultiplier = 1 / fractions; 

      item.selectedOptions.forEach((option: any) => {
        // Assume que o optionName ou ID da opção é a referência na ficha técnica
        const referenceToSearch = option.id || option.name || option.optionName;
        const optionCompositions = dbCompositions.filter(c => c.referenceId === referenceToSearch);
        
        optionCompositions.forEach(comp => {
          const totalToDeduct = (comp.amount_needed * fractionMultiplier) * item.quantity;
          stockDeductions[comp.inventory_item_id] = (stockDeductions[comp.inventory_item_id] || 0) + totalToDeduct;
        });
      });
    }
  });

  return stockDeductions;
};
// >>> FIM DO MOTOR DE CÁLCULO <<<

const App: React.FC = () => {
  // ---------------------------------------------------------------------------
  // ROTEAMENTO PÚBLICO: CARDÁPIO DIGITAL (SEM LOGIN)
  // Detecta URLs no formato /cardapio/:companyId para liberar acesso
  // ao DigitalMenuView sem exigir autenticação.
  // ---------------------------------------------------------------------------
  const menuRouteMatch = window.location.pathname.match(/^\/cardapio\/([^/?#]+)/);
  const publicMenuCompanyId = menuRouteMatch ? decodeURIComponent(menuRouteMatch[1]) : null;

  // ESTADOS DE AUTENTICAÇÃO E USUÁRIO
  // CORREÇÃO DE SESSÃO (BUG DO APP DESLOGANDO EM SEGUNDO PLANO):
  // O useState puro perdia o usuário sempre que o app ia para segundo
  // plano no mobile (a aba/WebView é suspensa/recriada pelo SO). Agora o
  // estado inicial tenta ler do localStorage antes de cair para `null`,
  // então uma sessão já logada sobrevive a esse ciclo de suspensão.
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
      try {
          const stored = localStorage.getItem('chegoou_user');
          return stored ? JSON.parse(stored) : null;
      } catch (e) {
          console.error("Erro ao ler sessão salva do localStorage:", e);
          return null;
      }
  });
  const currentUserRef = useRef<User | null>(null);
  
  useEffect(() => { 
    currentUserRef.current = currentUser; 
  }, [currentUser]);

  // Mantém o localStorage sempre sincronizado com o usuário logado.
  // Dispara tanto no login (quando handleLogin chama setCurrentUser)
  // quanto no logout (quando currentUser vira null).
  useEffect(() => {
      try {
          if (currentUser) {
              localStorage.setItem('chegoou_user', JSON.stringify(currentUser));
          } else {
              localStorage.removeItem('chegoou_user');
          }
      } catch (e) {
          console.error("Erro ao persistir sessão no localStorage:", e);
      }
  }, [currentUser]);

  // MUTEX/LOCK: Evita que o polling sobrescreva atualizações otimistas de pedidos
  // que ainda estão sendo persistidas no banco (efeito "bate e volta").
  const lockedOrders = useRef(new Set<string>());

  // --- LÓGICA DE INSTALAÇÃO PWA ---
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Impede que o mini-infobar apareça no mobile
      e.preventDefault();
      // Guarda o evento para ser disparado depois
      setDeferredPrompt(e);
      console.log("Evento beforeinstallprompt capturado.");
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Mostra o prompt de instalação
    deferredPrompt.prompt();

    // Aguarda a resposta do usuário
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Usuário respondeu ao prompt de instalação: ${outcome}`);

    // Limpa o prompt independentemente do resultado
    setDeferredPrompt(null);
  };
  // --------------------------------

  // ESTADOS DE NOTIFICAÇÃO (TOAST INTERNO)
  const [inAppNotification, setInAppNotification] = useState<{
    title: string;
    message: string;
    icon: string;
  } | null>(null);

  /**
   * Exibe notificação visual na tela
   */
  const showInAppNotification = (title: string, message: string, icon: string) => {
      setInAppNotification({ title, message, icon });
      setTimeout(() => setInAppNotification(null), 5000); 
  };

  // ESTADOS DE CARREGAMENTO E ERRO
  // isLoading agora só controla o carregamento dos dados do PAINEL (admin/parceiro/entregador/cliente).
  // Ele NÃO bloqueia mais a tela de Login nem o Cardápio Digital, que têm seus próprios estados abaixo.
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<{
    title: string;
    message: string;
    type: 'network' | 'permission' | 'unknown';
  } | null>(null);

  // ESTADOS EXCLUSIVOS DO CARDÁPIO DIGITAL PÚBLICO (rota /cardapio/:companyId)
  // Isolados do carregamento geral do painel para abrir instantaneamente.
  const [isMenuLoading, setIsMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  
  // ESTADOS DE DADOS GLOBAIS
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  // CONFIGURAÇÕES GLOBAIS DA PLATAFORMA
  const [globalSettings, setGlobalSettings] = useState({
      platformFee: 0.49, 
      minWithdrawal: 50,
      maintenanceMode: false
  });

  const ordersRef = useRef<Order[]>([]);
  useEffect(() => { 
    ordersRef.current = orders; 
  }, [orders]);

    const myPartnerCompany = currentUser?.role === 'partner' 
      ? companies.find(c => c.id === currentUser.id) 
      : null;

  const partnerOrders = useMemo(() => {
      return orders.filter(o => o.companyId === myPartnerCompany?.id);
  }, [orders, myPartnerCompany?.id]);

  const partnerProducts = useMemo(() => {
      return products.filter(p => p.companyId === myPartnerCompany?.id);
  }, [products, myPartnerCompany?.id]);

  // ---------------------------------------------------------------------------
  // EFEITOS DE SISTEMA
  // ---------------------------------------------------------------------------

  /**
   * Aviso de Instalação para iPhone (iOS PWA)
   */
  useEffect(() => {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    
    // Adicionamos "!publicMenuCompanyId" para que o alerta NÃO dispare na tela do Cardápio Digital
    if (isIos && !isStandalone && !publicMenuCompanyId) {
      setTimeout(() => {
        alert("Dica Chegoou: Para instalar o App, clique no ícone de 'Compartilhar' no seu Safari e escolha 'Adicionar à Tela de Início' 📲");
      }, 6000);
    }
  }, [publicMenuCompanyId]); // Variável adicionada ao array de dependências

    
  /**
   * Processamento de retorno de pagamento (Mercado Pago / Outros)
   */
  useEffect(() => {
      const handlePaymentReturn = async () => {
          const query = new URLSearchParams(window.location.search);
          const collectionStatus = query.get('collection_status');
          const externalReference = query.get('external_reference');

          if (collectionStatus === 'approved' && externalReference) {
              console.log("Pagamento aprovado detectado para o pedido:", externalReference);
              try {
                  const { error } = await supabase
                      .from('orders')
                      .update({ 
                          status: 'pending',
                          paymentStatus: 'approved' 
                      })
                      .eq('id', externalReference);
                  
                  if (error) throw error;
                  
                  showInAppNotification(
                      "Sucesso!",
                      "Pagamento confirmado! Seu pedido foi enviado para a loja.",
                      "✅"
                  );
                  
                  setOrders(prev => prev.map(o => o.id === externalReference ? { ...o, status: 'pending', paymentStatus: 'approved' } : o));

              } catch (e) {
                  console.error("Erro ao confirmar pagamento no retorno:", e);
              } finally {
                  // Limpa a URL para evitar reprocessamento ao recarregar
                  window.history.replaceState({}, document.title, window.location.pathname);
              }
          }
      };

      if (currentUser) {
          handlePaymentReturn();
      }
  }, [currentUser]);

  /**
   * Busca inicial de dados (sem Realtime — apenas REST/HTTP via Supabase)
   * O Realtime (WebSocket) foi desativado propositalmente. Todo o sistema
   * agora se mantém sincronizado via polling (ver useEffect abaixo).
   *
   * ROTEAMENTO DE CARREGAMENTO:
   * - Se for o Cardápio Digital (/cardapio/:id) -> busca SÓ a loja + produtos dela.
   * - Caso contrário -> busca o pacote completo do painel (companies, products,
   *   orders, users, coupons, withdrawals, messages), sem travar a tela de login,
   *   que já é exibida instantaneamente (ver LÓGICA DE RENDERIZAÇÃO mais abaixo).
   */
  useEffect(() => {
    if (publicMenuCompanyId) {
      fetchPublicMenuData();
    } else {
      fetchInitialData();
    }
  }, []);

  /**
   * POLLING UNIFICADO (substitui os antigos canais Realtime de
   * "orders", "messages" e "withdrawal_requests").
   *
   * A cada 5 segundos, busca o que há de novo em Pedidos, Mensagens de
   * Chat e Solicitações de Saque, comparando com o estado atual em tela
   * para disparar os mesmos sons/notificações que o Realtime disparava,
   * mas sem depender de WebSocket.
   */
  useEffect(() => {
      if (!currentUser) return;

      const fetchOrdersUpdate = async () => {
          // Só busca pedidos se houver pedidos ativos ou se for parceiro
          const activeOrders = ordersRef.current.filter(o => 
              ['waiting_payment', 'pending', 'preparing', 'ready', 'delivering'].includes(o.status)
          );
          const shouldFetch = currentUser.role === 'partner' || currentUser.role === 'courier' || activeOrders.length > 0;
if (!shouldFetch) return;

          let query = supabase.from('orders').select('*');

          if (currentUser.role === 'client') {
    query = query.eq('customerId', currentUser.id)
                 .in('status', ['waiting_payment', 'pending', 'preparing', 'ready', 'delivering', 'cancelled']);
} else if (currentUser.role === 'partner') {
    query = query.eq('companyId', currentUser.id)
                 .in('status', ['pending', 'preparing', 'ready', 'waiting_courier', 'delivering', 'delivered', 'cancelled', 'waiting_payment']);
} else if (currentUser.role === 'courier') {
    // Entregador só pode puxar pedidos do restaurante ao qual está vinculado
    // (users.companyId). Sem vínculo, não busca nada.
    const courierCompanyId = (currentUser as any).companyId;
    if (!courierCompanyId) return;
    query = query.eq('companyId', courierCompanyId)
                 .in('status', ['ready', 'waiting_courier', 'delivering']);
} else {
    return;
}

          query = query.order('timestamp', { ascending: false }).limit(50);

          const { data, error } = await query;
          if (error || !data) return;

          setOrders((prevOrders) => {
              const newOrdersMap = new Map<string, Order>(prevOrders.map(o => [o.id, o]));
              let hasChanges = false;

              (data as any[]).forEach((freshOrder: any) => {
                  // MUTEX/LOCK: Ignora pedidos que estão com uma atualização otimista
                  // em andamento (ainda sendo persistida no Supabase), para não
                  // sobrescrever a UI com o dado antigo vindo do polling.
                  if (lockedOrders.current.has(freshOrder.id)) return;

                  const existing = newOrdersMap.get(freshOrder.id);
                  const formattedFreshOrder: Order = {
                      ...freshOrder,
                      timestamp: new Date(freshOrder.timestamp)
                  };

                  if (!existing) {
                      newOrdersMap.set(freshOrder.id, formattedFreshOrder);
                      hasChanges = true;

                      if (currentUser.role === 'partner') {
                          new Audio(somPedido).play().catch(() => {});
                          showInAppNotification("Novo Pedido!", `Você recebeu um novo pedido de ${formattedFreshOrder.customerName}`, "🔔");
                      }

                  } else if (existing.status !== freshOrder.status || existing.paymentStatus !== freshOrder.paymentStatus) {
                      newOrdersMap.set(freshOrder.id, formattedFreshOrder);
                      hasChanges = true;

                      if (currentUser.role === 'client') {
                          // Notificação de Entrega
                          if (freshOrder.deliveryMethod === 'delivery' && existing.status !== 'delivering' && freshOrder.status === 'delivering') {
                              new Audio(somEntrega).play().catch(() => {});
                              showInAppNotification(
                                 'Chegoou! 🛵', 
                                 `Oba! Seu pedido de ${freshOrder.companyName} saiu para entrega!`,
                                 '🛵'
                              );
                          }
                          // Notificação de Retirada
                          else if (freshOrder.deliveryMethod === 'pickup' && existing.status !== 'ready' && freshOrder.status === 'ready') {
                              new Audio(somEntrega).play().catch(() => {});
                              showInAppNotification(
                                 'Tá na mão! 🛍️', 
                                 `Seu pedido de ${freshOrder.companyName} está pronto no balcão!`,
                                 '🛍️'
                              );
                          }
                      }
                  }
              });

              if (hasChanges) {
                  return Array.from(newOrdersMap.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
              }
              return prevOrders;
          });
      };

      const fetchMessagesUpdate = async () => {
          const { data, error } = await supabase
              .from('messages')
              .select('*')
              .order('timestamp', { ascending: true });

          if (error || !data) return;

          setChats(prev => {
              let hasChanges = false;
              const next: Record<string, ChatMessage[]> = { ...prev };

              (data as any[]).forEach((msg: any) => {
                  const formattedMsg: ChatMessage = {
                      ...msg,
                      timestamp: new Date(msg.timestamp)
                  };

                  const currentList = next[formattedMsg.orderId] || [];
                  if (currentList.some(m => m.id === formattedMsg.id)) return;

                  if (currentUserRef.current && formattedMsg.senderRole !== currentUserRef.current.role) {
                      new Audio(somMensagem).play().catch(() => {});
                      showInAppNotification(`Nova mensagem`, formattedMsg.text, '💬');
                  }

                  next[formattedMsg.orderId] = [...currentList, formattedMsg];
                  hasChanges = true;
              });

              return hasChanges ? next : prev;
          });
      };

      const fetchWithdrawalsUpdate = async () => {
          let query = supabase.from('withdrawal_requests').select('*');
          
          // Otimiza o Polling igual otimizamos o initial fetch
          if (currentUser.role === 'partner') {
              query = query.or(`userId.eq.${currentUser.id},companyId.eq.${currentUser.id}`);
          } else if (currentUser.role === 'courier') {
              query = query.eq('userId', currentUser.id);
          }

          const { data, error } = await query;
          if (error || !data) return;

          setWithdrawals(prev => {
              const prevMap = new Map(prev.map(w => [w.id, w]));
              let hasChanges = false;

              (data as WithdrawalRequest[]).forEach(fresh => {
                  const existing = prevMap.get(fresh.id);
                  if (!existing || JSON.stringify(existing) !== JSON.stringify(fresh)) {
                      prevMap.set(fresh.id, fresh);
                      hasChanges = true;
                  }
              });

              return hasChanges ? Array.from(prevMap.values()) : prev;
          });
      };

      const runPolling = () => {
          fetchOrdersUpdate();
          fetchMessagesUpdate();
          fetchWithdrawalsUpdate();
      };

      const interval = setInterval(runPolling, 5000);
      return () => clearInterval(interval);
  }, [currentUser]); 

  // ---------------------------------------------------------------------------
  // MANIPULADORES DE DADOS (HANDLERS)
  // ---------------------------------------------------------------------------

  /**
   * Busca inicial de todos os dados do sistema
   */
  /**
   * Busca inicial de todos os dados do sistema
   */
  /**
   * Busca RÁPIDA e ISOLADA para o Cardápio Digital Público.
   * Só baixa a loja e os produtos daquela loja — nada de orders, users,
   * coupons, withdrawals ou messages. Não usa nem depende de isLoading
   * do painel, então o cardápio abre assim que essas 2 consultas voltarem.
   */
  const fetchPublicMenuData = async () => {
      setIsMenuLoading(true);
      setMenuError(null);
      try {
          const [{ data: singleCompany, error: companyErr }, { data: storeProducts, error: productsErr }] =
              await Promise.all([
                  supabase.from('companies').select('*').eq('id', publicMenuCompanyId),
                  supabase.from('products').select('*').eq('companyId', publicMenuCompanyId)
              ]);

          if (companyErr) throw companyErr;
          if (productsErr) throw productsErr;

          if (singleCompany) setCompanies(singleCompany);
          if (storeProducts) {
              const enrichedProducts = await enrichProductsWithIngredients(storeProducts);
              setProducts(enrichedProducts);
          }
      } catch (error: any) {
          console.error("Erro ao carregar cardápio digital:", error);
          setMenuError(error.message || "Não foi possível carregar o cardápio agora.");
      } finally {
          setIsMenuLoading(false);
      }
  };

  const fetchInitialData = async () => {
      setIsLoading(true);
      setConnectionError(null);
      console.log("Iniciando carregamento de dados globais otimizado...");

      // Usa o usuário logado (via ref, que já reflete o localStorage restaurado)
      // para decidir quais filtros aplicar nas queries ANTES de disparar tudo.
      const role = currentUserRef.current?.role;
      const userId = currentUserRef.current?.id;
      const courierCompanyId = (currentUserRef.current as any)?.companyId; // Necessário para motoboys

      const ACTIVE_STATUSES = ['pending', 'preparing', 'ready', 'waiting_courier', 'delivering', 'waiting_payment'];
      const INACTIVE_STATUSES = ['delivered', 'cancelled'];
      const HISTORY_PAGE_SIZE = 50;

      try {
          // --- Monta as queries dinamicamente conforme o perfil de quem logou ---
          let productsQuery: any = supabase.from('products').select('*').limit(5000);
          let ordersQuery: any = supabase.from('orders').select('*').limit(5000);
          let ordersHistoryQuery: PromiseLike<{ data: any[] | null; error: any }> = Promise.resolve({ data: [], error: null });
          
          // QUERIES GLOBAIS QUE AGORA SÃO DINÂMICAS PARA NÃO TRAVAR O SISTEMA
          let usersQuery: any = supabase.from('users').select('*').limit(5000);
          let couponsQuery: any = supabase.from('coupons').select('*');
          let withdrawalsQuery: any = supabase.from('withdrawal_requests').select('*');
          let messagesQuery: any = supabase.from('messages').select('*').order('timestamp', { ascending: true });

          if (role === 'partner' && userId) {
              // Parceiro só precisa dos produtos/pedidos da própria loja.
              productsQuery = supabase.from('products').select('*').eq('companyId', userId);
              
              // Pedidos ativos da loja (sem limite de histórico).
              ordersQuery = supabase.from('orders').select('*')
                  .eq('companyId', userId)
                  .in('status', ACTIVE_STATUSES);
                  
              // Últimos 50 pedidos inativos (concluídos/cancelados) da loja.
              ordersHistoryQuery = supabase.from('orders').select('*')
                  .eq('companyId', userId)
                  .in('status', INACTIVE_STATUSES)
                  .order('timestamp', { ascending: false })
                  .limit(HISTORY_PAGE_SIZE);

              // Baixar apenas os usuários que são o próprio parceiro OU entregadores vinculados a ele
              usersQuery = supabase.from('users').select('*').or(`id.eq.${userId},companyId.eq.${userId}`);
              
              // Baixar apenas cupons deste restaurante
              couponsQuery = supabase.from('coupons').select('*').eq('companyId', userId);
              
              // Baixar saques apenas deste restaurante (seja do parceiro ou repasses dos motoboys)
              withdrawalsQuery = supabase.from('withdrawal_requests').select('*').or(`userId.eq.${userId},companyId.eq.${userId}`);

          } else if (role === 'client' && userId) {
              // Cliente só precisa dos próprios pedidos.
              ordersQuery = supabase.from('orders').select('*')
                  .eq('customerId', userId)
                  .limit(5000);

          } else if (role === 'courier' && userId) {
              // Entregador não precisa baixar o cardápio
              productsQuery = Promise.resolve({ data: [], error: null }) as any;
              
              if (courierCompanyId) {
                  // Entregador só baixa pedidos do restaurante que ele está vinculado
                  ordersQuery = supabase.from('orders').select('*').eq('companyId', courierCompanyId).limit(5000);
              } else {
                  // Sem vínculo, não baixa pedidos
                  ordersQuery = Promise.resolve({ data: [], error: null }) as any;
              }
              
              // Entregador só baixa seus próprios saques
              withdrawalsQuery = supabase.from('withdrawal_requests').select('*').eq('userId', userId);
          }
          // admin / não logado: mantém as queries completas (comportamento anterior).

          // --- Dispara TODAS as requisições principais em paralelo (elimina o waterfall) ---
          const [
              companiesRes,
              productsRes,
              ordersRes,
              ordersHistoryRes,
              usersRes,
              couponsRes,
              withdrawalsRes,
              messagesRes
          ] = await Promise.all([
              supabase.from('companies').select('*'),
              productsQuery,
              ordersQuery,
              ordersHistoryQuery,
              usersQuery,       // <-- Agora usa a query otimizada
              couponsQuery,     // <-- Agora usa a query otimizada
              withdrawalsQuery, // <-- Agora usa a query otimizada
              messagesQuery
          ]);

          // Erros críticos: qualquer um desses impede o app de funcionar corretamente.
          if (companiesRes.error) throw companiesRes.error;
          if (productsRes.error) throw productsRes.error;
          if (ordersRes.error) throw ordersRes.error;
          if (ordersHistoryRes.error) throw ordersHistoryRes.error;
          if (usersRes.error) throw usersRes.error;

          if (companiesRes.data) setCompanies(companiesRes.data);

          if (productsRes.data) {
              const enrichedProducts = await enrichProductsWithIngredients(productsRes.data);
              setProducts(enrichedProducts);
          }

          // Une pedidos ativos + últimos 50 históricos (quando parceiro) em um único estado.
          const combinedOrders = [...(ordersRes.data || []), ...(ordersHistoryRes.data || [])];
          const formattedOrders = combinedOrders.map((o: any) => ({
              ...o,
              timestamp: new Date(o.timestamp)
          }));
          formattedOrders.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          setOrders(formattedOrders);

          if (usersRes.data) setUsers(usersRes.data);

          // Erros não-críticos: não travam o app, só ficam de fora do estado.
          if (!couponsRes.error && couponsRes.data) {
              setCoupons(couponsRes.data);
          } else if (couponsRes.error) {
              console.warn("Tabela de cupons não acessível ou vazia.");
          }

          if (!withdrawalsRes.error && withdrawalsRes.data) {
              setWithdrawals(withdrawalsRes.data);
          } else if (withdrawalsRes.error) {
              console.warn("Tabela de saques não acessível.");
          }

          if (!messagesRes.error && messagesRes.data) {
              const groupedChats: Record<string, ChatMessage[]> = {};
              (messagesRes.data as ChatMessage[]).forEach((msg) => {
                  if (!groupedChats[msg.orderId]) groupedChats[msg.orderId] = [];
                  groupedChats[msg.orderId].push({
                      ...msg,
                      timestamp: new Date(msg.timestamp)
                  });
              });
              setChats(groupedChats);
          } else if (messagesRes.error) {
              console.error("Erro ao carregar histórico de mensagens.");
          }

      } catch (error: any) {
          console.error("Erro fatal ao carregar dados iniciais:", error);
          let errorType: 'network' | 'permission' | 'unknown' = 'unknown';
          let title = "Erro de Conexão";
          let message = error.message || "Erro desconhecido ao conectar com o servidor.";

          if (error.code === '42501') {
              errorType = 'permission';
              title = "Acesso Bloqueado (RLS)";
              message = "Permissão negada pelo banco de dados. Verifique suas políticas de segurança.";
          } else if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
              errorType = 'network';
              title = "Erro de Rede";
              message = "Servidor do Supabase inalcançável. Verifique sua conexão com a internet.";
          }
          setConnectionError({ title, message, type: errorType });
      } finally {
          setIsLoading(false);
      }
  };

  /**
   * LAZY LOADING DE HISTÓRICO (PARCEIRO)
   * Busca um bloco mais antigo de pedidos inativos (entregues/cancelados) e
   * concatena ao estado `orders` existente, sem duplicar itens já carregados.
   * Preparada para ser passada como prop ao `PartnerView` futuramente, para
   * paginação sob demanda no Kanban (ex: botão "Carregar mais antigos").
   */
  const loadMoreHistoricalOrders = async (offset: number, limit: number = 50) => {
      if (!currentUserRef.current || currentUserRef.current.role !== 'partner') return;

      try {
          const { data, error } = await supabase
              .from('orders')
              .select('*')
              .eq('companyId', currentUserRef.current.id)
              .in('status', ['delivered', 'cancelled'])
              .order('timestamp', { ascending: false })
              .range(offset, offset + limit - 1);

          if (error) throw error;
          if (!data || data.length === 0) return;

          const formattedBatch = data.map((o: any) => ({
              ...o,
              timestamp: new Date(o.timestamp)
          }));

          setOrders(prev => {
              const existingIds = new Set(prev.map(o => o.id));
              const newOnes = formattedBatch.filter(o => !existingIds.has(o.id));
              if (newOnes.length === 0) return prev;
              return [...prev, ...newOnes].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
          });
      } catch (error) {
          console.error("Erro ao carregar histórico de pedidos mais antigos:", error);
      }
  };

  /**
   * Finaliza sessão do usuário
   */
  const handleLogout = () => {
    console.log("Encerrando sessão...");
    setCurrentUser(null);
    try {
        localStorage.removeItem('chegoou_user');
    } catch (e) {
        console.error("Erro ao limpar sessão do localStorage:", e);
    }
  };

  /**
   * Gerencia login e unificação de contas (WhatsApp + Web)
   */
  const handleLogin = async (userAttempt: User) => {
    if (userAttempt.phone) {
        userAttempt.phone = normalizeWhatsApp(userAttempt.phone);
        
        if (userAttempt.phone.length < 12 && userAttempt.id.startsWith('u-')) {
            alert("Por favor, digite o seu número completo com o DDD (Ex: 81 99999-9999).");
            return;
        }
    }

    // Caso de Login via E-mail/Senha
    if (userAttempt.id === 'login_action') {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', userAttempt.email)
                .eq('password', userAttempt.password)
                .single();
            
            if (error) {
                alert("Credenciais incorretas. Tente novamente.");
                return;
            }
            
            if (data) {
                setCurrentUser(data);
                if (!users.find(u => u.id === data.id)) setUsers([...users, data]);
            }
        } catch (e: any) {
            alert("Erro durante o login: " + e.message);
        }
    } 
    // Caso de Novo Cadastro / Login via Telefone
    else if (userAttempt.id.startsWith('u-')) {
        const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('phone', userAttempt.phone)
            .single();

        if (existingUser) {
            // Unifica conta Web com conta WhatsApp existente
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
                alert("Erro ao sincronizar sua conta: " + updateError.message);
                return;
            }

            if (updatedRecord) {
                setUsers(users.map(u => u.id === existingUser.id ? updatedRecord[0] : u));
                setCurrentUser(updatedRecord[0]);
                showInAppNotification("Bem-vindo de volta!", "Suas contas foram unificadas com sucesso.", "🤝");
            }
        } else {
            // Criação de conta totalmente nova
            const { data, error } = await supabase.from('users').insert([userAttempt]).select();
            if (error) {
                 alert("Erro ao criar perfil: " + error.message);
                 return;
            }
            if (data) {
                setUsers([...users, data[0]]);
                setCurrentUser(data[0]);
            }
        }
    }
  };
  
  /**
   * Atualiza dados cadastrais do usuário
   */
  const handleUpdateUser = async (updatedUser: User) => {
      if (updatedUser.phone) {
          updatedUser.phone = normalizeWhatsApp(updatedUser.phone);
          if (updatedUser.phone.length < 12) {
              alert("Número de telefone inválido.");
              return; 
          }
      }
      
      const { error } = await supabase.from('users').update(updatedUser).eq('id', updatedUser.id);
      
      if (!error) {
        setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
        if (currentUser && currentUser.id === updatedUser.id) {
            setCurrentUser(updatedUser);
        }
      }
  };

  /**
   * Remove usuário do sistema
   */
  const handleDeleteUser = async (userId: string) => {
      if (!window.confirm("Deseja realmente excluir este usuário?")) return;
      
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (!error) {
          setUsers(users.filter(u => u.id !== userId));
      }
  };

  /**
   * Cria ou atualiza empresa parceira
   */
  const handleUpsertCompany = async (company: Company) => {
      const { data, error } = await supabase.from('companies').upsert(company).select();
      if (!error && data) {
           setCompanies(prev => {
               const exists = prev.find(c => c.id === company.id);
               if (exists) return prev.map(c => c.id === company.id ? data[0] : c);
               return [...prev, data[0]];
           });
           showInAppNotification("Sucesso", "Dados da empresa atualizados.", "🏢");
      }
  };

  /**
   * Remove empresa parceira
   */
  const handleDeleteCompany = async (companyId: string) => {
      if (!window.confirm("Deseja excluir esta empresa?")) return;
      const { error } = await supabase.from('companies').delete().eq('id', companyId);
      if (!error) setCompanies(companies.filter(c => c.id !== companyId));
  };

  /**
   * Atualiza configurações globais (Taxas, Mínimos)
   */
  const handleUpdateGlobalSettings = (newSettings: typeof globalSettings) => {
      setGlobalSettings(newSettings);
      // Aplica taxa administrativa a todas as empresas vinculadas
      companies.forEach(async (c) => {
          await supabase.from('companies').update({ 
            serviceFeePercentage: newSettings.platformFee 
          }).eq('id', c.id);
      });
      setCompanies(prev => prev.map(c => ({ ...c, serviceFeePercentage: newSettings.platformFee })));
  };

  /**
   * Envia mensagem no chat do pedido
   */
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

      // Update UI local imediatamente (Otimista)
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
      
      const { error } = await supabase.from('messages').insert([payloadToInsert]);
      if (error) {
          console.error("Falha ao persistir mensagem:", error);
      }
  };

  /**
   * Atualiza status de solicitação de saque (Admin)
   * Quando é uma solicitação de ENTREGADOR e é marcada como "paid",
   * damos baixa automaticamente nas corridas relacionadas
   * (courierPaid = true), pra carteira do entregador parar de contar
   * esse valor como pendente.
   */
  const handleUpdateWithdrawal = async (id: string, status: 'paid' | 'rejected') => {
      const { error } = await supabase.from('withdrawal_requests').update({ status }).eq('id', id);
      if (!error) {
          setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status } : w));

          if (status === 'paid') {
              const request = withdrawals.find(w => w.id === id);
              const relatedOrderIds: string[] = (request as any)?.relatedOrderIds || [];

              if (relatedOrderIds.length > 0) {
                  const { error: settleError } = await supabase
                      .from('orders')
                      .update({ courierPaid: true })
                      .in('id', relatedOrderIds);

                  if (!settleError) {
                      setOrders(prev => prev.map(o =>
                          relatedOrderIds.includes(o.id) ? ({ ...o, courierPaid: true } as any) : o
                      ));
                  } else {
                      console.error("Erro ao dar baixa nas corridas do saque:", settleError);
                  }
              }
          }
      }
  };

  /**
   * Solicitação de saque feita pelo ENTREGADOR a partir da Carteira.
   * Registra na mesma tabela `withdrawal_requests` usada pelas lojas,
   * marcando type: 'courier' e guardando quais corridas entram nesse
   * pedido (relatedOrderIds), pra dar baixa automática quando for pago.
   */
  const handleCourierRequestWithdrawal = async (
    courierId: string, 
    amount: number, 
    orderIds: string[],
    companyId?: string // <-- PARÂMETRO ADICIONADO
) => {
    if (amount <= 0 || orderIds.length === 0) {
        alert("Não há saldo pendente para solicitar.");
        return;
    }

    const alreadyPending = withdrawals.some(w => w.userId === courierId && w.status === 'pending');
    if (alreadyPending) {
        alert("Você já tem uma solicitação de saque pendente. Aguarde o pagamento antes de pedir novamente.");
        return;
    }

    const newRequest = {
        id: `wd-${Date.now()}`,
        userId: courierId,
        userName: currentUser?.name || 'Entregador', 
        userType: 'courier',                        
        amount: amount,
        status: 'pending',
        date: new Date().toISOString(),
        relatedOrderIds: orderIds,
        companyId: companyId || null, // <-- SALVA O ID NA SUA COLUNA companyId DO BANCO DE DADOS!
        bankInfo: `Chave Pix: ${currentUser?.pixKey || 'Não cadastrada'}` 
    };

    try {
        // 1. Grava diretamente no banco de dados na tabela de saques
        const { error } = await supabase
            .from('withdrawal_requests')
            .insert([newRequest]);

        if (error) {
            console.error("Erro ao salvar no banco:", error);
            alert("Erro ao enviar a solicitação para o banco de dados.");
            return;
        }

        // 2. Atualiza o estado interno do React local
        setWithdrawals(prev => [newRequest as any, ...prev]);
        alert("Solicitação de saque enviada com sucesso! Aguarde a aprovação do restaurante.");

    } catch (err) {
        console.error("Erro na requisição de saque:", err);
        alert("Erro de conexão ao solicitar saque.");
    }
};

  /**
   * Realiza a criação do pedido e processa pagamento
   */
const handlePlaceOrder = async (
      cartItems: any[], 
      companyId: string, 
      finalTotal: number, 
      deliveryMethod: 'delivery' | 'pickup', 
      serviceFee: number, 
      deliveryFee: number, 
      subtotal: number, 
      paymentMethod: 'cash' | 'card' | 'pix', 
      changeFor?: number, 
      couponCode?: string, 
      discountAmount?: number,
      guestData?: { name: string, phone: string, address: any }
  ): Promise<string | null> => { // 1. ALTERADO O TIPO DE RETORNO
    
    const customerId = currentUser ? currentUser.id : undefined;
    const customerName = currentUser ? currentUser.name : guestData?.name || 'Cliente Avulso';
    const rawPhone = currentUser ? currentUser.phone : guestData?.phone || '';
    const customerPhone = normalizeWhatsApp(rawPhone);
    const deliveryAddress = currentUser ? currentUser.address : guestData?.address;

    if (deliveryMethod === 'delivery' && !deliveryAddress) {
        alert("Erro: Por favor, informe um endereço de entrega válido.");
        return null; // 2. SUBSTITUÍDO false POR null
    }
    
    const company = companies.find(c => c.id === companyId);
    if (!company) {
        alert("Erro: Empresa não identificada.");
        return null; // 2. SUBSTITUÍDO false POR null
    }

    const isGuest = !currentUser;
    const isOnlinePayment = paymentMethod !== 'cash';
    const FIXED_SERVICE_FEE = isGuest ? 0 : 0.49; 
    
    let repasseValue = 0;
    const subtotalAfterDiscount = subtotal - (discountAmount || 0);

    if (!isGuest) {
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
    }

    const newOrder: Order = {
        id: `ord-${Date.now()}`,
        companyId,
        companyName: company.name,
        customerId: customerId,
        customerName: customerName,
        customerPhone: customerPhone,
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
        status: isGuest ? 'pending' : (paymentMethod === 'cash' ? 'pending' : 'waiting_payment'),
        timestamp: new Date(),
        deliveryCode: customerPhone.slice(-4) || '0000',
        deliveryAddress: deliveryAddress,
        pickupAddress: company.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 },
        deliveryType: company.deliveryType,
        paymentStatus: 'pending',
        repasseValue: repasseValue,
        repasseStatus: isGuest ? 'ignored' : 'pending',
        couponCode: couponCode,
        discountAmount: discountAmount
    };

    const { error } = await supabase.from('orders').insert([newOrder]);
    
    if (error) {
        alert("Erro técnico ao registrar pedido: " + error.message);
        return null; // 2. SUBSTITUÍDO false POR null
    }

    if (!isGuest && paymentMethod !== 'cash') {
        try {
            const paymentResponse = await PaymentService.processPayment(
                finalTotal,
                paymentMethod,
                currentUser!, 
                `Pedido #${newOrder.id} - ${company.name}`,
                newOrder.id
            );

            if (paymentResponse.ticketUrl && !paymentResponse.copyPaste && !paymentResponse.qrCodeBase64) {
                window.location.assign(paymentResponse.ticketUrl);
                return newOrder.id; // 3. SUBSTITUÍDO true POR newOrder.id
            }

            if (paymentMethod === 'pix' && (paymentResponse.copyPaste || paymentResponse.qrCodeBase64)) {
                 await supabase.from('orders').update({
                    paymentPixCode: paymentResponse.copyPaste,
                    paymentPixImage: paymentResponse.qrCodeBase64,
                    paymentId: paymentResponse.paymentId
                 }).eq('id', newOrder.id);
            }

            if (!paymentResponse.success) {
                alert("Pagamento negado: " + paymentResponse.message);
                await supabase.from('orders').update({ status: 'cancelled' }).eq('id', newOrder.id);
                return null; // 2. SUBSTITUÍDO false POR null
            }

        } catch (e: any) {
            alert("Falha crítica no checkout: " + (e.message || "Erro de conexão com o gateway."));
            return null; // 2. SUBSTITUÍDO false POR null
        }
    }

    showInAppNotification("Pedido Criado!", "Seu pedido foi enviado com sucesso!", "🍟");
    return newOrder.id; // 3. SUBSTITUÍDO true POR newOrder.id
  };

    /**
   * Busca pedido ativo pelo número do WhatsApp (Para Cardápio Digital Público)
   */
  const handleTrackByPhone = async (phone: string) => {
      const formattedPhone = normalizeWhatsApp(phone);
      
      const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('customerPhone', formattedPhone)
          .in('status', ['waiting_payment', 'pending', 'preparing', 'ready', 'delivering'])
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();
          
      if (error || !data) return null;

      // Pedidos concluídos ou cancelados não devem aparecer para o cliente
      if (data.status === 'delivered' || data.status === 'cancelled') return null;
      
      // Adaptando o status do banco para o padrão da nova interface
      let trackingStatus: 'pending_payment' | 'preparing' | 'ready' | 'out_for_delivery' = 'preparing';
      
      if (data.status === 'waiting_payment' || (data.status === 'pending' && data.paymentMethod === 'pix')) {
          trackingStatus = 'pending_payment';
      } else if (data.status === 'delivering') {
          trackingStatus = 'out_for_delivery';
      } else if (data.status === 'ready') {
          trackingStatus = 'ready';
      }

      return {
          id: data.id,
          total: data.total,
          paymentMethod: data.paymentMethod,
          customerName: data.customerName,
          status: trackingStatus,
          timestamp: Date.now(), // injeta timestamp novo para prolongar cache
          items: (data.items || []).map((i: any) => ({
              name: i.productName,
              quantity: i.quantity,
              selectedOptions: i.selectedOptions
          }))
      };
  };

    /**
   * Busca pedido ativo pelo ID (Para atualizar o status na tela de Rastreio)
   */
  const handleTrackOrderById = async (orderId: string) => {
      const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();
          
      if (error || !data) return null;

      // Pedido concluído ou cancelado: encerra o acompanhamento do cliente
      if (data.status === 'delivered' || data.status === 'cancelled') return null;
      
      let trackingStatus: 'pending_payment' | 'preparing' | 'ready' | 'out_for_delivery' = 'preparing';
      if (data.status === 'waiting_payment' || (data.status === 'pending' && data.paymentMethod === 'pix')) {
          trackingStatus = 'pending_payment';
      } else if (data.status === 'delivering') {
          trackingStatus = 'out_for_delivery';
      } else if (data.status === 'ready') {
          trackingStatus = 'ready';
      }

      return {
          id: data.id,
          total: data.total,
          paymentMethod: data.paymentMethod,
          customerName: data.customerName,
          status: trackingStatus,
          timestamp: Date.now(), // injeta novo timestamp
          items: (data.items || []).map((i: any) => ({
              name: i.productName,
              quantity: i.quantity,
              selectedOptions: i.selectedOptions
          }))
      };
  };

  /**
   * Atualiza status do pedido e processa estornos
   */
  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    // MUTEX/LOCK: Trava o pedido durante toda a operação de atualização
    // (otimista + persistência), impedindo que o polling sobrescreva a UI
    // com dados desatualizados antes do Supabase confirmar a mudança.
    lockedOrders.current.add(orderId);
    try {
      if (status === 'cancelled') {
          const orderToCancel = orders.find(o => o.id === orderId);
          
          // Estorno Automático para pagamentos digitais
          if (orderToCancel && orderToCancel.paymentId && orderToCancel.paymentMethod !== 'cash') {
              console.log("Iniciando processo de estorno para transação:", orderToCancel.paymentId);
              try {
                  const refundResult = await PaymentService.refundPayment(orderToCancel.paymentId);
                  if (refundResult.success) {
                      alert("Pedido cancelado e valor estornado com sucesso!");
                      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, paymentStatus: 'refunded' } : o));
                      await supabase.from('orders').update({ status, paymentStatus: 'refunded' }).eq('id', orderId);
                      return;
                  } else {
                      alert("Pedido cancelado. Nota: O estorno automático falhou e deve ser verificado: " + refundResult.message);
                  }
              } catch (e) {
                  console.error("Falha no serviço de estorno:", e);
              }
          }
      }

      let updateData: Partial<Order> = { status };
      
      // Libera saldo para empresa se entregue e GATILHO DE ESTOQUE
      if (status === 'delivered') {
          updateData.repasseStatus = 'blocked'; // Fica em carência
          updateData.repasseDate = new Date().toISOString();

          // >>> INÍCIO DA BAIXA DE ESTOQUE AUTOMÁTICA <<<
          try {
              const orderToDeduct = orders.find(o => o.id === orderId);
              if (orderToDeduct && orderToDeduct.items) {
                  // Puxa as fichas técnicas do banco de dados
                  const { data: compositions } = await supabase.from('compositions').select('*');
                  
                  if (compositions) {
                      // Roda a calculadora de estoque
                      const deductions = await processInventoryDeduction(orderToDeduct.items, compositions);
                      
                      // Vai no banco e desconta o que foi usado
                      for (const [inventoryId, amountToDeduct] of Object.entries(deductions)) {
                          const { data: itemData } = await supabase.from('inventory_items')
                              .select('current_stock').eq('id', inventoryId).single();
                              
                          if (itemData) {
                              const newStock = Math.max(0, Number(itemData.current_stock) - Number(amountToDeduct));
                              await supabase.from('inventory_items')
                                  .update({ current_stock: newStock }).eq('id', inventoryId);
                          }
                      }
                      console.log("Chegoou: Estoque atualizado com sucesso para o pedido", orderId);
                  }
              }
          } catch (e) {
              console.error("Chegoou: Erro ao abater estoque:", e);
          }
          // >>> FIM DA BAIXA DE ESTOQUE AUTOMÁTICA <<<
      }

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
      await supabase.from('orders').update(updateData).eq('id', orderId);
    } finally {
      // Libera o lock assim que a persistência (bem ou mal sucedida) terminar.
      lockedOrders.current.delete(orderId);
    }
  };

  /**
   * Atribui entregador ao pedido
   */
  const handleCourierAcceptOrder = async (orderId: string) => {
      if (!currentUser) return;

      // Trava de segurança: mesmo que a UI já filtre, garante que o entregador
      // só consiga aceitar corridas do restaurante ao qual está vinculado.
      const courierCompanyId = (currentUser as any).companyId;
      const targetOrder = ordersRef.current.find(o => o.id === orderId);
      if (!courierCompanyId || !targetOrder || (targetOrder as any).companyId !== courierCompanyId) {
          alert("Você não está vinculado a este restaurante e não pode aceitar esta corrida.");
          return;
      }

      const updateData: { status: Order['status']; courierId: string } = {
          status: 'delivering',
          courierId: currentUser.id
      };

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updateData } : o));
      await supabase.from('orders').update(updateData).eq('id', orderId);
  };

  /**
   * Cancelamento solicitado pelo usuário ou restaurante
   */
  const handleCancelOrder = async (orderId: string) => {
      const order = orders.find(o => o.id === orderId);
      if (!order || !currentUser) return;

      if (currentUser.role === 'client') {
          // Clientes só cancelam se não estiver em preparo
          if (order.status !== 'pending' && order.status !== 'waiting_payment') {
              alert("O restaurante já iniciou o preparo. Por favor, entre em contato via chat para solicitar cancelamento.");
              return;
          }
      }
      
      if (window.confirm("Deseja cancelar este pedido? Pagamentos online serão estornados.")) {
          await updateOrderStatus(orderId, 'cancelled');
      }
  };
  
  /**
   * Atualização total de objeto de pedido (Admin/Parceiro)
   */
  const handleUpdateFullOrder = async (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    await supabase.from('orders').update(updatedOrder).eq('id', updatedOrder.id);
  };

  /**
   * Alterna a flag "pay" (Acerto de Caixa) de um pedido — usado pelo botão
   * rápido no OrderCard do restaurante para marcar/desmarcar um pedido como
   * pago/acertado sem precisar abrir o modal de edição completo.
   */
  const handleTogglePayment = async (orderId: string, newStatus: boolean) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, pay: newStatus } : o));
    const { error } = await supabase.from('orders').update({ pay: newStatus }).eq('id', orderId);
    if (error) {
        console.error("Erro ao atualizar status de pagamento (Acerto de Caixa):", error);
        // Reverte o estado local em caso de falha na persistência
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, pay: !newStatus } : o));
    }
  };

  /**
   * Exclusão física de pedido (Apenas Admin)
   */
  const handleDeleteOrder = async (orderId: string) => {
    if (!window.confirm("Atenção Admin: Excluir um pedido é uma ação irreversível. Continuar?")) return;
    setOrders(prev => prev.filter(o => o.id !== orderId));
    await supabase.from('orders').delete().eq('id', orderId);
  };

  /**
   * Criação de novo produto no cardápio
   */
  const handleAddProduct = async (newProduct: Product) => {
      const payload = prepareProductPayload(newProduct);
      const { data, error } = await supabase.from('products').insert([payload]).select();
      if (!error && data) {
          setProducts([...products, data[0]]);
          showInAppNotification("Item Adicionado", "Produto salvo com sucesso.", "📦");
      }
  };

  /**
   * Atualização de produto existente
   */
  const handleUpdateProduct = async (updatedProduct: Product) => {
      const payload = prepareProductPayload(updatedProduct);
      const { error } = await supabase.from('products').update(payload).eq('id', updatedProduct.id);
      if (!error) {
          setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      }
  };

  /**
   * Remove produto do cardápio
   */
  const handleDeleteProduct = async (productId: string) => {
      if (!window.confirm("Excluir este produto do cardápio?")) return;
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (!error) setProducts(prev => prev.filter(p => p.id !== productId));
  };
  
  /**
   * Atualiza dados da empresa parceira
   */
  const handleUpdateCompany = async (companyId: string, data: Partial<Company>) => {
      const { error } = await supabase.from('companies').update(data).eq('id', companyId);
      if(!error) {
        setCompanies(prevCompanies => 
            prevCompanies.map(c => c.id === companyId ? {...c, ...data} : c)
        );
      }
  };

  /**
   * Cadastro de novos endereços salvos
   */
  const handleAddAddress = (address: Address) => {
      if (!currentUser) return;
      const updatedUser = { 
        ...currentUser, 
        address: address, 
        savedAddresses: [...(currentUser.savedAddresses || []), address] 
      };
      handleUpdateUser(updatedUser);
      showInAppNotification("Endereço salvo!", "Localização definida como padrão.", "📍");
  };

  /**
   * Remoção de endereços salvos
   */
  const handleRemoveAddress = (index: number) => {
      if (!currentUser || !currentUser.savedAddresses) return;
      const updatedAddresses = [...currentUser.savedAddresses];
      updatedAddresses.splice(index, 1);
      handleUpdateUser({ ...currentUser, savedAddresses: updatedAddresses });
  };

  /**
   * Adiciona cartão de crédito à carteira digital
   */
  const handleAddCard = (card: CreditCard) => {
      if (!currentUser) return;
      const updatedUser = { 
        ...currentUser, 
        savedCards: [...(currentUser.savedCards || []), card] 
      };
      handleUpdateUser(updatedUser);
      showInAppNotification("Cartão salvo", "Método de pagamento adicionado.", "💳");
  };

  /**
   * Remove cartão da carteira
   */
  const handleRemoveCard = (index: number) => {
      if (!currentUser || !currentUser.savedCards) return;
      const updatedCards = [...currentUser.savedCards];
      updatedCards.splice(index, 1);
      handleUpdateUser({ ...currentUser, savedCards: updatedCards });
  };

  // ---------------------------------------------------------------------------
  // LÓGICA DE RENDERIZAÇÃO
  // ---------------------------------------------------------------------------

  /**
   * Cardápio Digital Público (Acesso via /cardapio/:companyId)
   * Não exige login e não depende do carregamento do painel (isLoading).
   * Usa seu próprio estado (isMenuLoading/menuError) para abrir o mais
   * rápido possível, com apenas 2 consultas em paralelo.
   */
  if (publicMenuCompanyId) {
      if (isMenuLoading) {
          return (
              <div className="flex flex-col h-screen w-full items-center justify-center bg-white gap-4">
                  <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
                  <p className="text-gray-500 font-medium">Carregando cardápio...</p>
              </div>
          );
      }

      if (menuError) {
          return (
              <div className="h-screen w-full flex flex-col items-center justify-center bg-white p-8 text-center">
                  <div className="bg-red-50 p-6 rounded-full mb-6">
                    <AlertCircle className="w-16 h-16 text-red-600 mx-auto" />
                  </div>
                  <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">
                    Erro ao carregar
                  </h2>
                  <p className="text-gray-500 mt-4 max-w-sm font-medium">{menuError}</p>
                  <button
                    onClick={() => fetchPublicMenuData()}
                    className="mt-10 bg-red-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-red-200 hover:scale-105 active:scale-95 transition-all"
                  >
                      TENTAR NOVAMENTE
                  </button>
              </div>
          );
      }

      const publicMenuCompany = companies.find(c => c.id === publicMenuCompanyId);

      if (!publicMenuCompany) {
          return (
              <div className="h-screen w-full flex flex-col items-center justify-center bg-white p-8 text-center">
                  <div className="bg-gray-50 p-6 rounded-full mb-6">
                    <Store className="w-16 h-16 text-gray-300 mx-auto" />
                  </div>
                  <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">
                    Loja não encontrada
                  </h2>
                  <p className="text-gray-500 mt-4 max-w-sm font-medium">
                    O cardápio que você está procurando não existe ou não está mais disponível.
                  </p>
              </div>
          );
      }

      return (
          <Suspense fallback={
              <div className="flex flex-col h-screen w-full items-center justify-center bg-white gap-4">
                  <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
                  <p className="text-gray-500 font-medium">Carregando cardápio...</p>
              </div>
          }>
              <DigitalMenuView
                  company={publicMenuCompany}
                  products={products.filter(p => p.companyId === publicMenuCompany.id)}
                  onPlaceOrder={handlePlaceOrder}
                  onTrackOrderByPhone={handleTrackByPhone}
                  onTrackOrderById={handleTrackOrderById}
              />
          </Suspense>
      );
  }

  /**
   * Tela de Autenticação
   * Renderizada IMEDIATAMENTE, sem esperar o carregamento do painel
   * (companies/products/orders/users/etc. seguem carregando em segundo
   * plano via fetchInitialData). O login em si consulta o Supabase
   * diretamente em handleLogin, então não depende desses dados.
   */
  if (!currentUser) {
    return (
        <AuthView 
            onLogin={handleLogin} 
            existingUsers={users} 
        />
    );
  }

  /**
   * Tela de carregamento do painel (só aparece DEPOIS do login, e só se
   * os dados do painel ainda não tiverem terminado de carregar em segundo
   * plano — normalmente já estarão prontos nesse ponto).
   */
  if (isLoading) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50">
              <Loader2 className="w-12 h-12 text-red-600 animate-spin mb-6" />
              <p className="text-gray-600 font-bold text-lg animate-pulse">
                Carregando Chegoou...
              </p>
          </div>
      );
  }

  /**
   * Tela de erro de conexão com Supabase
   */
  if (connectionError) {
      return (
          <div className="h-screen w-full flex flex-col items-center justify-center bg-white p-8 text-center">
              <div className="bg-red-50 p-6 rounded-full mb-6">
                <AlertCircle className="w-16 h-16 text-red-600 mx-auto" />
              </div>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">
                {connectionError.title}
              </h2>
              <p className="text-gray-500 mt-4 max-w-sm font-medium">
                {connectionError.message}
              </p>
              <button 
                onClick={() => window.location.reload()} 
                className="mt-10 bg-red-600 text-white px-10 py-4 rounded-2xl font-black shadow-lg shadow-red-200 hover:scale-105 active:scale-95 transition-all"
              >
                  TENTAR NOVAMENTE
              </button>
          </div>
      );
  }

  /**
   * UI DA NOTIFICAÇÃO VISUAL INTERNA (TOAST)
   * Centralizada no topo para máxima visibilidade
   */
  const NotificationToast = inAppNotification && (
      <div className="fixed top-6 left-0 right-0 z-[99999] flex justify-center pointer-events-none px-6">
          <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-white/20 p-5 flex items-center gap-5 animate-slide-up w-full max-w-md pointer-events-auto ring-1 ring-black/5">
              <div className="bg-red-600 text-3xl p-3 rounded-2xl shrink-0 flex items-center justify-center h-14 w-14 shadow-lg shadow-red-100">
                  {inAppNotification.icon}
              </div>
              <div className="overflow-hidden">
                  <h4 className="font-black text-gray-900 text-sm uppercase tracking-tight truncate">
                    {inAppNotification.title}
                  </h4>
                  <p className="text-xs text-gray-500 font-bold leading-tight mt-1">
                    {inAppNotification.message}
                  </p>
              </div>
          </div>
      </div>
  );

  /**
   * BOTÃO DE INSTALAÇÃO PWA (CUSTOMIZADO)
   */
  const InstallPWAButton = deferredPrompt && (
      <button
        onClick={handleInstall}
        className="fixed bottom-24 right-6 z-[100] bg-red-600 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-bounce hover:scale-105 active:scale-95 transition-all border-2 border-white"
      >
          <Download className="w-5 h-5" />
          <span className="font-black text-xs uppercase tracking-widest">Instalar App</span>
      </button>
  );

  // SELEÇÃO DE VIEW POR PERFIL
  let ViewToRender;
  
  switch (currentUser.role) {
    case 'admin':
        ViewToRender = <AdminView 
            users={users} 
            setUsers={setUsers} 
            companies={companies} 
            setCompanies={setCompanies} 
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
        break;
    
    case 'partner':
        const myCompany = myPartnerCompany;

        if (!myCompany) {
            ViewToRender = (
                <div className="h-screen flex flex-col items-center justify-center p-10 text-center">
                    <Database className="w-16 h-16 text-gray-300 mb-4" />
                    <h3 className="text-xl font-bold">Loja não vinculada.</h3>
                    <p className="text-gray-500 text-sm mt-2">Sua conta não possui uma empresa associada no momento.</p>
                    <button onClick={handleLogout} className="mt-8 bg-black text-white px-8 py-3 rounded-xl font-bold">Sair</button>
                </div>
            );
        } else {
            ViewToRender = <PartnerView 
                company={myCompany} 
                orders={partnerOrders} 
                products={partnerProducts} 
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
                onTogglePayment={handleTogglePayment}
            />;
        }
        break;
    case 'courier':
        ViewToRender = <CourierView 
            courier={currentUser} 
            availableOrders={orders} 
            acceptOrder={handleCourierAcceptOrder}
            confirmDelivery={(id, code) => updateOrderStatus(id, 'delivered')}
            onLogout={handleLogout}
            withdrawals={withdrawals.filter(w => w.userId === currentUser.id)}
            onRequestWithdrawal={handleCourierRequestWithdrawal}
        />;
        break;

    case 'client':
    default:
        ViewToRender = <ClientView 
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
        break;
  }

  // COMPOSIÇÃO FINAL DA UI
  // COMPOSIÇÃO FINAL DA UI
  return (
      <div className="antialiased font-sans select-none">
        {NotificationToast}
        {InstallPWAButton}
        <main className="min-h-screen bg-white relative overflow-x-hidden">
            <Suspense fallback={
                <div className="flex flex-col h-screen w-full items-center justify-center bg-white gap-4">
                    <Loader2 className="w-12 h-12 text-red-600 animate-spin" />
                    <p className="text-gray-500 font-medium">Iniciando Chegoou...</p>
                </div>
            }>
                {ViewToRender}
            </Suspense>
        </main>
      </div>
  );
};
export default App;
