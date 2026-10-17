// ============================================================================
// ui-compartilhado.js — página "Compartilhado": grupo, membros, despesas,
// saldos (quem deve quanto pra quem), pagamentos + resumo no Dashboard
// ============================================================================

import * as db from "./db-compartilhado.js";
import { formatarMoeda, isoParaDataBR, hojeISO, parseValor, MESES_PT } from "./formato.js";
import {
  calcularDivisaoIgual,
  validarSomaDivisao,
  calcularSaldos,
  simplificarDividas,
} from "./calculos_compartilhado.js";
import { toastSucesso, toastErro } from "./toast.js";
import { escapeHtml } from "./ui-lancamentos.js";

let grupoAtual = null;
let membrosAtuais = [];
let meuId = null;

// dados completos do grupo (todos os meses) — base para saldos e resumos
let despesasTodas = [];
let divisoesTodas = [];
let pagamentosTodos = [];

// mês exibido na lista de despesas (mes: 1-12)
const hojeData = new Date();
let anoLista = hojeData.getFullYear();
let mesLista = hojeData.getMonth() + 1;

const selectMesComp = () => document.getElementById("select-mes-comp");
const selectAnoComp = () => document.getElementById("select-ano-comp");
const formPagamento = () => document.getElementById("form-pagamento");

// ------------------------------------------------------------------
// Seletor de mês (lista de despesas)
// ------------------------------------------------------------------
function garantirOpcaoAno(ano) {
  const select = selectAnoComp();
  if (![...select.options].some((o) => Number(o.value) === ano)) {
    select.innerHTML = [...select.options, new Option(ano, ano)]
      .sort((a, b) => Number(a.value) - Number(b.value))
      .map((o) => `<option value="${o.value}">${o.value}</option>`)
      .join("");
  }
}

function sincronizarSeletoresMes() {
  garantirOpcaoAno(anoLista);
  selectMesComp().value = String(mesLista);
  selectAnoComp().value = String(anoLista);
}

function mudarMes(delta) {
  const d = new Date(anoLista, mesLista - 1 + delta, 1);
  anoLista = d.getFullYear();
  mesLista = d.getMonth() + 1;
  sincronizarSeletoresMes();
  renderizarListaDespesas();
}

function inicializarSeletorMes() {
  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let a = anoAtual - 5; a <= anoAtual + 1; a++) anos.push(a);

  selectMesComp().innerHTML = MESES_PT.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  selectAnoComp().innerHTML = anos.map((a) => `<option value="${a}">${a}</option>`).join("");
  sincronizarSeletoresMes();

  selectMesComp().addEventListener("change", () => {
    mesLista = Number(selectMesComp().value);
    renderizarListaDespesas();
  });
  selectAnoComp().addEventListener("change", () => {
    anoLista = Number(selectAnoComp().value);
    renderizarListaDespesas();
  });
  document.getElementById("botao-mes-anterior-comp").addEventListener("click", () => mudarMes(-1));
  document.getElementById("botao-mes-proximo-comp").addEventListener("click", () => mudarMes(1));
}

