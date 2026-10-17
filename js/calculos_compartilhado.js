// ============================================================================
// calculos_compartilhado.js — lógica pura do orçamento compartilhado
// (divisão de despesas, cálculo de saldos e simplificação de dívidas)
// ============================================================================

const emCentavos = (valor) => Math.round(Number(valor || 0) * 100);

/**
 * Divide `valorTotal` igualmente entre os `idsMembros`, garantindo que a
 * SOMA das partes seja exatamente igual ao total (ajusta os centavos de
 * arredondamento nas primeiras pessoas da lista, ex: 100 ÷ 3 = 33.34+33.33+33.33).
 * @param {number} valorTotal
 * @param {string[]} idsMembros
 * @returns {{user_id:string, valor:number}[]}
 */
export function calcularDivisaoIgual(valorTotal, idsMembros) {
  const n = idsMembros.length;
  if (n === 0) return [];

  const baseEmCentavos = Math.floor((valorTotal * 100) / n);
  const totalEmCentavos = Math.round(valorTotal * 100);
  const restoEmCentavos = totalEmCentavos - baseEmCentavos * n;

  return idsMembros.map((id, indice) => {
    // distribui o resto de 1 centavo em 1 centavo pelas primeiras pessoas,
    // então ninguém "ganha" nem "perde" mais que 1 centavo de arredondamento
    const extra = indice < restoEmCentavos ? 1 : 0;
    return { user_id: id, valor: (baseEmCentavos + extra) / 100 };
  });
}

/**
 * Valida se a soma de uma divisão customizada bate com o valor total
 * (com tolerância de meio centavo, para evitar falsos positivos de
 * arredondamento de ponto flutuante).
 * @param {{valor:number}[]} divisoes
 * @param {number} valorTotal
 */
export function validarSomaDivisao(divisoes, valorTotal) {
  const soma = divisoes.reduce((acc, d) => acc + Number(d.valor || 0), 0);
  const diferenca = Math.abs(soma - valorTotal);
  return diferenca < 0.005;
}

/**
 * Saldo líquido de cada pessoa considerando TODO o histórico:
 *   + o que ela pagou pelo grupo
 *   − a parte dela em cada despesa
 *   + pagamentos que ela fez a outras pessoas
 *   − pagamentos que ela recebeu
 * Saldo POSITIVO = tem a receber; NEGATIVO = está devendo.
 * @param {string[]} idsMembros
 * @param {{pago_por:string, valor_total:number}[]} despesas
 * @param {{user_id:string, valor_devido:number}[]} divisoes
 * @param {{de_user_id:string, para_user_id:string, valor:number}[]} pagamentos
 * @returns {Map<string, number>} id -> saldo em reais
 */
export function calcularSaldos(idsMembros, despesas, divisoes, pagamentos) {
  const centavos = new Map(idsMembros.map((id) => [id, 0]));
  const somar = (id, valor) => centavos.set(id, (centavos.get(id) || 0) + valor);

  for (const d of despesas) somar(d.pago_por, emCentavos(d.valor_total));
  for (const v of divisoes) somar(v.user_id, -emCentavos(v.valor_devido));
  for (const p of pagamentos) {
    somar(p.de_user_id, emCentavos(p.valor));
    somar(p.para_user_id, -emCentavos(p.valor));
  }

  return new Map([...centavos].map(([id, c]) => [id, c / 100]));
}

/**
 * Simplifica as dívidas: em vez de cada um dever a cada um, gera o menor
 * número razoável de transferências ("quem deve quanto pra quem").
 * Estratégia: o maior devedor paga ao maior credor, repetindo até zerar.
 * Resulta em no máximo (pessoas − 1) transferências.
 * @param {Map<string, number>} saldos  id -> saldo em reais
 * @returns {{de:string, para:string, valor:number}[]}
 */
export function simplificarDividas(saldos) {
  const credores = [];
  const devedores = [];
  for (const [id, valor] of saldos) {
    const c = emCentavos(valor);
    if (c > 0) credores.push({ id, c });
    else if (c < 0) devedores.push({ id, c: -c });
  }

  const transferencias = [];
  const maiorPrimeiro = (a, b) => b.c - a.c;

  while (credores.length && devedores.length) {
    credores.sort(maiorPrimeiro);
    devedores.sort(maiorPrimeiro);
    const credor = credores[0];
    const devedor = devedores[0];
    const valor = Math.min(credor.c, devedor.c);

    transferencias.push({ de: devedor.id, para: credor.id, valor: valor / 100 });
    credor.c -= valor;
    devedor.c -= valor;
    if (credor.c === 0) credores.shift();
    if (devedor.c === 0) devedores.shift();
  }
  return transferencias;
}
