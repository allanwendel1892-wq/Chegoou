import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, Package, X, Save, Printer } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// ============================================================================
// MOTOR AUTÔNOMO DE BAIXA DE ESTOQUE (BACKGROUND SERVICE)
// Fica fora do componente React para não "morrer" quando você troca de aba
// ============================================================================

let isListenerActive = false;

const processOrderDeduction = async (orderItems: any[]) => {
    try {
        // 1. Busca todas as receitas ativas de uma vez
        const { data: compositions } = await supabase.from('compositions').select('*');
        if (!compositions || compositions.length === 0) return;

        // 2. Carrinho de deduções (soma tudo antes de abater para evitar múltiplas idas ao banco)
        const deductions: Record<string, number> = {};

        const addDeduction = (invId: string, amount: number) => {
            if (!deductions[invId]) deductions[invId] = 0;
            deductions[invId] += amount;
        };

        // 3. Lê o JSON do pedido
        for (const item of orderItems) {
            
            // A. Abate Produto Inteiro (Ex: Guaraná, Caixa de Pizza)
            const mainComps = compositions.filter(c => c.reference_id === item.productName);
            for (const comp of mainComps) {
                addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity);
            }

            // B. Abate Sabores e Adicionais (Baseado no seu JSON)
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                for (const opt of item.selectedOptions) {
                    // Pega o nome exato (Ex: "Calabresa") e ignora o "1/2" do nome de exibição
                    const optName = opt.optionName || opt.name;
                    const groupName = opt.groupName;

                    let fraction = 1;

                    // Se a opção tiver dividePrice = true (como no seu JSON)
                    if (opt.dividePrice === true) {
                        // Quantos sabores daquele mesmo grupo dividem o preço?
                        const countInGroup = item.selectedOptions.filter((o: any) => 
                            o.groupName === groupName && o.dividePrice === true
                        ).length;
                        
                        if (countInGroup > 0) {
                            fraction = 1 / countInGroup; // Ex: 2 sabores = 0.5 de dedução
                        }
                    }

                    // Busca a receita pelo nome exato ("Calabresa", "Portuguesa", "Sem Borda")
                    const optComps = compositions.filter(c => c.reference_id === optName);
                    for (const comp of optComps) {
                        addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity * fraction);
                    }
                }
            }
        }

        // 4. Executa a baixa no banco de dados
        for (const [invId, amountToDeduct] of Object.entries(deductions)) {
            if (amountToDeduct > 0) {
                const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', invId).single();
                if (inv) {
                    await supabase.from('inventory_items').update({ 
                        current_stock: Number(inv.current_stock) - amountToDeduct 
                    }).eq('id', invId);
                }
            }
        }
    } catch (error) {
        console.error("Erro no motor de baixa de estoque:", error);
    }
};

// Inicia a escuta global
if (!isListenerActive) {
    isListenerActive = true;
    supabase.channel('global_inventory_deduction')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders' },
            (payload) => {
                const newOrder = payload.new;
                const oldOrder = payload.old;

                // GATILHO: Somente quando mudar para 'delivered'
                if (newOrder.status === 'delivered' && oldOrder.status !== 'delivered') {
                    // Previne erro de parse se o JSON vier como string
                    const orderItems = typeof newOrder.items === 'string' ? JSON.parse(newOrder.items) : newOrder.items;
                    processOrderDeduction(orderItems);
                }
            }
        )
        .subscribe();
}

