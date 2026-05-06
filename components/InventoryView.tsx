import React, { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, CheckCircle, Package, X } from 'lucide-react';

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minStock: number;
    costPrice: number;
}

interface InventoryViewProps {
    items: InventoryItem[];
    setItems: (items: InventoryItem[] | ((prev: InventoryItem[]) => InventoryItem[])) => void;
}

const InventoryView: React.FC<InventoryViewProps> = ({ items, setItems }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

    const [formData, setFormData] = useState<Partial<InventoryItem>>({
        name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0
    });

    const itemsToBuy = useMemo(() => items.filter(item => item.currentStock <= item.minStock), [items]);

    const handleOpenModal = (item?: InventoryItem) => {
        if (item) {
            setEditingItem(item);
            setFormData(item);
        } else {
            setEditingItem(null);
            setFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 5, costPrice: 0 });
        }
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (!formData.name) { alert('O nome do insumo é obrigatório!'); return; }

        const newItem: InventoryItem = {
            // AQUI ESTÁ A CORREÇÃO MÁGICA PARA O BANCO DE DADOS (UUID)
            id: editingItem ? editingItem.id : self.crypto.randomUUID(),
            name: formData.name!,
            category: formData.category || 'Ingredientes',
            unit: formData.unit || 'KG',
            currentStock: Number(formData.currentStock) || 0,
            minStock: Number(formData.minStock) || 0,
            costPrice: Number(formData.costPrice) || 0
        };

        if (editingItem) {
            setItems(items.map(i => i.id === newItem.id ? newItem : i));
        } else {
            setItems([...items, newItem]);
        }
        setIsModalOpen(false);
    };

    const handleDelete = (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este insumo?')) {
            setItems(items.filter(i => i.id !== id));
        }
    };

    const handleGenerateShoppingList = () => {
        if (itemsToBuy.length === 0) { alert('Estoque em dia!'); return; }
        let text = "🛒 *LISTA DE COMPRAS - REPOSIÇÃO*\n\n";
        itemsToBuy.forEach(item => {
            const amountNeeded = item.minStock - item.currentStock + 1;
            text += `• *${item.name}*: Comprar ${amountNeeded} ${item.unit} (Atual: ${item.currentStock})\n`;
        });
        navigator.clipboard.writeText(text);
        alert('Lista copiada com sucesso! Cole no WhatsApp do fornecedor.');
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-6 h-6 text-red-600" /> Controle de Insumos
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Gerencie a matéria-prima e estoque base do estabelecimento.</p>
                </div>
                
                <div className="flex gap-3">
                    <button onClick={handleGenerateShoppingList} className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors">
                        <ShoppingCart className="w-5 h-5" /> Lista de Compras
                    </button>
                    <button onClick={() => handleOpenModal()} className="bg-red-600 text-white hover:bg-red-700 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-200 transition-colors">
                        <Plus className="w-5 h-5" /> Novo Insumo
                    </button>
                </div>
            </div>

            {itemsToBuy.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
                    <div>
                        <h4 className="font-bold text-red-900">Atenção: Insumos no Estoque Mínimo</h4>
                        <p className="text-sm text-red-800 mt-1">Você tem {itemsToBuy.length} item(ns) precisando de reposição urgente.</p>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="relative w-full md:w-96">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text" placeholder="Buscar insumo..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Insumo</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Unidade</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Status</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Estoque</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredItems.map(item => {
                                const isZero = item.currentStock <= 0;
                                const isLow = item.currentStock <= item.minStock && !isZero;
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50/80 transition-colors group">
                                        <td className="p-4"><p className="font-bold text-gray-900">{item.name}</p></td>
                                        <td className="p-4 text-sm font-medium text-gray-600">{item.unit}</td>
                                        <td className="p-4 text-center">
                                            {isZero ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200">Zerado</span> : 
                                             isLow ? <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">Baixo</span> : 
                                             <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg border border-green-200">Normal</span>}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className={`font-bold text-lg ${isZero ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-gray-900'}`}>{item.currentStock}</span>
                                                <span className="text-[10px] text-gray-400 font-medium">Mín: {item.minStock}</span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => handleOpenModal(item)} className="p-2 bg-blue-50 text-blue-600 rounded-lg"><Edit className="w-4 h-4" /></button>
                                                <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-900">{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Nome do Insumo</label>
                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 outline-none" placeholder="Ex: Mussarela"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Unidade</label>
                                    <select value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 outline-none bg-white">
                                        <option value="KG">Quilo (KG)</option>
                                        <option value="UN">Unidade (UN)</option>
                                        <option value="L">Litro (L)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Custo Médio (R$)</label>
                                    <input type="number" value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value)})} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 outline-none" />
                                </div>
                            </div>
                            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 mt-2">
                                <h4 className="font-bold text-yellow-800 text-sm mb-3">Controle de Quebra</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-yellow-700 uppercase">Estoque Mínimo</label>
                                        <input type="number" value={formData.minStock} onChange={e => setFormData({...formData, minStock: parseFloat(e.target.value)})} className="w-full mt-1 border border-yellow-200 rounded-xl px-4 py-2.5 outline-none font-bold text-gray-900" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Estoque Atual</label>
                                        <input type="number" value={formData.currentStock} onChange={e => setFormData({...formData, currentStock: parseFloat(e.target.value)})} className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-gray-900" />
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                            <button onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl">Cancelar</button>
                            <button onClick={handleSave} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg">Salvar Insumo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
