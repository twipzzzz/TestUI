// ============================================================================
// calculos.js — lógica pura de resumo mensal e estimativas
// (recebe uma lista de lançamentos já carregada; sem I/O aqui dentro —
// fácil de testar isoladamente, e igual em espírito ao main.py original)
// ============================================================================

import { MESES_PT, MESES_ABREV, proximosPeriodos } from "./formato.js";

const MESES_BASE_ESTIMATIVA = 3; // meses anteriores usados na média
export const MESES_PROJETADOS = 3; // meses futuros mostrados no painel

/** @typedef {{data:string, tipo:'Receita'|'Despesa', categoria:string, valor:number}} Lancamento */

function periodoDe(dataISO) {
  // 'aaaa-mm-dd' -> {ano, mes} (mes 1-12)
  const [ano, mes] = dataISO.split("-").map(Number);
  return { ano, mes };
}

function chavePeriodo({ ano, mes }) {
  return ano * 12 + mes; // permite comparar/ordenar períodos como números
}

/**
 * Monta o resumo dos 12 meses de `ano`, sempre com dados 100% reais
 * (0 quando não há lançamento) — nunca mistura estimativa aqui.
 * @param {Lancamento[]} lancamentos
 * @param {number} ano
 */
export function montarResumoAnual(lancamentos, ano) {
  const resumo = [];
  for (let mes = 1; mes <= 12; mes++) {
    const doMes = lancamentos.filter((l) => {
      const p = periodoDe(l.data);
      return p.ano === ano && p.mes === mes;
    });
    const receita = doMes
      .filter((l) => l.tipo === "Receita")
      .reduce((soma, l) => soma + Number(l.valor), 0);
    const despesa = doMes
      .filter((l) => l.tipo === "Despesa")
      .reduce((soma, l) => soma + Number(l.valor), 0);
    const saldo = receita - despesa;
    const margem = receita > 0 ? (saldo / receita) * 100 : 0;
    resumo.push({
      mesNum: mes,
      mesNome: MESES_PT[mes - 1],
      mesAbrev: MESES_ABREV[mes - 1],
      receita,
      despesa,
      saldo,
      margem,
    });
  }
  return resumo;
}

/**
 * Média de receita/despesa dos últimos `mesesBase` meses ANTERIORES ao
 * período de referência {ano, mes}, usando todo o histórico disponível.
 * @param {Lancamento[]} lancamentos
 */
export function calcularEstimativaTotais(lancamentos, ano, mes, mesesBase = MESES_BASE_ESTIMATIVA) {
  const referencia = ano * 12 + mes;
  const porPeriodo = new Map(); // chave numerica -> {receita, despesa}

  for (const l of lancamentos) {
    const p = periodoDe(l.data);
    const chave = chavePeriodo(p);
    if (chave >= referencia) continue; // só histórico ANTERIOR à referência
    if (!porPeriodo.has(chave)) porPeriodo.set(chave, { receita: 0, despesa: 0 });
    const acumulado = porPeriodo.get(chave);
    if (l.tipo === "Receita") acumulado.receita += Number(l.valor);
    else acumulado.despesa += Number(l.valor);
  }

  const chavesOrdenadas = [...porPeriodo.keys()].sort((a, b) => a - b);
  const ultimas = chavesOrdenadas.slice(-mesesBase);
  if (ultimas.length === 0) return { receita: 0, despesa: 0 };

  const soma = ultimas.reduce(
    (acc, chave) => {
      const p = porPeriodo.get(chave);
      acc.receita += p.receita;
      acc.despesa += p.despesa;
      return acc;
    },
    { receita: 0, despesa: 0 }
  );
  return { receita: soma.receita / ultimas.length, despesa: soma.despesa / ultimas.length };
}

/**
 * Média de despesa por categoria nos últimos `mesesBase` meses anteriores
 * ao período de referência. Retorna array [{categoria, valor}] ordenado
 * do maior para o menor.
 * @param {Lancamento[]} lancamentos
 */
