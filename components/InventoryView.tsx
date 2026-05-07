import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, Package, X, Save, Printer, BookOpen } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

// ============================================================================
// MOTOR AUTÓNOMO DE BAIXA DE STOCK (PLANO B: RADAR / POLLING COM ESCUDO)
// Resolve o problema de bloqueio de WebSocket do Easypanel e evita duplicações
// ============================================================================

let isPollingActive = false;
let isFirstRadarScan = true; // ESCUDO ATIVADO: Protege contra varreduras do histórico

const processOrderDeduction = async (orderItems: any[]) => {
    console.log("🔥 [STOCK] A iniciar processo de baixa. Itens recebidos:", orderItems);
    try {
        const { data: compositions, error: compError } = await supabase.from('compositions').select('*');
        
        if (compError || !compositions || compositions.length === 0) return;

        const deductions: Record<string, number> = {};

        const addDeduction = (invId: string, amount: number) => {
            if (!deductions[invId]) deductions[invId] = 0;
            deductions[invId] += amount;
            console.log(`➕ [STOCK] A adicionar ${amount} para abater do insumo ID: ${invId}`);
        };

        for (const item of orderItems) {
            console.log(`🔎 [STOCK] A analisar item: ${item.productName}`);
            
            // Abate Produto Principal
            const mainComps = compositions.filter(c => c.reference_id === item.productName);
            for (const comp of mainComps) {
                addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity);
            }

            // Abate Sabores e Lógica de Fração
            if (item.selectedOptions && item.selectedOptions.length > 0) {
                for (const opt of item.selectedOptions) {
                    const optName = opt.optionName || opt.name;
                    const groupName = opt.groupName;
                    let fraction = 1;

                    if (opt.dividePrice === true) {
                        const countInGroup = item.selectedOptions.filter((o: any) => 
                            o.groupName === groupName && o.dividePrice === true
                        ).length;
                        if (countInGroup > 0) fraction = 1 / countInGroup;
                    }

                    const optComps = compositions.filter(c => c.reference_id === optName);
                    for (const comp of optComps) {
                        addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity * fraction);
                    }
                }
            }
        }

        for (const [invId, amountToDeduct] of Object.entries(deductions)) {
            if (amountToDeduct > 0) {
                const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', invId).single();
                if (inv) {
                    const novoEstoque = Number(inv.current_stock) - amountToDeduct;
                    await supabase.from('inventory_items').update({ current_stock: novoEstoque }).eq('id', invId);
                    console.log(`✅ [STOCK] Insumo ${invId} atualizado para ${novoEstoque}`);
                }
            }
        }
    } catch (error) {
        console.error("❌ [STOCK] Erro fatal no motor de baixa:", error);
    }
};

// O RADAR: Corre a cada 5 segundos a verificar pedidos recentes
if (!isPollingActive) {
    console.log("📡 [STOCK] A ligar o Radar blindado (Fallback para Realtime bloqueado)...");
    isPollingActive = true;

    setInterval(async () => {
        try {
            // Busca os últimos 20 pedidos entregues
            const { data: recentDeliveredOrders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'delivered')
                .limit(20);

            if (error) {
                console.error("❌ [STOCK] O Supabase recusou a busca:", error.message);
                return;
            }

            if (!recentDeliveredOrders) return;

            // Puxa da memória local quais pedidos já tiveram o stock abatido
            const processedOrdersCache = JSON.parse(localStorage.getItem('inventory_processed_orders') || '[]');

            // ==========================================
            // ESCUDO: Se for a primeira vez que roda após abrir a página
            // ==========================================
            if (isFirstRadarScan) {
                let memorizedCount = 0;
                for (const order of recentDeliveredOrders) {
                    if (!processedOrdersCache.includes(order.id)) {
                        processedOrdersCache.push(order.id);
                        memorizedCount++;
                    }
                }
                
                if (processedOrdersCache.length > 200) processedOrdersCache.splice(0, processedOrdersCache.length - 200);
                localStorage.setItem('inventory_processed_orders', JSON.stringify(processedOrdersCache));
                
                isFirstRadarScan = false; // Desliga o escudo para as próximas varreduras
                console.log(`🛡️ [STOCK] Primeira varredura concluída. ${memorizedCount} pedidos antigos memorizados sem abater.`);
                return; // PARA AQUI! Não abate nada do que já passou.
            }

            // ==========================================
            // ROTINA NORMAL: A cada 5s verifica se há pedidos REALMENTE novos
            // ==========================================
            for (const order of recentDeliveredOrders) {
                if (!processedOrdersCache.includes(order.id)) {
                    console.log(`🚚 [STOCK] Novo pedido ENTREGUE detetado pelo Radar: ${order.id}`);
                    
                    const orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                    await processOrderDeduction(orderItems);

                    // Regista que este pedido foi processado para não voltar a abater
                    processedOrdersCache.push(order.id);
                    if (processedOrdersCache.length > 200) processedOrdersCache.shift();
                    localStorage.setItem('inventory_processed_orders', JSON.stringify(processedOrdersCache));
                }
            }
        } catch (err) {
            console.error("❌ [STOCK] Erro interno no Radar:", err);
        }
    }, 5000); 
}