function parseValorLivre(texto) {
  if (!texto) return 0;
  let limpo = String(texto).trim().replace("R$", "").trim();
  if (!limpo) return 0;
  if (limpo.includes(",") && limpo.includes(".")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if (limpo.includes(",")) limpo = limpo.replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : 0;
}

// ------------------------------------------------------------------
// Inicialização
// ------------------------------------------------------------------
export async function inicializarCompartilhado() {
  document.getElementById("form-criar-grupo").addEventListener("submit", aoCriarGrupo);
  document.getElementById("form-adicionar-membro").addEventListener("submit", aoAdicionarMembro);
  document.getElementById("form-despesa-compartilhada").addEventListener("submit", aoSalvarDespesa);
  formPagamento().addEventListener("submit", aoSalvarPagamento);
  document.querySelectorAll('input[name="tipo_divisao"]').forEach((r) => r.addEventListener("change", atualizarBlocoDivisao));
  document.querySelector('#form-despesa-compartilhada [name="valor_total"]').addEventListener("input", atualizarDicaSoma);
  document.querySelector('#form-despesa-compartilhada [name="data"]').value = hojeISO();
  formPagamento().elements["data"].value = hojeISO();
  inicializarSeletorMes();

  // botão "Registrar pagamento" ao lado de cada acerto sugerido
  document.getElementById("lista-acertos").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-acerto-de]");
    if (!botao) return;
    preencherPagamento(botao.dataset.acertoDe, botao.dataset.acertoPara, Number(botao.dataset.acertoValor));
  });

  // "Ver detalhes" no card do Dashboard
  document.getElementById("botao-ver-compartilhado").addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("ir-para-pagina", { detail: "compartilhado" }));
  });

  // outros membros podem ter mudado algo: atualiza ao abrir Dashboard/Compartilhado
  document.querySelectorAll(".item-nav").forEach((item) => {
    if (item.dataset.pagina === "dashboard" || item.dataset.pagina === "compartilhado") {
      item.addEventListener("click", () => atualizarCompartilhado().catch(() => {}));
    }
  });

  await atualizarCompartilhado();
}

export async function atualizarCompartilhado() {
  grupoAtual = await db.obterMeuGrupo();
  document.getElementById("bloco-sem-grupo").hidden = !!grupoAtual;
  document.getElementById("bloco-com-grupo").hidden = !grupoAtual;
  if (!grupoAtual) {
    renderizarResumoDashboard();
    return;
  }

  meuId = await db.obterMeuId();
  document.getElementById("titulo-grupo").textContent = grupoAtual.nome;
  membrosAtuais = await db.listarMembros(grupoAtual.id);
  renderizarMembros();
  preencherSelectPagoPor();
  preencherSelectsPagamento();
  atualizarBlocoDivisao();
  await recarregarDados();
}

/** Busca despesas, divisões e pagamentos do grupo e redesenha tudo. */
async function recarregarDados() {
  if (!grupoAtual) return;
  const [despesas, pagamentos] = await Promise.all([
    db.listarDespesas(grupoAtual.id),
    db.listarPagamentos(grupoAtual.id),
  ]);
  const divisoes = await db.listarTodasDivisoes(despesas.map((d) => d.id));
  despesasTodas = despesas;
  pagamentosTodos = pagamentos;
  divisoesTodas = divisoes;
  renderizarTudo();
}

function renderizarTudo() {
  renderizarListaDespesas();
  renderizarSaldos();
  renderizarPagamentos();
  renderizarResumoDashboard();
}

// ------------------------------------------------------------------
// Membros, grupo
// ------------------------------------------------------------------
const nomeDe = (id) => membrosAtuais.find((m) => m.id === id)?.nome || "Alguém";

function renderizarMembros() {
  const corpo = document.querySelector("#tabela-membros tbody");
  corpo.innerHTML = membrosAtuais.map((m) => `<tr><td><span class="saldo-linha__pessoa"><svg class="icone-pessoa" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg><span>${escapeHtml(m.nome)}</span></span></td></tr>`).join("");
  document.getElementById("contagem-membros-grupo").textContent = `${membrosAtuais.length} ${membrosAtuais.length === 1 ? "pessoa" : "pessoas"}`;
}

function preencherSelectPagoPor() {
  const select = document.querySelector('#form-despesa-compartilhada [name="pago_por"]');
  const valorAtual = select.value;
  select.innerHTML = membrosAtuais.map((m) => `<option value="${m.id}">${escapeHtml(m.nome)}</option>`).join("");
  if (membrosAtuais.some((m) => m.id === valorAtual)) select.value = valorAtual;
  else if (membrosAtuais.some((m) => m.id === meuId)) select.value = meuId;
}

async function aoCriarGrupo(evento) {
  evento.preventDefault();
  const erroEl = document.querySelector('[data-erro-para="criar-grupo"]');
  erroEl.textContent = "";
  const nome = new FormData(evento.target).get("nome");
  try {
    await db.criarGrupo(nome);
    toastSucesso("Grupo criado!");
    evento.target.reset();
    await atualizarCompartilhado();
  } catch (erro) {
    erroEl.textContent = erro.message;
  }
}

