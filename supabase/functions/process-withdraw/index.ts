import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS preflight request (OPTIONS)
  // Isso resolve o erro "Response to preflight request doesn't pass access control check"
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Initialize Supabase Client (Admin Context)
    // Usa a Service Role Key para ter permissão de escrita na tabela de saques
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Parse Body
    const { amount, pixKey, pixKeyType, userId, userName } = await req.json()

    // 4. Validate Data
    if (!amount || !pixKey || !userId) {
      return new Response(
        JSON.stringify({ error: 'Dados insuficientes para o saque.' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Insert into Database
    const { data, error } = await supabaseAdmin
      .from('withdrawal_requests')
      .insert([
        {
          userId,
          userName,
          userType: 'partner',
          amount: parseFloat(amount),
          status: 'pending',
          date: new Date().toISOString(),
          bankInfo: `${pixKeyType || 'Pix'}: ${pixKey}`
        }
      ])
      .select()

    if (error) {
      console.error('DB Error:', error)
      throw new Error('Falha ao registrar solicitação no banco de dados.')
    }

    // 6. Return Success
    return new Response(
      JSON.stringify({ success: true, message: 'Saque solicitado com sucesso!', data }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Function Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})