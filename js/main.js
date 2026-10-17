// ============================================================================
// main.js — ponto de entrada: autenticação, navegação entre páginas e boot
// ============================================================================

import { cadastrar, entrar, sair, obterSessaoAtual, aoMudarSessao } from "./auth.js";
import * as db from "./db.js";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabaseClient.js';
const configuracaoValida = SUPABASE_URL !== "" && SUPABASE_ANON_KEY !== "";
import { inicializarLancamentos, atualizarOpcoesCategoria, atualizarOpcoesConta, atualizarListaRecentes } from "./ui-lancamentos.js";
import { inicializarDashboard, atualizarDashboard } from "./ui-dashboard.js";
import { inicializarHistorico, atualizarHistorico } from "./ui-historico.js";
import { inicializarCategorias } from "./ui-categorias.js";
import { inicializarContas } from "./ui-contas.js";
import { inicializarCompartilhado } from "./ui-compartilhado.js";
import { toastErro } from "./toast.js";

let appJaInicializado = false;

// ------------------------------------------------------------------
// Erro fatal: mostrado no lugar da página inteira quando o app não
// consegue nem começar (config do Supabase ausente, CDN bloqueado, etc.)
// Existe propositalmente para NUNCA deixar a tela em branco sem explicação.
// ------------------------------------------------------------------
function mostrarErroFatal(mensagem) {
  const telaAuth = document.getElementById("tela-auth");
  const app = document.getElementById("app");
  if (telaAuth) telaAuth.hidden = true;
  if (app) app.hidden = true;

  let caixa = document.getElementById("erro-fatal");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.id = "erro-fatal";
    caixa.className = "erro-fatal";
    document.body.appendChild(caixa);
  }
  caixa.hidden = false;
  caixa.innerHTML = `
    <div class="erro-fatal__caixa">
      <h1>⚠️ Não foi possível iniciar o app</h1>
      <p>${mensagem}</p>
      <p class="erro-fatal__dica">Abra o Console do navegador (F12 → aba "Console") para mais detalhes técnicos.</p>
    </div>`;
}

// ------------------------------------------------------------------
// Tela de autenticação
// ------------------------------------------------------------------
function inicializarTelaAuth() {
  const botoesAba = document.querySelectorAll(".abas-auth__botao");
  const formEntrar = document.getElementById("form-entrar");
  const formCriar = document.getElementById("form-criar");
  const avisoConfirmacao = document.querySelector("[data-aviso-confirmacao]");

  botoesAba.forEach((botao) => {
    botao.addEventListener("click", () => {
      botoesAba.forEach((b) => { b.classList.remove("is-ativo"); b.setAttribute("aria-selected", "false"); });
      botao.classList.add("is-ativo");
      botao.setAttribute("aria-selected", "true");
      const aba = botao.dataset.aba;
      formEntrar.hidden = aba !== "entrar";
      formCriar.hidden = aba !== "criar";
      avisoConfirmacao.hidden = true;
    });
  });

  formEntrar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erroEl = document.querySelector('[data-erro-para="entrar"]');
    erroEl.textContent = "";
    const dados = new FormData(formEntrar);
    try {
      await entrar({ email: dados.get("email"), senha: dados.get("senha") });
      // a troca de tela acontece via aoMudarSessao()
    } catch (erro) {
      erroEl.textContent = erro.message;
    }
  });

  formCriar.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    const erroEl = document.querySelector('[data-erro-para="criar"]');
    erroEl.textContent = "";
    const dados = new FormData(formCriar);
    try {
      const { precisaConfirmarEmail } = await cadastrar({
        nome: dados.get("nome"),
        email: dados.get("email"),
        senha: dados.get("senha"),
      });
      if (precisaConfirmarEmail) {
        avisoConfirmacao.hidden = false;
        formCriar.reset();
      }
      // se a confirmação por e-mail estiver desativada, a sessão já vem
      // ativa e aoMudarSessao() troca de tela sozinho.
    } catch (erro) {
      erroEl.textContent = erro.message;
    }
  });
}

