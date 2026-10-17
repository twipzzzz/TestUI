// ============================================================================
// db-fixas.js — despesas fixas (recorrentes) e geração dos lançamentos mensais
// ============================================================================
// Como funciona: a despesa fixa é um "modelo" (descrição, valor, dia do mês).
// A cada mês ele vira um lançamento REAL (com fixa_id preenchido), gerado
// automaticamente quando você abre o app ou navega para um mês. Como são
// lançamentos normais, aparecem no Dashboard/Histórico e podem ser editados
// ou excluídos individualmente (um mês excluído NÃO é recriado).
// ============================================================================

import { supabase } from "./supabaseClient.js";

const LIMITE_MESES_A_FRENTE = 24; // até onde o app gera lançamentos à frente do mês atual

let alvoSincronizado = -1; // evita consultar o banco de novo sem necessidade

function lancarSeErro(error, mensagemPadrao) {
  if (!error) return;
  throw new Error(error.message || mensagemPadrao);
}

const pad = (n) => String(n).padStart(2, "0");
const indiceMes = (ano, mes) => ano * 12 + (mes - 1); // mes: 1-12
const indiceDeISO = (iso) => {
  const [ano, mes] = iso.split("-").map(Number);
  return indiceMes(ano, mes);
};
const primeiroDia = (indice) => `${Math.floor(indice / 12)}-${pad((indice % 12) + 1)}-01`;

function indiceHoje() {
  const h = new Date();
  return indiceMes(h.getFullYear(), h.getMonth() + 1);
}

/** Data do lançamento no mês `indice`; em meses curtos o dia 31 vira o último dia. */
function dataDoMes(indice, dia) {
  const ano = Math.floor(indice / 12);
  const mes = (indice % 12) + 1;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return `${ano}-${pad(mes)}-${pad(Math.min(dia, ultimoDia))}`;
}

export async function listarFixas() {
  const { data, error } = await supabase
    .from("despesas_fixas")
    .select("id, descricao, categoria, conta_id, valor, dia, mes_inicio, ultimo_mes_gerado")
    .order("descricao");
  lancarSeErro(error, "Não foi possível carregar as despesas fixas.");
  return data;
}

/** Cria a despesa fixa a partir da data escolhida (o dia e o mês de início vêm dela). */
export async function criarFixa({ descricao, categoria, conta_id, valor, dataISO }) {
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const { error } = await supabase.from("despesas_fixas").insert({
    descricao: descricao.trim(),
    categoria,
    conta_id: conta_id || null,
    valor,
    dia,
    mes_inicio: primeiroDia(indiceMes(ano, mes)),
  });
  lancarSeErro(error, "Não foi possível criar a despesa fixa.");
  alvoSincronizado = -1; // força nova geração
}

/**
 * Gera os lançamentos que ainda faltam, do mês de início de cada despesa fixa
 * até o maior entre o mês atual e o mês (ano/mes) informado.
 * Retorna quantos lançamentos foram preparados (0 = nada novo).
 */
export async function sincronizarFixas(ano, mes) {
  const hoje = indiceHoje();
  const alvo = Math.min(Math.max(hoje, indiceMes(ano, mes)), hoje + LIMITE_MESES_A_FRENTE);
  if (alvo <= alvoSincronizado) return 0;

  const fixas = await listarFixas();
  const linhas = [];
  const atualizacoes = [];

  for (const f of fixas) {
    let inicio = indiceDeISO(f.mes_inicio);
    if (f.ultimo_mes_gerado) inicio = Math.max(inicio, indiceDeISO(f.ultimo_mes_gerado) + 1);
    if (inicio > alvo) continue;

    for (let i = inicio; i <= alvo; i++) {
      linhas.push({
        fixa_id: f.id,
        data: dataDoMes(i, f.dia),
        descricao: f.descricao,
        tipo: "Despesa",
        categoria: f.categoria,
        valor: f.valor,
        conta_id: f.conta_id,
      });
    }
    atualizacoes.push({ id: f.id, ultimo: primeiroDia(alvo) });
  }

  if (linhas.length) {
    const { error } = await supabase
      .from("lancamentos")
      .upsert(linhas, { onConflict: "fixa_id,data", ignoreDuplicates: true });
    lancarSeErro(error, "Não foi possível gerar as despesas fixas.");

    for (const a of atualizacoes) {
      const { error: erroAtualizacao } = await supabase
        .from("despesas_fixas")
        .update({ ultimo_mes_gerado: a.ultimo })
        .eq("id", a.id);
      lancarSeErro(erroAtualizacao, "Não foi possível atualizar a despesa fixa.");
    }
  }

  alvoSincronizado = alvo;
  return linhas.length;
}

/** Altera o modelo e os lançamentos já gerados do mês atual em diante. */
export async function editarFixa(id, { descricao, categoria, conta_id, valor }) {
  const campos = { descricao: descricao.trim(), categoria, conta_id: conta_id || null, valor };

  const { error } = await supabase.from("despesas_fixas").update(campos).eq("id", id);
  lancarSeErro(error, "Não foi possível editar a despesa fixa.");

  const { error: erroLancamentos } = await supabase
    .from("lancamentos")
    .update(campos)
    .eq("fixa_id", id)
    .gte("data", primeiroDia(indiceHoje()));
  lancarSeErro(erroLancamentos, "Despesa fixa editada, mas houve um problema ao atualizar os lançamentos futuros.");
}

/**
 * Encerra a despesa fixa: apaga os lançamentos gerados a partir do PRÓXIMO mês
 * e remove o modelo. O que já existe até o mês atual continua no histórico.
 */
export async function encerrarFixa(id) {
  const { error } = await supabase
    .from("lancamentos")
    .delete()
    .eq("fixa_id", id)
    .gte("data", primeiroDia(indiceHoje() + 1));
  lancarSeErro(error, "Não foi possível remover os lançamentos futuros.");

  const { error: erroFixa } = await supabase.from("despesas_fixas").delete().eq("id", id);
  lancarSeErro(erroFixa, "Não foi possível encerrar a despesa fixa.");
}
