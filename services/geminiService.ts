
// FIX: Import SalesHistoryItem and ForecastData types
import { GoogleGenAI, Type } from "@google/genai";
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

// FIX: Add generateSalesForecast function to provide AI-powered sales predictions.
/**
 * Generates a sales forecast for the next day based on historical data and product list.
 * @param salesHistory - Array of past sales data.
 * @param products - Array of available products.
 * @returns A promise that resolves to ForecastData or null.
 */
export const generateSalesForecast = async (
  salesHistory: SalesHistoryItem[],
  products: Product[]
): Promise<ForecastData | null> => {
  const model = "gemini-3-pro-preview"; // Use a powerful model for analysis

  try {
    const historyContext = salesHistory.length > 0 ? salesHistory
      .map((item) => `Data: ${item.date}, Receita: R$ ${item.revenue.toFixed(2)}, Pedidos: ${item.ordersCount}`)
      .join("\n") : "Nenhum dado de venda recente.";

    const productContext = products.length > 0 ? products
        .map((p) => `${p.name} (Categoria: ${p.category})`)
        .join("\n") : "Nenhum produto cadastrado.";

    const prompt = `
      Você é um analista de dados especialista em delivery de comida e seu trabalho é prever vendas para o dia seguinte.
      
      Dados Históricos de Vendas (últimos dias):
      ${historyContext}

      Produtos Disponíveis no Cardápio:
      ${productContext}

      Tarefa:
      1. Analise os dados históricos de vendas para identificar padrões, como produtos mais vendidos e tendências.
      2. Com base na sua análise, preveja os 2 produtos com maior probabilidade de serem vendidos AMANHÃ.
      3. Para cada produto, forneça uma razão curta (máximo 15 palavras) e convincente para a previsão.
      4. Estime uma quantidade de vendas para cada produto previsto.
      5. Forneça um insight geral sobre a previsão e uma pontuação de confiança (0-100) para a previsão geral.

      Retorne APENAS um JSON estritamente no formato abaixo. Não inclua markdown (\`\`\`json ... \`\`\`).
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            predictedProducts: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        productName: { type: Type.STRING, description: "Nome exato do produto." },
                        reasoning: { type: Type.STRING, description: "Justificativa curta para a previsão." },
                        confidence: { type: Type.NUMBER, description: "Confiança na previsão deste item (0-100)." },
                        estimatedQuantity: { type: Type.NUMBER, description: "Quantidade estimada de venda." }
                    },
                    required: ["productName", "reasoning", "confidence", "estimatedQuantity"]
                },
                description: "Uma lista com os 2 produtos mais prováveis de vender."
            },
            confidenceScore: { type: Type.NUMBER, description: "Pontuação de confiança geral na previsão (0-100)." },
            insight: { type: Type.STRING, description: "Um breve insight sobre a análise." }
        },
        required: ["predictedProducts", "confidenceScore", "insight"]
    };

    const response = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    if (response.text) {
      try {
        const parsedJson = JSON.parse(response.text.trim());
        // Basic validation
        if (parsedJson.predictedProducts && typeof parsedJson.confidenceScore === 'number' && parsedJson.insight) {
            return parsedJson as ForecastData;
        }
      } catch (e) {
        console.error("AI Forecast JSON Parse Error:", e, "Raw Text:", response.text);
        return null;
      }
    }
    return null;

  } catch (error) {
    console.error("AI Sales Forecast API Error:", error);
    return null;
  }
};
