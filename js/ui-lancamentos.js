// ============================================================================
// ui-lancamentos.js — página "Lançamentos": formulário + lista mensal
// ============================================================================

import * as db from "./db.js";
import { formatarMoeda, parseValor, hojeISO, isoParaDataBR, MESES_PT } from "./formato.js";
import { toastSucesso, toastErro } from "./toast.js";
import { criarFixa, sincronizarFixas } from "./db-fixas.js";
import { inicializarFixas } from "./ui-fixas.js";

let idEmEdicao = null;
let aoSalvarCallback = null; // avisa o main.js para atualizar dashboard/histórico
let contasCache = []; // usado para mostrar o nome da conta na lista do mês

// mês exibido na lista (mes: 1-12)
const hojeData = new Date();
let anoLista = hojeData.getFullYear();
let mesLista = hojeData.getMonth() + 1;

const selectMesLista = () => document.getElementById("select-mes-lista");
const selectAnoLista = () => document.getElementById("select-ano-lista");

function garantirOpcaoAno(ano) {
  const select = selectAnoLista();
  if (![...select.options].some((o) => Number(o.value) === ano)) {
    select.innerHTML = [...select.options, new Option(ano, ano)]
      .sort((a, b) => Number(a.value) - Number(b.value))
      .map((o) => `<option value="${o.value}">${o.value}</option>`)
      .join("");
  }
}

function sincronizarSeletoresMes() {
  garantirOpcaoAno(anoLista);
  selectMesLista().value = String(mesLista);
  selectAnoLista().value = String(anoLista);
}

function mudarMes(delta) {
  const d = new Date(anoLista, mesLista - 1 + delta, 1);
  anoLista = d.getFullYear();
  mesLista = d.getMonth() + 1;
  sincronizarSeletoresMes();
  atualizarListaRecentes();
}

function inicializarSeletorMes() {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let a = anoAtual - 5; a <= anoAtual + 1; a++) anos.push(a);

  selectMesLista().innerHTML = MESES_PT.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  selectAnoLista().innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  sincronizarSeletoresMes();

  selectMesLista().addEventListener("change", () => {
    mesLista = Number(selectMesLista().value);
    atualizarListaRecentes();
  });
  selectAnoLista().addEventListener("change", () => {
    anoLista = Number(selectAnoLista().value);
    atualizarListaRecentes();
  });
  document.getElementById("botao-mes-anterior").addEventListener("click", () => mudarMes(-1));
  document.getElementById("botao-mes-proximo").addEventListener("click", () => mudarMes(1));
}

const form = () => document.getElementById("form-lancamento");
const selectCategoria = () => form().elements["categoria"];
const selectConta = () => form().elements["conta_id"];
const selectTipo = () => form().elements["tipo"];
const erroEl = () => document.querySelector('[data-erro-para="lancamento"]');
const tituloForm = () => document.getElementById("titulo-form-lancamento");
const botaoSalvar = () => document.getElementById("botao-salvar-lancamento");
const botaoCancelar = () => document.getElementById("botao-cancelar-edicao");
function definirTextoBotaoSalvar(texto) {
  const rotulo = botaoSalvar().querySelector("span");
  if (rotulo) rotulo.textContent = texto;
  else botaoSalvar().textContent = texto;
}

export function inicializarLancamentos(onSalvar) {
  aoSalvarCallback = onSalvar;

  document.querySelectorAll("[data-abrir-form-lancamento]").forEach((botao) => botao.addEventListener("click", () => {
    document.querySelector('.item-nav[data-pagina="lancamentos"]').click();
    const painel = document.getElementById("painel-formulario-lancamento");
    painel.open = true;
    painel.scrollIntoView({ behavior: "smooth", block: "start" });
    form().elements["descricao"].focus({ preventScroll: true });
  }));

  form().elements["data"].value = hojeISO();
  inicializarSeletorMes();

  selectTipo().addEventListener("change", () => {
    atualizarOpcoesCategoria();
    atualizarVisibilidadeFixa();
  });
  form().addEventListener("submit", aoSubmeter);
  document.getElementById("botao-limpar-lancamento").addEventListener("click", limparFormulario);
  botaoCancelar().addEventListener("click", cancelarEdicao);

  inicializarFixas(async () => {
    await atualizarListaRecentes();
    if (aoSalvarCallback) await aoSalvarCallback();
  });
  atualizarVisibilidadeFixa();

  Promise.all([atualizarOpcoesCategoria(), atualizarOpcoesConta()]).then(atualizarListaRecentes);
}

// A opção "Despesa fixa" só aparece para despesas novas (não na edição)
function atualizarVisibilidadeFixa() {
  const mostrar = selectTipo().value === "Despesa" && idEmEdicao == null;
  document.getElementById("campo-fixa").hidden = !mostrar;
  if (!mostrar) form().elements["fixa"].checked = false;
}

// Gera os lançamentos das despesas fixas que faltam até o mês exibido
async function garantirFixas() {
  try {
    const gerou = await sincronizarFixas(anoLista, mesLista);
    if (gerou > 0 && aoSalvarCallback) aoSalvarCallback().catch(() => {});
  } catch (erro) {
    console.warn("Não foi possível gerar as despesas fixas:", erro);
  }
}

export async function atualizarOpcoesCategoria() {
  const tipo = selectTipo().value;
  const categorias = await db.listarCategorias(tipo);
  const select = selectCategoria();
  const valorAtual = select.value;
  select.innerHTML = categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (categorias.includes(valorAtual)) select.value = valorAtual;
}