async function aoAdicionarMembro(evento) {
  evento.preventDefault();
  const erroEl = document.querySelector('[data-erro-para="adicionar-membro"]');
  erroEl.textContent = "";
  const email = new FormData(evento.target).get("email");
  try {
    await db.adicionarMembro(grupoAtual.id, email);
    toastSucesso("Pessoa adicionada ao grupo!");
    evento.target.reset();
    await atualizarCompartilhado();
  } catch (erro) {
    erroEl.textContent = erro.message;
  }
}

// ------------------------------------------------------------------
// Nova despesa: divisão igual / customizada
// ------------------------------------------------------------------
function atualizarBlocoDivisao() {
  const tipo = document.querySelector('input[name="tipo_divisao"]:checked')?.value;
  const bloco = document.getElementById("bloco-divisao-customizada");

  if (tipo === "customizado") {
    bloco.hidden = false;
    if (bloco.dataset.montado !== String(membrosAtuais.length) || bloco.dataset.grupo !== String(grupoAtual?.id)) {
      bloco.innerHTML = membrosAtuais
        .map(
          (m) => `
          <label class="campo campo--divisao">
            <span>${escapeHtml(m.nome)}</span>
            <input type="text" inputmode="decimal" class="input-divisao-membro" data-membro="${m.id}" placeholder="0,00" />
          </label>`
        )
        .join("");
      bloco.dataset.montado = String(membrosAtuais.length);
      bloco.dataset.grupo = String(grupoAtual?.id);
      bloco.querySelectorAll(".input-divisao-membro").forEach((i) => i.addEventListener("input", atualizarDicaSoma));
    }
    atualizarDicaSoma();
  } else {
    bloco.hidden = true;
    document.getElementById("dica-soma-divisao").textContent = "";
  }
}

function atualizarDicaSoma() {
  const tipo = document.querySelector('input[name="tipo_divisao"]:checked')?.value;
  const dica = document.getElementById("dica-soma-divisao");
  if (tipo !== "customizado") return;

  const valorTotal = parseValorLivre(document.querySelector('#form-despesa-compartilhada [name="valor_total"]').value);
  const inputs = [...document.querySelectorAll(".input-divisao-membro")];
  const soma = inputs.reduce((acc, i) => acc + parseValorLivre(i.value), 0);
  const diferenca = Math.round((valorTotal - soma) * 100) / 100;

  if (Math.abs(diferenca) < 0.005) {
    dica.textContent = `Soma: ${formatarMoeda(soma)} — bate certinho com o total ✅`;
    dica.classList.remove("dica-divisao--erro");
  } else {
    dica.textContent = `Soma: ${formatarMoeda(soma)} — ${diferenca > 0 ? "faltam " + formatarMoeda(diferenca) : "excede em " + formatarMoeda(-diferenca)} para bater com o total`;
    dica.classList.add("dica-divisao--erro");
  }
}

async function aoSalvarDespesa(evento) {
  evento.preventDefault();
  const erroEl = document.querySelector('[data-erro-para="despesa-compartilhada"]');
  erroEl.textContent = "";
  const form = evento.target;
  const dados = new FormData(form);

  try {
    const descricao = String(dados.get("descricao") || "").trim();
    if (!descricao) throw new Error("Informe uma descrição.");
    const valorTotal = parseValor(dados.get("valor_total"));
    const pagoPor = dados.get("pago_por");
    if (!pagoPor) throw new Error("Selecione quem pagou.");
    const dataISO = dados.get("data");
    if (!dataISO) throw new Error("Informe a data.");
    const categoria = dados.get("categoria");
    const tipoDivisao = dados.get("tipo_divisao");

    let divisoes;
    if (tipoDivisao === "igual") {
      divisoes = calcularDivisaoIgual(valorTotal, membrosAtuais.map((m) => m.id));
    } else {
      divisoes = [...document.querySelectorAll(".input-divisao-membro")].map((input) => ({
        user_id: input.dataset.membro,
        valor: parseValorLivre(input.value),
      }));
      if (!validarSomaDivisao(divisoes, valorTotal)) {
        throw new Error("A soma dos valores customizados precisa bater com o valor total.");
      }
    }

    await db.inserirDespesa(
      { grupo_id: grupoAtual.id, descricao, valor_total: valorTotal, pago_por: pagoPor, categoria, data: dataISO },
      divisoes
    );
    toastSucesso("Despesa compartilhada salva!");

    // a lista pula para o mês da despesa salva
    const [anoSalvo, mesSalvo] = dataISO.split("-").map(Number);
    anoLista = anoSalvo;
    mesLista = mesSalvo;
    sincronizarSeletoresMes();

    form.reset();
    form.querySelector('[name="data"]').value = hojeISO();
    document.querySelector('input[name="tipo_divisao"][value="igual"]').checked = true;
    preencherSelectPagoPor();
    atualizarBlocoDivisao();
    await recarregarDados();
  } catch (erro) {
    erroEl.textContent = erro.message;
    toastErro(erro.message);
  }
}

