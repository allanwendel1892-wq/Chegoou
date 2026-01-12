import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { parseWhatsAppMessage } from '../services/geminiService';
import { MessageSquare, Send, Smartphone, Bot, User, ShoppingCart, Loader2, CheckCircle } from 'lucide-react';

interface WhatsAppBotViewProps {
  products: Product[];
}

interface Message {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  orderParsed?: {
    items: { productName: string; quantity: number }[];
  };
}

const WhatsAppBotView: React.FC<WhatsAppBotViewProps> = ({ products }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 1, sender: 'bot', text: 'Olá! Sou o assistente virtual da Chegoou. O que você gostaria de pedir hoje?' }
  ]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    const userMsg: Message = { id: Date.now(), sender: 'user', text: inputText };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsProcessing(true);

    // Call AI to parse message
    const response = await parseWhatsAppMessage(userMsg.text, products);

    const botMsg: Message = {
      id: Date.now() + 1,
      sender: 'bot',
      text: response.reply,
      orderParsed: response.items.length > 0 ? { items: response.items } : undefined
    };

    setMessages(prev => [...prev, botMsg]);
    setIsProcessing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSendMessage();
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col lg:flex-row gap-6">
      
      {/* Left Column: Config & Info */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Z-API Integration</h2>
          <p className="text-gray-500 mt-1">Simulador de atendimento via WhatsApp com IA.</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-full">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-semibold text-gray-900">Status da Integração</h3>
          </div>
          <div className="flex items-center gap-2 text-green-600 font-medium mb-4">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            Online
          </div>
          <p className="text-sm text-gray-500 mb-4">
            O bot está treinado com o seu cardápio atual. Ele consegue identificar itens, calcular totais e tirar dúvidas básicas.
          </p>
          <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-600 font-mono">
            Webhook: https://api.chegoou.com.br/v1/webhook/whatsapp
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-500 to-emerald-600 p-6 rounded-xl text-white shadow-lg">
          <h3 className="font-bold text-lg mb-2">Dica Pro</h3>
          <p className="text-green-50 text-sm">
            A IA processa o texto natural. Tente pedir como um cliente real: <br/>
            <i>"Me vê dois x-burguer e uma coca, por favor"</i>
          </p>
        </div>
      </div>

      {/* Right Column: Phone Simulator */}
      <div className="flex-1 bg-white rounded-3xl shadow-xl border-8 border-gray-800 overflow-hidden flex flex-col relative max-w-md mx-auto lg:max-w-none lg:mx-0 h-[600px] lg:h-auto">
        
        {/* Phone Header */}
        <div className="bg-[#075E54] p-4 flex items-center gap-3 text-white z-10">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">Chegoou Delivery</h3>
            <p className="text-xs text-green-100">Conta comercial</p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 bg-[#E5DDD5] overflow-y-auto p-4 space-y-4 bg-opacity-50" style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundBlendMode: 'overlay' }}>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`
                max-w-[80%] rounded-lg p-3 shadow-sm relative
                ${msg.sender === 'user' ? 'bg-[#DCF8C6] rounded-tr-none' : 'bg-white rounded-tl-none'}
              `}>
                <p className="text-sm text-gray-800 leading-relaxed">{msg.text}</p>
                <span className="text-[10px] text-gray-500 block text-right mt-1">
                  {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>

              {/* Parsed Order Card (Visual Confirmation) */}
              {msg.orderParsed && (
                <div className="mt-2 w-64 bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden animate-fade-in-up">
                  <div className="bg-red-50 p-2 border-b border-red-100 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-bold text-red-700">Pedido Identificado</span>
                  </div>
                  <div className="p-3">
                    {msg.orderParsed.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                        <span className="text-gray-700">{item.quantity}x {item.productName}</span>
                      </div>
                    ))}
                    <div className="mt-3 pt-2 border-t border-gray-100 flex justify-center">
                      <button className="bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-full flex items-center gap-1 transition-colors">
                        <CheckCircle className="w-3 h-3" />
                        Confirmar Pedido
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {isProcessing && (
            <div className="flex items-center gap-2 text-gray-500 text-sm ml-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Digitando...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-[#F0F0F0] p-3 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem..."
            className="flex-1 rounded-full px-4 py-2 border-none focus:ring-0 text-sm"
          />
          <button 
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isProcessing}
            className={`
              w-10 h-10 rounded-full flex items-center justify-center transition-all
              ${!inputText.trim() ? 'bg-gray-300 text-gray-500' : 'bg-[#00897B] text-white hover:bg-[#00756A]'}
            `}
          >
            <Send className="w-5 h-5 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppBotView;