import { GoogleGenAI, Type } from "@google/genai";
import { Product, SalesHistoryItem, ForecastData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Forecast Logic (Real AI Implementation)
export const generateSalesForecast = async (history: SalesHistoryItem[], products: Product[]): Promise<ForecastData> => {
  const model = "gemini-3-flash-preview";

  // Fallback safe data if API fails or no data
  const fallbackData: ForecastData = {
    predictedRevenue: 0,
    confidenceScore: 0,
    predictedProducts: [],
    insight: "Dados insuficientes para previsão. Continue vendendo para gerar histórico."
  };

  if (!process.env.API_KEY) {
      console.warn("Gemini API Key missing.");
      return fallbackData;
  }

  try {
    // 1. Prepare Context
    const productNames = products.map(p => p.name).join(", ");
    const historyContext = history.length > 0 
        ? JSON.stringify(history.slice(-7)) // Last 7 days
        : "Sem histórico de vendas recente.";

    const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });

    // 2. Define Schema for Strict JSON Output
    const schema = {
      type: Type.OBJECT,
      properties: {
        predictedRevenue: { type: Type.NUMBER, description: "Estimated revenue for tomorrow in BRL" },
        confidenceScore: { type: Type.INTEGER, description: "Confidence level 0-100" },
        insight: { type: Type.STRING, description: "Short strategic advice in Portuguese" },
        predictedProducts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING, description: "Name of the product from the provided menu" },
              estimatedQuantity: { type: Type.INTEGER, description: "Estimated units to be sold" },
              confidence: { type: Type.INTEGER, description: "Probability percentage 0-100" },
              reasoning: { type: Type.STRING, description: "Why this product will sell well (max 10 words)" }
            }
          }
        }
      },
      required: ["predictedRevenue", "confidenceScore", "predictedProducts", "insight"]
    };

    // 3. Prompt Engineering
    const prompt = `
      Você é um especialista em Inteligência de Vendas para Delivery.
      
      Hoje é: ${today}.
      
      CONTEXTO:
      - Cardápio Disponível: ${productNames}
      - Histórico de Vendas Recente: ${historyContext}
      
      TAREFA:
      Preveja as vendas para AMANHÃ.
      
      REGRAS:
      1. Use APENAS produtos listados no "Cardápio Disponível". Não invente produtos.
      2. Se o histórico for vazio ou baixo, baseie-se em tendências gerais de delivery para o dia da semana de amanhã (ex: Sexta pede Pizza/Hambúrguer, Segunda pede Saudável).
      3. Seja realista com os números.
      4. Responda estritamente no formato JSON solicitado.
    `;

    // 4. Call API
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.4 // Lower temperature for more grounded predictions
      }
    });

    if (response.text) {
        const parsed = JSON.parse(response.text);
        return parsed as ForecastData;
    }

    return fallbackData;

  } catch (error) {
    console.error("Gemini Forecast Error:", error);
    // If it fails, try to return a semi-smart fallback using available products
    if (products.length > 0) {
        return {
            ...fallbackData,
            predictedProducts: [
                { productName: products[0].name, estimatedQuantity: 10, confidence: 50, reasoning: "Produto popular do cardápio (Estimativa Fallback)" }
            ],
            insight: "O sistema de IA está temporariamente indisponível, exibindo estimativa base."
        };
    }
    return fallbackData;
  }
};

/**
 * Takes an existing base64 image and enhances it using Gemini Vision features.
 * Acts as a "Pro Food Photographer" filter.
 */
export const enhanceProductImage = async (originalBase64: string, productName: string, productCategory: string): Promise<string | null> => {
  const model = "gemini-2.5-flash-image";

  if (!process.env.API_KEY) return null;

  try {
    // 1. Prepare Base64 (remove data:image/png;base64, prefix if present)
    const matches = originalBase64.match(/^data:(.+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        console.error("Invalid base64 format");
        return null;
    }
    const mimeType = matches[1];
    const data = matches[2];

    // 2. Define the enhancement prompt
    const prompt = `
      You are a professional food photographer and editor.
      I am providing a photo of a real dish: "${productName}" (Category: ${productCategory}).
      
      Task: Enhance this exact image to look like High-End Food Photography.
      - Improve the lighting (make it soft and appetizing).
      - Improve color grading (vibrant but natural).
      - Increase sharpness and clarity.
      - Clean up minor visual noise.
      - CRITICAL: Keep the food geometry and ingredients REALISTIC. Do not hallucinate new ingredients or change the dish completely. It must look like the same plate, just photographed better.
    `;

    // 3. Call Gemini
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { 
            inlineData: { 
              mimeType: mimeType, 
              data: data 
            } 
          },
          { text: prompt },
        ],
      },
    });

    // 4. Extract the image from response
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:image/png;base64,${part.inlineData.data}`;
            }
        }
    }
    
    return null;

  } catch (error) {
    console.error("AI Image Enhancement Error:", error);
    return null;
  }
};

export const parseWhatsAppMessage = async (message: string, menu: Product[]) => {
  const model = "gemini-3-flash-preview";
  
  if (!process.env.API_KEY) return { items: [], reply: "Erro de configuração de IA." };

  try {
      const menuContext = menu.map(p => `${p.name} (R$ ${p.price})`).join("\n");
      const prompt = `
        Você é um atendente virtual de delivery.
        Cardápio:
        ${menuContext}

        Mensagem do Cliente: "${message}"

        Tarefa:
        1. Identifique se o cliente quer fazer um pedido.
        2. Se sim, extraia os itens e quantidades baseados no cardápio.
        3. Gere uma resposta curta e amigável. Se faltar informação, pergunte. Se o pedido estiver claro, confirme o valor total.

        Retorne APENAS um JSON:
        {
            "items": [{"productName": "string", "quantity": number}],
            "reply": "string"
        }
      `;

      const response = await ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: prompt }] }],
          config: { responseMimeType: "application/json" }
      });

      if (response.text) {
          return JSON.parse(response.text);
      }
  } catch (e) {
      console.error("WhatsApp Bot Error", e);
  }

  return { items: [], reply: "Desculpe, não entendi. Pode repetir?" };
};