import React, { useState, useRef, useEffect } from 'react';
import { User, Company, Order, WithdrawalRequest, UserRole, Address } from '../types';
import { Users, Building2, DollarSign, Settings, Trash2, CheckCircle, Ban, TrendingUp, Search, Lock, Unlock, Edit, X, Save, Bike, LogOut, MapPin, Truck, Loader2, Navigation, MousePointer2, Map as MapIcon, Crosshair } from 'lucide-react';

interface AdminViewProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  orders: Order[];
  onLogout: () => void;
  // Withdrawals Props
  withdrawals: WithdrawalRequest[];
  onUpdateWithdrawal: (id: string, status: 'paid' | 'rejected') => void;
  // Settings Props
  globalSettings: { platformFee: number; minWithdrawal: number; maintenanceMode: boolean };
  onUpdateSettings: (settings: { platformFee: number; minWithdrawal: number; maintenanceMode: boolean }) => void;
  
  // PERSISTENCE HANDLERS (SUPABASE)
  onUpdateUser: (user: User) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onUpsertCompany: (company: Company) => Promise<void>;
  onDeleteCompany: (companyId: string) => Promise<void>;
}

// Standardized Categories - MUST MATCH CLIENT VIEW
const COMPANY_CATEGORIES = [
    "Lanches", "Pizza", "Japonesa", "Brasileira", "Açaí", 
    "Doces & Bolos", "Saudável", "Italiana", "Bebidas", "Padaria", 
    "Sorvetes", "Carnes", "Mercado", "Asiática"
];

