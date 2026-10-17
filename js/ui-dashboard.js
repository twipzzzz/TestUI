// ============================================================================
// ui-dashboard.js — página "Dashboard": KPIs, resumo mensal, estimativas e gráficos
// ============================================================================

import * as db from "./db.js";
import { formatarMoeda, MESES_PT } from "./formato.js";
import { montarResumoAnual, montarPainelEstimativas, montarResumoPorConta } from "./calculos.js";

let graficoBarras = null;
let todosLancamentos = [];
let todasContas = [];

const CORES_CATEGORIAS = [
  "#4F46E5", "#0E9F6E", "#F59E0B", "#E02424", "#0EA5E9",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#84CC16",
];

const selectAno = () => document.getElementById("select-ano-dashboard");
const selectMesDashboard = () => document.getElementById("select-mes-dashboard");
const selectMesRosca = () => document.getElementById("select-mes-rosca");

export function inicializarDashboard() {
  const anoAtual = new Date().getFullYear();
  const mesAtual = new Date().getMonth() + 1;
  const dataLabel = document.getElementById("data-dashboard");
  if (dataLabel) {
    dataLabel.textContent = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long", day: "numeric", month: "long",
    }).format(new Date());
  }
  const anos = [];
  for (let a = anoAtual - 5; a <= anoAtual + 1; a++) anos.push(a);
  selectAno().innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  selectAno().value = String(anoAtual);
  selectMesDashboard().innerHTML = MESES_PT
    .map((mes, i) => `<option value="${i + 1}">${mes}</option>`)
    .join("");
  selectMesDashboard().value = String(mesAtual);

  selectMesRosca().innerHTML =
    `<option value="todos">Todos (ano)</option>` +
    MESES_PT.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  selectMesRosca().value = String(mesAtual);

  selectAno().addEventListener("change", atualizarDashboard);
  selectMesDashboard().addEventListener("change", () => {
    atualizarKpisMensais();
    atualizarListaRecentes();
  });
  selectMesRosca().addEventListener("change", () => atualizarCategoriasDashboard(Number(selectAno().value)));
}

export async function atualizarDashboard() {
  [todosLancamentos, todasContas] = await Promise.all([db.listarLancamentos(), db.listarContas()]);
  const ano = Number(selectAno().value);
  const resumo = montarResumoAnual(todosLancamentos, ano);

  atualizarTabelaResumo(resumo);
  atualizarKpisMensais(ano);
  atualizarPainelEstimativas();
  atualizarResumoPorConta(ano);
  atualizarListaRecentes();
  atualizarGraficoBarras(resumo, ano);
  atualizarCategoriasDashboard(ano);
}

function atualizarListaRecentes() {
  const lista = document.getElementById("lista-recentes-dashboard");
  const aviso = document.getElementById("aviso-sem-recentes-dashboard");
  const mes = Number(selectMesDashboard().value);
  const ano = Number(selectAno().value);
  const recentes = todosLancamentos
    .filter((l) => {
      const [anoLancamento, mesLancamento] = l.data.split("-").map(Number);
      return anoLancamento === ano && mesLancamento === mes;
    })
    .sort((a, b) => b.data.localeCompare(a.data) || Number(b.id) - Number(a.id))
    .slice(0, 5);

  lista.innerHTML = recentes.map((l) => {
    const [ano, mes, dia] = l.data.split("-");
    const mesNumero = Number(mes);
    const dataLancamento = new Date(Number(ano), mesNumero - 1, Number(dia));
    const hoje = new Date();
    const ehHoje = dataLancamento.getFullYear() === hoje.getFullYear()
      && dataLancamento.getMonth() === hoje.getMonth()
      && dataLancamento.getDate() === hoje.getDate();
    const dataCurta = ehHoje ? "Hoje" : `${Number(dia)} ${MESES_PT[mesNumero - 1].slice(0, 3).toLowerCase()}`;
    const conta = todasContas.find((c) => c.id === l.conta_id);
    const receita = l.tipo === "Receita";
    const sinal = receita ? "+" : "−";
    const classe = receita ? "valor-receita" : "valor-despesa";
    return `<div class="linha-recente-dashboard">
      <span class="recentes-dashboard__descricao"><strong>${escapeHtml(l.descricao)} <span class="recentes-dashboard__categoria">${escapeHtml(l.categoria || l.tipo)}</span></strong><small>${dataCurta} · ${escapeHtml(conta?.nome || "Sem conta")}</small></span>
      <strong class="recentes-dashboard__valor ${classe}">${sinal} ${formatarMoeda(Math.abs(Number(l.valor)))}</strong>
    </div>`;
  }).join("");
  document.getElementById("rotulo-mes-recentes").textContent = `${MESES_PT[mes - 1]} de ${ano}`;
  aviso.hidden = recentes.length > 0;
}

