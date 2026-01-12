import React, { useState, useEffect } from 'react';
import { Product, SalesHistoryItem, ForecastData } from '../types';
import { generateSalesForecast } from '../services/geminiService';
import { Sparkles, TrendingUp, AlertTriangle, Loader2, BarChart2, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ForecastViewProps {
  products: Product[];
  salesHistory: SalesHistoryItem[];
}

const ForecastView: React.FC<ForecastViewProps> = ({ products, salesHistory }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [forecast, setForecast] = useState<ForecastData | null>(null);

  useEffect(() => {
    const fetchForecast = async () => {
      setLoading(true);
      // Removed artificial timeout, call real service
      const data = await generateSalesForecast(salesHistory, products);
      setForecast(data);
      setLoading(false);
    };

    if (products.length > 0) {
        fetchForecast();
    } else {
        setLoading(false); // No products, no forecast
    }
    
  }, [products, salesHistory]); // Trigger when props update

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin" />
        <p className="text-gray-500 font-medium">A IA do Gemini está analisando seus dados de vendas...</p>
      </div>
    );
  }

  if (!forecast) return (
      <div className="text-center py-10 text-gray-500">
          Adicione produtos ao cardápio para gerar previsões.
      </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-purple-600" />
          <h2 className="text-2xl font-bold text-gray-800">IA Preditiva de Vendas (Gemini)</h2>
        </div>
        <p className="text-gray-500">
          Probabilidade de venda para <span className="font-bold text-gray-900">Amanhã</span>
        </p>
      </div>

      {/* Probability Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {forecast.predictedProducts.map((item, idx) => (
             <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-10 bg-purple-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
                 <div className="relative z-10">
                     <p className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-1">
                         {idx === 0 ? 'Maior Probabilidade' : 'Sugestão Secundária'}
                     </p>
                     <h3 className="text-2xl font-bold text-gray-900">{item.productName}</h3>
                     <p className="text-sm text-gray-500 mt-2 max-w-xs">{item.reasoning}</p>
                 </div>
                 <div className="relative z-10 text-right">
                     <div className="inline-flex flex-col items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg">
                         <span className="text-2xl font-bold">{item.confidence}%</span>
                         <span className="text-[10px] uppercase font-medium">Chance</span>
                     </div>
                     <p className="text-xs text-center text-gray-400 mt-2">Est. {item.estimatedQuantity} un.</p>
                 </div>
             </div>
        ))}
      </div>

      {/* Confidence Chart */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
            <Target className="w-5 h-5 text-gray-500" /> Margem de Confiabilidade
        </h3>
        <div className="relative pt-6 pb-2">
             <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                 <div 
                    className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${forecast.confidenceScore}%` }}
                 ></div>
             </div>
             <div className="flex justify-between mt-2 text-sm font-medium text-gray-600">
                 <span>Baixa Confiabilidade</span>
                 <span className="text-gray-900 font-bold">{forecast.confidenceScore}% (Alta)</span>
                 <span>Certeza Absoluta</span>
             </div>
        </div>
        <p className="text-sm text-gray-500 mt-4 bg-gray-50 p-4 rounded-lg">
            {forecast.insight}
        </p>
      </div>
    </div>
  );
};

export default ForecastView;