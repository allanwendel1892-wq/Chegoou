import React, { useState } from 'react';
import { Search, Plus, AlertCircle, Edit2, Trash2, Package } from 'lucide-react';

// Tipagem atualizada para focar em insumos/matéria-prima
export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: 'KG' | 'L' | 'UN'; // Unidade de medida fundamental
  currentStock: number;
  minStock: number; // Para alertar quando estiver acabando
  costPrice: number;
}

interface InventoryViewProps {
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
}

const InventoryView: React.FC<InventoryViewProps> = ({ items, setItems }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Atualiza o estoque permitindo entradas fracionadas (ex: comprar 5.5 Kg)
  const handleManualEntry = (id: string, value: string) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return;

    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, currentStock: numValue };
      }
      return item;
    }));
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="w-6 h-6 text-red-600" /> Controle de Insumos
          </h2>
          <p className="text-gray-500 mt-1">Gerencie a matéria-prima e estoque base do estabelecimento.</p>
        </div>
        <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
          <Plus className="w-5 h-5" />
          Novo Insumo
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Buscar insumo (ex: Mussarela, Caixa...)" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Insumo</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Unidade</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Custo Médio</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Estoque Atual</th>
                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs font-bold">{item.unit}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    R$ {item.costPrice.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    {item.currentStock <= item.minStock ? (
                      <span className="flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2 py-1 rounded-full text-xs font-medium w-fit">
                        <AlertCircle className="w-3 h-3" /> Repor
                      </span>
                    ) : (
                      <span className="text-green-600 bg-green-50 px-2 py-1 rounded-full text-xs font-medium w-fit">
                        OK
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <input 
                        type="number"
                        step="0.01" // Permite decimais
                        value={item.currentStock}
                        onChange={(e) => handleManualEntry(item.id, e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InventoryView;
