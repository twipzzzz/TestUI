// ============================================================================
// toast.js — pequenas notificações no canto da tela (sucesso/erro)
// ============================================================================

const container = () => document.getElementById("toasts");

function mostrarToast(mensagem, tipo = "info") {
  const el = document.createElement("div");
  el.className = `toast ${tipo === "erro" ? "toast--erro" : tipo === "sucesso" ? "toast--sucesso" : ""}`;
  el.textContent = mensagem;
  container().appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export const toastSucesso = (msg) => mostrarToast(msg, "sucesso");
export const toastErro = (msg) => mostrarToast(msg, "erro");
export const toastInfo = (msg) => mostrarToast(msg, "info");
