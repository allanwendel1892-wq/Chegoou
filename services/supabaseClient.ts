import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// NOVA CONFIGURAÇÃO (APONTANDO PARA O EASYPANEL)
// ------------------------------------------------------------------

const SUPABASE_URL = 'https://chegoou-api.allanwendel-wq.easypanel.host'; 

export const SUPABASE_ANON_KEY = 'chave-temporaria-easypanel';

console.log("🟢 Conectado ao Servidor Próprio Easypanel");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public',
  },
});
