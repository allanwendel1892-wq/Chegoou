
import { supabase, SUPABASE_ANON_KEY } from './supabaseClient';
import { User } from '../types';

export interface PaymentResponse {
  success: boolean;
  status: 'approved' | 'pending' | 'rejected' | 'in_process' | 'refunded' | 'cancelled';
  paymentId?: string;
  qrCode?: string; // Base64 image or text
  qrCodeBase64?: string; // Explicit Base64 Image
  copyPaste?: string; // Pix Copy Paste
  ticketUrl?: string; // For Boleto or External Redirect (Checkout Pro)
  message?: string;
}

export const PaymentService = {
  /**
   * Process a REAL payment request via Supabase Edge Functions.
   */
  async processPayment(
    amount: number, 
    method: 'pix' | 'card' | 'cash', 
    user: User, 
    description: string,
    orderId?: string,
    cardToken?: string
  ): Promise<PaymentResponse> {
    
    if (method === 'cash') {
      return { success: true, status: 'pending', message: 'Pagamento na entrega (Dinheiro)' };
    }

    try {
      console.log(`[PaymentService] Iniciando transação real via ${method}`);
      const currentUrl = window.location.origin.replace(/\/$/, "");

      // Send request to Edge Function
      // Note: Removed manual Authorization header to let Supabase client handle it
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          action: 'create',
          amount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken,
          orderId: orderId,
          origin: currentUrl,
        }
      });

      if (error) {
        console.error("[PaymentService] Erro na Edge Function:", error);
        throw new Error(error.message || "Erro de comunicação com o servidor de pagamento (Edge Function).");
      }

      if (!data || data.error) {
         throw new Error(data?.error || "Pagamento recusado pelo processador.");
      }

      return {
        success: true,
        status: data.status,
        paymentId: data.id,
        qrCodeBase64: data.qrCodeBase64,
        copyPaste: data.qrCode || data.copyPaste,
        ticketUrl: data.ticketUrl || data.init_point,
        message: 'Aguardando Pagamento'
      };

    } catch (e: any) {
      console.error("[PaymentService] Falha Crítica:", e);
      // Propagate error to be handled by UI
      throw e; 
    }
  },

  /**
   * Process a REFUND via Supabase Edge Functions.
   */
  async refundPayment(paymentId: string): Promise<PaymentResponse> {
      try {
          console.log(`[PaymentService] Iniciando estorno para Payment ID: ${paymentId}`);

          const { data, error } = await supabase.functions.invoke('create-payment', {
              body: {
                  action: 'refund', // IMPORTANTE: Define que é um estorno
                  paymentId: paymentId
              }
          });

          if (error) throw error;
          if (!data || !data.success) throw new Error(data?.error || "Falha ao processar estorno.");

          return {
              success: true,
              status: 'refunded',
              message: 'Estorno realizado com sucesso.'
          };

      } catch (e: any) {
          console.error("[PaymentService] Erro no Estorno:", e);
          return {
              success: false,
              status: 'rejected',
              message: e.message || "Erro ao estornar."
          };
      }
  }
};
