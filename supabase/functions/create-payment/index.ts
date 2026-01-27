
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Evita erro de 'Deno is not defined' no editor
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Lidar com Preflight Request do CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) {
      console.error("Erro: MP_ACCESS_TOKEN não encontrado.");
      return new Response(JSON.stringify({ error: "Erro de configuração do servidor (Token ausente)." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Parse body robustamente
    let body: any = {};
    try {
        const text = await req.text();
        if (text) body = JSON.parse(text);
    } catch (e) {
        console.error("Erro parsing body:", e);
    }
    
    const { 
      action = 'create', 
      paymentId, 
      amount, 
      payerEmail, 
      description = 'Pedido Chegoou', 
      method, 
      orderId, 
      origin 
    } = body;

    console.log(`Action: ${action}, Method: ${method}`);

    // =================================================================
    // AÇÃO: ESTORNO (REFUND)
    // =================================================================
    if (action === 'refund') {
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "ID do pagamento é obrigatório para estorno." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`Iniciando estorno para pagamento ID: ${paymentId}`);

      // Chamada para a API de Reembolso do Mercado Pago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({}) // Body vazio = reembolso total
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Erro MP Refund:", result);
        return new Response(JSON.stringify({ 
            success: false, 
            error: result.message || "Erro ao processar estorno no Mercado Pago" 
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        status: result.status, // Geralmente 'approved'
        refundId: result.id
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =================================================================
    // AÇÃO: CRIAR PAGAMENTO (CREATE)
    // =================================================================
    else {
        // Validação básica para criação
        if (!amount || !payerEmail) {
            return new Response(JSON.stringify({ error: "Dados ausentes (Valor ou Email)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- LÓGICA PIX: CHECKOUT TRANSPARENTE ---
        if (method === 'pix') {
            const response = await fetch("https://api.mercadopago.com/v1/payments", {
                method: "POST",
                headers: {
                "Authorization": `Bearer ${MP_TOKEN}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": crypto.randomUUID(),
                },
                body: JSON.stringify({
                transaction_amount: Number(amount),
                description: description,
                payment_method_id: 'pix',
                payer: { email: payerEmail.trim() },
                external_reference: orderId, // Vincula ao pedido
                notification_url: "https://seusite.com/api/webhook" // Opcional (Webhook)
                }),
            });

            const result = await response.json();
            
            if (!response.ok) {
                console.error("Erro MP Pix:", result);
                return new Response(JSON.stringify({ error: result.message || "Erro ao criar Pix" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            return new Response(JSON.stringify({
                success: true,
                status: result.status,
                id: result.id,
                qrCode: result.point_of_interaction?.transaction_data?.qr_code,
                qrCodeBase64: result.point_of_interaction?.transaction_data?.qr_code_base64,
                ticketUrl: result.transaction_details?.external_resource_url
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // --- LÓGICA CARTÃO: CHECKOUT PRO (REDIRECT) ---
        else {
            const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
                method: "POST",
                headers: {
                "Authorization": `Bearer ${MP_TOKEN}`,
                "Content-Type": "application/json",
                },
                body: JSON.stringify({
                items: [{
                    title: description,
                    quantity: 1,
                    unit_price: Number(amount),
                    currency_id: 'BRL'
                }],
                payer: { email: payerEmail.trim() },
                external_reference: orderId,
                back_urls: {
                    success: origin || '',
                    failure: origin || '',
                    pending: origin || ''
                },
                auto_return: "approved",
                payment_methods: {
                    excluded_payment_methods: [{ id: 'ticket' }], // Remove boleto
                    excluded_payment_types: [{ id: 'bank_transfer' }],
                    installments: 12
                }
                }),
            });

            const result = await response.json();
            
            if (!response.ok) {
                console.error("Erro MP Preference:", result);
                return new Response(JSON.stringify({ error: result.message || "Erro ao criar Preferência" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            return new Response(JSON.stringify({
                success: true,
                ticketUrl: result.init_point, // URL de redirecionamento
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
    }

  } catch (error: any) {
    console.error("Edge Function Critical Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno no servidor de pagamento" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
})
    