export async function atualizarOpcoesConta() {
  contasCache = await db.listarContas();
  const select = selectConta();
  const valorAtual = select.value;
  select.innerHTML = contasCache
    .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}${c.banco ? " — " + escapeHtml(c.banco) : ""}</option>`)
    .join("");
  if (contasCache.some((c) => String(c.id) === valorAtual)) select.value = valorAtual;
}

async function aoSubmeter(evento) {
  evento.preventDefault();
  erroEl().textContent = "";

  const dados = new FormData(form());
  const descricao = String(dados.get("descricao") || "").trim();
  const tipo = dados.get("tipo");
  const categoria = dados.get("categoria");
  const contaId = dados.get("conta_id");
  const dataISO = dados.get("data");

  try {
    if (!descricao) throw new Error("Informe uma descrição para o lançamento.");
    if (!dataISO) throw new Error("Informe a data do lançamento.");
    if (!categoria) throw new Error("Selecione (ou cadastre) uma categoria.");
    if (!contaId) throw new Error("Selecione (ou cadastre) uma conta.");
    const valor = parseValor(dados.get("valor"));

    const payload = { data: dataISO, descricao, tipo, categoria, valor, conta_id: Number(contaId) };
    const [anoSalvo, mesSalvo] = dataISO.split("-").map(Number);
    const querFixa = dados.get("fixa") === "on" && tipo === "Despesa" && idEmEdicao == null;

    if (idEmEdicao == null) {
      if (querFixa) {
        await criarFixa({ descricao, categoria, conta_id: payload.conta_id, valor, dataISO });
        await sincronizarFixas(anoSalvo, mesSalvo);
        toastSucesso("Despesa fixa criada! Ela se repete todos os meses.");
      } else {
        await db.inserirLancamento(payload);
        toastSucesso("Lançamento salvo com sucesso!");
      }
    } else {
      await db.atualizarLancamento(idEmEdicao, payload);
      toastSucesso("Lançamento atualizado com sucesso!");
      cancelarEdicao();
    }

    // a lista pula para o mês do lançamento salvo
    anoLista = anoSalvo;
    mesLista = mesSalvo;
    sincronizarSeletoresMes();

    limparFormulario();
    await atualizarListaRecentes();
    if (aoSalvarCallback) await aoSalvarCallback();
  } catch (erro) {
    erroEl().textContent = erro.message;
    toastErro(erro.message);
  }
}

function limparFormulario() {
  form().reset();
  form().elements["data"].value = hojeISO();
  atualizarOpcoesCategoria();
  atualizarOpcoesConta();
  atualizarVisibilidadeFixa();
  erroEl().textContent = "";
}

function cancelarEdicao() {
  idEmEdicao = null;
  tituloForm().textContent = "Novo Lançamento";
  definirTextoBotaoSalvar("Salvar Lançamento");
  botaoCancelar().hidden = true;
  limparFormulario();
}

export async function carregarParaEdicao(id) {
  const registro = await db.buscarLancamento(id);
  idEmEdicao = registro.id;
  form().elements["data"].value = registro.data;
  form().elements["descricao"].value = registro.descricao;
  form().elements["tipo"].value = registro.tipo;
  atualizarVisibilidadeFixa();
  await Promise.all([atualizarOpcoesCategoria(), atualizarOpcoesConta()]);
  form().elements["categoria"].value = registro.categoria;
  if (registro.conta_id) form().elements["conta_id"].value = String(registro.conta_id);
  form().elements["valor"].value = String(registro.valor).replace(".", ",");
  tituloForm().textContent = `Editando lançamento #${registro.id}`;
  definirTextoBotaoSalvar("Atualizar Lançamento");
  botaoCancelar().hidden = false;
  document.getElementById("painel-formulario-lancamento").open = true;
  document.querySelector('[data-pagina="lancamentos"]').dispatchEvent(new CustomEvent("ir-para-pagina", { bubbles: true, detail: "lancamentos" }));
}

export async function atualizarListaRecentes() {
  await garantirFixas();
  const todos = await db.listarLancamentos();
  const registros = todos.filter((l) => {
    const [ano, mes] = l.data.split("-").map(Number);
    return ano === anoLista && mes === mesLista;
  });

  // resumo do mês
  const receita = registros.filter((l) => l.tipo === "Receita").reduce((s, l) => s + Number(l.valor), 0);
  const despesa = registros.filter((l) => l.tipo === "Despesa").reduce((s, l) => s + Number(l.valor), 0);
  const saldo = receita - despesa;
  document.getElementById("resumo-mes-receita").textContent = formatarMoeda(receita);
  document.getElementById("resumo-mes-despesa").textContent = formatarMoeda(despesa);
  const saldoEl = document.getElementById("resumo-mes-saldo");
  saldoEl.textContent = formatarMoeda(saldo);
  saldoEl.className = saldo > 0 ? "valor-receita" : saldo < 0 ? "valor-despesa" : "";

  const corpo = document.querySelector("#tabela-recentes tbody");
  corpo.innerHTML = registros
    .map((l) => {
      const sinal = l.tipo === "Receita" ? "+" : "-";
      const classe = l.tipo === "Receita" ? "valor-receita" : "valor-despesa";
      const conta = contasCache.find((c) => c.id === l.conta_id);
      return `<tr>
        <td>${isoParaDataBR(l.data)}</td>
        <td>${l.fixa_id ? '<svg class="ui-icon ui-icon--inline" aria-label="Despesa fixa" viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.55-2.1L20 12M4 12l2.85 5.1A7 7 0 0 0 18.4 15"/></svg> ' : ""}${escapeHtml(l.descricao)}</td>
        <td>${escapeHtml(conta ? conta.nome : "—")}</td>
        <td>${l.tipo}</td>
        <td class="col-num ${classe}">${sinal} ${formatarMoeda(l.valor)}</td>
      </tr>`;
    })
    .join("");
  document.querySelector('[data-vazio-para="recentes"]').hidden = registros.length > 0;
}

export function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}
