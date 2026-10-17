// ============================================================================
// supabaseClient.js — configuração de conexão com o Supabase
// ============================================================================
// PREENCHA os dois valores abaixo com os dados do SEU projeto Supabase:
// Painel do Supabase → Project Settings → API → "Project URL" e "anon public".
// Essas duas informações são seguras para ficar no código do navegador (a
// proteção de verdade é feita pelas regras de RLS no banco de dados).

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://qqxgcxlxyndunvynxtdd.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeGdjeGx4eW5kdW52eW54dGRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzMxMDksImV4cCI6MjEwNDU0OTEwOX0.phCJl5sn_XCvyQy1L923oq-AhVfyXpjT-am0TAwFCKw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
