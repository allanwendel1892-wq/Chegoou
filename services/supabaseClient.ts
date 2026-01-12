import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------------

const SUPABASE_URL = 'https://shpdyqsrqudtwagqwart.supabase.co'; 

// ATENÇÃO: A chave padrão do Supabase (anon/public) geralmente começa com "eyJ..." (Formato JWT).
// A chave fornecida "sb_publishable..." pode não funcionar para operações de banco de dados direto.
// Se tiver erro 401 ou tabelas vazias, troque pela chave 'anon' em: Project Settings > API.
const SUPABASE_ANON_KEY = 'sb_publishable_WesGHZLCpYEPGklcXopkRw_YG2S7z12';

// Diagnóstico de Chave no Console
if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
    console.warn("⚠️ ALERTA SUPABASE: A chave API fornecida não parece ser um JWT padrão do Supabase (não começa com 'eyJ'). Se os dados não carregarem, verifique a chave 'anon' no painel.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
});