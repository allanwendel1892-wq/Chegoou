
import { supabase, SUPABASE_ANON_KEY } from './supabaseClient';
import { User } from '../types';

export interface PaymentResponse {
  success: boolean;
  status: 'approved' | 'pending' | 'rejected' | 'in_process';
  paymentId?: string;
  qrCode?: string; // Base64 image or text
  qrCodeBase64?: string; // Explicit Base64 Image
  copyPaste?: string; // Pix Copy Paste
  ticketUrl?: string; // For Boleto or External Redirect (Checkout Pro)
  message?: string;
}

/**
 * ATENÇÃO - INSTRUÇÕES PARA O BACKEND (EDGE FUNCTION):
 * 
 * Para que este serviço funcione, você deve fazer o deploy do código da função 'create-payment'.
 * 
 * Comando para deploy:
 * > supabase functions deploy create-payment --no-verify-jwt
 * 
 * Certifique-se de que o arquivo 'supabase/functions/create-payment/index.ts' 
 * contenha o código que utiliza 'npm:mercadopago' e 'Preference'.
 */

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
    orderId?: string, // NEW: Required for Checkout Pro tracking
    cardToken?: string
  ): Promise<PaymentResponse> {
    
    // 1. Dinheiro é tratado localmente (não requer API)
    if (method === 'cash') {
      return { success: true, status: 'pending', message: 'Pagamento na entrega (Dinheiro)' };
    }

    try {
      console.log(`[PaymentService] Iniciando transação real via ${method} para ${user.email}`);

      // URL base da aplicação (para retorno do Checkout Pro)
      // Remove barra final se existir para evitar urls mal formadas
      const currentUrl = window.location.origin.replace(/\/$/, "");

      console.log(`[PaymentService] Ambiente: ${currentUrl}`);

      // 2. Chamada Real ao Backend
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken,
          orderId: orderId, // Send Order ID to backend
          origin: currentUrl, // Send Origin for dynamic redirect
        },
        headers: {
            // CRÍTICO: FORÇA o envio da Anon Key no cabeçalho Authorization.
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      // 3. Tratamento de Erros de Infraestrutura (Supabase/Rede)
      if (error) {
        console.error("[PaymentService] Erro na Edge Function:", error);
        
        // Mensagem amigável para erro de Configuração (Secrets faltando)
        if (error.message && error.message.includes("MP_ACCESS_TOKEN")) {
             throw new Error("Erro de Configuração: O Token do Mercado Pago não foi configurado no Supabase (Secrets).");
        }
        
        let msg = "Erro de comunicação com o servidor de pagamento.";
        // Tenta extrair o corpo do erro se for um objeto JSON stringificado
        try {
            const body = JSON.parse(error.message);
            if (body.error) msg = body.error;
        } catch (e) {
            msg = error.message || "Erro desconhecido.";
        }

        throw new Error(`Falha no Servidor: ${msg}`);
      }

      // 4. Tratamento de Erros de Negócio (Mercado Pago recusou)
      if (!data || !data.success) {
         console.warn("[PaymentService] Recusa do Gateway:", data);
         throw new Error(data?.error || "Pagamento recusado pelo processador.");
      }

      console.log("[PaymentService] Sucesso:", data);

      // 5. Sucesso Real
      return {
        success: true,
        status: data.status,
        paymentId: data.id,
        qrCodeBase64: data.qrCodeBase64, // Mapping new field
        copyPaste: data.qrCode || data.copyPaste, // Mapping new field
        ticketUrl: data.ticketUrl || data.init_point, // Suporte a init_point do Checkout Pro
        message: data.status === 'approved' ? 'Pagamento Aprovado' : 'Aguardando Pagamento'
      };

    } catch (e: any) {
      console.error("[PaymentService] Falha Crítica:", e);
      throw e; 
    }
  }
};
