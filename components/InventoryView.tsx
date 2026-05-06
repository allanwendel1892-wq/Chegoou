import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, CheckCircle, Package, X, BookOpen, ChevronRight, Save } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

export interface InventoryItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    currentStock: number;
    minStock: number;
    costPrice: number;
}

export interface Composition {
    id: string;
    reference_id: string; // Nome exato no cardápio (Ex: "Calabresa" ou "Guaraná 1L")
    inventory_item_id: string;
    amount_needed: number;
}

interface InventoryViewProps {
    items: InventoryItem[];
    setItems: (items: InventoryItem[] | ((prev: InventoryItem[]) => InventoryItem[])) => void;
}

const InventoryView: React.FC<InventoryViewProps> = ({ items, setItems }) => {
    const [activeTab, setActiveTab] = useState<'insumos' | 'receitas'>('insumos');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estados de Insumos
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [itemFormData, setItemFormData] = useState<Partial<InventoryItem>>({
        name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0
    });

    // Estados de Receitas
    const [compositions, setCompositions] = useState<Composition[]>([]);
    const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
    const [recipeReferenceName, setRecipeReferenceName] = useState('');
    const [recipeIngredients, setRecipeIngredients] = useState<{ invId: string, amount: number }[]>([]);

    const itemsToBuy = useMemo(() => items.filter(item => item.currentStock <= item.minStock), [items]);

    // Buscar as composições ao abrir
    useEffect(() => {
        const fetchCompositions = async () => {
            const { data } = await supabase.from('compositions').select('*');
            if (data) setCompositions(data);
        };
        fetchCompositions();
    }, []);

    // ----------------------------------------------------
    // FUNÇÕES DE INSUMOS (ESTOQUE BRUTO)
    // ----------------------------------------------------
    const handleOpenItemModal = (item?: InventoryItem) => {
        if (item) {
            setEditingItem(item);
            setItemFormData(item);
        } else {
            setEditingItem(null);
            setItemFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 5, costPrice: 0 });
        }
        setIsItemModalOpen(true);
    };

    const handleSaveItem = () => {
        if (!itemFormData.name) { alert('Nome obrigatório!'); return; }
        const newItem: InventoryItem = {
            id: editingItem ? editingItem.id : self.crypto.randomUUID(),
            name: itemFormData.name!,
            category: itemFormData.category || 'Ingredientes',
            unit: itemFormData.unit || 'KG',
            currentStock: Number(itemFormData.currentStock) || 0,
            minStock: Number(itemFormData.minStock) || 0,
            costPrice: Number(itemFormData.costPrice) || 0
        };
        if (editingItem) setItems(items.map(i => i.id === newItem.id ? newItem : i));
        else setItems([...items, newItem]);
        setIsItemModalOpen(false);
    };

    const handleDeleteItem = (id: string) => {
        if (window.confirm('Excluir este insumo? (Pode quebrar receitas atreladas a ele)')) {
            setItems(items.filter(i => i.id !== id));
        }
    };

    // ----------------------------------------------------
    // FUNÇÕES DE RECEITAS (FICHAS TÉCNICAS)
    // ----------------------------------------------------
    const groupedRecipes = useMemo(() => {
        const groups: Record<string, Composition[]> = {};
        compositions.forEach(c => {
            if (!groups[c.reference_id]) groups[c.reference_id] = [];
            groups[c.reference_id].push(c);
        });
        return groups;
    }, [compositions]);

    const handleOpenRecipeModal = (refId?: string) => {
        if (refId && groupedRecipes[refId]) {
            setRecipeReferenceName(refId);
            setRecipeIngredients(groupedRecipes[refId].map(c => ({ invId: c.inventory_item_id, amount: c.amount_needed })));
        } else {
            setRecipeReferenceName('');
            setRecipeIngredients([{ invId: '', amount: 0 }]);
        }
        setIsRecipeModalOpen(true);
    };

    const handleSaveRecipe = async () => {
        if (!recipeReferenceName.trim()) { alert('Digite o nome do produto/sabor do cardápio!'); return; }
        const validIngredients = recipeIngredients.filter(i => i.invId && i.amount > 0);
        if (validIngredients.length === 0) { alert('Adicione pelo menos um insumo válido!'); return; }

        const referenceId = recipeReferenceName.trim();

        // Remove receitas antigas para este nome
        await supabase.from('compositions').delete().eq('reference_id', referenceId);

        // Insere as novas
        const newComps = validIngredients.map(ing => ({
            id: self.crypto.randomUUID(),
            reference_id: referenceId,
            inventory_item_id: ing.invId,
            amount_needed: ing.amount
        }));

        const { error } = await supabase.from('compositions').insert(newComps);
        if (error) {
            alert('Erro ao salvar receita: ' + error.message);
        } else {
            // Atualiza tela localmente
            setCompositions(prev => [...prev.filter(c => c.reference_id !== referenceId), ...newComps]);
            setIsRecipeModalOpen(false);
            alert('Ficha Técnica salva com sucesso!');
        }
    };

    const handleDeleteRecipe = async (refId: string) => {
        if (window.confirm(`Apagar a receita de "${refId}"?`)) {
            await supabase.from('compositions').delete().eq('reference_id', refId);
            setCompositions(prev => prev.filter(c => c.reference_id !== refId));
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header e Tabs */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <Package className="w-6 h-6 text-red-600" /> Almoxarifado
                        </h2>
                        <p className="text-gray-500 text-sm mt-1">Gerencie estoques brutas e receitas dos produtos.</p>
                    </div>
                    {itemsToBuy.length > 0 && activeTab === 'insumos' && (
                        <button onClick={() => alert("Copie a lista!")} className="bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2 rounded-lg font-bold flex items-center gap-2">
                            <ShoppingCart className="w-4 h-4" /> Comprar ({itemsToBuy.length})
                        </button>
                    )}
                </div>

                <div className="flex gap-2 border-b border-gray-100">
                    <button 
                        onClick={() => setActiveTab('insumos')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'insumos' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        📦 Estoque Bruto
                    </button>
                    <button 
                        onClick={() => setActiveTab('receitas')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'receitas' ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                    >
                        📋 Fichas Técnicas (Receitas)
                    </button>
                </div>
            </div>

            {/* ABA: INSUMOS */}
            {activeTab === 'insumos' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center gap-4">
                        <div className="relative w-full md:w-96">
                            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                            <input 
                                type="text" placeholder="Buscar insumo..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg outline-none"
                            />
                        </div>
                        <button onClick={() => handleOpenItemModal()} className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shrink-0">
                            <Plus className="w-4 h-4" /> Novo Insumo
                        </button>
                    </div>
                    
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase">Insumo</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Status</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-right">Estoque</th>
                                <th className="p-4 text-xs font-bold text-gray-500 uppercase text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {items.filter(i => i.name.toLowerCase().includes(searchTerm.toLowerCase())).map(item => {
                                const isZero = item.currentStock <= 0;
                                const isLow = item.currentStock <= item.minStock && !isZero;
                                return (
                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors group">
                                        <td className="p-4"><p className="font-bold text-gray-900">{item.name}</p><span className="text-xs text-gray-400">{item.unit}</span></td>
                                        <td className="p-4 text-center">
                                            {isZero ? <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg">Zerado</span> : 
                                             isLow ? <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-lg">Baixo</span> : 
                                             <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-lg">Normal</span>}
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`font-bold text-lg ${isZero ? 'text-red-600' : isLow ? 'text-yellow-600' : 'text-gray-900'}`}>{item.currentStock}</span>
                                            <span className="block text-[10px] text-gray-400 font-medium">Mín: {item.minStock}</span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button onClick={() => handleOpenItemModal(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ABA: RECEITAS */}
            {activeTab === 'receitas' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center gap-4">
                        <div className="text-sm text-gray-600">
                            Crie receitas para produtos inteiros (Ex: <strong>Guaraná 1L</strong>) ou sabores (Ex: <strong>Calabresa</strong>).
                        </div>
                        <button onClick={() => handleOpenRecipeModal()} className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 shrink-0">
                            <BookOpen className="w-4 h-4" /> Nova Receita
                        </button>
                    </div>

                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(groupedRecipes).length === 0 && (
                            <div className="col-span-full p-8 text-center text-gray-400">Nenhuma receita cadastrada ainda.</div>
                        )}
                        {Object.entries(groupedRecipes).map(([refId, comps]) => (
                            <div key={refId} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-col justify-between">
                                <div>
                                    <h4 className="font-bold text-gray-900 flex justify-between items-center mb-3">
                                        {refId}
                                        <span className="flex gap-1">
                                            <button onClick={() => handleOpenRecipeModal(refId)} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded"><Edit className="w-4 h-4"/></button>
                                            <button onClick={() => handleDeleteRecipe(refId)} className="text-red-600 hover:bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4"/></button>
                                        </span>
                                    </h4>
                                    <ul className="space-y-1">
                                        {comps.map(c => {
                                            const item = items.find(i => i.id === c.inventory_item_id);
                                            return (
                                                <li key={c.id} className="text-xs text-gray-600 flex justify-between border-b border-dashed border-gray-200 pb-1">
                                                    <span>{item?.name || 'Insumo Apagado'}</span>
                                                    <span className="font-bold">{c.amount_needed} {item?.unit}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL: NOVO INSUMO */}
            {isItemModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold">{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</h3>
                            <button onClick={() => setIsItemModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div><label className="text-xs font-bold text-gray-500 uppercase">Nome do Insumo</label><input type="text" value={itemFormData.name} onChange={e => setItemFormData({...itemFormData, name: e.target.value})} className="w-full mt-1 border rounded-lg px-4 py-2" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Unidade</label><select value={itemFormData.unit} onChange={e => setItemFormData({...itemFormData, unit: e.target.value})} className="w-full mt-1 border rounded-lg px-4 py-2 bg-white"><option value="KG">KG</option><option value="UN">UN</option><option value="L">Litro</option></select></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Custo Médio (R$)</label><input type="number" value={itemFormData.costPrice} onChange={e => setItemFormData({...itemFormData, costPrice: parseFloat(e.target.value)})} className="w-full mt-1 border rounded-lg px-4 py-2" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Estoque Min.</label><input type="number" value={itemFormData.minStock} onChange={e => setItemFormData({...itemFormData, minStock: parseFloat(e.target.value)})} className="w-full mt-1 border rounded-lg px-4 py-2" /></div>
                                <div><label className="text-xs font-bold text-gray-500 uppercase">Estoque Atual</label><input type="number" value={itemFormData.currentStock} onChange={e => setItemFormData({...itemFormData, currentStock: parseFloat(e.target.value)})} className="w-full mt-1 border rounded-lg px-4 py-2" /></div>
                            </div>
                        </div>
                        <div className="p-4 border-t flex gap-2">
                            <button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-2 bg-gray-100 font-bold rounded-lg">Cancelar</button>
                            <button onClick={handleSaveItem} className="flex-1 py-2 bg-red-600 text-white font-bold rounded-lg">Salvar Insumo</button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: NOVA RECEITA (FICHA TÉCNICA) */}
            {isRecipeModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="text-xl font-bold flex items-center gap-2"><BookOpen className="w-5 h-5"/> {recipeReferenceName ? 'Editar Receita' : 'Montar Receita'}</h3>
                            <button onClick={() => setIsRecipeModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Referência exata no Cardápio (Gatilho)</label>
                                <input 
                                    type="text" 
                                    value={recipeReferenceName} 
                                    onChange={e => setRecipeReferenceName(e.target.value)} 
                                    placeholder="Ex: Calabresa, Guaraná 1L, Combo Casal..."
                                    className="w-full mt-1 border border-gray-300 rounded-lg px-4 py-3 font-bold text-gray-900 outline-none focus:border-red-500" 
                                />
                                <p className="text-[10px] text-gray-400 mt-1">O sistema vai procurar esse nome exato nos pedidos para abater os ingredientes abaixo.</p>
                            </div>
                            
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Insumos desta receita</label>
                                
                                {recipeIngredients.map((ing, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2 items-center">
                                        <select 
                                            value={ing.invId} 
                                            onChange={e => {
                                                const newArr = [...recipeIngredients];
                                                newArr[idx].invId = e.target.value;
                                                setRecipeIngredients(newArr);
                                            }}
                                            className="flex-1 border rounded-lg px-2 py-2 text-sm bg-white"
                                        >
                                            <option value="">Selecione o insumo...</option>
                                            {items.map(item => (
                                                <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                                            ))}
                                        </select>
                                        <input 
                                            type="number" step="0.01" placeholder="Qtd"
                                            value={ing.amount || ''}
                                            onChange={e => {
                                                const newArr = [...recipeIngredients];
                                                newArr[idx].amount = parseFloat(e.target.value);
                                                setRecipeIngredients(newArr);
                                            }}
                                            className="w-20 border rounded-lg px-2 py-2 text-sm"
                                        />
                                        <button onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))} className="text-red-500 hover:bg-red-50 p-2 rounded">
                                            <Trash2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                ))}

                                <button onClick={() => setRecipeIngredients([...recipeIngredients, { invId: '', amount: 0 }])} className="text-sm font-bold text-blue-600 mt-2 hover:underline">
                                    + Adicionar Insumo
                                </button>
                            </div>
                        </div>
                        <div className="p-4 border-t flex gap-2">
                            <button onClick={() => setIsRecipeModalOpen(false)} className="flex-1 py-3 bg-gray-100 font-bold rounded-lg hover:bg-gray-200">Cancelar</button>
                            <button onClick={handleSaveRecipe} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 shadow-lg"><Save className="w-5 h-5"/> Salvar Receita</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
