import { createClient } from '@supabase/supabase-js';

// ------------------------------------------------------------------
// NOVA CONFIGURAÇÃO (APONTANDO PARA O EASYPANEL)
// ------------------------------------------------------------------

// COLOQUE AQUI O LINK DO SEU CHEGOOU-API DO EASYPANEL (MANTENHA AS ASPAS)
const SUPABASE_URL = 'https://modo-fila-chegoou-api.znzrqn.easypanel.host/'; 

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
