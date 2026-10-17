// ============================================================================
// formato.js — funções puras de formatação e conversão
// (sem dependência de DOM ou Supabase — fáceis de testar isoladamente)
// ============================================================================

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const MESES_ABREV = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** Formata um número para o padrão monetário brasileiro: R$ 1.234,56 */
export function formatarMoeda(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "R$ 0,00";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Converte texto digitado pelo usuário ('1234,56', '1.234,56' ou '1234.56')
 * em número. Lança Error com mensagem amigável se inválido.
 */
export function parseValor(valorStr) {
  if (valorStr == null) throw new Error("Informe um valor.");
  let texto = String(valorStr).trim().replace("R$", "").trim();
  if (!texto) throw new Error("Informe um valor.");

  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const valor = Number(texto);
  if (!Number.isFinite(valor)) {
    throw new Error("Valor inválido. Use apenas números (ex: 150,90).");
  }
  if (valor <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }
  return Math.round(valor * 100) / 100;
}

/** Converte 'dd/mm/aaaa' digitado pelo usuário para 'aaaa-mm-dd' (ISO). */
export function dataParaISO(dataStr) {
  const texto = String(dataStr || "").trim();
  const m = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error("Data inválida. Use o formato dd/mm/aaaa.");
  const [, dia, mes, ano] = m;
  const diaN = Number(dia), mesN = Number(mes), anoN = Number(ano);
  const dt = new Date(anoN, mesN - 1, diaN);
  const valida =
    dt.getFullYear() === anoN && dt.getMonth() === mesN - 1 && dt.getDate() === diaN;
  if (!valida) throw new Error("Data inválida. Use o formato dd/mm/aaaa.");
  return `${ano}-${mes}-${dia}`;
}

/** Converte 'aaaa-mm-dd' (ISO, vindo do banco) para 'dd/mm/aaaa' (exibição). */
export function isoParaDataBR(dataISO) {
  const [ano, mes, dia] = String(dataISO).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje no formato dd/mm/aaaa, no fuso horário local do navegador. */
export function hojeBR() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${hoje.getFullYear()}`;
}

/** Data de hoje no formato aaaa-mm-dd (ISO), no fuso horário local. */
export function hojeISO() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, "0");
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

/**
 * Retorna lista de {ano, mes} (mes 1-12) para os próximos `quantidade`
 * meses a partir do mês seguinte a `aPartirDe` (padrão: hoje).
 */
export function proximosPeriodos(quantidade = 3, aPartirDe = new Date()) {
  let ano = aPartirDe.getFullYear();
  let mes = aPartirDe.getMonth() + 1; // 1-12
  const periodos = [];
  for (let i = 0; i < quantidade; i++) {
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    periodos.push({ ano, mes });
  }
  return periodos;
}
