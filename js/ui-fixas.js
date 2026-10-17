// ============================================================================
// ui-fixas.js — modal "Despesas Fixas": listar, editar e encerrar
// (a criação é feita no formulário de Lançamentos, marcando "Despesa fixa")
// ============================================================================

import * as db from "./db.js";
import * as dbFixas from "./db-fixas.js";
import { formatarMoeda, parseValor } from "./formato.js";
import { toastSucesso, toastErro } from "./toast.js";

let fixasCache = [];
let aoMudarCallback = null;

const modal = () => document.getElementById("modal-fixas");
const form = () => document.getElementById("form-fixa");
const erroEl = () => document.querySelector('[data-erro-para="fixa"]');

function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

export function inicializarFixas(onMudar) {
  aoMudarCallback = onMudar;

  document.getElementById("botao-gerenciar-fixas").addEventListener("click", abrirModal);
  modal()
    .querySelectorAll("[data-fechar-modal]")
    .forEach((el) => el.addEventListener("click", fecharModal));
  document.getElementById("botao-cancelar-fixa").addEventListener("click", esconderForm);
  form().addEventListener("submit", aoSubmeter);
}

async function abrirModal() {
  modal().hidden = false;
  esconderForm();
  try {
    await atualizarLista();
  } catch (erro) {
    toastErro(erro.message);
  }
}

function fecharModal() {
  modal().hidden = true;
}

function esconderForm() {
  form().hidden = true;
  form().reset();
  form().elements["id"].value = "";
  erroEl().textContent = "";
}

async function atualizarLista() {
  fixasCache = await dbFixas.listarFixas();
  const corpo = document.querySelector("#tabela-fixas tbody");
  corpo.innerHTML = fixasCache
    .map(
      (f) => `<tr>
        <td>${escapeHtml(f.descricao)}</td>
        <td class="col-num">${formatarMoeda(f.valor)}</td>
        <td>dia ${f.dia}</td>
        <td class="col-acoes">
          <button type="button" class="acao-tabela" data-editar="${f.id}" title="Editar" aria-label="Editar despesa fixa"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>
          <button type="button" class="acao-tabela acao-tabela--excluir" data-encerrar="${f.id}" title="Encerrar" aria-label="Encerrar despesa fixa"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button>
        </td>
      </tr>`
    )
    .join("");
  document.getElementById("aviso-sem-fixas").hidden = fixasCache.length > 0;

  corpo.querySelectorAll("[data-editar]").forEach((btn) =>
    btn.addEventListener("click", () => abrirEdicao(Number(btn.dataset.editar)))
  );
  corpo.querySelectorAll("[data-encerrar]").forEach((btn) =>
    btn.addEventListener("click", () => encerrar(Number(btn.dataset.encerrar)))
  );
}

async function abrirEdicao(id) {
  const fixa = fixasCache.find((f) => f.id === id);
  if (!fixa) return;

  try {
    const [categorias, contas] = await Promise.all([db.listarCategorias("Despesa"), db.listarContas()]);
    const f = form();
    f.elements["categoria"].innerHTML = categorias
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
    f.elements["conta_id"].innerHTML = contas
      .map((c) => `<option value="${c.id}">${escapeHtml(c.nome)}${c.banco ? " — " + escapeHtml(c.banco) : ""}</option>`)
      .join("");

    f.elements["id"].value = String(fixa.id);
    f.elements["descricao"].value = fixa.descricao;
    f.elements["categoria"].value = fixa.categoria;
    if (fixa.conta_id) f.elements["conta_id"].value = String(fixa.conta_id);
    f.elements["valor"].value = String(fixa.valor).replace(".", ",");
    erroEl().textContent = "";
    f.hidden = false;
  } catch (erro) {
    toastErro(erro.message);
  }
}

async function aoSubmeter(evento) {
  evento.preventDefault();
  erroEl().textContent = "";
  const dados = new FormData(form());

  try {
    const descricao = String(dados.get("descricao") || "").trim();
    if (!descricao) throw new Error("Informe uma descrição.");
    const categoria = dados.get("categoria");
    if (!categoria) throw new Error("Selecione uma categoria.");
    const contaId = dados.get("conta_id");
    if (!contaId) throw new Error("Selecione uma conta.");
    const valor = parseValor(dados.get("valor"));

    await dbFixas.editarFixa(Number(dados.get("id")), {
      descricao,
      categoria,
      conta_id: Number(contaId),
      valor,
    });
    toastSucesso("Despesa fixa atualizada!");
    esconderForm();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    erroEl().textContent = erro.message;
  }
}

async function encerrar(id) {
  const fixa = fixasCache.find((f) => f.id === id);
  const confirmado = window.confirm(
    `Encerrar a despesa fixa "${fixa?.descricao || ""}"?\n` +
      `Os lançamentos até o mês atual são mantidos; os dos próximos meses serão removidos.`
  );
  if (!confirmado) return;
  try {
    await dbFixas.encerrarFixa(id);
    toastSucesso("Despesa fixa encerrada.");
    esconderForm();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    toastErro(erro.message);
  }
}
