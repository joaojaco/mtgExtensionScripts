// googleInjecao.js - Painel Flutuante Inteligente para Scryfall na página do Google

(function() {
  // Evita duplicar o painel caso a página recarregue elementos
  if (document.getElementById("scryfall-floating-panel")) return;

  // Cria o elemento visual do painel flutuante
  const panel = document.createElement("div");
  panel.id = "scryfall-floating-panel";
  
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    padding: "12px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
    zIndex: "999999",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: "13px",
    maxWidth: "320px",
    display: "none", // Começa oculto até detetar a query
    border: "1px solid #334155"
  });

  panel.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: #60a5fa;">⚡ Scryfall Assistant</span>
      <span id="scryfall-status" style="font-size: 11px; color: #94a3b8;">A procurar...</span>
    </div>
    <div id="scryfall-query-box" style="background: #0f172a; padding: 6px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; margin-bottom: 8px; word-break: break-all; color: #38bdf8;">
      Nenhum comando detetado
    </div>
    <button id="scryfall-go-btn" style="width: 100%; background: #2563eb; color: white; border: none; padding: 6px; border-radius: 4px; font-weight: bold; cursor: pointer; text-align: center; display: none;">
      🚀 Abrir no Scryfall
    </button>
  `;

  document.body.appendChild(panel);

  const queryBox = panel.querySelector("#scryfall-query-box");
  const goBtn = panel.querySelector("#scryfall-go-btn");
  const statusEl = panel.querySelector("#scryfall-status");

  let queryEncontradaAnterior = "";

  function analisarPagina() {
    // Garante que só roda se a busca veio do nosso atalho 'sc'
    if (!window.location.search.includes("fa%C3%A7a+um+comando+valido+no+scryfall+que")) {
      panel.style.display = "none";
      return;
    }

    // Pega o texto bruto visível de toda a página de resultados do Google
    const textoPagina = document.body.innerText || "";

    // Regex para procurar padrões comuns do Scryfall (ex: art:, lore:, t:, c:, otag:, etc.)
    // Procura por blocos do tipo "chave:valor" ou frases entre aspas geradas pela IA
    const regexComando = /(?:art|lore|t|c|otag|oracle|ci|set|e):[^\s\n"']+(?:\s+(?:art|lore|t|c|otag|oracle|ci|set|e):[^\s\n"']+)*|[a-z]+:"[^"]+"/gi;
    
    const matches = textoPagina.match(regexComando);

    if (matches && matches.length > 0) {
      // Pega o primeiro comando válido encontrado na página
      const comandoLimpo = matches[0].trim();

      if (comandoLimpo && comandoLimpo !== queryEncontradaAnterior) {
        queryEncontradaAnterior = comandoLimpo;
        
        queryBox.textContent = comandoLimpo;
        statusEl.textContent = "Comando pronto!";
        statusEl.style.color = "#4ade80";
        goBtn.style.display = "block";
        panel.style.display = "block";

        goBtn.onclick = () => {
          window.open(`https://scryfall.com/search?q=${encodeURIComponent(comandoLimpo)}`, "_blank");
        };
      }
    }
  }

  // Observa alterações dinâmicas na página (já que a IA do Google carrega os blocos gradualmente)
  const observer = new MutationObserver(() => {
    analisarPagina();
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();