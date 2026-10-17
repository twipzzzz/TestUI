// ============================================================================
// db.js — camada de acesso a dados via Supabase
// (equivalente ao database.py da versão desktop; toda query passa por aqui)
// ============================================================================

import { supabase } from "./supabaseClient.js";

function lancarSeErro(error, mensagemPadrao) {
  if (!error) return;
  if (error.code === "23505") throw new Error("Já existe um registro com esse nome.");
  throw new Error(error.message || mensagemPadrao);
}

// ------------------------------------------------------------------
// Perfil (nome exibido na barra lateral)
// ------------------------------------------------------------------
export async function obterMeuPerfil() {
  const { data: sessao } = await supabase.auth.getSession();
  const uid = sessao.session?.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).single();
  lancarSeErro(error, "Não foi possível carregar o perfil.");
  return data;
}

// ------------------------------------------------------------------
// Categorias
// ------------------------------------------------------------------
export async function listarCategorias(tipo = null) {
  const { data, error } = await supabase.from("categorias").select("nome, tipo").order("nome");
  lancarSeErro(error, "Não foi possível carregar as categorias.");
  if (!tipo || tipo === "Ambos") return data.map((c) => c.nome);
  return data.filter((c) => c.tipo === tipo || c.tipo === "Ambos").map((c) => c.nome);
}

export async function listarCategoriasCompletas() {
  const { data, error } = await supabase.from("categorias").select("nome, tipo").order("tipo").order("nome");
  lancarSeErro(error, "Não foi possível carregar as categorias.");
  return data;
}

export async function adicionarCategoria(nome, tipo) {
  nome = (nome || "").trim();
  if (!nome) throw new Error("O nome da categoria não pode ficar vazio.");
  const { error } = await supabase.from("categorias").insert({ nome, tipo });
  lancarSeErro(error, "Não foi possível adicionar a categoria.");
}

export async function editarCategoria(nomeAntigo, novoNome, novoTipo) {
  novoNome = (novoNome || "").trim();
  if (!novoNome) throw new Error("O nome da categoria não pode ficar vazio.");
  const { error } = await supabase
    .from("categorias")
    .update({ nome: novoNome, tipo: novoTipo })
    .eq("nome", nomeAntigo);
  lancarSeErro(error, "Não foi possível editar a categoria.");

  if (novoNome !== nomeAntigo) {
    const { error: erroLancamentos } = await supabase
      .from("lancamentos")
      .update({ categoria: novoNome })
      .eq("categoria", nomeAntigo);
    lancarSeErro(erroLancamentos, "Categoria renomeada, mas houve um problema ao atualizar lançamentos antigos.");
  }
}

export async function excluirCategoria(nome) {
  const { error } = await supabase.from("categorias").delete().eq("nome", nome);
  lancarSeErro(error, "Não foi possível excluir a categoria.");
}

// ------------------------------------------------------------------
// Contas bancárias
// ------------------------------------------------------------------
export async function listarContas() {
  const { data, error } = await supabase.from("contas").select("id, nome, banco, tipo, cor").order("nome");
  lancarSeErro(error, "Não foi possível carregar as contas.");
  return data;
}

export async function adicionarConta(nome, banco, tipo) {
  nome = (nome || "").trim();
  if (!nome) throw new Error("O nome da conta não pode ficar vazio.");
  const { error } = await supabase.from("contas").insert({ nome, banco: (banco || "").trim() || null, tipo });
  lancarSeErro(error, "Não foi possível adicionar a conta.");
}

export async function editarConta(id, novoNome, novoBanco, novoTipo) {
  novoNome = (novoNome || "").trim();
  if (!novoNome) throw new Error("O nome da conta não pode ficar vazio.");
  const { error } = await supabase
    .from("contas")
    .update({ nome: novoNome, banco: (novoBanco || "").trim() || null, tipo: novoTipo })
    .eq("id", id);
  lancarSeErro(error, "Não foi possível editar a conta.");
}

export async function excluirConta(id) {
  const { error } = await supabase.from("contas").delete().eq("id", id);
  lancarSeErro(error, "Não foi possível excluir a conta.");
}

// ------------------------------------------------------------------
// Lançamentos
// ------------------------------------------------------------------
export async function listarLancamentos() {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, data, descricao, tipo, categoria, valor, conta_id")
    .order("data", { ascending: false })
    .order("id", { ascending: false });
  lancarSeErro(error, "Não foi possível carregar os lançamentos.");
  return data;
}

export async function inserirLancamento({ data, descricao, tipo, categoria, valor, conta_id }) {
  const { error } = await supabase
    .from("lancamentos")
    .insert({ data, descricao: descricao.trim(), tipo, categoria, valor, conta_id: conta_id || null });
  lancarSeErro(error, "Não foi possível salvar o lançamento.");
}

export async function atualizarLancamento(id, { data, descricao, tipo, categoria, valor, conta_id }) {
  const { error } = await supabase
    .from("lancamentos")
    .update({ data, descricao: descricao.trim(), tipo, categoria, valor, conta_id: conta_id || null })
    .eq("id", id);
  lancarSeErro(error, "Não foi possível atualizar o lançamento.");
}

export async function excluirLancamento(id) {
  const { error } = await supabase.from("lancamentos").delete().eq("id", id);
  lancarSeErro(error, "Não foi possível excluir o lançamento.");
}

export async function buscarLancamento(id) {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, data, descricao, tipo, categoria, valor, conta_id")
    .eq("id", id)
    .single();
  lancarSeErro(error, "Lançamento não encontrado.");
  return data;
}
