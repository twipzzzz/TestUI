// ============================================================================
// ui-historico.js — página "Histórico": busca, filtros, ordenação, edição, exclusão
// ============================================================================

import * as db from "./db.js";
import { formatarMoeda, isoParaDataBR, MESES_PT } from "./formato.js";
import { escapeHtml, carregarParaEdicao } from "./ui-lancamentos.js";
import { toastSucesso, toastErro } from "./toast.js";

let todosLancamentos = [];
let contasCache = [];
let colunaOrdenacao = "data";
let ordemCrescente = false;
let aoMudarCallback = null;

const buscaEl = () => document.getElementById("filtro-busca");
const anoEl = () => document.getElementById("filtro-ano");
const mesEl = () => document.getElementById("filtro-mes");
const tipoEl = () => document.getElementById("filtro-tipo");
const contaEl = () => document.getElementById("filtro-conta");

export function inicializarHistorico(onMudar) {
  aoMudarCallback = onMudar;

  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let a = anoAtual - 5; a <= anoAtual + 1; a++) anos.push(a);
  anoEl().innerHTML =
    `<option value="todos">Todos</option>` + anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  mesEl().innerHTML =
    `<option value="todos">Todos</option>` + MESES_PT.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");

  buscaEl().addEventListener("input", renderizarTabela);
  anoEl().addEventListener("change", renderizarTabela);
  mesEl().addEventListener("change", renderizarTabela);
  tipoEl().addEventListener("change", renderizarTabela);
  contaEl().addEventListener("change", renderizarTabela);
  document.getElementById("botao-limpar-filtros").addEventListener("click", limparFiltros);

  document.querySelectorAll("#tabela-historico th[data-ordenar]").forEach((th) => {
    th.addEventListener("click", () => ordenarPor(th.dataset.ordenar));
  });
}

export async function atualizarHistorico() {
  [todosLancamentos, contasCache] = await Promise.all([db.listarLancamentos(), db.listarContas()]);

  const valorAtual = contaEl().value;
  contaEl().innerHTML =
    `<option value="todos">Todas</option>` +
    contasCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join("");
  if (contasCache.some((c) => String(c.id) === valorAtual)) contaEl().value = valorAtual;

  renderizarTabela();
}

function limparFiltros() {
  buscaEl().value = "";
  anoEl().value = "todos";
  mesEl().value = "todos";
  tipoEl().value = "todos";
  contaEl().value = "todos";
  renderizarTabela();
}

function linhasFiltradas() {
  const termo = buscaEl().value.trim().toLowerCase();
  const anoSel = anoEl().value;
  const mesSel = mesEl().value;
  const tipoSel = tipoEl().value;
  const contaSel = contaEl().value;

  return todosLancamentos.filter((l) => {
    if (termo && !l.descricao.toLowerCase().includes(termo) && !l.categoria.toLowerCase().includes(termo)) {
      return false;
    }
    const [anoL, mesL] = l.data.split("-").map(Number);
    if (anoSel !== "todos" && anoL !== Number(anoSel)) return false;
    if (mesSel !== "todos" && mesL !== Number(mesSel)) return false;
    if (tipoSel !== "todos" && l.tipo !== tipoSel) return false;
    if (contaSel !== "todos" && String(l.conta_id) !== contaSel) return false;
    return true;
  });
}

function ordenarPor(coluna) {
  if (colunaOrdenacao === coluna) {
    ordemCrescente = !ordemCrescente;
  } else {
    colunaOrdenacao = coluna;
    ordemCrescente = true;
  }
  renderizarTabela();
}

function renderizarTabela() {
  let linhas = linhasFiltradas();
  linhas.sort((a, b) => {
    let va = a[colunaOrdenacao];
    let vb = b[colunaOrdenacao];
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return ordemCrescente ? -1 : 1;
    if (va > vb) return ordemCrescente ? 1 : -1;
    return 0;
  });

  document.querySelectorAll("#tabela-historico th[data-ordenar]").forEach((th) => {
    th.classList.remove("ordenado-asc", "ordenado-desc");
    if (th.dataset.ordenar === colunaOrdenacao) {
      th.classList.add(ordemCrescente ? "ordenado-asc" : "ordenado-desc");
    }
  });

  const corpo = document.querySelector("#tabela-historico tbody");
  corpo.innerHTML = linhas
    .map((l) => {
      const sinal = l.tipo === "Receita" ? "+" : "-";
      const classe = l.tipo === "Receita" ? "valor-receita" : "valor-despesa";
      const conta = contasCache.find((c) => c.id === l.conta_id);
      return `<tr>
        <td>${isoParaDataBR(l.data)}</td>
        <td>${escapeHtml(l.descricao)}</td>
        <td>${l.tipo}</td>
        <td>${escapeHtml(l.categoria)}</td>
        <td>${escapeHtml(conta ? conta.nome : "—")}</td>
        <td class="col-num ${classe}">${sinal} ${formatarMoeda(l.valor)}</td>
        <td class="col-acoes">
          <button type="button" class="acao-tabela" data-editar="${l.id}" title="Editar" aria-label="Editar lançamento"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>
          <button type="button" class="acao-tabela acao-tabela--excluir" data-excluir="${l.id}" title="Excluir" aria-label="Excluir lançamento"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button>
        </td>
      </tr>`;
    })
    .join("");

  corpo.querySelectorAll("[data-editar]").forEach((btn) =>
    btn.addEventListener("click", () => carregarParaEdicao(Number(btn.dataset.editar)))
  );
  corpo.querySelectorAll("[data-excluir]").forEach((btn) =>
    btn.addEventListener("click", () => excluir(Number(btn.dataset.excluir)))
  );

  document.getElementById("contagem-historico").textContent = `${linhas.length} lançamento(s) encontrado(s)`;
  document.querySelector('[data-vazio-para="historico"]').hidden = linhas.length > 0;
}

async function excluir(id) {
  const registro = todosLancamentos.find((l) => l.id === id);
  const confirmado = window.confirm(
    `Tem certeza que deseja excluir o lançamento "${registro?.descricao || ""}"?\nEsta ação não pode ser desfeita.`
  );
  if (!confirmado) return;
  try {
    await db.excluirLancamento(id);
    toastSucesso("Lançamento excluído.");
    await atualizarHistorico();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    toastErro(erro.message);
  }
}
