import React, { useState, useMemo } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, CheckCircle, Package, X, Copy } from 'lucide-react';

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

    // Estado do formulário
    const [formData, setFormData] = useState<Partial<InventoryItem>>({
        name: '',
        category: 'Ingredientes',
        unit: 'KG',
        currentStock: 0,
        minStock: 0,
        costPrice: 0
    });

    // Inteligência de Estoque
    const itemsToBuy = useMemo(() => items.filter(item => item.currentStock <= item.minStock), [items]);

    const handleOpenModal = (item?: InventoryItem) => {
        if (item) {
            setEditingItem(item);
            setFormData(item);
        } else {
            setEditingItem(null);
            setFormData({
                name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 5, costPrice: 0
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = () => {
        if (!formData.name) {
            alert('O nome do insumo é obrigatório!');
            return;
        }

        const newItem: InventoryItem = {
            id: editingItem ? editingItem.id : Date.now().toString(),
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
        if (itemsToBuy.length === 0) {
            alert('Estoque em dia! Nenhum item atingiu o estoque mínimo.');
            return;
        }

        let text = "🛒 *LISTA DE COMPRAS - REPOSIÇÃO*\n\n";
        itemsToBuy.forEach(item => {
            const amountNeeded = item.minStock - item.currentStock + 1; // Sugere comprar para sair do mínimo
            text += `• *${item.name}*: Comprar ${amountNeeded} ${item.unit} (Atual: ${item.currentStock} | Mín: ${item.minStock})\n`;
        });

        navigator.clipboard.writeText(text);
        alert('Lista copiada com sucesso! Só colar no WhatsApp do fornecedor.');
    };

    const filteredItems = items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Cabeçalho e Ações */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Package className="w-6 h-6 text-red-600" /> Controle de Insumos
                    </h2>
                    <p className="text-gray-500 text-sm mt-1">Gerencie a matéria-prima e estoque base do estabelecimento.</p>
                </div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={handleGenerateShoppingList}
                        className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors"
                    >
                        <ShoppingCart className="w-5 h-5" />
                        Lista de Compras {itemsToBuy.length > 0 && <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded-full text-xs">{itemsToBuy.length}</span>}
                    </button>
                    <button 
                        onClick={() => handleOpenModal()}
                        className="bg-red-600 text-white hover:bg-red-700 px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-red-200 transition-colors"
                    >
                        <Plus className="w-5 h-5" /> Novo Insumo
                    </button>
                </div>
            </div>

            {/* Alerta de Estoque Baixo */}
            {itemsToBuy.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
                    <div>
                        <h4 className="font-bold text-red-900">Atenção: Insumos no Estoque Mínimo</h4>
                        <p className="text-sm text-red-800 mt-1">
                            Você tem {itemsToBuy.length} item(ns) precisando de reposição urgente. Clique no botão de "Lista de Compras" para enviar ao fornecedor.
                        </p>
                    </div>
                </div>
            )}

            {/* Barra de Busca e Tabela */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="relative w-full md:w-96">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                        <input 
                            type="text"
                            placeholder="Buscar insumo (ex: Farinha, Tomate...)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none transition-shadow"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Insumo</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Unidade</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Custo Médio</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Status</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Estoque Atual</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-gray-400">
                                        Nenhum insumo encontrado. Comece adicionando um novo!
                                    </td>
                                </tr>
                            ) : (
                                filteredItems.map(item => {
                                    const isZero = item.currentStock <= 0;
                                    const isLow = item.currentStock <= item.minStock && !isZero;
                                    
                                    return (
                                        <tr key={item.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="p-4">
                                                <p className="font-bold text-gray-900">{item.name}</p>
                                                <p className="text-xs text-gray-500">{item.category}</p>
                                            </td>
                                            <td className="p-4 text-sm font-medium text-gray-600">{item.unit}</td>
                                            <td className="p-4 text-sm font-medium text-gray-600">R$ {item.costPrice.toFixed(2)}</td>
                                            <td className="p-4 text-center">
                                                {isZero ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg border border-red-200">
                                                        <AlertTriangle className="w-3 h-3"/> Zerado
                                                    </span>
                                                ) : isLow ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg border border-yellow-200">
                                                        <AlertTriangle className="w-3 h-3"/> Baixo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg border border-green-200">
                                                        <CheckCircle className="w-3 h-3"/> Normal
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex flex-col items-end">
                                                    <span className={`font-bold text-lg ${isZero ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-gray-900'}`}>
                                                        {item.currentStock}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-medium">Mín: {item.minStock}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleOpenModal(item)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">
                                                        <Edit className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(item.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Criação / Edição */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl animate-scale-in overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold text-gray-900">
                                {editingItem ? 'Editar Insumo' : 'Novo Insumo'}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Nome do Insumo</label>
                                <input 
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-red-500 outline-none"
                                    placeholder="Ex: Mussarela Ralada"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Unidade de Medida</label>
                                    <select 
                                        value={formData.unit}
                                        onChange={e => setFormData({...formData, unit: e.target.value})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-red-500 outline-none bg-white"
                                    >
                                        <option value="KG">Quilo (KG)</option>
                                        <option value="UN">Unidade (UN)</option>
                                        <option value="L">Litro (L)</option>
                                        <option value="G">Grama (g)</option>
                                        <option value="CX">Caixa (CX)</option>
                                        <option value="PCT">Pacote (PCT)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Custo Médio (R$)</label>
                                    <input 
                                        type="number"
                                        value={formData.costPrice}
                                        onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value)})}
                                        className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-red-500 outline-none"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 mt-2">
                                <h4 className="font-bold text-yellow-800 text-sm mb-3 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" /> Controle de Quebra
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-yellow-700 uppercase">Estoque Mínimo</label>
                                        <input 
                                            type="number"
                                            value={formData.minStock}
                                            onChange={e => setFormData({...formData, minStock: parseFloat(e.target.value)})}
                                            className="w-full mt-1 border border-yellow-200 rounded-xl px-4 py-2.5 outline-none bg-white font-bold text-gray-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase">Estoque Atual</label>
                                        <input 
                                            type="number"
                                            value={formData.currentStock}
                                            onChange={e => setFormData({...formData, currentStock: parseFloat(e.target.value)})}
                                            className="w-full mt-1 border border-gray-200 rounded-xl px-4 py-2.5 outline-none font-bold text-gray-900"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-yellow-700 mt-2">Se o estoque atual cair abaixo do mínimo, o sistema gerará um alerta de reposição.</p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex gap-3">
                            <button 
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1 py-3 bg-white border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleSave}
                                className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-200 transition-colors"
                            >
                                Salvar Insumo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
