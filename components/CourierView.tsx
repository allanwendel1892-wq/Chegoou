import React, { useState, useEffect, useMemo } from 'react';
import { Order, User, Address } from '../types';
import { Navigation, Bike, CheckCircle, MapPin, DollarSign, LogOut, ArrowRight, Store, Loader2, Crosshair } from 'lucide-react';

interface CourierViewProps {
  courier: User;
  availableOrders: Order[];
  acceptOrder: (orderId: string) => void;
  confirmDelivery: (orderId: string, code: string) => void;
  onLogout: () => void;
}

// Haversine Formula (Copied locally to ensure autonomy of the component)
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

const CourierView: React.FC<CourierViewProps> = ({ courier, availableOrders, acceptOrder, confirmDelivery, onLogout }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [deliveryCodeInput, setDeliveryCodeInput] = useState('');
  const [withdrawalSent, setWithdrawalSent] = useState(false); // State for withdrawal button feedback
  
  // GPS State
  const [currentLocation, setCurrentLocation] = useState<{lat: number, lng: number} | null>(
      courier.address ? { lat: courier.address.lat, lng: courier.address.lng } : null
  );
  const [locationStatus, setLocationStatus] = useState<'locating' | 'found' | 'error'>('locating');

  // OPERATIONAL RADIUS FOR COURIER (e.g., 15km)
  const COURIER_OPERATIONAL_RADIUS_KM = 15;

  // --- PERSISTENCE LOGIC ---
  // Ensure that if an order is currently 'delivering', it remains as the active order
  // even if the courier refreshes or navigates away and back.
  useEffect(() => {
      // Find an order that is already 'delivering' and belongs to the platform logic
      // In a real backend scenario, we would also check if order.courierId === courier.id
      const inProgressOrder = availableOrders.find(o => 
          o.status === 'delivering' && 
          o.deliveryType === 'chegoou'
      );

      if (inProgressOrder) {
          setActiveOrder(inProgressOrder);
      }
  }, [availableOrders]);

  // --- GEOLOCATION TRACKING ---
  useEffect(() => {
      if (!navigator.geolocation) {
          setLocationStatus('error');
          return;
      }

      const watchId = navigator.geolocation.watchPosition(
          (position) => {
              setCurrentLocation({
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
              });
              setLocationStatus('found');
          },
          (error) => {
              console.error("Error watching position", error);
              // Fallback to static address if GPS fails
              if (courier.address && courier.address.lat) {
                  setCurrentLocation({ lat: courier.address.lat, lng: courier.address.lng });
                  setLocationStatus('found'); // "Found" via fallback
              } else {
                  setLocationStatus('error');
              }
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
  }, [courier.address]);

  // --- FILTER & SORT ORDERS BY DISTANCE ---
  const filteredOrders = useMemo(() => {
      if (!currentLocation) return [];

      return availableOrders
        .filter(o => {
            // 1. Check Delivery Type: Only show orders managed by the platform ('chegoou')
            if (o.deliveryType !== 'chegoou') return false;

            // 2. Check Status: Only show available orders. 
            // 'delivering' orders are handled by activeOrder state, so exclude them from the list.
            if (o.status !== 'ready' && o.status !== 'waiting_courier') return false;

            return true;
        })
        .map(o => {
            // Distance from Courier to Restaurant (Pickup)
            const distToPickup = getDistanceFromLatLonInKm(
                currentLocation.lat, currentLocation.lng,
                o.pickupAddress?.lat || 0, o.pickupAddress?.lng || 0
            );
            return { ...o, distToPickup };
        })
        .filter(o => o.distToPickup <= COURIER_OPERATIONAL_RADIUS_KM) // Only show nearby orders
        .sort((a, b) => a.distToPickup - b.distToPickup); // Closest first
  }, [availableOrders, currentLocation]);


  const handleAccept = (order: Order) => {
    setActiveOrder(order);
    acceptOrder(order.id);
  };

  const handleFinish = () => {
    if (activeOrder && deliveryCodeInput === activeOrder.deliveryCode) {
        confirmDelivery(activeOrder.id, deliveryCodeInput);
        setActiveOrder(null);
        setDeliveryCodeInput('');
        alert("Entrega confirmada com sucesso!");
    } else {
        alert("Código incorreto! Peça os 4 últimos dígitos do celular do cliente.");
    }
  };

  const handleWithdrawRequest = () => {
      setWithdrawalSent(true);
      // In a real app, this would call an API
      alert("Solicitação de saque enviada com sucesso! O admin analisará em até 24h.");
  };

  // Helper to open Google Maps with Route
  const openNavigation = (destination: Address, origin?: {lat: number, lng: number}) => {
      // If we have GPS, use it as start point
      const destQuery = destination.lat && destination.lng !== 0 
        ? `${destination.lat},${destination.lng}` 
        : `${destination.street}, ${destination.number}, ${destination.city}`;
      
      const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destQuery)}&travelmode=driving`;
      window.open(url, '_blank');
  };

  // Calculate distances for active order
  const activeDistances = useMemo(() => {
      if (!activeOrder || !currentLocation) return { toPickup: 0, toDrop: 0 };
      
      const toPickup = getDistanceFromLatLonInKm(
          currentLocation.lat, currentLocation.lng,
          activeOrder.pickupAddress.lat, activeOrder.pickupAddress.lng
      );
      
      const toDrop = getDistanceFromLatLonInKm(
          activeOrder.pickupAddress.lat, activeOrder.pickupAddress.lng,
          activeOrder.deliveryAddress.lat, activeOrder.deliveryAddress.lng
      );

      return { toPickup, toDrop };
  }, [activeOrder, currentLocation]);

  return (
    <div className="bg-gray-100 min-h-screen pb-20">
        {/* Header */}
        <div className="bg-white p-4 shadow-sm sticky top-0 z-10 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 rounded-full">
                    <Bike className="text-orange-600 w-6 h-6" />
                </div>
                <div>
                    <h1 className="font-bold text-gray-800">{courier.name}</h1>
                    <div className="flex items-center gap-2 text-xs">
                         <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                         {isOnline ? 'Online' : 'Offline'}
                         {locationStatus === 'locating' && <span className="text-orange-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Buscando GPS...</span>}
                         {locationStatus === 'found' && <span className="text-green-600 flex items-center gap-1"><Crosshair className="w-3 h-3"/> GPS Ativo</span>}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isOnline} onChange={() => setIsOnline(!isOnline)} className="sr-only peer"/>
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                </label>
                <button 
                    onClick={onLogout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Sair"
                >
                    <LogOut className="w-6 h-6" />
                </button>
            </div>
        </div>

        {/* Stats & Withdrawal */}
        <div className="p-4 grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm col-span-2 md:col-span-1 flex justify-between items-center">
                <div>
                    <p className="text-xs text-gray-500">Saldo a Receber</p>
                    <h3 className="text-xl font-bold text-gray-800">R$ 145,00</h3>
                </div>
                <button 
                    onClick={handleWithdrawRequest}
                    disabled={withdrawalSent}
                    className={`text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1
                        ${withdrawalSent ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}
                    `}
                >
                    <DollarSign className="w-4 h-4" /> 
                    {withdrawalSent ? 'Solicitado' : 'Solicitar Saque'}
                </button>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm col-span-2 md:col-span-1">
                <p className="text-xs text-gray-500">Corridas Hoje</p>
                <h3 className="text-xl font-bold text-gray-800">8</h3>
            </div>
        </div>

        {/* Active Delivery Interface */}
        {activeOrder ? (
            <div className="m-4 bg-white rounded-xl shadow-lg overflow-hidden border-2 border-orange-500 animate-fade-in-up">
                <div className="bg-orange-500 p-3 text-white font-bold flex justify-between items-center">
                    <span>Em Rota de Entrega</span>
                    <Navigation className="w-5 h-5 animate-pulse" />
                </div>
                
                <div className="p-4 space-y-6">
                    {/* Mock Map Route Visual */}
                    <div className="bg-gray-100 h-24 rounded-lg flex items-center justify-center relative border border-gray-200">
                        <div className="absolute inset-0 flex items-center justify-between px-10">
                             <div className="flex flex-col items-center gap-1 z-10">
                                <div className="w-3 h-3 bg-blue-500 rounded-full ring-2 ring-white"></div>
                                <span className="text-[10px] text-gray-500 font-bold">Você</span>
                             </div>
                             <div className="h-0.5 bg-gray-300 flex-1 mx-2 relative">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2 text-[10px] text-gray-500 rounded-full border border-gray-200">
                                    {(activeDistances.toPickup + activeDistances.toDrop).toFixed(1)}km
                                </div>
                             </div>
                             <div className="flex flex-col items-center gap-1 z-10">
                                <div className="w-3 h-3 bg-red-500 rounded-full ring-2 ring-white animate-pulse"></div>
                                <span className="text-[10px] text-gray-500 font-bold">Destino</span>
                             </div>
                        </div>
                    </div>

                    {/* Step 1: Pickup */}
                    <div className="relative pl-6 border-l-2 border-gray-200 pb-6">
                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 border-2 border-white"></div>
                        <h4 className="font-bold text-gray-800 text-sm">Coleta: {activeOrder.companyName}</h4>
                        <p className="text-xs text-gray-500 mb-2">{activeOrder.pickupAddress?.street}, {activeOrder.pickupAddress?.number}</p>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                {activeDistances.toPickup.toFixed(1)} km de você
                            </span>
                            <button 
                                onClick={() => openNavigation(activeOrder.pickupAddress)}
                                className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-700 transition-colors w-fit"
                            >
                                <Store className="w-3 h-3" /> Navegar (Maps)
                            </button>
                        </div>
                    </div>

                    {/* Step 2: Dropoff */}
                    <div className="relative pl-6 border-l-2 border-orange-500">
                         <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-orange-500 border-2 border-white animate-ping"></div>
                         <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-orange-500 border-2 border-white"></div>
                        <h4 className="font-bold text-gray-800 text-sm">Entrega: {activeOrder.customerName}</h4>
                        <p className="text-xs text-gray-500 mb-2">{activeOrder.deliveryAddress.street}, {activeOrder.deliveryAddress.number}</p>
                        
                        {/* PAYMENT ALERT FOR CASH */}
                        {activeOrder.paymentMethod === 'cash' && (
                            <div className="mb-3 p-2 bg-green-100 border border-green-200 rounded-lg text-green-800 text-xs font-bold flex items-center gap-2">
                                <DollarSign className="w-4 h-4" />
                                <span>Cobrar R$ {activeOrder.total.toFixed(2)} (Dinheiro)</span>
                                {activeOrder.changeFor && <span className="bg-white px-1 rounded ml-auto">Troco p/ R$ {activeOrder.changeFor}</span>}
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold bg-orange-50 text-orange-700 px-2 py-1 rounded">
                                {activeDistances.toDrop.toFixed(1)} km da loja
                            </span>
                            <button 
                                onClick={() => openNavigation(activeOrder.deliveryAddress)}
                                className="bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-orange-700 transition-colors w-fit"
                            >
                                <Navigation className="w-3 h-3" /> Navegar (Maps)
                            </button>
                        </div>
                    </div>

                    {/* Confirmation */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 mt-4">
                        <label className="block text-sm font-bold text-gray-700 mb-2 text-center">
                            Código de Confirmação
                        </label>
                        <input 
                            type="text" maxLength={4}
                            className="w-full text-center text-3xl tracking-[0.5em] font-mono p-3 border rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                            placeholder="0000"
                            value={deliveryCodeInput}
                            onChange={(e) => setDeliveryCodeInput(e.target.value)}
                        />
                        <p className="text-xs text-center mt-2 text-gray-500">Peça os 4 últimos dígitos do telefone do cliente.</p>
                    </div>

                    <button 
                        onClick={handleFinish}
                        className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 flex items-center justify-center gap-2 transition-transform active:scale-95"
                    >
                        <CheckCircle className="w-5 h-5" /> Confirmar Entrega
                    </button>
                </div>
            </div>
        ) : (
            /* Available Orders List */
            <div className="p-4 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-gray-600">Pedidos Próximos</h3>
                    {currentLocation && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                            Raio de {COURIER_OPERATIONAL_RADIUS_KM}km
                        </span>
                    )}
                </div>

                {filteredOrders.length === 0 && (
                    <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-dashed border-gray-200 flex flex-col items-center gap-2">
                        <Bike className="w-8 h-8 opacity-20" />
                        <p>Nenhum pedido disponível na sua região.</p>
                    </div>
                )}

                {filteredOrders.map(order => (
                    <div key={order.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-2 bg-gray-50 rounded-bl-xl text-xs font-bold text-gray-500">
                            {(order as any).distToPickup.toFixed(1)} km
                        </div>
                        
                        <div className="flex justify-between items-start mb-2 pr-10">
                            <div>
                                <h4 className="font-bold text-gray-800">{order.companyName}</h4>
                                <p className="text-xs text-gray-500">{order.pickupAddress?.neighborhood}</p>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2 my-3 text-sm border-l-2 border-gray-200 pl-3">
                             <div className="flex-1 space-y-1">
                                 <p className="text-gray-500 text-xs truncate flex items-center gap-1">
                                     <Store className="w-3 h-3" /> Coleta: {order.pickupAddress?.street}, {order.pickupAddress?.number}
                                 </p>
                                 <p className="font-medium text-gray-800 text-xs truncate flex items-center gap-1">
                                     <MapPin className="w-3 h-3 text-red-500" /> Entrega: {order.deliveryAddress.street}, {order.deliveryAddress.number}
                                 </p>
                             </div>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                            <div className="bg-green-100 text-green-700 font-bold px-3 py-1.5 rounded-lg text-sm">
                                + R$ {order.deliveryFee.toFixed(2)}
                            </div>
                            <button 
                                onClick={() => handleAccept(order)}
                                className="bg-gray-900 text-white font-bold py-2 px-4 rounded-lg hover:bg-black transition-colors flex items-center gap-2 text-sm shadow-md"
                            >
                                Aceitar <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
};

export default CourierView;