function atualizarTabelaResumo(resumo) {
  const corpo = document.querySelector("#tabela-resumo tbody");
  let totalReceita = 0;
  let totalDespesa = 0;

  const linhas = resumo.map((m) => {
    totalReceita += m.receita;
    totalDespesa += m.despesa;
    return `<tr>
      <td>${m.mesNome}</td>
      <td class="col-num">${formatarMoeda(m.receita)}</td>
      <td class="col-num">${formatarMoeda(m.despesa)}</td>
      <td class="col-num">${formatarMoeda(m.saldo)}</td>
      <td class="col-num">${m.margem.toFixed(1)}%</td>
    </tr>`;
  });

  const saldoTotal = totalReceita - totalDespesa;
  const margemMedia = totalReceita > 0 ? (saldoTotal / totalReceita) * 100 : 0;
  linhas.push(`<tr class="linha-total">
    <td>TOTAL ANO</td>
    <td class="col-num">${formatarMoeda(totalReceita)}</td>
    <td class="col-num">${formatarMoeda(totalDespesa)}</td>
    <td class="col-num">${formatarMoeda(saldoTotal)}</td>
    <td class="col-num">${margemMedia.toFixed(1)}%</td>
  </tr>`);

  corpo.innerHTML = linhas.join("");
  return { totalReceita, totalDespesa, saldoTotal, margemMedia };
}

function atualizarKpisMensais(ano = Number(selectAno().value)) {
  const mes = Number(selectMesDashboard().value);
  const lancamentosDoMes = todosLancamentos.filter((l) => {
    const [anoLancamento, mesLancamento] = l.data.split("-").map(Number);
    return anoLancamento === ano && mesLancamento === mes;
  });
  const receita = lancamentosDoMes
    .filter((l) => l.tipo === "Receita")
    .reduce((s, l) => s + Number(l.valor), 0);
  const despesa = lancamentosDoMes
    .filter((l) => l.tipo === "Despesa")
    .reduce((s, l) => s + Number(l.valor), 0);
  const saldo = receita - despesa;
  const saldoEl = document.getElementById("kpi-saldo");
  const margemEl = document.getElementById("kpi-margem");
  const margemNota = document.getElementById("kpi-margem-nota");

  document.getElementById("kpi-receita").textContent = formatarMoeda(receita);
  document.getElementById("kpi-despesa").textContent = formatarMoeda(despesa);
  saldoEl.textContent = formatarMoeda(saldo);
  saldoEl.className = `kpi__valor ${saldo < 0 ? "kpi__valor--despesa" : "kpi__valor--saldo"}`;

  if (receita <= 0) {
    margemEl.textContent = "—";
    margemEl.className = "kpi__valor kpi__valor--saldo";
    margemNota.textContent = "Sem receita registrada";
  } else if (saldo < 0) {
    margemEl.textContent = "Déficit";
    margemEl.className = "kpi__valor kpi__valor--despesa";
    margemNota.textContent = `Saldo negativo de ${formatarMoeda(Math.abs(saldo))}`;
  } else {
    margemEl.textContent = `${((saldo / receita) * 100).toFixed(1)}%`;
    margemEl.className = "kpi__valor kpi__valor--saldo";
    margemNota.textContent = "Sobre as receitas do período";
  }
}

