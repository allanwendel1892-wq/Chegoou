import React, { useState, useRef, useEffect } from 'react';
import { User, UserRole } from '../types';
import { MapPin, Navigation, ArrowRight, Loader2, ShoppingBag, AlertCircle, Search, Check, MousePointer2, Map as MapIcon, Crosshair } from 'lucide-react';

declare global {
  interface Window {
    google: any;
    googleMapsAuthFailed?: boolean;
  }
}

interface AuthViewProps {
  onLogin: (user: User) => void;
  existingUsers?: User[];
}

const AuthView: React.FC<AuthViewProps> = ({ onLogin, existingUsers = [] }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Map Modal State
  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false); // State for GPS loading
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    street: '',
    number: '',
    zipCode: '',
    city: '',
    neighborhood: '',
    lat: -23.550520,
    lng: -46.633308
  });

  // --- GOOGLE MAPS LOGIC ---
  useEffect(() => {
    // Listener for auth failure (defined in index.html)
    const handleAuthFailure = () => {
        setMapError(true);
    };
    window.addEventListener('gm_authFailure', handleAuthFailure);
    if (window.googleMapsAuthFailed) setMapError(true);

    return () => window.removeEventListener('gm_authFailure', handleAuthFailure);
  }, []);

  useEffect(() => {
    let map: any;
    
    const initMap = () => {
        if (!mapContainerRef.current || !window.google || mapError) return;

        try {
            // Default center (São Paulo)
            const initialPos = { lat: formData.lat || -23.550520, lng: formData.lng || -46.633308 };
            
            map = new window.google.maps.Map(mapContainerRef.current, {
                center: initialPos,
                zoom: 17,
                disableDefaultUI: true,
                zoomControl: false,
                gestureHandling: 'greedy', // Important for mobile touch
                styles: [
                    {
                        "featureType": "poi",
                        "stylers": [{ "visibility": "off" }]
                    }
                ]
            });

            mapInstanceRef.current = map;
            const geocoder = new window.google.maps.Geocoder();

            // SMART CENTER LOGIC:
            const isDefaultCoords = (initialPos.lat === -23.550520 && initialPos.lng === -46.633308);
            if (isDefaultCoords && formData.street && formData.city) {
                 const fullAddress = `${formData.street}, ${formData.number || ''} - ${formData.neighborhood}, ${formData.city}, Brasil`;
                 geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                     if (status === 'OK' && results[0]) {
                         const location = results[0].geometry.location;
                         map.setCenter(location);
                     }
                 });
            }

            // Listeners for Pin Animation
            map.addListener('dragstart', () => {
                setIsMapDragging(true);
            });

            map.addListener('idle', () => {
                setIsMapDragging(false);
                const center = map.getCenter();
                if (center) {
                    const lat = center.lat();
                    const lng = center.lng();
                    
                    // Reverse Geocode
                    geocoder.geocode({ location: { lat, lng } }, (results: any, status: any) => {
                        if (status === 'OK' && results[0]) {
                            const addressComponents = results[0].address_components;
                            let route = '';
                            let streetNumber = '';
                            let sublocality = '';
                            let locality = '';
                            let postalCode = '';

                            addressComponents.forEach((component: any) => {
                                if (component.types.includes('route')) route = component.long_name;
                                if (component.types.includes('street_number')) streetNumber = component.long_name;
                                if (component.types.includes('sublocality')) sublocality = component.long_name;
                                if (component.types.includes('administrative_area_level_2') || component.types.includes('locality')) locality = component.long_name;
                                if (component.types.includes('postal_code')) postalCode = component.long_name;
                            });

                            setMapAddress(`${route}, ${streetNumber || 'S/N'}`);
                            
                            // Update form data directly from map position
                            setFormData(prev => ({
                                ...prev,
                                lat,
                                lng,
                                street: route || prev.street,
                                neighborhood: sublocality || prev.neighborhood,
                                city: locality || prev.city,
                                zipCode: postalCode ? postalCode.replace('-', '') : prev.zipCode
                            }));
                        }
                    });
                }
            });
        } catch (e) {
            console.error("Map initialization error:", e);
            setMapError(true);
        }
    };

    if (showMapModal && !mapError) {
        if (window.google && window.google.maps) {
            initMap();
        } else {
            // Retry if google script hasn't loaded yet
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    initMap();
                } else if (window.googleMapsAuthFailed) {
                    clearInterval(interval);
                    setMapError(true);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }
  }, [showMapModal, mapError]); 

  // --- GET CURRENT LOCATION (GPS) ---
  const handleGetCurrentLocation = () => {
      if (!navigator.geolocation) {
          alert('Geolocalização não é suportada pelo seu navegador.');
          return;
      }
      
      setLoadingLocation(true);

      navigator.geolocation.getCurrentPosition(
          (position) => {
              const { latitude, longitude } = position.coords;
              
              // Use Google Geocoder to reverse geocode
              if (window.google && window.google.maps) {
                  const geocoder = new window.google.maps.Geocoder();
                  geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
                      if (status === 'OK' && results[0]) {
                          const addressComponents = results[0].address_components;
                          let route = '';
                          let streetNumber = '';
                          let sublocality = '';
                          let locality = '';
                          let postalCode = '';

                          addressComponents.forEach((component: any) => {
                              if (component.types.includes('route')) route = component.long_name;
                              if (component.types.includes('street_number')) streetNumber = component.long_name;
                              if (component.types.includes('sublocality')) sublocality = component.long_name;
                              if (component.types.includes('administrative_area_level_2') || component.types.includes('locality')) locality = component.long_name;
                              if (component.types.includes('postal_code')) postalCode = component.long_name;
                          });

                          setFormData(prev => ({
                              ...prev,
                              lat: latitude,
                              lng: longitude,
                              street: route || prev.street,
                              number: streetNumber || prev.number,
                              neighborhood: sublocality || prev.neighborhood,
                              city: locality || prev.city,
                              zipCode: postalCode ? postalCode.replace('-', '') : prev.zipCode
                          }));
                      }
                      setLoadingLocation(false);
                  });
              } else {
                  // Fallback if google maps not loaded yet (just sets lat/lng)
                  setFormData(prev => ({
                      ...prev,
                      lat: latitude,
                      lng: longitude
                  }));
                  setLoadingLocation(false);
                  alert("Localização obtida! Confirme os detalhes do endereço.");
              }
          },
          (error) => {
              console.error("Error getting location:", error);
              
              let msg = "Não foi possível obter sua localização.";
              // Handle specific Geolocation errors
              if (error.code === 1) { // PERMISSION_DENIED
                  msg = "Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador.";
              } else if (error.code === 2) { // POSITION_UNAVAILABLE
                  msg = "Sinal de GPS indisponível. Verifique se o GPS está ativo ou tente em local aberto.";
              } else if (error.code === 3) { // TIMEOUT
                  msg = "O tempo para obter a localização esgotou. Tente novamente.";
              }
              
              alert(msg);
              setLoadingLocation(false);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, '');
      setFormData(prev => ({...prev, zipCode: value}));

      if (value.length === 8) {
          setLoadingCep(true);
          try {
              const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
              const data = await response.json();
              
              if (!data.erro) {
                  // 1. Update text fields first
                  setFormData(prev => ({
                      ...prev,
                      street: data.logradouro,
                      city: data.localidade,
                      neighborhood: data.bairro
                  }));

                  // 2. CRITICAL: Fetch Coordinates based on the ViaCEP address text
                  if (window.google && window.google.maps) {
                      const geocoder = new window.google.maps.Geocoder();
                      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, Brasil`;
                      
                      geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                          if (status === 'OK' && results[0]) {
                              const location = results[0].geometry.location;
                              setFormData(prev => ({
                                  ...prev,
                                  lat: location.lat(),
                                  lng: location.lng()
                              }));
                          }
                      });
                  }
              }
          } catch (err) {
              console.error("Erro ao buscar CEP", err);
          } finally {
              setLoadingCep(false);
          }
      }
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    setTimeout(() => {
        // --- STRICT LOGIN LOGIC ---
        if (!isRegistering) {
            // LOGIN MODE
            // Send a special ID to App.tsx to tell it to SELECT from DB, not INSERT.
            const loginAttemptUser: User = {
                id: 'login_action', // SPECIAL FLAG
                name: '',
                email: formData.email,
                password: formData.password,
                phone: '',
                role: 'client',
                address: undefined
            };
            onLogin(loginAttemptUser);
            // Note: Error handling will be done by App.tsx if DB fetch fails
        } else {
            // --- REGISTRATION MODE ---
            // Ensure passwords are created
            const newUser: User = {
                id: `u-${Date.now()}`,
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                role: 'client', // Default role for new signups
                password: formData.password, // Save the password
                address: {
                    street: formData.street,
                    number: formData.number,
                    city: formData.city,
                    zipCode: formData.zipCode,
                    neighborhood: formData.neighborhood,
                    lat: formData.lat,
                    lng: formData.lng
                }
            };
            // Logs in and Adds to global state via App.tsx handleLogin
            onLogin(newUser);
        }
        setLoading(false);
    }, 500);
  };

  const openWhatsAppPartner = () => {
    window.open(`https://wa.me/5581973147355?text=Olá, quero ser um parceiro Chegoou!`, '_blank');
  };

  return (
    <div className="min-h-screen flex bg-white relative">
      
      {/* MAP CONFIRMATION MODAL (IFOOD STYLE) */}
      {showMapModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[600px] relative">
                  {/* Header */}
                  <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                      <div className="bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md border border-gray-100 pointer-events-auto">
                          <h3 className="font-bold text-gray-800 flex items-center gap-2">
                             <Navigation className="w-4 h-4 text-red-600" /> 
                             {mapError ? 'Localização Manual' : 'Confirmar Localização'}
                          </h3>
                          <p className="text-xs text-gray-500">
                              {mapError ? 'O mapa está indisponível no momento.' : 'Mova o mapa para onde deseja entregar'}
                          </p>
                      </div>
                      <button 
                        onClick={() => setShowMapModal(false)}
                        className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 pointer-events-auto transition-colors"
                      >
                          <AlertCircle className="w-6 h-6 text-gray-500" />
                      </button>
                  </div>

                  {/* Interactive Google Map OR Fallback */}
                  <div className="flex-1 bg-gray-100 relative group overflow-hidden">
                      {mapError ? (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-8 text-center">
                              <MapIcon className="w-16 h-16 text-gray-300 mb-4" />
                              <h4 className="font-bold text-gray-600 mb-2">Mapa Indisponível</h4>
                              <p className="text-sm text-gray-500 max-w-xs">
                                  Houve um problema ao carregar o Google Maps. 
                                  Por favor, confirme o endereço digitado.
                              </p>
                          </div>
                      ) : (
                        <>
                          <div ref={mapContainerRef} className="w-full h-full" />
                          
                          {/* Center Pin */}
                          <div 
                            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none transition-all duration-300 ease-out
                                ${isMapDragging ? '-mt-16 scale-110' : '-mt-8'}
                            `}
                          >
                              <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-2xl border-[3px] border-white">
                                  <MapPin className="w-6 h-6 text-white fill-current" />
                              </div>
                              <div 
                                className={`w-2 h-8 bg-black/80 rounded-full -mt-2 blur-[1px] transition-opacity duration-300
                                    ${isMapDragging ? 'opacity-0' : 'opacity-20'}
                                `}
                              ></div>
                          </div>

                          {!isMapDragging && (
                              <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-2 animate-pulse">
                                 <MousePointer2 className="w-3 h-3" /> Arraste o mapa
                              </div>
                          )}
                        </>
                      )}
                  </div>

                  {/* Bottom Sheet Address */}
                  <div className="p-6 bg-white border-t border-gray-100 rounded-t-3xl -mt-6 relative z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
                      
                      <div className="flex items-start gap-3 mb-6">
                           <div className="p-2 bg-red-50 rounded-lg shrink-0">
                               <MapPin className="w-6 h-6 text-red-600" />
                           </div>
                           <div className="flex-1">
                               <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço Selecionado</p>
                               <h4 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">
                                   {mapAddress || `${formData.street || 'Rua Desconhecida'}, ${formData.number || 'S/N'}`}
                               </h4>
                               <p className="text-sm text-gray-500">{formData.neighborhood} - {formData.city}</p>
                           </div>
                      </div>

                      <button 
                        onClick={() => setShowMapModal(false)}
                        className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 flex items-center justify-center gap-2 transition-transform active:scale-95"
                      >
                          <Check className="w-5 h-5" /> {mapError ? 'Confirmar Endereço Manual' : 'Confirmar Localização'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Left Side - Image */}
      <div className="hidden lg:flex w-1/2 bg-red-600 relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-black opacity-20 z-10"></div>
        <img 
            src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop" 
            className="absolute inset-0 w-full h-full object-cover"
            alt="Food Background"
        />
        <div className="relative z-20 text-white p-12 max-w-lg">
            <div className="bg-red-600/90 backdrop-blur-sm p-8 rounded-3xl shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="bg-white p-2 rounded-xl">
                        <ShoppingBag className="w-6 h-6 text-red-600" />
                    </div>
                    <h1 className="text-3xl font-bold">Chegoou Delivery</h1>
                </div>
                <p className="text-lg font-medium opacity-90 leading-relaxed">
                    Gerencie seu negócio, faça pedidos ou entregue com a plataforma mais completa do mercado.
                </p>
            </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center p-8 sm:p-12 lg:p-24 bg-gray-50">
        <div className="max-w-md w-full mx-auto space-y-8">
            <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                    {isRegistering ? 'Crie sua conta' : 'Bem-vindo de volta'}
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                    {isRegistering ? 'Preencha seus dados para começar' : 'Entre com suas credenciais para acessar'}
                </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" /> {error}
                    </div>
                )}
                {!isRegistering ? (
                    <div className="space-y-5">
                        <div>
                            <label className="text-sm font-semibold text-gray-700 ml-1">Email</label>
                            <input 
                                type="email" 
                                className="mt-1 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all shadow-sm"
                                placeholder="seu@email.com"
                                value={formData.email}
                                onChange={e => setFormData({...formData, email: e.target.value})}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-gray-700 ml-1">Senha</label>
                            <input 
                                type="password" 
                                className="mt-1 w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all shadow-sm"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={e => setFormData({...formData, password: e.target.value})}
                                required
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in-up">
                        <input 
                            type="text" placeholder="Nome Completo" 
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                            value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required
                        />
                        <input 
                            type="email" placeholder="Email" 
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                            value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required
                        />
                         <input 
                                type="password" 
                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none shadow-sm"
                                placeholder="Crie uma senha"
                                value={formData.password}
                                onChange={e => setFormData({...formData, password: e.target.value})}
                                required
                            />
                        <input 
                            type="tel" placeholder="Celular" 
                            className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none shadow-sm"
                            value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required
                        />
                        
                        <div className="p-4 bg-white rounded-xl border border-gray-200 space-y-3 shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> Endereço de Entrega
                                </p>
                                <button 
                                    type="button" 
                                    onClick={handleGetCurrentLocation}
                                    disabled={loadingLocation}
                                    className="text-xs text-red-600 font-bold hover:text-red-700 flex items-center gap-1"
                                >
                                    {loadingLocation ? <Loader2 className="w-3 h-3 animate-spin"/> : <Crosshair className="w-3 h-3" />}
                                    Usar localização atual
                                </button>
                            </div>
                            
                            {/* CEP Search */}
                            <div className="flex gap-2">
                                <div className="w-1/3 relative">
                                    <input 
                                        type="text" placeholder="CEP" 
                                        className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-red-500"
                                        value={formData.zipCode} 
                                        onChange={handleCepChange}
                                        maxLength={8}
                                        required
                                    />
                                    {loadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 text-red-500 animate-spin" />}
                                </div>
                                <button 
                                    type="button" 
                                    onClick={() => setShowMapModal(true)}
                                    className="flex-1 text-xs bg-red-50 text-red-600 font-bold rounded-lg hover:bg-red-100 flex items-center justify-center gap-2 border border-red-100 transition-colors"
                                >
                                    <MapPin className="w-3 h-3" /> Abrir Mapa
                                </button>
                            </div>

                            {/* Address Fields */}
                            <div className="flex gap-2">
                                <input 
                                    type="text" placeholder="Rua" className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} required
                                />
                                <input 
                                    type="text" placeholder="Nº" className="w-20 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} required
                                />
                            </div>
                             <div className="flex gap-2">
                                <input 
                                    type="text" placeholder="Bairro" className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})} required
                                />
                                <input 
                                    type="text" placeholder="Cidade" className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none"
                                    value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} required
                                />
                            </div>
                        </div>
                    </div>
                )}

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin" /> : (
                        <>
                            {isRegistering ? 'Criar Conta' : 'Acessar Plataforma'}
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </form>
            
            <div className="flex items-center gap-4 my-6">
                <div className="h-px bg-gray-200 flex-1"></div>
                <span className="text-gray-400 text-sm">ou</span>
                <div className="h-px bg-gray-200 flex-1"></div>
            </div>

            <div className="text-center space-y-4">
                <button 
                    type="button" 
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-gray-600 font-medium hover:text-red-600 transition-colors"
                >
                    {isRegistering ? 'Já tem uma conta? Faça Login' : 'Não tem conta? Cadastre-se'}
                </button>

                <div 
                    onClick={openWhatsAppPartner}
                    className="mt-6 p-4 bg-green-50 rounded-xl border border-green-100 cursor-pointer hover:bg-green-100 transition-colors group"
                >
                    <p className="text-green-800 font-medium text-sm flex items-center justify-center gap-2">
                        Possui um restaurante? 
                        <span className="font-bold underline decoration-green-500 group-hover:decoration-2">Seja um Parceiro</span>
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AuthView;