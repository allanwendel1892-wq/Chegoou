import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Edit, Trash2, AlertTriangle, ShoppingCart, Package, X, Save, Printer } from 'lucide-react';
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
    
    // Campo de entrada (soma ao estoque)
    const [stockEntry, setStockEntry] = useState<string>('');

    // ============================================================================
    // MOTOR AUTÔNOMO DE BAIXA DE ESTOQUE (Escuta a tabela 'orders' em tempo real)
    // ============================================================================
    useEffect(() => {
        const processOrderDeduction = async (orderItems: any[]) => {
            try {
                // 1. Busca todas as receitas ativas
                const { data: compositions } = await supabase.from('compositions').select('*');
                if (!compositions || compositions.length === 0) return;

                // 2. Cria um "carrinho de deduções" para somar tudo antes de gravar no banco
                const deductions: Record<string, number> = {};

                const addDeduction = (invId: string, amount: number) => {
                    if (!deductions[invId]) deductions[invId] = 0;
                    deductions[invId] += amount;
                };

                // 3. Lê o JSON exato que você me mandou e calcula as quantidades
                for (const item of orderItems) {
                    
                    // A. Abate Produto Inteiro / Principal (Ex: Caixa de Pizza, Bebidas)
                    const mainComps = compositions.filter(c => c.reference_id === item.productName);
                    for (const comp of mainComps) {
                        addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity);
                    }

                    // B. Abate Sabores / Opções e Lida com as Frações "1/2"
                    if (item.selectedOptions && item.selectedOptions.length > 0) {
                        for (const opt of item.selectedOptions) {
                            // Extrai o nome limpo (Ex: pega "Calabresa" direto do optionName, ou limpa o "1/2" do nome original)
                            const optName = opt.optionName || String(opt.name).replace('1/2 ', '').replace('1/3 ', '').trim();
                            const groupName = opt.groupName;

                            let fraction = 1;

                            // Verifica se é uma opção que divide (pela flag dividePrice ou pelo texto 1/2)
                            if (opt.dividePrice === true || String(opt.name).includes('1/2') || String(opt.name).includes('meia')) {
                                // Quantas opções desse mesmo grupo "PIZZA" ele escolheu?
                                const selectedInGroup = item.selectedOptions.filter((o: any) => 
                                    o.groupName === groupName && 
                                    (o.dividePrice === true || String(o.name).includes('1/2') || String(o.name).includes('meia'))
                                ).length;
                                
                                if (selectedInGroup > 0) {
                                    fraction = 1 / selectedInGroup; // Transforma 2 sabores em 0.5 (1/2), 3 em 0.33, etc.
                                }
                            }

                            // Acha a receita correspondente ao sabor limpo e adiciona à dedução proporcional
                            const optComps = compositions.filter(c => c.reference_id === optName);
                            for (const comp of optComps) {
                                addDeduction(comp.inventory_item_id, comp.amount_needed * item.quantity * fraction);
                            }
                        }
                    }
                }

                // 4. Executa a baixa diretamente no banco de dados
                for (const [invId, amountToDeduct] of Object.entries(deductions)) {
                    if (amountToDeduct > 0) {
                        const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', invId).single();
                        if (inv) {
                            const newStock = Number(inv.current_stock) - amountToDeduct;
                            // Grava no Supabase
                            await supabase.from('inventory_items').update({ current_stock: newStock }).eq('id', invId);
                            // Atualiza a tela visualmente na mesma hora
                            setItems(prev => prev.map(i => i.id === invId ? { ...i, currentStock: newStock } : i));
                        }
                    }
                }

            } catch (error) {
                console.error("Erro ao processar a baixa de estoque:", error);
            }
        };

        // Canal Realtime do Supabase: Fica "ouvindo" atualizações na tabela orders
        const ordersChannel = supabase.channel('realtime:orders_inventory_sync')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'orders' },
                (payload) => {
                    const newOrder = payload.new;
                    const oldOrder = payload.old;

                    // Se o status acabou de mudar para 'delivered'
                    if (newOrder.status === 'delivered' && oldOrder.status !== 'delivered') {
                        // Converte o JSONB caso ele venha como string
                        const orderItems = typeof newOrder.items === 'string' ? JSON.parse(newOrder.items) : newOrder.items;
                        processOrderDeduction(orderItems);
                    }
                }
            )
            .subscribe();

        // Limpa o listener ao desmontar o componente
        return () => {
            supabase.removeChannel(ordersChannel);
        };
    }, []); 
    // ============================================================================


    // 1. GERAÇÃO DA LISTA DE COMPRAS
    const shoppingList = useMemo(() => {
        return items.filter(item => Number(item.currentStock) <= Number(item.minStock));
    }, [items]);

    const filteredItems = items.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // FUNÇÃO PARA IMPRIMIR/GERAR PDF DA LISTA DE COMPRAS
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

    // 2. SALVAMENTO BLINDADO E SOMA DE ENTRADA
    const handleSaveItem = async () => {
        if (!itemFormData.name) {
            alert('O nome do insumo é obrigatório!');
            return;
        }

        // Lógica de Entrada: Pega o estoque que estava lá + o valor que foi digitado no campo de entrada
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
            current_stock: final_stock, // Salva a soma final no banco
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
            setStockEntry(''); // Limpa o campo de entrada
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
                            
                            {/* Linha de Estoque e Entrada */}
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
