

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { MercadoPagoConfig, Preference, Payment } from "npm:mercadopago";

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Get the MP Access Token from Secrets
    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
        console.error("Missing MP_ACCESS_TOKEN secret");
        throw new Error("MP_ACCESS_TOKEN is missing. Please set it in Supabase Edge Function Secrets.");
    }

    // 2. Parse Request Body
    // UPDATED: Now accepting orderId and origin
    const { amount, description, payerEmail, method, back_urls, orderId, origin } = await req.json();

    // 3. Initialize Mercado Pago
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });

    // ---------------------------------------------------------
    // A. PIX NATIVE PAYMENT (QRCode Inline)
    // ---------------------------------------------------------
    if (method === 'pix') {
        const payment = new Payment(client);
        
        console.log("Creating Pix Payment...");

        const result = await payment.create({
            body: {
                transaction_amount: Number(amount),
                description: description || "Pedido Chegoou Delivery",
                payment_method_id: 'pix',
                // Link Pix to Order ID as well
                external_reference: orderId,
                payer: {
                    email: payerEmail || "customer@email.com"
                }
            }
        });

        if (!result.point_of_interaction) {
            throw new Error("Pix generated but no QR Code returned from Mercado Pago.");
        }

        const poi = result.point_of_interaction;
        
        return new Response(
            JSON.stringify({
                success: true,
                status: result.status, // 'pending'
                id: result.id,
                qrCode: poi.transaction_data?.qr_code, // Copy & Paste Code
                qrCodeBase64: poi.transaction_data?.qr_code_base64, // Image Data
                copyPaste: poi.transaction_data?.qr_code,
                ticketUrl: result.point_of_interaction?.transaction_data?.ticket_url // Link to Receipt
            }),
            { 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200 
            }
        );
    }

    // ---------------------------------------------------------
    // B. CHECKOUT PRO PREFERENCE (Cards / General)
    // ---------------------------------------------------------
    const preference = new Preference(client);

    // Dynamic Back URLs based on origin passed from Frontend
    const successUrl = origin ? `${origin}` : (back_urls?.success || "http://localhost:5173");
    const failureUrl = origin ? `${origin}` : (back_urls?.failure || "http://localhost:5173");
    const pendingUrl = origin ? `${origin}` : (back_urls?.pending || "http://localhost:5173");

    const result = await preference.create({
      body: {
        items: [
          {
            id: orderId || `ord-${Date.now()}`,
            title: description || "Pedido Chegoou Delivery",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "BRL"
          }
        ],
        payer: {
          email: payerEmail || "customer@email.com"
        },
        // Link the payment to the Order ID so we can identify it on return
        external_reference: orderId,
        back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl
        },
        auto_return: "approved"
      }
    });

    console.log("Preference created:", result.id);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'pending', 
        id: result.id,
        init_point: result.init_point, 
        sandbox_init_point: result.sandbox_init_point, 
        ticketUrl: result.init_point 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: any) {
    console.error("Error creating payment:", error.message);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal Server Error",
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
