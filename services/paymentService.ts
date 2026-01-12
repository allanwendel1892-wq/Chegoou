import { supabase } from './supabaseClient';
import { Order, User } from '../types';

export interface PaymentResponse {
  success: boolean;
  status: 'approved' | 'pending' | 'rejected' | 'in_process';
  paymentId?: string;
  qrCode?: string; // Base64 image or text
  copyPaste?: string; // Pix Copy Paste
  ticketUrl?: string; // For Boleto or External Redirect
  message?: string;
}

export const PaymentService = {
  /**
   * Process a REAL payment request via Supabase Edge Functions.
   * Requires the 'create-payment' function to be deployed on Supabase.
   */
  async processPayment(
    amount: number, 
    method: 'pix' | 'card' | 'cash', 
    user: User, 
    description: string,
    cardToken?: string // Used only for card payments (requires MP CardForm implementation)
  ): Promise<PaymentResponse> {
    
    // 1. Dinheiro continua sendo aprovação imediata (pagamento na entrega)
    if (method === 'cash') {
      return { success: true, status: 'pending', message: 'Pagamento na entrega (Dinheiro)' };
    }

    try {
      console.log(`Iniciando pagamento real via ${method}...`);

      // 2. Chamada Real ao Backend
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken // Se for cartão, passamos o token seguro
        }
      });

      if (error) {
        console.error("Erro na Edge Function:", error);
        throw new Error(`Erro de conexão com servidor de pagamento: ${error.message}`);
      }

      if (!data || !data.success) {
         throw new Error(data?.error || "Pagamento rejeitado ou falha na criação.");
      }

      // 3. Sucesso: Retorna dados reais do Mercado Pago
      return {
        success: true,
        status: data.status,
        paymentId: data.id,
        qrCode: data.qrCodeBase64, // Imagem Base64 do QR Code
        copyPaste: data.qrCode,     // Código Copia e Cola
        ticketUrl: data.ticketUrl,
        message: data.status === 'approved' ? 'Pagamento Aprovado' : 'Aguardando Pagamento'
      };

    } catch (e: any) {
      console.error("PaymentService Error:", e);
      
      // Fallback de erro amigável para o usuário
      let userMessage = "Não foi possível processar o pagamento.";
      
      if (e.message.includes("FunctionsFetchError")) {
        userMessage = "Erro de configuração: A função 'create-payment' não foi encontrada no Supabase. Verifique se o deploy foi feito.";
      } else {
        userMessage = e.message;
      }

      return { 
        success: false, 
        status: 'rejected', 
        message: userMessage 
      };
    }
  }
};