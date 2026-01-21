import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// CONFIGURAÇÃO DO SUPABASE
// ------------------------------------------------------------------

const SUPABASE_URL = 'https://shpdyqsrqudtwagqwart.supabase.co'; 

// ATENÇÃO: Chave Atualizada conforme fornecido.
// Esta chave (JWT) permite acesso público (Anon) às Edge Functions e Tabelas (respeitando RLS).
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNocGR5cXNycXVkdHdhZ3F3YXJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjUzNTMsImV4cCI6MjA4MzgwMTM1M30.XbgCQEruRiN7rMu_8L7dTpThKv59iYoQktoy2-aYncw';

// Diagnóstico de Chave no Console
if (!SUPABASE_ANON_KEY.startsWith('eyJ')) {
    console.warn("⚠️ ALERTA SUPABASE: A chave API fornecida não parece ser um JWT padrão do Supabase (não começa com 'eyJ'). Se os dados não carregarem ou der erro 401, verifique a chave 'anon' no painel.");
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