export type UserRole = 'admin' | 'partner' | 'courier' | 'client';

export interface Address {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  zipCode: string; // CEP
  lat: number;
  lng: number;
  name?: string; // e.g. "Casa", "Trabalho"
}

export interface CreditCard {
    id: string;
    number: string;
    holderName: string;
    expiry: string;
    cvv: string;
    brand: string;
    last4?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  password?: string; // Added for local auth validation
  address?: Address;
  vehiclePlate?: string; // For couriers
  vehicleType?: 'moto' | 'bike' | 'car';
  isOnline?: boolean; // For couriers
  savedAddresses?: Address[]; // List of saved addresses for clients
  savedCards?: CreditCard[]; // Mock payments
}

export interface ChatMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderRole: 'client' | 'partner' | 'system';
  text: string;
  timestamp: Date;
}

export interface Company {
  id: string; // Links to User ID
  name: string;
  description: string;
  category: string;
  logo: string;
  coverImage?: string; // NEW: Banner image
  status: 'open' | 'closed';
  serviceFeePercentage: number; // Admin fee (used for customer calculation B)
  deliveryType: 'own' | 'chegoou';
  deliveryRadiusKm: number;
  ownDeliveryFee?: number; // Fee when delivery is 'own'
  customPlatformFee?: number; // NEW: Fee set by ADMIN when delivery is 'chegoou' (overrides formula)
  openingHours: string;
  openingDays: string[]; // Changed to required array
  address?: Address; // Added address for company
  isSuspended?: boolean; // Block access
  
  // --- NOVOS CAMPOS FINANCEIROS (PIX DO RESTAURANTE) ---
  pixKey?: string;
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';

  // --- NOVOS CAMPOS DE MARKETING / WHATSAPP ---
  dailyMessageLimit?: number; 
  leadsPerBlastLimit?: number; 
  messagesSentToday?: number; 
  lastMessageDate?: string; 

  // --- NOVO: SENHA GERENCIAL ---
  adminPin?: string; // Senha numérica para bloquear módulos
}

export interface ProductOption {
  id: string;
  name: string;
  price: number;
  description?: string;
  isAvailable: boolean;
}

export interface ProductGroup {
  id: string;
  name: string; // e.g. "Escolha o Tamanho", "Escolha os Sabores"
  min: number; // e.g. 1 (Required)
  max: number; // e.g. 2 (Half/Half)
  options: ProductOption[];
}

export interface Product {
  id: string;
  companyId: string;
  name: string;
  description: string;
  category: string;
  price: number; // Base price. If 0, price is calculated from required groups.
  image: string;
  isAvailable: boolean; 
  pricingMode: 'default' | 'average' | 'highest'; // Pizza Logic
  groups: ProductGroup[]; // Complements/Toppings
  stock?: number;
}

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  observation?: string;
  selectedOptions?: { groupName: string; optionName: string; price: number }[]; // Track choices
}

export interface Order {
  id: string;
  companyId: string;
  companyName: string;
  customerId: string; // Made optional in DB, but TS keeps string for now (handled as empty string if needed)
  customerName: string;
  customerPhone: string; // Used for delivery code (last 4 digits)
  courierId?: string;
  items: OrderItem[];
  total: number; // Calculation C (Final Total - amount_total)
  subtotal: number; // Product Sum
  deliveryFee: number; // Part of Calculation A
  serviceFee: number; // Calculation B
  status: 'waiting_payment' | 'pending' | 'preparing' | 'ready' | 'waiting_courier' | 'delivering' | 'delivered' | 'cancelled';
  paymentMethod: 'cash' | 'card' | 'pix' | 'whatsapp' | string; 
  changeFor?: number; // Needed for cash payments
  timestamp: Date;
  deliveryCode: string; // Secret code for courier
  deliveryAddress: Address;
  pickupAddress: Address; // Address of the company
  deliveryType: 'own' | 'chegoou'; // inherited from company at time of order
  deliveryMethod: 'delivery' | 'pickup' | string; 

  origin?: 'app' | 'whatsapp' | 'pdv' | string; // Origem do pedido
  raw_description?: string; // Texto livre do pedido (ex: "1 pizza de calabresa")

  paymentId?: string; // payment_id do MP
  paymentStatus?: 'pending' | 'approved' | 'rejected' | 'refunded'; // Status real do gateway
  paymentPixCode?: string; // O Código Copia e Cola gerado pelo n8n
  paymentPixImage?: string; // BASE64 da imagem do QR Code

  repasseStatus?: 'pending' | 'blocked' | 'available' | 'withdrawn' | 'ignored'; // 'ignored' para whats
  repasseValue?: number; // Valor líquido para o restaurante
  repasseDate?: string; // Data que o valor foi creditado (geralmente data da entrega)
  waitingFunds?: boolean; // deprecated, use repasseStatus logic

  couponCode?: string;
  discountAmount?: number;
}

export interface FinancialRecord {
  id: string;
  entityId: string; // Company or Courier ID
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  orderId: string;
  date: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userType: 'partner' | 'courier';
  amount: number;
  status: 'pending' | 'paid' | 'rejected';
  date: string;
  bankInfo: string; // Chave PIX e Tipo
}

export interface Coupon {
    id: string;
    companyId: string;
    code: string; // ex: DEZEMBRO10
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    minOrderValue?: number;
    isActive: boolean;
    createdAt: string;
}

export interface SalesHistoryItem {
  date: string;
  revenue: number;
  ordersCount: number;
}

export interface ForecastData {
    predictedProducts: {
        productName: string;
        reasoning: string;
        confidence: number;
        estimatedQuantity: number;
    }[];
    confidenceScore: number;
    insight: string;
}

export enum ViewState {
  DASHBOARD = 'dashboard',
  ORDERS = 'orders', // Kanban
  MENU = 'menu', // Cardapio (was inventory)
  WHATSAPP = 'whatsapp',
  SETTINGS = 'settings',
  FINANCE = 'finance',
  COUPONS = 'coupons',
  POS = 'pos', // NOVO: Módulo de Lançamento de Pedido (Balcão/PDV)
  HISTORY = 'history', // NOVO: Histórico de Pedidos
}