// ------------------------------------------------------------------
// Lista de despesas do mês
// ------------------------------------------------------------------
function renderizarListaDespesas() {
  if (!grupoAtual) return;
  const despesas = despesasTodas.filter((d) => {
    const [ano, mes] = d.data.split("-").map(Number);
    return ano === anoLista && mes === mesLista;
  });

  const total = despesas.reduce((s, d) => s + Number(d.valor_total), 0);
  document.getElementById("resumo-comp-total").textContent = formatarMoeda(total);
  document.getElementById("resumo-comp-qtd").textContent = String(despesas.length);

  const corpo = document.querySelector("#tabela-despesas-compartilhadas tbody");
  corpo.innerHTML = despesas
    .map((d) => {
      const pagador = membrosAtuais.find((m) => m.id === d.pago_por);
      return `<tr>
        <td>${isoParaDataBR(d.data)}</td>
        <td>${escapeHtml(d.descricao)}</td>
        <td>${escapeHtml(pagador ? pagador.nome : "—")}</td>
        <td class="col-num">${formatarMoeda(d.valor_total)}</td>
        <td class="col-acoes"><button type="button" class="acao-tabela acao-tabela--excluir" data-excluir="${d.id}" title="Excluir" aria-label="Excluir despesa compartilhada"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></td>
      </tr>`;
    })
    .join("");
  document.getElementById("aviso-sem-despesas-compartilhadas").hidden = despesas.length > 0;

  corpo.querySelectorAll("[data-excluir]").forEach((btn) =>
    btn.addEventListener("click", () => excluirDespesa(Number(btn.dataset.excluir)))
  );
}

async function excluirDespesa(id) {
  const confirmado = window.confirm("Excluir esta despesa compartilhada? Isso também remove a divisão registrada e muda os saldos.");
  if (!confirmado) return;
  try {
    await db.excluirDespesa(id);
    toastSucesso("Despesa excluída.");
    await recarregarDados();
  } catch (erro) {
    toastErro(erro.message);
  }
}

// ------------------------------------------------------------------
// Saldos: quem deve quanto pra quem
// ------------------------------------------------------------------
function calcularEstado() {
  const saldos = calcularSaldos(
    membrosAtuais.map((m) => m.id),
    despesasTodas,
    divisoesTodas,
    pagamentosTodos
  );
  return { saldos, acertos: simplificarDividas(saldos) };
}

/** "Carlos deve R$ 150,00 para Maria" — com "Você" / "você" quando é o próprio usuário. */
function fraseAcerto(a) {
  const de = a.de === meuId ? "Você" : nomeDe(a.de);
  const para = a.para === meuId ? "você" : nomeDe(a.para);
  return `<strong>${escapeHtml(de)}</strong> deve <strong>${formatarMoeda(a.valor)}</strong> para <strong>${escapeHtml(para)}</strong>`;
}

