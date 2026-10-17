// ============================================================================
// ui-contas.js — modal "Gerenciar Contas"
// ============================================================================

import * as db from "./db.js";
import { toastSucesso, toastErro } from "./toast.js";
import { escapeHtml } from "./ui-lancamentos.js";

let contaSelecionadaId = null;
let aoMudarCallback = null; // avisa main.js/ui-lancamentos para recarregar selects

const modal = () => document.getElementById("modal-contas");
const form = () => document.getElementById("form-conta");
const erroEl = () => document.querySelector('[data-erro-para="conta"]');
const botaoAdicionar = () => document.getElementById("botao-adicionar-conta");
const rotularBotaoAdicionar = (texto) => {
  const rotulo = botaoAdicionar().querySelector("span");
  if (rotulo) rotulo.textContent = texto;
  else botaoAdicionar().textContent = texto;
};

export function inicializarContas(onMudar) {
  aoMudarCallback = onMudar;

  document.getElementById("botao-gerenciar-contas").addEventListener("click", abrirModal);
  modal()
    .querySelectorAll("[data-fechar-modal]")
    .forEach((el) => el.addEventListener("click", fecharModal));
  document.getElementById("botao-limpar-conta").addEventListener("click", limparCampos);
  form().addEventListener("submit", aoSubmeter);
}

async function abrirModal() {
  modal().hidden = false;
  limparCampos();
  await atualizarLista();
}

function fecharModal() {
  modal().hidden = true;
}

async function atualizarLista() {
  const contas = await db.listarContas();
  const corpo = document.querySelector("#tabela-contas tbody");
  corpo.innerHTML = contas
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.nome)}</td>
        <td>${escapeHtml(c.banco || "—")}</td>
        <td>${c.tipo}</td>
        <td class="col-acoes">
          <button type="button" class="acao-tabela" data-editar="${c.id}" title="Editar" aria-label="Editar conta"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>
          <button type="button" class="acao-tabela acao-tabela--excluir" data-excluir="${c.id}" title="Excluir" aria-label="Excluir conta"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button>
        </td>
      </tr>`
    )
    .join("");

  corpo.querySelectorAll("[data-editar]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const conta = contas.find((c) => c.id === Number(btn.dataset.editar));
      contaSelecionadaId = conta.id;
      form().elements["id"].value = conta.id;
      form().elements["nome"].value = conta.nome;
      form().elements["banco"].value = conta.banco || "";
      form().elements["tipo"].value = conta.tipo;
      rotularBotaoAdicionar("Salvar alteração");
    })
  );
  corpo.querySelectorAll("[data-excluir]").forEach((btn) =>
    btn.addEventListener("click", () => excluirConta(Number(btn.dataset.excluir), contas))
  );
}

function limparCampos() {
  contaSelecionadaId = null;
  form().reset();
  form().elements["id"].value = "";
  rotularBotaoAdicionar("Adicionar");
  erroEl().textContent = "";
}

async function aoSubmeter(evento) {
  evento.preventDefault();
  erroEl().textContent = "";
  const dados = new FormData(form());
  const nome = String(dados.get("nome") || "").trim();
  const banco = String(dados.get("banco") || "").trim();
  const tipo = dados.get("tipo");
  const id = dados.get("id");

  try {
    if (!id) {
      await db.adicionarConta(nome, banco, tipo);
      toastSucesso("Conta adicionada!");
    } else {
      await db.editarConta(Number(id), nome, banco, tipo);
      toastSucesso("Conta atualizada!");
    }
    limparCampos();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    erroEl().textContent = erro.message;
  }
}

async function excluirConta(id, contas) {
  const conta = contas.find((c) => c.id === id);
  const confirmado = window.confirm(
    `Excluir a conta "${conta?.nome}"?\nLançamentos já existentes com essa conta continuam existindo, só ficam sem conta vinculada.`
  );
  if (!confirmado) return;
  try {
    await db.excluirConta(id);
    toastSucesso("Conta excluída.");
    limparCampos();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    toastErro(erro.message);
  }
}
