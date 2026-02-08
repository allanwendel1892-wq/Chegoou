
import { GoogleGenAI, Type } from "@google/genai";
// FIX: Import ForecastData type to be used in the new forecast function.
import { Product, SalesHistoryItem, ForecastData } from "../types";

// Initialize with fallback to prevent app crash if env var is missing or undefined
// The actual API calls will fail gracefully in the try/catch blocks below if the key is invalid
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "missing_api_key" });

/**
 * Takes an existing base64 image and enhances it using Gemini Vision features.
 * Acts as a "Pro Food Photographer" filter.
 */
export const enhanceProductImage = async (originalBase64: string, productName: string, productCategory: string): Promise<string | null> => {
  const model = "gemini-2.5-flash-image";

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

// FIX: Implement the missing generateSalesForecast function.
/**
 * Analyzes sales history and product list to forecast future sales using Gemini.
 */
export const generateSalesForecast = async (salesHistory: SalesHistoryItem[], products: Product[]): Promise<ForecastData | null> => {
  // Use a more powerful model for complex reasoning tasks like forecasting.
  const model = "gemini-3-pro-preview";

  try {
    const salesHistoryContext = salesHistory.map(item => `Data: ${item.date}, Faturamento: R$ ${item.revenue.toFixed(2)}, Pedidos: ${item.ordersCount}`).join('\n');
    const menuContext = products.map(p => `${p.name} (Categoria: ${p.category}, Preço: R$ ${p.price.toFixed(2)})`).join('\n');

    const prompt = `
      Você é uma IA especialista em previsão de vendas para um restaurante fast-food (delivery).
      Analise o histórico de vendas e o cardápio atual para prever os 2 produtos com maior probabilidade de venda para o dia de amanhã.

      Histórico de Vendas (últimos dias):
      ${salesHistoryContext}

      Cardápio Atual:
      ${menuContext}

      Tarefa:
      1. Identifique padrões e tendências nos dados de vendas (ex: dias da semana, produtos mais vendidos).
      2. Selecione os 2 produtos com maior potencial de venda para amanhã.
      3. Para cada produto, forneça uma breve justificativa (reasoning) em uma frase, uma porcentagem de confiança (confidence) de 0 a 100, e uma quantidade estimada de venda (estimatedQuantity).
      4. Forneça um score de confiança geral para a previsão (confidenceScore) de 0 a 100, baseado na qualidade e quantidade de dados históricos.
      5. Escreva um insight curto e acionável sobre a previsão (ex: "Foco nos combos de hambúrguer, pois a tendência de lanches está em alta para o fim de semana.").
      
      Retorne APENAS o objeto JSON, sem nenhum texto, markdown ou formatação extra.
    `;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        predictedProducts: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              productName: { type: Type.STRING, description: "Nome exato do produto como no cardápio." },
              reasoning: { type: Type.STRING, description: "Justificativa curta para a previsão." },
              confidence: { type: Type.NUMBER, description: "Confiança na previsão do produto (0-100)." },
              estimatedQuantity: { type: Type.NUMBER, description: "Estimativa de unidades a serem vendidas." },
            },
            required: ['productName', 'reasoning', 'confidence', 'estimatedQuantity'],
          },
        },
        confidenceScore: { type: Type.NUMBER, description: "Confiança geral na previsão (0-100)." },
        insight: { type: Type.STRING, description: "Insight acionável baseado na análise." },
      },
      required: ['predictedProducts', 'confidenceScore', 'insight'],
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2, // Lower temperature for more predictable, analytical responses
      },
    });

    if (response.text) {
      return JSON.parse(response.text.trim());
    }
    return null;

  } catch (error) {
    console.error("AI Sales Forecast Error:", error);
    return null;
  }
};


export const parseWhatsAppMessage = async (message: string, menu: Product[]) => {
  const model = "gemini-3-flash-preview";
  
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
      // FIX: Add response schema for more reliable JSON output.
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
            items: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        productName: { type: Type.STRING },
                        quantity: { type: Type.NUMBER }
                    },
                    required: ['productName', 'quantity']
                }
            },
            reply: { type: Type.STRING }
        },
        required: ['items', 'reply']
      };

      const response = await ai.models.generateContent({
          model: model,
          contents: [{ parts: [{ text: prompt }] }],
          // FIX: Use responseSchema to ensure valid JSON is returned.
          config: { 
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
      });

      if (response.text) {
          // FIX: Trim response to avoid parsing errors.
          return JSON.parse(response.text.trim());
      }
  } catch (e) {
      console.error("WhatsApp Bot Error", e);
  }

  return { items: [], reply: "Desculpe, não entendi. Pode repetir?" };
};