function renderizarSaldos() {
  if (!grupoAtual) return;
  const { saldos, acertos } = calcularEstado();

  const ordenados = [...saldos].sort((a, b) => b[1] - a[1]);
  document.getElementById("lista-saldos").innerHTML = ordenados
    .map(([id, valor]) => {
      const nome = id === meuId ? "Você" : nomeDe(id);
      let situacao = `<span class="saldo-linha__quite">quite</span>`;
      if (valor > 0.004) situacao = `<span class="valor-receita">a receber ${formatarMoeda(valor)}</span>`;
      else if (valor < -0.004) situacao = `<span class="valor-despesa">deve ${formatarMoeda(-valor)}</span>`;
      return `<div class="saldo-linha${id === meuId ? " saldo-linha--eu" : ""}">
        <span class="saldo-linha__pessoa"><svg class="icone-pessoa" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg><span>${escapeHtml(nome)}</span></span>${situacao}
      </div>`;
    })
    .join("");

  document.getElementById("lista-acertos").innerHTML = acertos
    .map(
      (a) => `<li class="${a.de === meuId || a.para === meuId ? "acerto--meu" : ""}">
        <span>${fraseAcerto(a)}</span>
        <button type="button" class="botao botao--secundario botao--pequeno"
          data-acerto-de="${a.de}" data-acerto-para="${a.para}" data-acerto-valor="${a.valor}"><svg class="ui-icon ui-icon--inline" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg><span>Registrar pagamento</span></button>
      </li>`
    )
    .join("");

  const quite = acertos.length === 0;
  document.getElementById("aviso-grupo-quite").hidden = !quite;
  document.getElementById("bloco-como-acertar").hidden = quite;
  const estado = document.getElementById("estado-grupo");
  estado.textContent = quite ? "Tudo certo" : `${acertos.length} acerto${acertos.length === 1 ? " pendente" : "s pendentes"}`;
  estado.classList.toggle("estado-grupo--pendente", !quite);
}

// ------------------------------------------------------------------
// Pagamentos / quitação
// ------------------------------------------------------------------
function preencherSelectsPagamento() {
  const form = formPagamento();
  const opcoes = membrosAtuais.map((m) => `<option value="${m.id}">${escapeHtml(m.nome)}</option>`).join("");
  const deAtual = form.elements["de_user_id"].value;
  const paraAtual = form.elements["para_user_id"].value;
  form.elements["de_user_id"].innerHTML = opcoes;
  form.elements["para_user_id"].innerHTML = opcoes;

  const ids = membrosAtuais.map((m) => m.id);
  const de = ids.includes(deAtual) ? deAtual : ids.includes(meuId) ? meuId : ids[0];
  const para = ids.includes(paraAtual) && paraAtual !== de ? paraAtual : ids.find((id) => id !== de);
  form.elements["de_user_id"].value = de || "";
  form.elements["para_user_id"].value = para || "";
}

function preencherPagamento(de, para, valor) {
  const form = formPagamento();
  form.elements["de_user_id"].value = de;
  form.elements["para_user_id"].value = para;
  form.elements["valor"].value = valor.toFixed(2).replace(".", ",");
  form.elements["data"].value = hojeISO();
  document.querySelector('[data-erro-para="pagamento"]').textContent = "";
  document.getElementById("cartao-pagamento").scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements["valor"].focus();
}

async function aoSalvarPagamento(evento) {
  evento.preventDefault();
  const erroEl = document.querySelector('[data-erro-para="pagamento"]');
  erroEl.textContent = "";
  const form = evento.target;
  const dados = new FormData(form);

  try {
    const de = dados.get("de_user_id");
    const para = dados.get("para_user_id");
    if (!de || !para) throw new Error("Selecione quem pagou e quem recebeu.");
    if (de === para) throw new Error("Quem paga e quem recebe precisam ser pessoas diferentes.");
    const valor = parseValor(dados.get("valor"));
    const dataISO = dados.get("data");
    if (!dataISO) throw new Error("Informe a data do pagamento.");

    await db.inserirPagamento({
      grupo_id: grupoAtual.id,
      de_user_id: de,
      para_user_id: para,
      valor,
      data: dataISO,
      observacao: String(dados.get("observacao") || "").trim(),
    });
    toastSucesso("Pagamento registrado!");
    form.reset();
    form.elements["data"].value = hojeISO();
    preencherSelectsPagamento();
    await recarregarDados();
  } catch (erro) {
    erroEl.textContent = erro.message;
    toastErro(erro.message);
  }
}