// ------------------------------------------------------------------
// Navegação entre páginas do app
// ------------------------------------------------------------------
function inicializarNavegacao() {
  const itens = document.querySelectorAll(".item-nav");
  itens.forEach((item) => {
    item.addEventListener("click", () => mostrarPagina(item.dataset.pagina));
  });
  document.querySelectorAll("[data-ir-pagina]").forEach((item) => {
    item.addEventListener("click", () => mostrarPagina(item.dataset.irPagina));
  });
  document.addEventListener("ir-para-pagina", (evento) => mostrarPagina(evento.detail));
}

function mostrarPagina(nome) {
  document.querySelectorAll(".pagina").forEach((p) => { p.hidden = p.dataset.pagina !== nome; });
  document.querySelectorAll(".item-nav").forEach((i) => i.classList.toggle("is-ativo", i.dataset.pagina === nome));
  window.scrollTo({ top: 0 });
}

// ------------------------------------------------------------------
// Boot do app principal (só roda uma vez, na primeira sessão válida)
// ------------------------------------------------------------------
async function iniciarAppPrincipal() {
  if (appJaInicializado) return;
  appJaInicializado = true;

  inicializarNavegacao();
  inicializarCategorias(async () => {
    await atualizarOpcoesCategoria();
    await atualizarDashboard();
    await atualizarHistorico();
  });
  inicializarContas(async () => {
    await atualizarOpcoesConta();
    await atualizarListaRecentes();
    await atualizarDashboard();
    await atualizarHistorico();
  });
  inicializarLancamentos(async () => {
    await atualizarDashboard();
    await atualizarHistorico();
  });
  inicializarDashboard();
  inicializarHistorico(async () => {
    await atualizarDashboard();
    await atualizarListaRecentes();
  });
  inicializarCompartilhado();

  document.getElementById("botao-sair").addEventListener("click", sair);

  try {
    const perfil = await db.obterMeuPerfil();
    document.getElementById("rodape-nome-usuario").textContent = perfil?.nome || "Você";
  } catch {
    document.getElementById("rodape-nome-usuario").textContent = "Você";
  }

  await Promise.all([atualizarListaRecentes(), atualizarDashboard(), atualizarHistorico()]);
}

// ------------------------------------------------------------------
// Alterna entre tela de login e app principal conforme a sessão
// ------------------------------------------------------------------
function mostrarTelaAuth() {
  document.getElementById("tela-auth").hidden = false;
  document.getElementById("app").hidden = true;
}

async function mostrarAppPrincipal() {
  document.getElementById("tela-auth").hidden = true;
  document.getElementById("app").hidden = false;
  try {
    await iniciarAppPrincipal();
  } catch (erro) {
    toastErro("Erro ao carregar seus dados: " + erro.message);
  }
}

async function reagirASessao(sessao) {
  if (sessao) {
    await mostrarAppPrincipal();
  } else {
    appJaInicializado = false;
    mostrarTelaAuth();
  }
}

// ------------------------------------------------------------------
// Boot geral
// ------------------------------------------------------------------
async function iniciar() {
  if (!configuracaoValida) {
    mostrarErroFatal(
      "O arquivo <code>js/supabaseClient.js</code> ainda está com os valores de exemplo " +
        "(<code>COLOQUE_AQUI_...</code>). Edite <code>SUPABASE_URL</code> e " +
        "<code>SUPABASE_ANON_KEY</code> com os dados do seu projeto Supabase " +
        "(menu <strong>Project Settings → API</strong>) e publique novamente."
    );
    return;
  }
  inicializarTelaAuth();
  aoMudarSessao(reagirASessao);
  const sessao = await obterSessaoAtual();
  await reagirASessao(sessao);
}

iniciar().catch((erro) => {
  console.error("Falha ao iniciar o app:", erro);
  mostrarErroFatal(erro?.message || "Erro desconhecido ao iniciar o aplicativo.");
});
