import { supabase } from './supabaseClient';
import { User } from '../types';

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
   * STRICT MODE: No simulations. Fails if backend fails.
   */
  async processPayment(
    amount: number, 
    method: 'pix' | 'card' | 'cash', 
    user: User, 
    description: string,
    cardToken?: string
  ): Promise<PaymentResponse> {
    
    // 1. Dinheiro é tratado localmente (não requer API)
    if (method === 'cash') {
      return { success: true, status: 'pending', message: 'Pagamento na entrega (Dinheiro)' };
    }

    try {
      console.log(`[PaymentService] Iniciando transação real via ${method} para ${user.email}`);

      // 2. Chamada Real ao Backend
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken
        }
      });

      // 3. Tratamento de Erros de Infraestrutura (Supabase/Rede)
      if (error) {
        console.error("[PaymentService] Erro na Edge Function:", error);
        
        let msg = "Erro de comunicação com o servidor de pagamento.";
        let technicalDetail = error.message || 'Erro 500/400';

        // Diagnóstico Específico para o Usuário
        if (technicalDetail.includes("non-2xx")) {
            msg = "Falha na Configuração do Mercado Pago (Erro 500).";
            technicalDetail = "Provavelmente o TOKEN de acesso (MP_ACCESS_TOKEN) não foi configurado nos Secrets do Supabase, ou está inválido.";
        } else if (technicalDetail.includes("Function not found")) {
            msg = "Servidor de pagamento não encontrado.";
            technicalDetail = "A função 'create-payment' não foi implantada (deploy).";
        }

        throw new Error(`${msg} \n\nDiagnóstico: ${technicalDetail}`);
      }

      // 4. Tratamento de Erros de Negócio (Mercado Pago recusou)
      if (!data || !data.success) {
         console.warn("[PaymentService] Recusa do Gateway:", data);
         throw new Error(data?.error || "Pagamento recusado pelo processador.");
      }

      // 5. Sucesso Real
      return {
        success: true,
        status: data.status,
        paymentId: data.id,
        qrCode: data.qrCodeBase64,
        copyPaste: data.qrCode,
        ticketUrl: data.ticketUrl,
        message: data.status === 'approved' ? 'Pagamento Aprovado' : 'Aguardando Pagamento'
      };

    } catch (e: any) {
      console.error("[PaymentService] Falha Crítica:", e);
      return { 
        success: false, 
        status: 'rejected', 
        message: e.message || "Erro desconhecido no processamento."
      };
    }
  }
};