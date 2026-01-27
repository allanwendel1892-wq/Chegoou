
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

// Hardcoded for robustness against client config issues
const FUNCTION_URL = 'https://shpdyqsrqudtwagqwart.supabase.co/functions/v1/create-payment';

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

      // Ensure amount is valid and has max 2 decimal places
      const safeAmount = Number(amount.toFixed(2));

      if (safeAmount <= 0) {
        throw new Error("Valor do pagamento inválido (deve ser maior que zero).");
      }

      // Use native fetch instead of supabase.functions.invoke to avoid client library wrapper issues
      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          amount: safeAmount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken,
          orderId: orderId,
          origin: currentUrl,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorJson;
        try {
            errorJson = JSON.parse(errorText);
        } catch (e) {
            // Ignore parse error
        }
        
        console.error("[PaymentService] Erro HTTP:", response.status, errorText);
        throw new Error(errorJson?.error || `Erro de comunicação: ${response.status}`);
      }

      const data = await response.json();

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

          const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'refund',
              paymentId: paymentId
            })
          });

          if (!response.ok) {
             const errorText = await response.text();
             throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
          }

          const data = await response.json();

          if (!data.success) throw new Error(data?.error || "Falha ao processar estorno.");

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
