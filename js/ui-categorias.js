// ============================================================================
// ui-categorias.js — modal "Gerenciar Categorias"
// ============================================================================

import * as db from "./db.js";
import { toastSucesso, toastErro } from "./toast.js";
import { escapeHtml } from "./ui-lancamentos.js";

let categoriaSelecionada = null;
let aoMudarCallback = null; // avisa main.js/ui-lancamentos para recarregar selects

const modal = () => document.getElementById("modal-categorias");
const form = () => document.getElementById("form-categoria");
const erroEl = () => document.querySelector('[data-erro-para="categoria"]');
const botaoAdicionar = () => document.getElementById("botao-adicionar-categoria");
const rotularBotaoAdicionar = (texto) => {
  const rotulo = botaoAdicionar().querySelector("span");
  if (rotulo) rotulo.textContent = texto;
  else botaoAdicionar().textContent = texto;
};

export function inicializarCategorias(onMudar) {
  aoMudarCallback = onMudar;

  document.getElementById("botao-gerenciar-categorias").addEventListener("click", abrirModal);
  modal()
    .querySelectorAll("[data-fechar-modal]")
    .forEach((el) => el.addEventListener("click", fecharModal));
  document.getElementById("botao-limpar-categoria").addEventListener("click", limparCampos);
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
  const categorias = await db.listarCategoriasCompletas();
  const corpo = document.querySelector("#tabela-categorias tbody");
  corpo.innerHTML = categorias
    .map(
      (c) => `<tr>
        <td>${escapeHtml(c.nome)}</td>
        <td>${c.tipo}</td>
        <td class="col-acoes">
          <button type="button" class="acao-tabela" data-editar="${escapeHtml(c.nome)}" data-tipo="${c.tipo}" title="Editar" aria-label="Editar categoria"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z"/></svg></button>
          <button type="button" class="acao-tabela acao-tabela--excluir" data-excluir="${escapeHtml(c.nome)}" title="Excluir" aria-label="Excluir categoria"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button>
        </td>
      </tr>`
    )
    .join("");

  corpo.querySelectorAll("[data-editar]").forEach((btn) =>
    btn.addEventListener("click", () => {
      categoriaSelecionada = btn.dataset.editar;
      form().elements["nome_original"].value = categoriaSelecionada;
      form().elements["nome"].value = categoriaSelecionada;
      form().elements["tipo"].value = btn.dataset.tipo;
      rotularBotaoAdicionar("Salvar alteração");
    })
  );
  corpo.querySelectorAll("[data-excluir]").forEach((btn) =>
    btn.addEventListener("click", () => excluirCategoria(btn.dataset.excluir))
  );
}

function limparCampos() {
  categoriaSelecionada = null;
  form().reset();
  form().elements["nome_original"].value = "";
  rotularBotaoAdicionar("Adicionar");
  erroEl().textContent = "";
}

async function aoSubmeter(evento) {
  evento.preventDefault();
  erroEl().textContent = "";
  const dados = new FormData(form());
  const nome = String(dados.get("nome") || "").trim();
  const tipo = dados.get("tipo");
  const nomeOriginal = dados.get("nome_original");

  try {
    if (!nomeOriginal) {
      await db.adicionarCategoria(nome, tipo);
      toastSucesso("Categoria adicionada!");
    } else {
      await db.editarCategoria(nomeOriginal, nome, tipo);
      toastSucesso("Categoria atualizada!");
    }
    limparCampos();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    erroEl().textContent = erro.message;
  }
}

async function excluirCategoria(nome) {
  const confirmado = window.confirm(
    `Excluir a categoria "${nome}"?\nLançamentos já existentes com essa categoria não serão apagados.`
  );
  if (!confirmado) return;
  try {
    await db.excluirCategoria(nome);
    toastSucesso("Categoria excluída.");
    limparCampos();
    await atualizarLista();
    if (aoMudarCallback) await aoMudarCallback();
  } catch (erro) {
    toastErro(erro.message);
  }
}