export function calcularEstimativaCategorias(lancamentos, ano, mes, mesesBase = MESES_BASE_ESTIMATIVA) {
  const referencia = ano * 12 + mes;
  const despesas = lancamentos.filter((l) => {
    if (l.tipo !== "Despesa") return false;
    return chavePeriodo(periodoDe(l.data)) < referencia;
  });
  if (despesas.length === 0) return [];

  const periodosComDados = [...new Set(despesas.map((l) => chavePeriodo(periodoDe(l.data))))].sort(
    (a, b) => a - b
  );
  const periodosRecentes = new Set(periodosComDados.slice(-mesesBase));

  // soma por (periodo, categoria)
  const somaPorPeriodoCategoria = new Map(); // "chave|categoria" -> valor
  for (const l of despesas) {
    const chave = chavePeriodo(periodoDe(l.data));
    if (!periodosRecentes.has(chave)) continue;
    const chaveCombinada = `${chave}|${l.categoria}`;
    somaPorPeriodoCategoria.set(
      chaveCombinada,
      (somaPorPeriodoCategoria.get(chaveCombinada) || 0) + Number(l.valor)
    );
  }

  // agora agrupa por categoria, tirando a média sobre a QUANTIDADE de períodos recentes
  const somaPorCategoria = new Map();
  for (const [chaveCombinada, valor] of somaPorPeriodoCategoria) {
    const categoria = chaveCombinada.split("|")[1];
    somaPorCategoria.set(categoria, (somaPorCategoria.get(categoria) || 0) + valor);
  }

  const qtdPeriodos = periodosRecentes.size;
  const resultado = [...somaPorCategoria.entries()].map(([categoria, soma]) => ({
    categoria,
    valor: soma / qtdPeriodos,
  }));
  resultado.sort((a, b) => b.valor - a.valor);
  return resultado;
}

/**
 * Monta o resumo de receitas/despesas/saldo POR CONTA no ano informado
 * (dados 100% reais, mesmo espírito de montarResumoAnual). Contas sem
 * nenhum lançamento no ano aparecem com tudo zerado; lançamentos cuja
 * conta foi excluída entram numa linha "Sem conta".
 * @param {Lancamento[]} lancamentos
 * @param {{id:number, nome:string, banco:string|null}[]} contas
 * @param {number} ano
 */
export function montarResumoPorConta(lancamentos, contas, ano) {
  const idsConhecidos = new Set(contas.map((c) => c.id));
  const totaisPorConta = new Map(); // contaId (ou null) -> {receita, despesa}

  for (const l of lancamentos) {
    if (periodoDe(l.data).ano !== ano) continue;
    // qualquer conta_id que não exista mais na lista de contas atuais
    // (incluindo null) cai no mesmo balde "sem conta vinculada"
    const chave = idsConhecidos.has(l.conta_id) ? l.conta_id : null;
    if (!totaisPorConta.has(chave)) totaisPorConta.set(chave, { receita: 0, despesa: 0 });
    const acumulado = totaisPorConta.get(chave);
    if (l.tipo === "Receita") acumulado.receita += Number(l.valor);
    else acumulado.despesa += Number(l.valor);
  }

  const linhas = contas.map((conta) => {
    const totais = totaisPorConta.get(conta.id) || { receita: 0, despesa: 0 };
    return {
      id: conta.id,
      nome: conta.nome,
      banco: conta.banco || null,
      receita: totais.receita,
      despesa: totais.despesa,
      saldo: totais.receita - totais.despesa,
    };
  });

  const semConta = totaisPorConta.get(null);
  if (semConta && (semConta.receita || semConta.despesa)) {
    linhas.push({
      id: null,
      nome: "Sem conta vinculada",
      banco: null,
      receita: semConta.receita,
      despesa: semConta.despesa,
      saldo: semConta.receita - semConta.despesa,
    });
  }

  linhas.sort((a, b) => b.saldo - a.saldo);
  return linhas;
}

/**
 * Monta a lista de estimativas para os próximos meses (painel isolado do
 * dashboard, nunca misturado com a tabela de dados reais).
 * @param {Lancamento[]} lancamentos
 */
export function montarPainelEstimativas(lancamentos, quantidade = MESES_PROJETADOS, hoje = new Date()) {
  const periodos = proximosPeriodos(quantidade, hoje);
  const linhas = periodos.map(({ ano, mes }) => {
    const { receita, despesa } = calcularEstimativaTotais(lancamentos, ano, mes);
    return { ano, mes, mesAbrev: MESES_ABREV[mes - 1], receita, despesa, saldo: receita - despesa };
  });
  const temAlgumDado = linhas.some((l) => l.receita || l.despesa);
  const categoriasEstimadas = temAlgumDado
    ? calcularEstimativaCategorias(lancamentos, periodos[0].ano, periodos[0].mes)
    : [];
  return { linhas, temAlgumDado, categoriasEstimadas };
}
