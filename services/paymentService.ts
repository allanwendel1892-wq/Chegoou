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
    cardToken?: string
  ): Promise<PaymentResponse> {
    
    // 1. Dinheiro é tratado localmente (não requer API)
    if (method === 'cash') {
      return { success: true, status: 'pending', message: 'Pagamento na entrega (Dinheiro)' };
    }

    try {
      console.log(`[PaymentService] Iniciando transação real via ${method} para ${user.email}`);

      // URL base da aplicação
      const currentUrl = window.location.origin;

      // 2. Chamada Real ao Backend
      // ADIÇÃO IMPORTANTE: Headers explícitos para evitar 401
      const { data, error } = await supabase.functions.invoke('create-payment', {
        body: {
          amount,
          method,
          payerEmail: user.email,
          description,
          token: cardToken,
          // Configuração para Checkout Pro:
          returnUrl: currentUrl,
          back_urls: {
            success: currentUrl,
            failure: currentUrl,
            pending: currentUrl
          }
        },
        headers: {
            // CRÍTICO: FORÇA o envio da Anon Key no cabeçalho Authorization.
            // Isso sobrescreve o token de usuário logado (que pode causar 401 se a Edge Function não validar o usuário).
            // A Edge Function aceitará a requisição se 'verify_jwt' estiver ativo mas validando a chave do projeto.
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
      });

      // 3. Tratamento de Erros de Infraestrutura (Supabase/Rede)
      if (error) {
        console.error("[PaymentService] Erro na Edge Function:", error);
        
        let msg = "Erro de comunicação com o servidor de pagamento.";
        let technicalDetail = error.message || 'Erro 500/400';

        // Diagnóstico Específico para o Usuário
        if (technicalDetail.includes("non-2xx") || technicalDetail.includes("401")) {
            msg = "Erro 401/500: Falha de Autorização ou Servidor.";
            technicalDetail = "A Edge Function rejeitou a conexão (401). O app agora está enviando a chave ANON explicitamente. Verifique se o Segredo do Mercado Pago está configurado no painel do Supabase.";
        } else if (technicalDetail.includes("Function not found")) {
            msg = "Função não encontrada.";
            technicalDetail = "A função 'create-payment' não foi implantada no Supabase.";
        }

        throw new Error(`${msg}\n\nDetalhe Técnico: ${technicalDetail}`);
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
        qrCodeBase64: data.qrCodeBase64, // Mapping new field
        copyPaste: data.qrCode || data.copyPaste, // Mapping new field
        ticketUrl: data.ticketUrl || data.init_point, // Suporte a init_point do Checkout Pro
        message: data.status === 'approved' ? 'Pagamento Aprovado' : 'Aguardando Pagamento'
      };

    } catch (e: any) {
      console.error("[PaymentService] Falha Crítica:", e);
      // Repassa o erro para ser exibido no Alert do App.tsx
      throw e; 
    }
  }
};