function renderizarPagamentos() {
  if (!grupoAtual) return;
  const corpo = document.querySelector("#tabela-pagamentos tbody");
  corpo.innerHTML = pagamentosTodos
    .map((p) => {
      const de = p.de_user_id === meuId ? "Você" : nomeDe(p.de_user_id);
      const para = p.para_user_id === meuId ? "Você" : nomeDe(p.para_user_id);
      return `<tr>
        <td>${isoParaDataBR(p.data)}</td>
        <td>${escapeHtml(de)}</td>
        <td>${escapeHtml(para)}</td>
        <td class="col-num">${formatarMoeda(p.valor)}</td>
        <td>${escapeHtml(p.observacao || "—")}</td>
        <td class="col-acoes"><button type="button" class="acao-tabela acao-tabela--excluir" data-excluir-pagamento="${p.id}" title="Excluir" aria-label="Excluir pagamento"><svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3"/></svg></button></td>
      </tr>`;
    })
    .join("");
  document.getElementById("aviso-sem-pagamentos").hidden = pagamentosTodos.length > 0;

  corpo.querySelectorAll("[data-excluir-pagamento]").forEach((btn) =>
    btn.addEventListener("click", () => excluirPagamento(Number(btn.dataset.excluirPagamento)))
  );
}

async function excluirPagamento(id) {
  const confirmado = window.confirm("Excluir este pagamento? Os saldos do grupo voltam a considerar essa dívida.");
  if (!confirmado) return;
  try {
    await db.excluirPagamento(id);
    toastSucesso("Pagamento excluído.");
    await recarregarDados();
  } catch (erro) {
    toastErro(erro.message);
  }
}

// ------------------------------------------------------------------
// Resumo no Dashboard principal
// ------------------------------------------------------------------
function renderizarResumoDashboard() {
  const card = document.getElementById("cartao-dashboard-compartilhado");
  if (!card) return;
  card.hidden = !grupoAtual;
  if (!grupoAtual) return;

  const { saldos, acertos } = calcularEstado();
  document.getElementById("dash-comp-grupo").textContent = `— ${grupoAtual.nome}`;

  // meu saldo
  const meu = Math.round((saldos.get(meuId) || 0) * 100) / 100;
  const saldoEl = document.getElementById("dash-comp-saldo");
  const textoEl = document.getElementById("dash-comp-saldo-texto");
  saldoEl.textContent = formatarMoeda(Math.abs(meu));
  if (meu > 0.004) {
    saldoEl.className = "valor-receita";
    textoEl.textContent = "você tem a receber";
  } else if (meu < -0.004) {
    saldoEl.className = "valor-despesa";
    textoEl.textContent = "você deve";
  } else {
    saldoEl.className = "";
    textoEl.textContent = "você está quite";
  }

  // movimento do mês atual (mês real, não o exibido na lista)
  const hoje = new Date();
  const doMes = despesasTodas.filter((d) => {
    const [ano, mes] = d.data.split("-").map(Number);
    return ano === hoje.getFullYear() && mes === hoje.getMonth() + 1;
  });
  const idsDoMes = new Set(doMes.map((d) => d.id));
  const totalMes = doMes.reduce((s, d) => s + Number(d.valor_total), 0);
  const minhaParte = divisoesTodas
    .filter((v) => v.user_id === meuId && idsDoMes.has(v.despesa_id))
    .reduce((s, v) => s + Number(v.valor_devido), 0);
  document.getElementById("dash-comp-mes-total").textContent = formatarMoeda(totalMes);
  document.getElementById("dash-comp-mes-minha").textContent = formatarMoeda(minhaParte);

  // quem deve quanto pra quem
  document.getElementById("dash-comp-acertos").innerHTML = acertos
    .map((a) => `<li class="${a.de === meuId || a.para === meuId ? "acerto--meu" : ""}"><span>${fraseAcerto(a)}</span></li>`)
    .join("");
  document.getElementById("dash-comp-quite").hidden = acertos.length > 0;
}
