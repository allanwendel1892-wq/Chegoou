import React, { useState } from 'react';
import { Coupon } from '../types';
import { Ticket, Plus, Save, X, Edit, Trash2, ToggleLeft, ToggleRight, DollarSign, Percent, CheckCircle } from 'lucide-react';

interface CouponsViewProps {
  coupons: Coupon[];
  onSave: (coupon: Coupon) => Promise<void>;
  onDelete: (couponId: string) => Promise<void>;
  companyId: string;
}

const CouponModal: React.FC<{ coupon: Partial<Coupon>, onSave: (coupon: Coupon) => void, onClose: () => void, companyId: string }> = ({ coupon, onSave, onClose, companyId }) => {
  const [formData, setFormData] = useState<Partial<Coupon>>({
      discountType: 'fixed', // FIX: Default value to prevent validation error
      ...coupon,
  });

  const handleSave = () => {
    if (!formData.code || !formData.discountType || typeof formData.discountValue !== 'number' || formData.discountValue <= 0) {
        alert("Preencha todos os campos obrigatórios com valores válidos. O valor do desconto deve ser maior que zero.");
        return;
    }
    onSave({
        id: formData.id || crypto.randomUUID(),
        companyId: companyId,
        code: formData.code.toUpperCase(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderValue: Number(formData.minOrderValue) || 0,
        isActive: formData.isActive !== undefined ? formData.isActive : true,
        createdAt: formData.createdAt || new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-fade-in-up">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800">{formData.id ? 'Editar Cupom' : 'Novo Cupom'}</h3>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 space-y-4">
                <div>
                    <label className="text-sm font-bold text-gray-700">Código</label>
                    <input 
                        type="text" 
                        value={formData.code || ''}
                        onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2 font-mono uppercase"
                        placeholder="EX: PROMO10"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-bold text-gray-700">Tipo de Desconto</label>
                        <select
                            value={formData.discountType || 'fixed'}
                            onChange={(e) => setFormData({...formData, discountType: e.target.value as any})}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2 bg-white"
                        >
                            <option value="fixed">Fixo (R$)</option>
                            <option value="percentage">Porcentagem (%)</option>
                        </select>
                    </div>
                     <div>
                        <label className="text-sm font-bold text-gray-700">Valor</label>
                        <input 
                            type="number"
                            value={formData.discountValue || ''}
                            onChange={(e) => setFormData({...formData, discountValue: Number(e.target.value)})}
                            className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2"
                            placeholder={formData.discountType === 'fixed' ? "10.00" : "15"}
                        />
                    </div>
                </div>
                 <div>
                    <label className="text-sm font-bold text-gray-700">Valor Mínimo do Pedido (Opcional)</label>
                    <input 
                        type="number"
                        value={formData.minOrderValue || ''}
                        onChange={(e) => setFormData({...formData, minOrderValue: Number(e.target.value)})}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-4 py-2"
                        placeholder="Ex: 50.00"
                    />
                </div>
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
                <button onClick={handleSave} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-colors flex items-center gap-2">
                    <Save className="w-4 h-4" /> Salvar Cupom
                </button>
            </div>
        </div>
    </div>
  );
};


const CouponsView: React.FC<CouponsViewProps> = ({ coupons, onSave, onDelete, companyId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Partial<Coupon> | null>(null);
  const [couponToDelete, setCouponToDelete] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleOpenModal = (coupon?: Coupon) => {
    setEditingCoupon(coupon || {});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingCoupon(null);
    setIsModalOpen(false);
  };

  const handleSaveAndClose = async (coupon: Coupon) => {
    await onSave(coupon);
    handleCloseModal();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };
  
  const handleToggleActive = (coupon: Coupon) => {
    onSave({ ...coupon, isActive: !coupon.isActive });
  };
  
  const handleDelete = (couponId: string) => {
    setCouponToDelete(couponId);
  };

  const handleConfirmDelete = () => {
    if (couponToDelete) {
        onDelete(couponToDelete);
        setCouponToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="fixed top-5 right-5 z-[60] bg-white border border-green-200 shadow-lg rounded-xl p-4 flex items-center gap-3 animate-fade-in">
            <div className="p-2 bg-green-100 rounded-full">
                <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
                <p className="font-bold text-gray-800">Cupom Salvo!</p>
                <p className="text-sm text-gray-500">A promoção já está disponível.</p>
            </div>
        </div>
      )}

      {isModalOpen && editingCoupon && (
          <CouponModal 
            coupon={editingCoupon} 
            onSave={handleSaveAndClose}
            onClose={handleCloseModal}
            companyId={companyId}
          />
      )}

      {couponToDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-fade-in-up">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Excluir Cupom</h3>
                <p className="text-sm text-gray-500 mt-2">
                  Tem certeza que deseja excluir este cupom? Esta ação não pode ser desfeita.
                </p>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setCouponToDelete(null)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmDelete}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 font-bold text-white hover:bg-red-700 shadow-md shadow-red-100 transition-colors"
                >
                  Sim, Excluir
                </button>
              </div>
            </div>
          </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Ticket className="w-7 h-7 text-red-600" /> Gestão de Cupons
          </h2>
          <p className="text-gray-500 mt-1">Crie e gerencie cupons de desconto para seus clientes.</p>
        </div>
        <button 
            onClick={() => handleOpenModal()}
            className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-red-200"
        >
          <Plus className="w-5 h-5" />
          Novo Cupom
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {coupons.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white rounded-2xl border border-dashed border-gray-200">
                <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="font-bold text-gray-700">Nenhum cupom criado</h3>
                <p className="text-gray-500 text-sm">Clique em "Novo Cupom" para começar a criar promoções.</p>
            </div>
        )}
        {coupons.map(coupon => (
            <div key={coupon.id} className={`bg-white rounded-2xl shadow-sm border ${coupon.isActive ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-70'} p-6 flex flex-col justify-between transition-all`}>
                <div>
                    <div className="flex justify-between items-start mb-4">
                         <div className={`p-3 rounded-xl ${coupon.discountType === 'fixed' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'}`}>
                            {coupon.discountType === 'fixed' ? <DollarSign className="w-6 h-6"/> : <Percent className="w-6 h-6"/>}
                         </div>
                         <div className="text-right">
                             <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Código</p>
                             <p className="font-mono font-bold text-2xl text-gray-800 tracking-wider">{coupon.code}</p>
                         </div>
                    </div>
                    
                    <div className="mb-4">
                        <p className="text-lg font-bold text-gray-900">
                            {coupon.discountType === 'fixed' 
                                ? `R$ ${coupon.discountValue.toFixed(2)} de desconto`
                                : `${coupon.discountValue}% de desconto`
                            }
                        </p>
                        {coupon.minOrderValue && coupon.minOrderValue > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                                Válido para pedidos acima de R$ {coupon.minOrderValue.toFixed(2)}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                    <div className="flex gap-1">
                         <button onClick={() => handleOpenModal(coupon)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="w-4 h-4"/></button>
                         <button onClick={() => handleDelete(coupon.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    <button onClick={() => handleToggleActive(coupon)} className="flex items-center gap-2 text-sm font-bold">
                        {coupon.isActive 
                            ? <><ToggleRight className="w-6 h-6 text-green-500"/> <span className="text-gray-700">Ativo</span></>
                            : <><ToggleLeft className="w-6 h-6 text-gray-400"/> <span className="text-gray-500">Inativo</span></>
                        }
                    </button>
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default CouponsView;