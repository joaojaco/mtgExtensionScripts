// buscaIA.js - Janela da Busca Inteligente (Scryfall + Gemini)

document.addEventListener("DOMContentLoaded", async () => {
  const apiKeyInput = document.getElementById("apiKeyInput");
  const btnSalvarKey = document.getElementById("btnSalvarKey");
  const keyStatus = document.getElementById("keyStatus");

  const nlpQueryInput = document.getElementById("nlpQueryInput");
  const btnBuscarNlp = document.getElementById("btnBuscarNlp");
  const nlpStatus = document.getElementById("nlpStatus");

  function exibirStatus(elemento, mensagem, tipo) {
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.style.display = "block";
    elemento.className = `status-msg status-${tipo}`;
  }

  // Abre o Scryfall numa janela normal do Chrome (e não dentro desta janelinha)
  async function abrirNaJanelaNormal(url) {
    const janelas = (await chrome.windows.getAll()).filter((j) => j.type === "normal");
    if (!janelas.length) {
      await chrome.windows.create({ url });
      return;
    }
    const alvo = janelas.find((j) => j.focused) || janelas[0];
    await chrome.tabs.create({ windowId: alvo.id, url });
    await chrome.windows.update(alvo.id, { focused: true });
  }

  // 1) Restaura a chave e a última pergunta
  const chaveSalva = await obterApiKey();
  if (chaveSalva) apiKeyInput.value = chaveSalva;

  const guardado = await chrome.storage.local.get("ultimaBuscaIA");
  if (guardado.ultimaBuscaIA) nlpQueryInput.value = guardado.ultimaBuscaIA;

  nlpQueryInput.addEventListener("input", () => {
    chrome.storage.local.set({ ultimaBuscaIA: nlpQueryInput.value });
  });

  // 2) Salvar e validar a chave
  btnSalvarKey.addEventListener("click", async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      exibirStatus(keyStatus, "Por favor, digite uma API Key válida.", "error");
      return;
    }

    exibirStatus(keyStatus, "Validando chave com a API do Gemini...", "success");
    try {
      const resultado = await testarApiKey(key);
      if (resultado.ok) {
        await salvarApiKey(key);
        exibirStatus(keyStatus, "✓ Chave salva e validada com sucesso!", "success");
      } else {
        exibirStatus(keyStatus, `✕ Recusada: ${resultado.errorMsg}`, "error");
      }
    } catch (err) {
      exibirStatus(keyStatus, `✕ ${err.message}`, "error");
    }
  });

  // 3) Busca com linguagem natural
  let buscando = false;

  async function executarBuscaIA() {
    if (buscando) return;

    const texto = nlpQueryInput.value.trim();
    if (!texto) {
      exibirStatus(nlpStatus, "Digite o que você procura antes de buscar.", "error");
      return;
    }

    buscando = true;
    btnBuscarNlp.disabled = true;

    const inicio = Date.now();
    const mostrarProgresso = () => {
      const s = Math.round((Date.now() - inicio) / 1000);
      exibirStatus(nlpStatus, `Traduzindo busca com IA... (${s}s)`, "success");
    };
    mostrarProgresso();
    const timer = setInterval(mostrarProgresso, 1000);

    try {
      const scryfallQuery = await traduzirParaScryfallQuery(texto);
      clearInterval(timer);
      exibirStatus(nlpStatus, `Query gerada: ${scryfallQuery}`, "success");

      await abrirNaJanelaNormal(
        "https://scryfall.com/search?q=" + encodeURIComponent(scryfallQuery)
      );
    } catch (err) {
      clearInterval(timer);
      exibirStatus(nlpStatus, `✕ ${err.message}`, "error");
    } finally {
      clearInterval(timer);
      buscando = false;
      btnBuscarNlp.disabled = false;
    }
  }

  btnBuscarNlp.addEventListener("click", executarBuscaIA);

  nlpQueryInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executarBuscaIA();
    }
  });
});