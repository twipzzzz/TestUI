// ============================================================================
// db-compartilhado.js — acesso a dados do orçamento compartilhado
// ============================================================================

import { supabase } from "./supabaseClient.js";

const TAMANHO_PAGINA = 1000; // limite padrão de linhas por consulta no Supabase
const IDS_POR_LOTE = 100; // evita URLs enormes ao filtrar com .in(...)

function lancarSeErro(error, mensagemPadrao) {
  if (!error) return;
  throw new Error(error.message || mensagemPadrao);
}

/**
 * Busca TODAS as linhas de uma consulta, página por página. Sem isso, o
 * Supabase corta o resultado em 1000 linhas sem avisar — o que deixaria os
 * saldos errados em silêncio.
 */
async function buscarTudo(montarConsulta, mensagemErro) {
  const linhas = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await montarConsulta().range(inicio, inicio + TAMANHO_PAGINA - 1);
    lancarSeErro(error, mensagemErro);
    linhas.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
  }
  return linhas;
}

/** Retorna o id (uuid) do usuário logado, ou null. */
export async function obterMeuId() {
  const { data: sessao } = await supabase.auth.getSession();
  return sessao.session?.user?.id || null;
}

/** Retorna {id, nome} do grupo do usuário logado, ou null se ele ainda não faz parte de nenhum. */
export async function obterMeuGrupo() {
  const uid = await obterMeuId();
  if (!uid) return null;

  const { data: linhasMembro, error } = await supabase.from("membros_grupo").select("grupo_id").eq("user_id", uid);
  lancarSeErro(error, "Não foi possível verificar seu grupo compartilhado.");
  if (!linhasMembro.length) return null;

  const { data: grupo, error: erroGrupo } = await supabase
    .from("grupos")
    .select("id, nome")
    .eq("id", linhasMembro[0].grupo_id)
    .single();
  lancarSeErro(erroGrupo, "Não foi possível carregar o grupo compartilhado.");
  return grupo;
}

export async function criarGrupo(nome) {
  const { data, error } = await supabase.rpc("criar_grupo_compartilhado", { p_nome: nome || "Orçamento Compartilhado" });
  lancarSeErro(error, "Não foi possível criar o grupo.");
  return data;
}

export async function adicionarMembro(grupoId, email) {
  const { error } = await supabase.rpc("adicionar_membro_grupo", { p_grupo_id: grupoId, p_email: email });
  lancarSeErro(error, "Não foi possível adicionar essa pessoa ao grupo.");
}

/** Retorna [{id, nome, icone}] dos membros do grupo. */
export async function listarMembros(grupoId) {
  const { data: membros, error } = await supabase.from("membros_grupo").select("user_id").eq("grupo_id", grupoId);
  lancarSeErro(error, "Não foi possível carregar os membros do grupo.");
  const ids = membros.map((m) => m.user_id);
  if (ids.length === 0) return [];

  const { data: perfis, error: erroPerfis } = await supabase.from("profiles").select("id, nome, icone").in("id", ids);
  lancarSeErro(erroPerfis, "Não foi possível carregar os perfis dos membros.");
  return perfis;
}

export async function listarDespesas(grupoId) {
  return buscarTudo(
    () =>
      supabase
        .from("despesas_compartilhadas")
        .select("id, descricao, valor_total, pago_por, categoria, data")
        .eq("grupo_id", grupoId)
        .order("data", { ascending: false })
        .order("id", { ascending: false }),
    "Não foi possível carregar as despesas compartilhadas."
  );
}

export async function listarTodasDivisoes(idsDespesas) {
  if (!idsDespesas.length) return [];
  const resultado = [];
  for (let i = 0; i < idsDespesas.length; i += IDS_POR_LOTE) {
    const lote = idsDespesas.slice(i, i + IDS_POR_LOTE);
    const linhas = await buscarTudo(
      () =>
        supabase
          .from("divisao_despesa")
          .select("despesa_id, user_id, valor_devido")
          .in("despesa_id", lote)
          .order("despesa_id")
          .order("user_id"),
      "Não foi possível carregar a divisão das despesas."
    );
    resultado.push(...linhas);
  }
  return resultado;
}

/**
 * Insere a despesa e sua divisão numa única operação lógica. Se a divisão
 * falhar por algum motivo, desfaz a despesa para não deixar dado pela metade.
 */
export async function inserirDespesa({ grupo_id, descricao, valor_total, pago_por, categoria, data }, divisoes) {
  const { data: despesaInserida, error } = await supabase
    .from("despesas_compartilhadas")
    .insert({
      grupo_id,
      descricao: descricao.trim(),
      valor_total,
      pago_por,
      categoria: categoria || null,
      data,
    })
    .select()
    .single();
  lancarSeErro(error, "Não foi possível salvar a despesa.");

  const linhasDivisao = divisoes.map((d) => ({
    despesa_id: despesaInserida.id,
    user_id: d.user_id,
    valor_devido: d.valor,
  }));
  const { error: erroDivisao } = await supabase.from("divisao_despesa").insert(linhasDivisao);
  if (erroDivisao) {
    await supabase.from("despesas_compartilhadas").delete().eq("id", despesaInserida.id);
    lancarSeErro(erroDivisao, "Não foi possível salvar a divisão da despesa.");
  }
  return despesaInserida.id;
}

export async function excluirDespesa(id) {
  const { error } = await supabase.from("despesas_compartilhadas").delete().eq("id", id);
  lancarSeErro(error, "Não foi possível excluir a despesa.");
}

export async function listarPagamentos(grupoId) {
  return buscarTudo(
    () =>
      supabase
        .from("pagamentos")
        .select("id, de_user_id, para_user_id, valor, data, observacao")
        .eq("grupo_id", grupoId)
        .order("data", { ascending: false })
        .order("id", { ascending: false }),
    "Não foi possível carregar os pagamentos."
  );
}

export async function inserirPagamento({ grupo_id, de_user_id, para_user_id, valor, data, observacao }) {
  const { error } = await supabase
    .from("pagamentos")
    .insert({ grupo_id, de_user_id, para_user_id, valor, data, observacao: observacao || null });
  lancarSeErro(error, "Não foi possível registrar o pagamento.");
}

export async function excluirPagamento(id) {
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  lancarSeErro(error, "Não foi possível excluir o pagamento.");
}