function atualizarPainelEstimativas() {
  const { linhas, temAlgumDado, categoriasEstimadas } = montarPainelEstimativas(todosLancamentos);

  const corpo = document.querySelector("#tabela-estimativas tbody");
  corpo.innerHTML = linhas
    .map(
      (l) => `<tr>
        <td>${l.mesAbrev}/${l.ano}</td>
        <td class="col-num">${formatarMoeda(l.receita)}</td>
        <td class="col-num">${formatarMoeda(l.despesa)}</td>
        <td class="col-num">${formatarMoeda(l.saldo)}</td>
      </tr>`
    )
    .join("");

  const textoCategoriasEl = document.getElementById("texto-categorias-estimativa");
  const avisoEl = document.getElementById("aviso-sem-estimativa");

  if (temAlgumDado) {
    avisoEl.hidden = true;
    if (categoriasEstimadas.length) {
      const texto = categoriasEstimadas
        .slice(0, 5)
        .map((c) => `${c.categoria}: ${formatarMoeda(c.valor)}`)
        .join("   •   ");
      textoCategoriasEl.textContent = `Maiores despesas médias por categoria: ${texto}`;
    } else {
      textoCategoriasEl.textContent = "";
    }
  } else {
    textoCategoriasEl.textContent = "";
    avisoEl.hidden = false;
  }
}

function atualizarResumoPorConta(ano) {
  const linhas = montarResumoPorConta(todosLancamentos, todasContas, ano);
  const corpo = document.querySelector("#tabela-resumo-contas tbody");
  const avisoEl = document.getElementById("aviso-sem-contas");

  if (linhas.length === 0) {
    corpo.innerHTML = "";
    avisoEl.hidden = false;
    return;
  }
  avisoEl.hidden = true;

  corpo.innerHTML = linhas
    .map((l) => {
      const classeSaldo = l.saldo > 0 ? "valor-receita" : l.saldo < 0 ? "valor-despesa" : "";
      return `<tr>
        <td>${escapeHtml(l.nome)}</td>
        <td>${escapeHtml(l.banco || "—")}</td>
        <td class="col-num">${formatarMoeda(l.receita)}</td>
        <td class="col-num">${formatarMoeda(l.despesa)}</td>
        <td class="col-num ${classeSaldo}">${formatarMoeda(l.saldo)}</td>
      </tr>`;
    })
    .join("");
}

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function atualizarGraficoBarras(resumo, ano) {
  const ctx = document.getElementById("grafico-barras").getContext("2d");
  const dados = {
    labels: resumo.map((m) => m.mesAbrev),
    datasets: [
      { label: "Receitas", data: resumo.map((m) => m.receita), backgroundColor: "#0E9F6E", borderRadius: 4 },
      { label: "Despesas", data: resumo.map((m) => m.despesa), backgroundColor: "#E02424", borderRadius: 4 },
    ],
  };
  document.getElementById("titulo-grafico-barras").textContent = `Receitas vs Despesas — ${ano}`;

  if (graficoBarras) {
    graficoBarras.data = dados;
    graficoBarras.update();
    return;
  }
  graficoBarras = new Chart(ctx, {
    type: "bar",
    data: dados,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top" } },
      scales: { y: { beginAtZero: true, ticks: { callback: (v) => formatarMoeda(v) } } },
    },
  });
}

function atualizarCategoriasDashboard(ano) {
  const mesSel = selectMesRosca().value;
  const despesas = todosLancamentos.filter((l) => {
    const [anoL, mesL] = l.data.split("-").map(Number);
    if (l.tipo !== "Despesa" || anoL !== ano) return false;
    if (mesSel !== "todos" && mesL !== Number(mesSel)) return false;
    return true;
  });

  const porCategoria = new Map();
  for (const l of despesas) {
    porCategoria.set(l.categoria, (porCategoria.get(l.categoria) || 0) + Number(l.valor));
  }
  const entradas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);

  const avisoEl = document.getElementById("aviso-sem-despesas-rosca");
  const lista = document.getElementById("lista-categorias-dashboard");

  if (entradas.length === 0) {
    avisoEl.hidden = false;
    lista.innerHTML = "";
    return;
  }
  avisoEl.hidden = true;
  const total = entradas.reduce((soma, [, valor]) => soma + valor, 0);
  lista.innerHTML = entradas.map(([categoria, valor], indice) => {
    const percentual = total > 0 ? (valor / total) * 100 : 0;
    return `<div class="categoria-dashboard-linha">
      <div class="categoria-dashboard-cabecalho"><strong>${escapeHtml(categoria || "Sem categoria")}</strong><span>${formatarMoeda(valor)} · ${Math.round(percentual)}%</span></div>
      <div class="categoria-dashboard-trilho"><i style="width:${percentual.toFixed(2)}%;--categoria-cor:${CORES_CATEGORIAS[indice % CORES_CATEGORIAS.length]}"></i></div>
    </div>`;
  }).join("");
}
