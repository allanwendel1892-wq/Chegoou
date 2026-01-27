
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
    if (!MP_TOKEN) {
      throw new Error("MP_ACCESS_TOKEN não configurado no Supabase.");
    }

    let body = {};
    try {
        body = await req.json();
    } catch(e) {
        // If body is empty or invalid JSON, ignore (body stays empty)
    }
    
    // Extrair action (padrão é 'create' se não vier nada)
    const { action = 'create', paymentId, amount, payerEmail, description, method, orderId, origin } = body as any;

    // =================================================================
    // AÇÃO: ESTORNO (REFUND)
    // =================================================================
    if (action === 'refund') {
      if (!paymentId) {
        return new Response(JSON.stringify({ error: "Payment ID é obrigatório para estorno." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`Iniciando estorno para pagamento: ${paymentId}`);

      // Endpoint de Reembolso Total do Mercado Pago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${MP_TOKEN}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({}) // Empty body for full refund
      });

      const result = await response.json();

      if (!response.ok) {
        console.error("Erro MP Refund:", result);
        return new Response(JSON.stringify({ success: false, error: result.message || "Erro ao processar estorno no Mercado Pago" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        success: true,
        status: result.status, // 'approved' geralmente
        refundId: result.id
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // =================================================================
    // AÇÃO: CRIAR PAGAMENTO (CREATE)
    // =================================================================
    else {
      if (!amount || !payerEmail) {
        return new Response(JSON.stringify({ error: "Dados ausentes (amount ou email)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
            description: description || 'Pedido Chegoou',
            payment_method_id: 'pix',
            payer: { email: payerEmail.trim() },
            external_reference: orderId, // Vinculo Importante
            notification_url: "https://seusite.com/api/webhook" // Opcional
          }),
        });

        const result = await response.json();
        
        if (!response.ok) {
             throw new Error(result.message || "Erro ao criar Pix");
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
              id: orderId,
              title: description || 'Pedido Chegoou',
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
              excluded_payment_methods: [{ id: 'ticket' }],
              excluded_payment_types: [{ id: 'bank_transfer' }],
              installments: 12
            }
          }),
        });

        const result = await response.json();
        
        if (!response.ok) {
             throw new Error(result.message || "Erro ao criar Preferência");
        }

        return new Response(JSON.stringify({
          success: true,
          status: 'pending',
          ticketUrl: result.init_point, // URL de redirecionamento
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

  } catch (error: any) {
    console.error("Critical Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
})
    