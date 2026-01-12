
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
}

// --- PRODUCT STRUCTURE UPDATE FOR PIZZA LOGIC ---
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
  customerId: string;
  customerName: string;
  customerPhone: string; // Used for delivery code (last 4 digits)
  courierId?: string;
  items: OrderItem[];
  total: number; // Calculation C (Final Total)
  subtotal: number; // Product Sum
  deliveryFee: number; // Part of Calculation A
  serviceFee: number; // Calculation B
  status: 'pending' | 'preparing' | 'ready' | 'waiting_courier' | 'delivering' | 'delivered' | 'cancelled';
  paymentMethod: 'cash' | 'card' | 'pix'; // Updated payment methods
  changeFor?: number; // Needed for cash payments
  timestamp: Date;
  deliveryCode: string; // Secret code for courier
  deliveryAddress: Address;
  pickupAddress: Address; // Address of the company
  deliveryType: 'own' | 'chegoou'; // inherited from company at time of order
  deliveryMethod: 'delivery' | 'pickup'; // NEW: Choice of customer
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
  bankInfo: string;
}

export enum ViewState {
  DASHBOARD = 'dashboard',
  ORDERS = 'orders', // Kanban
  MENU = 'menu', // Cardapio (was inventory)
  FORECAST = 'forecast',
  WHATSAPP = 'whatsapp',
  SETTINGS = 'settings'
}

export interface SalesHistoryItem {
  date: string;
  revenue: number;
  ordersCount: number;
}

export interface PredictedProduct {
  productName: string;
  estimatedQuantity: number;
  confidence: number; // Changed from reasoning to confidence mostly
  reasoning: string;
}

export interface ForecastData {
  predictedRevenue: number;
  confidenceScore: number;
  predictedProducts: PredictedProduct[];
  insight: string;
}