// ============================================================================
// COMPONENTE VISUAL REACT
// ============================================================================

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
    reference_id: string;
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
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [itemFormData, setItemFormData] = useState<Partial<InventoryItem>>({
        name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0
    });
    
    const [stockEntry, setStockEntry] = useState<string>('');

    // Busca os dados atualizados sempre que a tela for aberta,
    // garantindo que as baixas do background apareçam na tela.
    useEffect(() => {
        const fetchCurrentInventory = async () => {
            const { data } = await supabase.from('inventory_items').select('*').order('name');
            if (data) {
                const mappedData = data.map((item: any) => ({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    currentStock: Number(item.current_stock) || 0,
                    minStock: Number(item.min_stock) || 0,
                    costPrice: Number(item.cost_price) || 0
                }));
                setItems(mappedData);
            }
        };
        fetchCurrentInventory();
    }, []);

    const shoppingList = useMemo(() => {
        return items.filter(item => Number(item.currentStock) <= Number(item.minStock));
    }, [items]);

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handlePrintList = () => {
        const printWindow = window.open('', '', 'width=800,height=600');
        if (!printWindow) return;

        const htmlContent = `
            <html>
                <head>
                    <title>Lista de Compras</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                        h1 { color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                        th { background-color: #f8f9fa; font-weight: bold; }
                        .urgent { color: #dc2626; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <h1>Lista de Compras - Forneria 90</h1>
                    <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Insumo</th>
                                <th>Estoque Atual</th>
                                <th>Mínimo Exigido</th>
                                <th>Comprar Aprox.</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${shoppingList.map(item => {
                                const toBuy = Math.max(0, item.minStock - item.currentStock);
                                return `
                                    <tr>
                                        <td><strong>${item.name}</strong></td>
                                        <td>${item.currentStock} ${item.unit}</td>
                                        <td>${item.minStock} ${item.unit}</td>
                                        <td class="urgent">${toBuy} ${item.unit}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    <script>
                        window.onload = () => {
                            window.print();
                            window.close();
                        };
                    </script>
                </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    const handleSaveItem = async () => {
        if (!itemFormData.name) {
            alert('O nome do insumo é obrigatório!');
            return;
        }

        const current_stock = Number(itemFormData.currentStock) || 0;
        const entry_amount = Number(stockEntry) || 0;
        const final_stock = current_stock + entry_amount;

        const min_stock = Number(itemFormData.minStock) || 0;
        const cost_price = Number(itemFormData.costPrice) || 0;

        const dbItem = {
            id: editingItem ? editingItem.id : self.crypto.randomUUID(),
            name: itemFormData.name,
            category: itemFormData.category || 'Ingredientes',
            unit: itemFormData.unit || 'KG',
            current_stock: final_stock,
            min_stock: min_stock,
            cost_price: cost_price
        };

        try {
            const { error } = await supabase.from('inventory_items').upsert([dbItem]);

            if (error) {
                alert(`Erro no banco de dados: ${error.message}`);
                return;
            }

            const uiItem: InventoryItem = {
                id: dbItem.id,
                name: dbItem.name,
                category: dbItem.category,
                unit: dbItem.unit,
                currentStock: dbItem.current_stock,
                minStock: dbItem.min_stock,
                costPrice: dbItem.cost_price
            };

            if (editingItem) {
                setItems(prev => prev.map(i => i.id === uiItem.id ? uiItem : i));
            } else {
                setItems(prev => [...prev, uiItem]);
            }
            
            setIsItemModalOpen(false);
            setEditingItem(null);
            setItemFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0 });
            setStockEntry('');
            alert("Insumo salvo com sucesso!");

        } catch (err) {
            alert("Erro de conexão ao salvar.");
        }
    };

    const handleDeleteItem = async (id: string) => {
        if (window.confirm('Excluir este insumo permanentemente?')) {
            const { error } = await supabase.from('inventory_items').delete().eq('id', id);
            if (error) {
                alert("Erro ao excluir: " + error.message);
            } else {
                setItems(prev => prev.filter(i => i.id !== id));
            }
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header com Lista de Compras Rápida */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3">
                        <Package className="w-8 h-8 text-red-600" />
                        Controle de Estoque
                    </h1>
                    <p className="text-gray-500 font-medium">Gerencie insumos e receitas de produção</p>
                </div>
                
                <div className="flex gap-3">
                    {shoppingList.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-3 animate-pulse">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            <span className="text-amber-800 font-bold text-sm">{shoppingList.length} itens abaixo do mínimo!</span>
                        </div>
                    )}
                    <button 
                        onClick={() => { 
                            setEditingItem(null); 
                            setItemFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0 }); 
                            setStockEntry('');
                            setIsItemModalOpen(true); 
                        }}
                        className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 shadow-lg shadow-red-100 transition-all"
                    >
                        <Plus className="w-5 h-5" /> Novo Insumo
                    </button>
                </div>
            </div>

            {/* Lista de Compras Gerada */}
            {shoppingList.length > 0 && (
                <div className="mb-8 bg-white border-2 border-red-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
                        <h2 className="text-red-800 font-black flex items-center gap-2">
                            <ShoppingCart className="w-5 h-5" /> LISTA DE COMPRAS SUGERIDA
                        </h2>
                        {/* Botão de Imprimir */}
                        <button 
                            onClick={handlePrintList}
                            className="bg-white border border-red-200 text-red-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-red-100 transition-colors shadow-sm"
                        >
                            <Printer className="w-4 h-4" /> Imprimir / PDF
                        </button>
                    </div>
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {shoppingList.map(item => (
                            <div key={item.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-800">{item.name}</p>
                                    <p className="text-xs text-red-600 font-medium">Estoque: {item.currentStock} {item.unit} (Mín: {item.minStock})</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-400 uppercase font-bold">Comprar aprox.</p>
                                    <p className="font-black text-gray-900">{Math.max(0, item.minStock - item.currentStock)} {item.unit}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabela de Insumos */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-50 flex flex-col md:row justify-between gap-4">
                    <div className="relative flex-1">
                        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar insumos..." 
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-red-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-6 py-4">Insumo</th>
                                <th className="px-6 py-4">Categoria</th>
                                <th className="px-6 py-4 text-center">Estoque Atual</th>
                                <th className="px-6 py-4 text-center">Mínimo</th>
                                <th className="px-6 py-4 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredItems.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{item.name}</div>
                                        <div className="text-xs text-gray-400">R$ {item.costPrice.toFixed(2)} / {item.unit}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                                            {item.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className={`font-black ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-green-600'}`}>
                                            {item.currentStock} {item.unit}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-center font-medium text-gray-500">
                                        {item.minStock} {item.unit}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-center gap-2">
                                            <button 
                                                onClick={() => { 
                                                    setEditingItem(item); 
                                                    setItemFormData(item); 
                                                    setStockEntry(''); 
                                                    setIsItemModalOpen(true); 
                                                }} 
                                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            >
                                                <Edit className="w-5 h-5" />
                                            </button>
                                            <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de Insumo */}
            {isItemModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-black text-gray-900">{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</h2>
                            <button onClick={() => setIsItemModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X className="w-6 h-6"/></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nome do Insumo</label>
                                <input type="text" value={itemFormData.name} onChange={e => setItemFormData({...itemFormData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none" placeholder="Ex: Queijo Mussarela"/>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Unidade</label>
                                    <select value={itemFormData.unit} onChange={e => setItemFormData({...itemFormData, unit: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none">
                                        <option value="KG">Quilo (KG)</option>
                                        <option value="UN">Unidade (UN)</option>
                                        <option value="LT">Litro (LT)</option>
                                        <option value="GR">Grama (GR)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Preço de Custo</label>
                                    <input type="number" value={itemFormData.costPrice} onChange={e => setItemFormData({...itemFormData, costPrice: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none" placeholder="0.00"/>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-4 pt-2">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Estoque Atual</label>
                                    <input type="number" value={itemFormData.currentStock} onChange={e => setItemFormData({...itemFormData, currentStock: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none font-bold text-gray-600 bg-gray-50"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Mínimo</label>
                                    <input type="number" value={itemFormData.minStock} onChange={e => setItemFormData({...itemFormData, minStock: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none"/>
                                </div>
                                <div>
                                    <label className="block text-sm font-black text-green-700 mb-1">+ Nova Entrada</label>
                                    <input 
                                        type="number" 
                                        value={stockEntry} 
                                        onChange={e => setStockEntry(e.target.value)} 
                                        className="w-full px-4 py-3 rounded-xl border-2 border-green-300 bg-green-50 outline-none font-black text-green-700 placeholder-green-400 focus:ring-2 focus:ring-green-500" 
                                        placeholder="Qtd..."
                                    />
                                </div>
                            </div>
                            {Number(stockEntry) > 0 && (
                                <p className="text-xs font-bold text-green-600 text-right mt-1">
                                    O estoque final será: {(Number(itemFormData.currentStock) || 0) + Number(stockEntry)}
                                </p>
                            )}
                        </div>
                        <div className="p-6 bg-gray-50 flex gap-3">
                            <button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl transition-colors">Cancelar</button>
                            <button onClick={handleSaveItem} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 flex items-center justify-center gap-2">
                                <Save className="w-5 h-5"/> Salvar Agora
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
