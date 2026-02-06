
import React, { useState } from 'react';
import { MarketingAsset, Company } from '../types';
import { TicketPercent, Megaphone, Plus, Trash2, Edit, Check, X, ToggleLeft, ToggleRight, AlertCircle, Save, CheckCircle } from 'lucide-react';

interface MarketingViewProps {
  company: Company;
  assets: MarketingAsset[];
  onAddAsset: (asset: MarketingAsset) => void;
  onUpdateAsset: (asset: MarketingAsset) => void;
  onDeleteAsset: (id: string) => void;
}

const MarketingView: React.FC<MarketingViewProps> = ({ company, assets, onAddAsset, onUpdateAsset, onDeleteAsset }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false); 
  const [deleteId, setDeleteId] = useState<string | null>(null); // New Delete Modal State
  
  // Form State
  const [formType, setFormType] = useState<'coupon' | 'promotion'>('coupon');
  const [formData, setFormData] = useState<Partial<MarketingAsset>>({
      type: 'coupon',
      name: '',
      discountType: 'percentage',
      discountValue: 0,
      description: '',
      active: true
  });

  // --- LOGIC ---
  
  const getGeneratedPreview = (type: 'coupon' | 'promotion', data: Partial<MarketingAsset>) => {
      if (type === 'coupon') {
          if (data.discountType === 'percentage') {
              return `Esse cupom dá ao cliente um desconto de ${data.discountValue || 0}% no seu pedido.`;
          } else {
              return `Esse cupom dá ao cliente um desconto de R$ ${(data.discountValue || 0).toFixed(2)} no seu pedido.`;
          }
      } else {
          return data.description || "Descrição da promoção aqui...";
      }
  };

  const handleEdit = (asset: MarketingAsset) => {
      setFormType(asset.type);
      setFormData(asset);
      setEditingId(asset.id);
      setIsEditing(true);
  };

  const handleDeleteClick = (id: string) => {
      setDeleteId(id); // Open Modal
  };

  const confirmDelete = () => {
      if (deleteId) {
          onDeleteAsset(deleteId);
          setDeleteId(null);
      }
  };

  const handleSave = () => {
      if (formType === 'coupon' && !formData.name) { alert("Nome do cupom é obrigatório."); return; }
      if (formType === 'promotion' && !formData.description) { alert("Descrição da promoção é obrigatória."); return; }

      const assetToSave: MarketingAsset = {
          id: editingId || `mkt-${Date.now()}`,
          companyId: company.id,
          type: formType,
          name: formData.name || '',
          discountType: formData.discountType,
          discountValue: formData.discountValue,
          description: formData.description,
          active: formData.active !== undefined ? formData.active : true
      };

      if (editingId) {
          onUpdateAsset(assetToSave);
      } else {
          onAddAsset(assetToSave);
      }

      setShowSuccessModal(true);
  };

  const handleCloseSuccess = () => {
      setShowSuccessModal(false);
      handleCancel();
  };

  const handleCancel = () => {
      setIsEditing(false);
      setEditingId(null);
      setFormData({
          type: 'coupon',
          name: '',
          discountType: 'percentage',
          discountValue: 0,
          description: '',
          active: true
      });
  };

  const handleToggleActive = (asset: MarketingAsset) => {
      onUpdateAsset({ ...asset, active: !asset.active });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 relative">
        
        {/* SUCCESS CONFIRMATION MODAL */}
        {showSuccessModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 flex flex-col items-center text-center animate-scale-in relative">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 shadow-sm">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Sucesso!</h3>
                    <p className="text-gray-500 mb-6">
                        {formType === 'coupon' ? 'O cupom foi salvo e já pode ser usado em campanhas.' : 'A promoção foi salva com sucesso.'}
                    </p>
                    <button 
                        onClick={handleCloseSuccess}
                        className="w-full bg-green-600 text-white font-bold py-3 rounded-xl hover:bg-green-700 shadow-lg shadow-green-200 transition-all"
                    >
                        Concluir
                    </button>
                </div>
            </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {deleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center animate-scale-in">
                    <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600 shadow-sm">
                        <Trash2 className="w-7 h-7" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Excluir Item?</h3>
                    <p className="text-gray-500 mb-6 text-sm leading-relaxed">
                        Tem certeza que deseja remover este item? Essa ação é irreversível e o cupom parará de funcionar imediatamente.
                    </p>
                    <div className="flex gap-3 w-full">
                        <button 
                            onClick={() => setDeleteId(null)}
                            className="flex-1 bg-gray-100 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="flex-1 bg-red-600 text-white font-bold py-3 rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                        >
                            Sim, Excluir
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex justify-between items-center">
            <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <TicketPercent className="w-8 h-8 text-brand" /> Cupons e Promoções
                </h2>
                <p className="text-gray-500 mt-1">Crie ofertas para engajar seus clientes no WhatsApp.</p>
            </div>
            {!isEditing && (
                <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-brand text-white font-bold px-6 py-3 rounded-xl hover:bg-brandHover shadow-lg shadow-red-200 flex items-center gap-2 transition-all"
                >
                    <Plus className="w-5 h-5" /> Novo Item
                </button>
            )}
        </div>

        {/* FORMULÁRIO DE EDIÇÃO/CRIAÇÃO */}
        {isEditing && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden animate-fade-in-up">
                <div className="bg-gray-50 border-b border-gray-100 p-4 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 text-lg">
                        {editingId ? 'Editar Item' : 'Novo Item de Marketing'}
                    </h3>
                    <button onClick={handleCancel} className="p-2 hover:bg-gray-200 rounded-full text-gray-500">
                        <X className="w-5 h-5"/>
                    </button>
                </div>
                
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Coluna Esquerda: Inputs */}
                    <div className="space-y-5">
                        <div>
                            <label className="text-sm font-bold text-gray-600 mb-2 block uppercase">Tipo do Item</label>
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => { setFormType('coupon'); setFormData(prev => ({...prev, type: 'coupon'})); }}
                                    className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${formType === 'coupon' ? 'border-brand bg-red-50 text-brand' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <TicketPercent className="w-4 h-4" /> Cupom
                                </button>
                                <button 
                                    onClick={() => { setFormType('promotion'); setFormData(prev => ({...prev, type: 'promotion'})); }}
                                    className={`flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${formType === 'promotion' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <Megaphone className="w-4 h-4" /> Promoção
                                </button>
                            </div>
                        </div>

                        {formType === 'coupon' && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <label className="text-sm font-bold text-gray-600 mb-1 block">Nome do Cupom</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: PRIMEIRACOMPRA" 
                                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-brandLight outline-none uppercase font-mono"
                                        value={formData.name || ''}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-bold text-gray-600 mb-1 block">Tipo de Desconto</label>
                                        <select 
                                            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-brandLight outline-none"
                                            value={formData.discountType}
                                            onChange={e => setFormData({...formData, discountType: e.target.value as any})}
                                        >
                                            <option value="percentage">Percentual (%)</option>
                                            <option value="fixed">Valor Fixo (R$)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-bold text-gray-600 mb-1 block">Valor do Desconto</label>
                                        <input 
                                            type="number" 
                                            placeholder="0" 
                                            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-brandLight outline-none font-bold"
                                            value={formData.discountValue || ''}
                                            onChange={e => setFormData({...formData, discountValue: parseFloat(e.target.value)})}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {formType === 'promotion' && (
                            <div className="space-y-4 animate-fade-in">
                                <div>
                                    <label className="text-sm font-bold text-gray-600 mb-1 block">Descrição da Promoção</label>
                                    <textarea 
                                        placeholder="Ex: Compre 2 leve 3 nas pizzas grandes de Calabresa..." 
                                        className="w-full border border-gray-200 rounded-xl px-4 py-3 h-32 resize-none focus:ring-2 focus:ring-blue-100 outline-none"
                                        value={formData.description || ''}
                                        onChange={e => setFormData({...formData, description: e.target.value})}
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Este texto alimentará o contexto da IA no WhatsApp.</p>
                                </div>
                            </div>
                        )}
                        
                        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <button onClick={() => setFormData(prev => ({...prev, active: !prev.active}))}>
                                {formData.active ? <ToggleRight className="w-8 h-8 text-green-500"/> : <ToggleLeft className="w-8 h-8 text-gray-400"/>}
                            </button>
                            <span className="text-sm font-bold text-gray-700">{formData.active ? 'Ativo' : 'Inativo'}</span>
                        </div>
                    </div>

                    {/* Coluna Direita: Preview */}
                    <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 flex flex-col justify-center">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-4 text-center tracking-widest">Preview da Mensagem Automática</h4>
                        
                        <div className="bg-[#DCF8C6] p-4 rounded-xl shadow-sm border border-green-100 relative">
                            <div className="absolute -left-2 top-4 w-4 h-4 bg-[#DCF8C6] transform rotate-45 border-l border-b border-green-100"></div>
                            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                                {getGeneratedPreview(formType, formData)}
                            </p>
                            <p className="text-[10px] text-right text-green-700 mt-2 font-bold opacity-60">12:00</p>
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button 
                                onClick={handleCancel}
                                className="px-6 py-3 rounded-xl bg-white border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSave}
                                className="px-8 py-3 rounded-xl bg-brand text-white font-bold hover:bg-brandHover shadow-lg shadow-red-200 transition-colors flex items-center gap-2"
                            >
                                <Save className="w-5 h-5"/> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* LISTA DE ITENS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assets.map(asset => (
                <div key={asset.id} className={`bg-white p-6 rounded-2xl shadow-sm border relative group transition-all hover:shadow-md ${asset.active ? 'border-gray-100' : 'border-gray-200 bg-gray-50 opacity-75'}`}>
                    <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-xl ${asset.type === 'coupon' ? 'bg-red-50 text-brand' : 'bg-blue-50 text-blue-600'}`}>
                            {asset.type === 'coupon' ? <TicketPercent className="w-6 h-6"/> : <Megaphone className="w-6 h-6"/>}
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => handleToggleActive(asset)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400" title={asset.active ? "Desativar" : "Ativar"}>
                                {asset.active ? <ToggleRight className="w-5 h-5 text-green-500"/> : <ToggleLeft className="w-5 h-5"/>}
                            </button>
                            <button onClick={() => handleEdit(asset)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600">
                                <Edit className="w-4 h-4"/>
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteClick(asset.id); }} 
                                className="p-2 rounded-lg hover:bg-red-50 text-red-500"
                            >
                                <Trash2 className="w-4 h-4"/>
                            </button>
                        </div>
                    </div>

                    <h3 className="font-bold text-gray-800 text-lg mb-1">
                        {asset.type === 'coupon' ? asset.name : 'Promoção Ativa'}
                    </h3>
                    
                    <div className="text-sm text-gray-600 mb-4 h-12 overflow-hidden">
                        {asset.type === 'coupon' ? (
                            <span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold text-gray-700">
                                {asset.discountType === 'percentage' ? `${asset.discountValue}% OFF` : `R$ ${asset.discountValue?.toFixed(2)} OFF`}
                            </span>
                        ) : (
                            <p className="line-clamp-2 text-xs">{asset.description}</p>
                        )}
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-400 italic">
                            "{getGeneratedPreview(asset.type, asset)}"
                        </p>
                    </div>
                </div>
            ))}
            
            {assets.length === 0 && !isEditing && (
                <div className="col-span-full py-12 text-center text-gray-400 bg-white rounded-2xl border border-dashed border-gray-200">
                    <TicketPercent className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Nenhum cupom ou promoção cadastrado.</p>
                </div>
            )}
        </div>
    </div>
  );
};

export default MarketingView;