const AdminView: React.FC<AdminViewProps> = ({ 
    users, setUsers, companies, setCompanies, orders, onLogout,
    withdrawals, onUpdateWithdrawal,
    globalSettings, onUpdateSettings,
    onUpdateUser, onDeleteUser, onUpsertCompany, onDeleteCompany
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'companies' | 'users' | 'finance'>('dashboard');

  // --- MODAL STATES ---
  const [showSettings, setShowSettings] = useState(false);
  
  // Local Settings State (for form editing before save)
  const [localSettingsForm, setLocalSettingsForm] = useState(globalSettings);

  // Edit User Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingUserCompany, setEditingUserCompany] = useState<Company | null>(null);
  
  // Edit Company Modal State
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // Confirmation Modal State
  const [confirmAction, setConfirmAction] = useState<{
      type: 'delete_user' | 'delete_company' | 'approve_withdrawal';
      id: string;
      title: string;
      message: string;
  } | null>(null);

  // --- MAP & ADDRESS LOGIC STATES (FOR EDIT USER) ---
  const [showMapModal, setShowMapModal] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapAddress, setMapAddress] = useState('');
  const [isMapDragging, setIsMapDragging] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Update local form when global settings change (sync)
  useEffect(() => {
      setLocalSettingsForm(globalSettings);
  }, [globalSettings]);

  // --- MAP LOGIC (Copied from ClientView/AuthView for consistency) ---
  useEffect(() => {
    let map: any;
    
    const initMap = () => {
        if (!mapContainerRef.current || !window.google || mapError || !editingUser) return;

        try {
            const initialPos = { 
                lat: editingUser.address?.lat || -23.550520, 
                lng: editingUser.address?.lng || -46.633308 
            };
            
            map = new window.google.maps.Map(mapContainerRef.current, {
                center: initialPos,
                zoom: 17,
                disableDefaultUI: true,
                zoomControl: false,
                gestureHandling: 'greedy',
                styles: [{ "featureType": "poi", "stylers": [{ "visibility": "off" }] }]
            });

            const geocoder = new window.google.maps.Geocoder();

            map.addListener('dragstart', () => setIsMapDragging(true));
            map.addListener('idle', () => {
                setIsMapDragging(false);
                const center = map.getCenter();
                if (center) {
                    const lat = center.lat();
                    const lng = center.lng();
                    
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
                            
                            // Update editingUser state directly with GEOCODED coordinates
                            setEditingUser(prev => {
                                if(!prev) return null;
                                return {
                                    ...prev,
                                    address: {
                                        ...prev.address!,
                                        lat,
                                        lng,
                                        street: route || prev.address?.street || '',
                                        neighborhood: sublocality || prev.address?.neighborhood || '',
                                        city: locality || prev.address?.city || '',
                                        zipCode: postalCode ? postalCode.replace('-', '') : prev.address?.zipCode || ''
                                    }
                                }
                            });
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
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    initMap();
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }
  }, [showMapModal, mapError]);

  const handleGetCurrentLocation = () => {
      if (!navigator.geolocation) {
          alert('Geolocalização não suportada.');
          return;
      }
      setLoadingLocation(true);
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const { latitude, longitude } = position.coords;
              if (window.google && window.google.maps) {
                  const geocoder = new window.google.maps.Geocoder();
                  geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
                      if (status === 'OK' && results[0]) {
                          const components = results[0].address_components;
                          // Extract address parts...
                          let route = '', num = '', neigh = '', city = '', zip = '';
                          components.forEach((c: any) => {
                              if (c.types.includes('route')) route = c.long_name;
                              if (c.types.includes('street_number')) num = c.long_name;
                              if (c.types.includes('sublocality')) neigh = c.long_name;
                              if (c.types.includes('administrative_area_level_2')) city = c.long_name;
                              if (c.types.includes('postal_code')) zip = c.long_name;
                          });

                          setEditingUser(prev => prev ? ({
                              ...prev,
                              address: {
                                  ...prev.address!,
                                  lat: latitude, lng: longitude,
                                  street: route, number: num, neighborhood: neigh, city: city, zipCode: zip
                              }
                          }) : null);
                      }
                      setLoadingLocation(false);
                  });
              } else {
                  // Fallback
                  setEditingUser(prev => prev ? ({ ...prev, address: { ...prev.address!, lat: latitude, lng: longitude } }) : null);
                  setLoadingLocation(false);
              }
          },
          (err) => {
              console.error(err);
              alert("Erro ao obter localização. Verifique permissões.");
              setLoadingLocation(false);
          },
          { enableHighAccuracy: true, timeout: 20000 }
      );
  };

  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, '');
      setEditingUser(prev => prev ? ({...prev, address: {...prev.address!, zipCode: value}}) : null);

      if (value.length === 8) {
          setLoadingCep(true);
          try {
              const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
              const data = await response.json();
              if (!data.erro) {
                  // 1. Update text fields first
                  setEditingUser(prev => prev ? ({
                      ...prev,
                      address: {
                          ...prev.address!,
                          street: data.logradouro,
                          city: data.localidade,
                          neighborhood: data.bairro
                      }
                  }) : null);

                  // 2. CRITICAL: Trigger Google Geocoder to get coordinates for this address
                  if (window.google && window.google.maps) {
                      const geocoder = new window.google.maps.Geocoder();
                      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade}, Brasil`;
                      
                      geocoder.geocode({ address: fullAddress }, (results: any, status: any) => {
                          if (status === 'OK' && results[0]) {
                              const location = results[0].geometry.location;
                              setEditingUser(prev => prev ? ({
                                  ...prev,
                                  address: {
                                      ...prev.address!, // Keep latest text updates
                                      lat: location.lat(),
                                      lng: location.lng()
                                  }
                              }) : null);
                          }
                      });
                  }
              }
          } catch (err) { console.error(err); } 
          finally { setLoadingCep(false); }
      }
  };

  // --- USER ACTIONS ---
  const startEditingUser = (user: User) => {
      // Ensure address object exists
      const userWithAddress = {
          ...user,
          address: user.address || { street: '', number: '', neighborhood: '', city: '', zipCode: '', lat: 0, lng: 0 }
      };
      setEditingUser(userWithAddress);
      
      if (user.role === 'partner') {
          const comp = companies.find(c => c.id === user.id);
          setEditingUserCompany(comp || null);
      } else {
          setEditingUserCompany(null);
      }
  };

  const handleSaveUser = async () => {
      if (!editingUser) return;
      const updatedUser = editingUser;

      // 1. PERSIST USER CHANGE
      await onUpdateUser(updatedUser);

      // 2. Handle Partner/Company Logic
      if (updatedUser.role === 'partner') {
           const existingCompany = companies.find(c => c.id === updatedUser.id);
           
           if (!existingCompany) {
               // Create new company if it doesn't exist (promoted user)
               const newCompany: Company = {
                    id: updatedUser.id,
                    name: `Restaurante de ${updatedUser.name}`,
                    description: 'Configure sua loja...',
                    category: 'Lanches', // Default category
                    logo: '',
                    status: 'open', 
                    serviceFeePercentage: globalSettings.platformFee, // USE GLOBAL SETTING
                    deliveryType: editingUserCompany?.deliveryType || 'chegoou',
                    deliveryRadiusKm: editingUserCompany?.deliveryRadiusKm || 5,
                    openingHours: '08:00 - 22:00',
                    openingDays: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
                    isSuspended: false,
                    address: updatedUser.address // Sync address
                };
                await onUpsertCompany(newCompany);
           } else if (editingUserCompany) {
               // Update existing company
               const updatedCompany = {
                   ...existingCompany,
                   deliveryType: editingUserCompany.deliveryType,
                   deliveryRadiusKm: editingUserCompany.deliveryRadiusKm,
                   ownDeliveryFee: editingUserCompany.ownDeliveryFee,
                   address: updatedUser.address // CRITICAL: Sync address here to update Coordinates!
               };
               await onUpsertCompany(updatedCompany);
           }
      }
      setEditingUser(null);
      setEditingUserCompany(null);
  };

  const confirmDeleteUser = (id: string) => {
      setConfirmAction({
          type: 'delete_user',
          id,
          title: 'Excluir Usuário',
          message: 'Tem certeza? Se este usuário for um Parceiro, a empresa vinculada também será excluída.'
      });
  };

  const executeDeleteUser = async () => {
      if (!confirmAction) return;
      const id = confirmAction.id;
      
      await onDeleteUser(id);
      
      // Also check if company needs deletion (although database cascade should handle it, we do it in state via App logic usually)
      const comp = companies.find(c => c.id === id);
      if (comp) {
          await onDeleteCompany(id);
      }
      
      setConfirmAction(null);
  };

  // --- COMPANY ACTIONS ---
  const handleSaveCompany = async (updatedCompany: Company) => {
      await onUpsertCompany(updatedCompany);
      setEditingCompany(null);
  };

  const confirmDeleteCompany = (id: string) => {
      setConfirmAction({
          type: 'delete_company',
          id,
          title: 'Excluir Empresa',
          message: 'Isso removerá a empresa do sistema. O usuário vinculado voltará a ser um "Cliente".'
      });
  };

  const executeDeleteCompany = async () => {
      if (!confirmAction) return;
      const id = confirmAction.id;
      
      await onDeleteCompany(id);
      
      // Revert User Role to Client
      const user = users.find(u => u.id === id);
      if (user) {
          await onUpdateUser({ ...user, role: 'client' });
      }
      
      setConfirmAction(null);
  };

  const toggleSuspendCompany = async (id: string) => {
      const company = companies.find(c => c.id === id);
      if (company) {
          await onUpsertCompany({ ...company, isSuspended: !company.isSuspended });
      }
  };

  // --- FINANCE ACTIONS ---
  const approveWithdrawal = (id: string) => {
      setConfirmAction({
          type: 'approve_withdrawal',
          id,
          title: 'Confirmar Pagamento',
          message: 'Você confirma que o pagamento foi realizado para o entregador?'
      });
  };

  const executeApproveWithdrawal = () => {
      if (!confirmAction) return;
      const id = confirmAction.id;
      // Call prop handler to update DB
      onUpdateWithdrawal(id, 'paid');
      setConfirmAction(null);
  };

  // --- SAVE SETTINGS ---
  const saveGlobalSettings = () => {
      onUpdateSettings(localSettingsForm);
      setShowSettings(false);
      alert('Configurações atualizadas! As taxas das empresas foram ajustadas.');
  };


  // --- CALCULATIONS ---
  const totalRevenue = orders.reduce((acc, o) => o.status !== 'cancelled' ? acc + o.total : acc, 0);
  const totalOrders = orders.length;
  const activeCompaniesCount = companies.filter(c => !c.isSuspended).length;
  const platformRevenue = totalRevenue * (globalSettings.platformFee / 100);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
            <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
            <p className="text-gray-500 mt-1">Gestão completa da plataforma Chegoou.</p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => {
                    setLocalSettingsForm(globalSettings); // Reset form to current
                    setShowSettings(true);
                }}
                className="bg-white p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 shadow-sm transition-colors hover:text-red-600"
                title="Configurações Globais"
            >
                <Settings className="w-5 h-5" />
            </button>
            <button 
                onClick={onLogout}
                className="bg-white p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 shadow-sm transition-colors"
                title="Sair do Sistema"
            >
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex overflow-x-auto pb-4 gap-2 mb-8 border-b border-gray-200">
        {[
            {id: 'dashboard', label: 'Visão Geral'},
            {id: 'users', label: 'Usuários'},
            {id: 'companies', label: 'Empresas'},
            {id: 'finance', label: 'Financeiro'}
        ].map(tab => (
            <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`
                    px-6 py-2.5 rounded-full font-medium text-sm transition-all whitespace-nowrap
                    ${activeTab === tab.id 
                        ? 'bg-gray-900 text-white shadow-lg shadow-gray-200' 
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-transparent'}
                `}
            >
                {tab.label}
            </button>
        ))}
      </div>

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                  { label: 'Volume Transacionado', value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'bg-green-100 text-green-600' },
                  { label: 'Total de Pedidos', value: totalOrders.toString(), icon: CheckCircle, color: 'bg-blue-100 text-blue-600' },
                  { label: 'Empresas Ativas', value: activeCompaniesCount.toString(), icon: Building2, color: 'bg-purple-100 text-purple-600' },
                  { label: 'Usuários Cadastrados', value: users.length.toString(), icon: TrendingUp, color: 'bg-orange-100 text-orange-600' },
              ].map((stat, idx) => (
                  <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                          <div>
                              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                              <h3 className="text-2xl font-bold text-gray-900 mt-2">{stat.value}</h3>
                          </div>
                          <div className={`p-3 rounded-xl ${stat.color}`}>
                              <stat.icon className="w-5 h-5" />
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-800">Base de Usuários</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Buscar usuário..." className="pl-9 pr-4 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-200" />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50">
                        <tr>
                            <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Usuário</th>
                            <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Contato</th>
                            <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Função</th>
                            <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-xs text-gray-600">
                                            {user.name.charAt(0)}
                                        </div>
                                        <div>
                                            <span className="font-medium text-gray-900 block">{user.name}</span>
                                            <span className="text-xs text-gray-400">ID: {user.id.slice(0, 6)}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                    <div className="flex flex-col">
                                        <span>{user.email}</span>
                                        <span className="text-xs">{user.phone}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                                        ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : ''}
                                        ${user.role === 'client' ? 'bg-gray-100 text-gray-600' : ''}
                                        ${user.role === 'partner' ? 'bg-blue-100 text-blue-700' : ''}
                                        ${user.role === 'courier' ? 'bg-orange-100 text-orange-700' : ''}
                                    `}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => startEditingUser(user)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        >
                                            <Edit className="w-4 h-4"/>
                                        </button>
                                        <button 
                                            onClick={() => confirmDeleteUser(user.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* COMPANIES TAB */}
      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {companies.map(company => (
                <div key={company.id} className={`bg-white rounded-2xl shadow-sm border ${company.isSuspended ? 'border-red-200 bg-red-50' : 'border-gray-100'} p-6 relative group hover:shadow-md transition-all`}>
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-gray-100 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                                {company.logo ? <img src={company.logo} className="w-full h-full object-cover" /> : <Building2 className="w-6 h-6 text-gray-400"/>}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 text-lg">{company.name}</h3>
                                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{company.category}</p>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setEditingCompany(company)} className="p-2 hover:bg-gray-100 rounded-lg text-blue-600">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => confirmDeleteCompany(company.id)} className="p-2 hover:bg-gray-100 rounded-lg text-red-600">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    
                    <div className="space-y-3 text-sm text-gray-600 bg-white/50 p-4 rounded-xl mb-4">
                        <div className="flex justify-between border-b border-gray-200/50 pb-2">
                            <span>Taxa Serviço</span>
                            <span className="font-bold text-gray-900">{company.serviceFeePercentage}%</span>
                        </div>
                        <div className="flex justify-between border-b border-gray-200/50 pb-2">
                            <span>Logística</span>
                            <span className="capitalize font-medium">{company.deliveryType}</span>
                        </div>
                        {company.deliveryType === 'chegoou' && company.customPlatformFee && (
                            <div className="flex justify-between border-b border-gray-200/50 pb-2">
                                <span>Frete Fixo Admin</span>
                                <span className="font-bold text-blue-600">R$ {company.customPlatformFee.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center pt-1">
                            <span>Status</span>
                            {company.isSuspended ? (
                                <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-red-600 text-white">SUSPENSO</span>
                            ) : (
                                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${company.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                    {company.status === 'open' ? 'ABERTO' : 'FECHADO'}
                                </span>
                            )}
                        </div>
                    </div>

                    <button 
                        onClick={() => toggleSuspendCompany(company.id)}
                        className={`w-full border py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors
                            ${company.isSuspended 
                                ? 'border-green-200 text-green-600 hover:bg-green-50' 
                                : 'border-red-200 text-red-500 hover:bg-red-50'
                            }
                        `}
                    >
                        {company.isSuspended ? (
                            <> <Unlock className="w-4 h-4" /> Desbloquear Acesso </>
                        ) : (
                            <> <Ban className="w-4 h-4" /> Bloquear Acesso </>
                        )}
                    </button>
                </div>
            ))}
        </div>
      )}

      {/* FINANCE TAB */}
      {activeTab === 'finance' && (
          <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
                  <div className="flex items-center gap-3 mb-6">
                      <div className="bg-emerald-100 p-2 rounded-lg">
                          <DollarSign className="w-6 h-6 text-emerald-600" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl text-gray-900">Fluxo Financeiro</h3>
                        <p className="text-sm text-gray-500">Gestão global da plataforma</p>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-2xl border border-gray-200">
                          <p className="text-sm text-gray-600 font-bold uppercase tracking-wider mb-2">Volume Total (GMV)</p>
                          <h4 className="text-3xl font-bold text-gray-900">R$ {totalRevenue.toFixed(2)}</h4>
                          <p className="text-xs text-gray-500 mt-2">Soma de todos os pedidos</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100">
                          <p className="text-sm text-green-600 font-bold uppercase tracking-wider mb-2">Receita Plataforma</p>
                          <h4 className="text-3xl font-bold text-green-900">R$ {platformRevenue.toFixed(2)}</h4>
                          <p className="text-xs text-green-600 mt-2 opacity-80">Baseado na taxa de {globalSettings.platformFee}%</p>
                      </div>
                  </div>
              </div>

              {/* Courier Withdrawals */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                 <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                     <Bike className="w-5 h-5 text-orange-600" />
                     <h3 className="font-bold text-lg text-gray-800">Solicitações de Saque (Entregadores)</h3>
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Solicitante</th>
                                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Dados Bancários</th>
                                <th className="p-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                                <th className="p-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {withdrawals.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">
                                        Nenhuma solicitação encontrada.
                                    </td>
                                </tr>
                            )}
                            {withdrawals.map(req => (
                                <tr key={req.id}>
                                    <td className="p-4 font-medium text-gray-900">{req.userName}</td>
                                    <td className="p-4 font-bold text-gray-800">R$ {req.amount.toFixed(2)}</td>
                                    <td className="p-4 text-sm text-gray-600 font-mono bg-gray-50 rounded">{req.bankInfo}</td>
                                    <td className="p-4">
                                        {req.status === 'paid' ? (
                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold uppercase">Pago</span>
                                        ) : (
                                            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold uppercase">Pendente</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {req.status === 'pending' && (
                                            <button 
                                                onClick={() => approveWithdrawal(req.id)}
                                                className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors"
                                            >
                                                Confirmar Pagto
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
              </div>
          </div>
      )}

      {/* --- MODALS --- */}

      {/* CONFIRMATION MODAL */}
      {confirmAction && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{confirmAction.title}</h3>
                  <p className="text-gray-600 mb-6">{confirmAction.message}</p>
                  <div className="flex gap-3">
                      <button 
                        onClick={() => setConfirmAction(null)}
                        className="flex-1 py-2 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200"
                      >
                          Cancelar
                      </button>
                      <button 
                        onClick={() => {
                            if (confirmAction.type === 'delete_user') executeDeleteUser();
                            if (confirmAction.type === 'delete_company') executeDeleteCompany();
                            if (confirmAction.type === 'approve_withdrawal') executeApproveWithdrawal();
                        }}
                        className={`flex-1 py-2 rounded-xl font-bold text-white transition-colors
                            ${confirmAction.type === 'approve_withdrawal' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        `}
                      >
                          Confirmar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in-up">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100">
                      <h3 className="text-xl font-bold flex items-center gap-2">
                          <Settings className="w-5 h-5 text-gray-900" /> Configurações Globais
                      </h3>
                      <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-sm font-bold text-gray-700">Taxa Padrão da Plataforma (%)</label>
                          <input 
                            type="number" 
                            value={localSettingsForm.platformFee}
                            onChange={(e) => setLocalSettingsForm({...localSettingsForm, platformFee: Number(e.target.value)})}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2"
                          />
                          <p className="text-xs text-red-500 mt-1">Atenção: Ao salvar, esta taxa será aplicada a TODAS as empresas.</p>
                      </div>
                      <div>
                          <label className="text-sm font-bold text-gray-700">Saque Mínimo (R$)</label>
                          <input 
                            type="number" 
                            value={localSettingsForm.minWithdrawal}
                            onChange={(e) => setLocalSettingsForm({...localSettingsForm, minWithdrawal: Number(e.target.value)})}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2"
                          />
                      </div>
                      <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-xl border border-yellow-100">
                           <input 
                                type="checkbox" 
                                checked={localSettingsForm.maintenanceMode}
                                onChange={(e) => setLocalSettingsForm({...localSettingsForm, maintenanceMode: e.target.checked})}
                                className="w-5 h-5 text-red-600"
                           />
                           <div>
                               <p className="font-bold text-yellow-800">Modo Manutenção</p>
                               <p className="text-xs text-yellow-700">Bloqueia acesso de clientes e parceiros.</p>
                           </div>
                      </div>
                  </div>
                  <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
                      <button onClick={saveGlobalSettings} className="bg-gray-900 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-black transition-colors">Salvar Configurações</button>
                  </div>
              </div>
          </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl my-8 relative flex flex-col max-h-[90vh]">
                  {/* ... (Existing User Edit Modal Code) ... */}
                  {/* ... Reusing previous implementation for brevity ... */}
                  <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-white z-10 rounded-t-2xl">
                      <h3 className="text-lg font-bold">Editar Usuário</h3>
                      <button onClick={() => setEditingUser(null)}><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 space-y-4 overflow-y-auto flex-1">
                      {/* Basic Info */}
                      <div className="space-y-4">
                        <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide border-b pb-2">Dados Pessoais</h4>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Nome</label>
                            <input 
                                value={editingUser.name} 
                                onChange={e => setEditingUser({...editingUser, name: e.target.value})}
                                className="w-full border rounded-lg px-3 py-2 mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                            <input 
                                value={editingUser.email} 
                                onChange={e => setEditingUser({...editingUser, email: e.target.value})}
                                className="w-full border rounded-lg px-3 py-2 mt-1"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Função (Role)</label>
                            <select 
                                value={editingUser.role}
                                onChange={e => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                                className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
                            >
                                <option value="client">Cliente</option>
                                <option value="partner">Parceiro (Cria Empresa)</option>
                                <option value="courier">Entregador</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                      </div>

                      {/* Address Info */}
                      <div className="space-y-4 pt-2">
                        <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide border-b pb-2 flex items-center gap-2">
                            <MapPin className="w-4 h-4"/> Endereço Completo
                        </h4>
                        
                        {/* CEP & GPS */}
                        <div className="flex gap-2 mb-2">
                            <div className="relative w-1/3">
                                <input 
                                    placeholder="CEP" 
                                    className="w-full border rounded-lg px-3 py-2"
                                    value={editingUser.address?.zipCode || ''}
                                    onChange={handleCepChange}
                                    maxLength={8}
                                />
                                {loadingCep && <Loader2 className="absolute right-2 top-2.5 w-4 h-4 animate-spin text-red-500"/>}
                            </div>
                            <button 
                                onClick={() => setShowMapModal(true)}
                                className="flex-1 bg-red-50 text-red-600 border border-red-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-100"
                            >
                                <MapPin className="w-3 h-3"/> Abrir Mapa
                            </button>
                            <button 
                                onClick={handleGetCurrentLocation}
                                className="px-3 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200"
                                title="Usar GPS"
                            >
                                {loadingLocation ? <Loader2 className="w-4 h-4 animate-spin"/> : <Crosshair className="w-4 h-4"/>}
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                                <input 
                                    value={editingUser.address?.street || ''}
                                    onChange={e => setEditingUser(prev => prev ? ({...prev, address: {...prev.address!, street: e.target.value}}) : null)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="Rua..."
                                />
                            </div>
                            <div>
                                <input 
                                    value={editingUser.address?.number || ''}
                                    onChange={e => setEditingUser(prev => prev ? ({...prev, address: {...prev.address!, number: e.target.value}}) : null)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="Nº"
                                />
                            </div>
                            <div>
                                <input 
                                    value={editingUser.address?.neighborhood || ''}
                                    onChange={e => setEditingUser(prev => prev ? ({...prev, address: {...prev.address!, neighborhood: e.target.value}}) : null)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="Bairro"
                                />
                            </div>
                            <div>
                                <input 
                                    value={editingUser.address?.city || ''}
                                    onChange={e => setEditingUser(prev => prev ? ({...prev, address: {...prev.address!, city: e.target.value}}) : null)}
                                    className="w-full border rounded-lg px-3 py-2"
                                    placeholder="Cidade"
                                />
                            </div>
                        </div>
                      </div>

                      {/* Partner Specifics */}
                      {editingUser.role === 'partner' && (
                          <div className="space-y-4 pt-2 bg-blue-50 p-4 rounded-xl border border-blue-100">
                             <h4 className="font-bold text-blue-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                <Truck className="w-4 h-4"/> Configuração Logística (Parceiro)
                             </h4>
                             <div className="grid grid-cols-2 gap-3">
                                 <div className="col-span-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Entrega</label>
                                    <div className="flex gap-2 mt-1">
                                        <button 
                                            onClick={() => setEditingUserCompany(prev => ({...(prev || {} as Company), deliveryType: 'chegoou'}))}
                                            className={`flex-1 py-2 text-xs font-bold rounded border ${editingUserCompany?.deliveryType === 'chegoou' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                        >
                                            Chegoou
                                        </button>
                                        <button 
                                            onClick={() => setEditingUserCompany(prev => ({...(prev || {} as Company), deliveryType: 'own'}))}
                                            className={`flex-1 py-2 text-xs font-bold rounded border ${editingUserCompany?.deliveryType === 'own' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'}`}
                                        >
                                            Própria
                                        </button>
                                    </div>
                                 </div>
                                 <div>
                                     <label className="text-xs font-bold text-gray-500 uppercase">Raio (Km)</label>
                                     <input 
                                        type="number"
                                        value={editingUserCompany?.deliveryRadiusKm || 5}
                                        onChange={e => setEditingUserCompany(prev => ({...(prev || {} as Company), deliveryRadiusKm: parseFloat(e.target.value)}))}
                                        className="w-full border rounded-lg px-3 py-2 mt-1"
                                     />
                                 </div>
                                 {editingUserCompany?.deliveryType === 'own' && (
                                     <div>
                                         <label className="text-xs font-bold text-gray-500 uppercase">Taxa Fixa (R$)</label>
                                         <input 
                                            type="number"
                                            value={editingUserCompany?.ownDeliveryFee || 0}
                                            onChange={e => setEditingUserCompany(prev => ({...(prev || {} as Company), ownDeliveryFee: parseFloat(e.target.value)}))}
                                            className="w-full border rounded-lg px-3 py-2 mt-1"
                                         />
                                     </div>
                                 )}
                             </div>
                          </div>
                      )}

                  </div>
                  <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-2xl sticky bottom-0">
                       <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 font-medium">Cancelar</button>
                       <button onClick={handleSaveUser} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Salvar Alterações</button>
                  </div>
              </div>
          </div>
      )}

      {/* MAP MODAL (For User Address Editing) */}
      {showMapModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in h-full">
            <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90%] relative">
                <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-start pointer-events-none">
                    <div className="bg-white/95 backdrop-blur px-4 py-2 rounded-xl shadow-md border border-gray-100 pointer-events-auto">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Navigation className="w-4 h-4 text-red-600" /> Definir Localização
                        </h3>
                        <p className="text-xs text-gray-500">Mova o pin para o endereço correto.</p>
                    </div>
                    <button onClick={() => setShowMapModal(false)} className="bg-white p-2 rounded-full shadow-md hover:bg-gray-100 pointer-events-auto"><X className="w-6 h-6 text-gray-500" /></button>
                </div>
                <div className="flex-1 bg-gray-100 relative group overflow-hidden">
                    {mapError ? (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center p-8"><MapIcon className="w-16 h-16 text-gray-300"/><p>Erro no Mapa</p></div>
                    ) : (
                        <>
                        <div ref={mapContainerRef} className="w-full h-full" />
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 pointer-events-none transition-all duration-300 ease-out ${isMapDragging ? '-mt-16 scale-110' : '-mt-8'}`}>
                            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-2xl border-[3px] border-white"><MapPin className="w-6 h-6 text-white fill-current" /></div>
                            <div className={`w-2 h-8 bg-black/80 rounded-full -mt-2 blur-[1px] transition-opacity duration-300 ${isMapDragging ? 'opacity-0' : 'opacity-20'}`}></div>
                        </div>
                        {!isMapDragging && <div className="absolute bottom-32 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none flex items-center gap-2 animate-pulse"><MousePointer2 className="w-3 h-3" /> Arraste o mapa</div>}
                        </>
                    )}
                </div>
                <div className="p-6 bg-white border-t border-gray-100 rounded-t-3xl -mt-6 relative z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                    <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
                    <div className="flex items-start gap-3 mb-6">
                        <div className="p-2 bg-red-50 rounded-lg shrink-0"><MapPin className="w-6 h-6 text-red-600" /></div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Endereço Selecionado</p>
                            <h4 className="font-bold text-gray-900 text-lg leading-tight line-clamp-2">{mapAddress || 'Carregando endereço...'}</h4>
                        </div>
                    </div>
                    <button onClick={() => setShowMapModal(false)} className="w-full bg-red-600 text-white font-bold py-3.5 rounded-xl hover:bg-red-700 shadow-lg flex items-center justify-center gap-2"><CheckCircle className="w-5 h-5" /> Confirmar</button>
                </div>
            </div>
        </div>
      )}

      {/* EDIT COMPANY MODAL */}
      {editingCompany && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                  <div className="flex justify-between items-center p-6 border-b border-gray-100">
                      <h3 className="text-lg font-bold">Editar Empresa</h3>
                      <button onClick={() => setEditingCompany(null)}><X className="w-5 h-5"/></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Nome Fantasia</label>
                          <input 
                            value={editingCompany.name} 
                            onChange={e => setEditingCompany({...editingCompany, name: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2 mt-1"
                          />
                      </div>
                      
                      {/* UPDATED CATEGORY SELECT */}
                      <div>
                          <label className="text-xs font-bold text-gray-500 uppercase">Categoria</label>
                          <select 
                            value={editingCompany.category} 
                            onChange={e => setEditingCompany({...editingCompany, category: e.target.value})}
                            className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
                          >
                              {COMPANY_CATEGORIES.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                              ))}
                          </select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Taxa (%)</label>
                            <input 
                                type="number"
                                value={editingCompany.serviceFeePercentage} 
                                onChange={e => setEditingCompany({...editingCompany, serviceFeePercentage: Number(e.target.value)})}
                                className="w-full border rounded-lg px-3 py-2 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Status</label>
                            <select 
                                value={editingCompany.status}
                                onChange={e => setEditingCompany({...editingCompany, status: e.target.value as any})}
                                className="w-full border rounded-lg px-3 py-2 mt-1 bg-white"
                            >
                                <option value="open">Aberto</option>
                                <option value="closed">Fechado</option>
                            </select>
                          </div>
                      </div>

                      {/* DELIVERY CONFIG IN COMPANY MODAL */}
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                          <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Tipo de Entrega</label>
                          <select 
                            value={editingCompany.deliveryType} 
                            onChange={e => setEditingCompany({...editingCompany, deliveryType: e.target.value as any})}
                            className="w-full border rounded-lg px-3 py-2 mb-2 bg-white"
                          >
                              <option value="chegoou">Entrega Chegoou (Plataforma)</option>
                              <option value="own">Entrega Própria (Restaurante)</option>
                          </select>

                          {editingCompany.deliveryType === 'chegoou' && (
                              <div>
                                  <label className="text-xs font-bold text-blue-600 uppercase">Valor da Entrega (Definido pelo Admin)</label>
                                  <input 
                                    type="number"
                                    placeholder="Deixe 0 para cálculo automático por km"
                                    value={editingCompany.customPlatformFee || ''}
                                    onChange={e => setEditingCompany({...editingCompany, customPlatformFee: parseFloat(e.target.value)})}
                                    className="w-full border border-blue-200 rounded-lg px-3 py-2 mt-1 focus:ring-blue-500"
                                  />
                                  <p className="text-[10px] text-gray-400 mt-1">Se preenchido, este valor fixo substitui o cálculo por distância.</p>
                              </div>
                          )}

                          {editingCompany.deliveryType === 'own' && (
                              <div>
                                  <label className="text-xs font-bold text-gray-500 uppercase">Taxa Fixa (Restaurante)</label>
                                  <input 
                                    type="number"
                                    value={editingCompany.ownDeliveryFee || 0}
                                    onChange={e => setEditingCompany({...editingCompany, ownDeliveryFee: parseFloat(e.target.value)})}
                                    className="w-full border rounded-lg px-3 py-2 mt-1"
                                  />
                              </div>
                          )}
                      </div>

                      <div>
                          <label className="flex items-center gap-2 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={editingCompany.isSuspended}
                                onChange={e => setEditingCompany({...editingCompany, isSuspended: e.target.checked})}
                              />
                              <span className="text-sm font-medium text-red-600">Suspender Empresa (Bloquear Acesso)</span>
                          </label>
                      </div>
                  </div>
                  <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
                       <button onClick={() => setEditingCompany(null)} className="px-4 py-2 text-gray-600 font-medium">Cancelar</button>
                       <button onClick={() => handleSaveCompany(editingCompany)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Salvar</button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};

export default AdminView;