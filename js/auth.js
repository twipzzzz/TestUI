// ============================================================================
// auth.js — cadastro, login, logout e observação de sessão via Supabase Auth
// ============================================================================

import { supabase } from "./supabaseClient.js";

/** Cria uma nova conta. Supabase pode exigir confirmação por e-mail
 * (configurável no painel) antes do login funcionar. */
export async function cadastrar({ nome, email, senha }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome } },
  });
  if (error) throw new Error(traduzirErroAuth(error));
  // Se a confirmação por e-mail estiver ativa, `session` vem nulo aqui.
  const precisaConfirmarEmail = !data.session;
  return { precisaConfirmarEmail };
}

export async function entrar({ email, senha }) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(traduzirErroAuth(error));
}

export async function sair() {
  await supabase.auth.signOut();
}

export async function obterSessaoAtual() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Chama `callback(sessao|null)` sempre que o estado de login mudar. */
export function aoMudarSessao(callback) {
  supabase.auth.onAuthStateChange((_evento, sessao) => callback(sessao));
}

function traduzirErroAuth(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("user already registered")) return "Já existe uma conta com esse e-mail.";
  if (msg.includes("password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email")) return "E-mail inválido.";
  if (msg.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).";
  return error?.message || "Não foi possível completar a operação. Tente novamente.";
}