// ============================================================================
// COMPONENTE VISUAL REACT (COM ABAS INTACTAS)
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
    // Abas
    const [activeTab, setActiveTab] = useState<'insumos' | 'receitas'>('insumos');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Insumos States
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [itemFormData, setItemFormData] = useState<Partial<InventoryItem>>({
        name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0
    });
    const [stockEntry, setStockEntry] = useState<string>('');

    // Receitas States
    const [compositions, setCompositions] = useState<Composition[]>([]);
    const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
    const [editingRecipeName, setEditingRecipeName] = useState('');
    const [recipeIngredients, setRecipeIngredients] = useState<{ invId: string, amount: number }[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            // Busca Insumos
            const { data: invData } = await supabase.from('inventory_items').select('*').order('name');
            if (invData) {
                const mappedData = invData.map((item: any) => ({
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
            // Busca Receitas
            const { data: compData } = await supabase.from('compositions').select('*');
            if (compData) {
                setCompositions(compData);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 5000); // Polling de atualização da interface (a cada 5s)
        return () => clearInterval(interval);
    }, [setItems]);

    // Lógica Insumos
    const shoppingList = useMemo(() => items.filter(item => Number(item.currentStock) <= Number(item.minStock)), [items]);
    const filteredItems = items.filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase()));

    const handlePrintList = () => {
        const printWindow = window.open('', '', 'width=800,height=600');
        if (!printWindow) return;
        const htmlContent = `<html><head><title>Lista de Compras</title><style>body { font-family: Arial, sans-serif; padding: 20px; color: #333; }h1 { color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; }table { width: 100%; border-collapse: collapse; margin-top: 20px; }th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }th { background-color: #f8f9fa; font-weight: bold; }.urgent { color: #dc2626; font-weight: bold; }</style></head><body><h1>Lista de Compras - Forneria 90</h1><p>Gerado em: ${new Date().toLocaleDateString('pt-PT')} às ${new Date().toLocaleTimeString('pt-PT')}</p><table><thead><tr><th>Insumo</th><th>Stock Atual</th><th>Mínimo Exigido</th><th>Comprar Aprox.</th></tr></thead><tbody>${shoppingList.map(item => {const toBuy = Math.max(0, item.minStock - item.currentStock);return `<tr><td><strong>${item.name}</strong></td><td>${item.currentStock} ${item.unit}</td><td>${item.minStock} ${item.unit}</td><td class="urgent">${toBuy} ${item.unit}</td></tr>`;}).join('')}</tbody></table><script>window.onload = () => { window.print(); window.close(); };</script></body></html>`;
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    const handleSaveItem = async () => {
        if (!itemFormData.name) { alert('O nome do insumo é obrigatório!'); return; }
        const current_stock = Number(itemFormData.currentStock) || 0;
        const entry_amount = Number(stockEntry) || 0;
        const final_stock = current_stock + entry_amount;
        const min_stock = Number(itemFormData.minStock) || 0;
        const costPrice = Number(itemFormData.costPrice) || 0;

        const dbItem = {
            id: editingItem ? editingItem.id : self.crypto.randomUUID(),
            name: itemFormData.name,
            category: itemFormData.category || 'Ingredientes',
            unit: itemFormData.unit || 'KG',
            current_stock: final_stock,
            min_stock: min_stock,
            cost_price: costPrice
        };

        try {
            const { error } = await supabase.from('inventory_items').upsert([dbItem]);
            if (error) { alert(`Erro no banco: ${error.message}`); return; }
            setIsItemModalOpen(false);
            setEditingItem(null);
            setItemFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0 });
            setStockEntry('');
        } catch (err) { alert("Erro ao guardar."); }
    };

    const handleDeleteItem = async (id: string) => {
        if (window.confirm('Excluir este insumo permanentemente?')) {
            await supabase.from('inventory_items').delete().eq('id', id);
            setItems(prev => prev.filter(i => i.id !== id));
        }
    };

    // Lógica Receitas
    const recipesGrouped = useMemo(() => {
        const groups: Record<string, Composition[]> = {};
        compositions.forEach(c => {
            if (!groups[c.reference_id]) groups[c.reference_id] = [];
            groups[c.reference_id].push(c);
        });
        return groups;
    }, [compositions]);

    const handleSaveRecipe = async () => {
        if (!editingRecipeName) { alert('O Nome da Receita (Ex: Calabresa) é obrigatório!'); return; }
        
        try {
            // Apaga a receita antiga
            await supabase.from('compositions').delete().eq('reference_id', editingRecipeName);
            
            // Insere a nova
            const validIngredients = recipeIngredients.filter(r => r.invId && r.amount > 0);
            if (validIngredients.length > 0) {
                const newComps = validIngredients.map(r => ({
                    id: self.crypto.randomUUID(),
                    reference_id: editingRecipeName,
                    inventory_item_id: r.invId,
                    amount_needed: r.amount
                }));
                await supabase.from('compositions').insert(newComps);
                
                const otherComps = compositions.filter(c => c.reference_id !== editingRecipeName);
                setCompositions([...otherComps, ...newComps]);
            } else {
                setCompositions(compositions.filter(c => c.reference_id !== editingRecipeName));
            }
            
            setIsRecipeModalOpen(false);
            setEditingRecipeName('');
            setRecipeIngredients([]);
        } catch (err) {
            alert("Erro ao guardar a receita.");
        }
    };

    const handleDeleteRecipe = async (recipeName: string) => {
        if (window.confirm(`Excluir a receita de ${recipeName}?`)) {
            await supabase.from('compositions').delete().eq('reference_id', recipeName);
            setCompositions(prev => prev.filter(c => c.reference_id !== recipeName));
        }
    };

    const openRecipeModal = (recipeName: string = '') => {
        setEditingRecipeName(recipeName);
        if (recipeName && recipesGrouped[recipeName]) {
            setRecipeIngredients(recipesGrouped[recipeName].map(c => ({
                invId: c.inventory_item_id,
                amount: c.amount_needed
            })));
        } else {
            setRecipeIngredients([{ invId: '', amount: 0 }]);
        }
        setIsRecipeModalOpen(true);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header e Abas */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3"><Package className="w-8 h-8 text-red-600" /> Controlo de Stock</h1>
                    <p className="text-gray-500 font-medium">Faça a gestão de insumos e fichas técnicas</p>
                </div>
                
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('insumos')}
                        className={`px-6 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'insumos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Package className="w-5 h-5"/> Insumos
                    </button>
                    <button 
                        onClick={() => setActiveTab('receitas')}
                        className={`px-6 py-2.5 rounded-lg font-bold transition-all flex items-center gap-2 ${activeTab === 'receitas' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <BookOpen className="w-5 h-5"/> Fichas Técnicas
                    </button>
                </div>
            </div>

            {/* ABA INSUMOS */}
            {activeTab === 'insumos' && (
                <>
                    <div className="flex justify-end gap-3 mb-6">
                        {shoppingList.length > 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 flex items-center gap-3 animate-pulse">
                                <AlertTriangle className="w-5 h-5 text-amber-600" /><span className="text-amber-800 font-bold text-sm">{shoppingList.length} itens abaixo do mínimo!</span>
                            </div>
                        )}
                        <button onClick={() => { setEditingItem(null); setItemFormData({ name: '', category: 'Ingredientes', unit: 'KG', currentStock: 0, minStock: 0, costPrice: 0 }); setStockEntry(''); setIsItemModalOpen(true); }} className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 shadow-lg shadow-red-100 transition-all"><Plus className="w-5 h-5" /> Novo Insumo</button>
                    </div>

                    {shoppingList.length > 0 && (
                        <div className="mb-8 bg-white border-2 border-red-100 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
                                <h2 className="text-red-800 font-black flex items-center gap-2"><ShoppingCart className="w-5 h-5" /> LISTA DE COMPRAS SUGERIDA</h2>
                                <button onClick={handlePrintList} className="bg-white border border-red-200 text-red-700 px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-red-100 transition-colors shadow-sm"><Printer className="w-4 h-4" /> Imprimir / PDF</button>
                            </div>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                {shoppingList.map(item => (
                                    <div key={item.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex justify-between items-center">
                                        <div><p className="font-bold text-gray-800">{item.name}</p><p className="text-xs text-red-600 font-medium">Stock: {item.currentStock} {item.unit} (Mín: {item.minStock})</p></div>
                                        <div className="text-right"><p className="text-xs text-gray-400 uppercase font-bold">Comprar aprox.</p><p className="font-black text-gray-900">{Math.max(0, item.minStock - item.currentStock)} {item.unit}</p></div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex flex-col md:row justify-between gap-4">
                            <div className="relative flex-1"><Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input type="text" placeholder="Procurar insumos..." className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-red-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                                    <tr><th className="px-6 py-4">Insumo</th><th className="px-6 py-4">Categoria</th><th className="px-6 py-4 text-center">Stock Atual</th><th className="px-6 py-4 text-center">Mínimo</th><th className="px-6 py-4 text-center">Ações</th></tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredItems.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4"><div className="font-bold text-gray-900">{item.name}</div><div className="text-xs text-gray-400">R$ {item.costPrice.toFixed(2)} / {item.unit}</div></td>
                                            <td className="px-6 py-4"><span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">{item.category}</span></td>
                                            <td className="px-6 py-4 text-center"><div className={`font-black ${item.currentStock <= item.minStock ? 'text-red-600' : 'text-green-600'}`}>{item.currentStock} {item.unit}</div></td>
                                            <td className="px-6 py-4 text-center font-medium text-gray-500">{item.minStock} {item.unit}</td>
                                            <td className="px-6 py-4"><div className="flex justify-center gap-2"><button onClick={() => { setEditingItem(item); setItemFormData(item); setStockEntry(''); setIsItemModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit className="w-5 h-5" /></button><button onClick={() => handleDeleteItem(item.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-5 h-5" /></button></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* ABA RECEITAS */}
            {activeTab === 'receitas' && (
                <div>
                    <div className="flex justify-end gap-3 mb-6">
                        <button onClick={() => openRecipeModal()} className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-red-700 shadow-lg shadow-red-100 transition-all">
                            <Plus className="w-5 h-5" /> Nova Receita
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Object.entries(recipesGrouped).map(([recipeName, comps]) => (
                            <div key={recipeName} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative group">
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openRecipeModal(recipeName)} className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"><Edit className="w-4 h-4"/></button>
                                    <button onClick={() => handleDeleteRecipe(recipeName)} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"><Trash2 className="w-4 h-4"/></button>
                                </div>
                                <h3 className="text-xl font-black text-gray-900 mb-4">{recipeName}</h3>
                                <div className="space-y-3">
                                    {comps.map((comp, idx) => {
                                        const item = items.find(i => i.id === comp.inventory_item_id);
                                        return (
                                            <div key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                                                <span className="font-bold text-gray-700 text-sm">{item?.name || 'Item Removido'}</span>
                                                <span className="text-sm bg-white px-3 py-1 rounded-lg shadow-sm font-medium border border-gray-100">
                                                    {comp.amount_needed} {item?.unit}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MODAL DE INSUMO */}
            {isItemModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50"><h2 className="text-xl font-black text-gray-900">{editingItem ? 'Editar Insumo' : 'Novo Insumo'}</h2><button onClick={() => setIsItemModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-6 h-6"/></button></div>
                        <div className="p-6 space-y-4">
                            <div><label className="block text-sm font-bold text-gray-700 mb-1">Nome do Insumo</label><input type="text" value={itemFormData.name} onChange={e => setItemFormData({...itemFormData, name: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Unidade</label><select value={itemFormData.unit} onChange={e => setItemFormData({...itemFormData, unit: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none"><option value="KG">Quilo (KG)</option><option value="UN">Unidade (UN)</option><option value="LT">Litro (LT)</option><option value="GR">Grama (GR)</option></select></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Preço de Custo</label><input type="number" value={itemFormData.costPrice} onChange={e => setItemFormData({...itemFormData, costPrice: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none" /></div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 pt-2">
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Stock Atual</label><input type="number" value={itemFormData.currentStock} onChange={e => setItemFormData({...itemFormData, currentStock: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none font-bold text-gray-600 bg-gray-50"/></div>
                                <div><label className="block text-sm font-bold text-gray-700 mb-1">Mínimo</label><input type="number" value={itemFormData.minStock} onChange={e => setItemFormData({...itemFormData, minStock: parseFloat(e.target.value)})} className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none"/></div>
                                <div><label className="block text-sm font-black text-green-700 mb-1">+ Nova Entrada</label><input type="number" value={stockEntry} onChange={e => setStockEntry(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-green-300 bg-green-50 outline-none font-black text-green-700" placeholder="Qtd..."/></div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 flex gap-3"><button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl">Cancelar</button><button onClick={handleSaveItem} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 flex items-center justify-center gap-2"><Save className="w-5 h-5"/> Guardar</button></div>
                    </div>
                </div>
            )}

            {/* MODAL DE RECEITA */}
            {isRecipeModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
                        <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                            <h2 className="text-xl font-black text-gray-900">{editingRecipeName ? 'Editar Receita' : 'Nova Receita'}</h2>
                            <button onClick={() => setIsRecipeModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-6 h-6"/></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nome no Cardápio</label>
                                <input 
                                    type="text" 
                                    value={editingRecipeName} 
                                    onChange={e => setEditingRecipeName(e.target.value)} 
                                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 outline-none" 
                                    placeholder="Ex: Calabresa, Guaraná 1L"
                                    disabled={!!editingRecipeName && recipesGrouped[editingRecipeName] !== undefined}
                                />
                                <p className="text-xs text-gray-500 mt-1">Este nome deve ser exatamente igual ao que sai no pedido.</p>
                            </div>

                            <div className="pt-4 border-t border-gray-100">
                                <label className="block text-sm font-bold text-gray-700 mb-3">Insumos Necessários</label>
                                {recipeIngredients.map((ing, idx) => (
                                    <div key={idx} className="flex gap-2 mb-2 items-center">
                                        <select 
                                            value={ing.invId} 
                                            onChange={e => {
                                                const newIng = [...recipeIngredients];
                                                newIng[idx].invId = e.target.value;
                                                setRecipeIngredients(newIng);
                                            }}
                                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 outline-none"
                                        >
                                            <option value="">Selecione um insumo...</option>
                                            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                                        </select>
                                        <input 
                                            type="number" 
                                            value={ing.amount} 
                                            onChange={e => {
                                                const newIng = [...recipeIngredients];
                                                newIng[idx].amount = parseFloat(e.target.value);
                                                setRecipeIngredients(newIng);
                                            }}
                                            className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm outline-none text-center"
                                            placeholder="Qtd"
                                        />
                                        <button onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors">
                                            <Trash2 className="w-5 h-5"/>
                                        </button>
                                    </div>
                                ))}

                                <button onClick={() => setRecipeIngredients([...recipeIngredients, { invId: '', amount: 0 }])} className="text-sm font-bold text-blue-600 mt-4 hover:underline flex items-center gap-1">
                                    <Plus className="w-4 h-4"/> Adicionar Insumo
                                </button>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 flex gap-3">
                            <button onClick={() => setIsRecipeModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-200 rounded-xl">Cancelar</button>
                            <button onClick={handleSaveRecipe} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 flex items-center justify-center gap-2"><Save className="w-5 h-5"/> Guardar Ficha</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryView;
