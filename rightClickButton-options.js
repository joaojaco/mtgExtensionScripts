// ---------- Menus de clique direito (EDHREC e Seleção de Texto) ----------
function criarMenu() {
  chrome.contextMenus.removeAll(() => {
    const contexts = ["image", "link", "selection"];
    const documentUrlPatterns = ["https://edhrec.com/*", "https://www.google.com/*"];
    
    // Itens para EDHREC
    chrome.contextMenus.create({ id: "open-scryfall", title: "Abrir essa carta no Scryfall", contexts: ["image", "link", "selection"], documentUrlPatterns: ["https://edhrec.com/*"] });
    chrome.contextMenus.create({ id: "open-tagger", title: "Abrir essa carta no Scryfall Tagger", contexts: ["image", "link", "selection"], documentUrlPatterns: ["https://edhrec.com/*"] });

    // Novo item universal para abrir texto selecionado (ex: queries geradas pelo Google)
    chrome.contextMenus.create({
      id: "abrir-comando-scryfall",
      title: "Abrir comando no Scryfall",
      contexts: ["selection"]
    });
  });
}

chrome.runtime.onInstalled.addListener(criarMenu);
chrome.runtime.onStartup.addListener(criarMenu);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function abrir(url) {
  chrome.tabs.create({ url });
}

// ---------- Atalho na Barra de Endereços (Omnibox: digite "sc" + Espaço) ----------
chrome.omnibox.onInputEntered.addListener((textoDigitado) => {
  const queryCompleta = `faça um comando valido no scryfall que: ${textoDigitado}`;
  const urlGoogle = `https://www.google.com/search?q=${encodeURIComponent(queryCompleta)}`;
  abrir(urlGoogle);
});

// ---------- Descobrir a carta clicada (EDHREC) ----------
async function acharCarta(info) {
  const m = info.srcUrl && info.srcUrl.match(UUID);
  if (m) {
    try {
      const r = await fetch("https://api.scryfall.com/cards/" + m[0]);
      if (r.ok) return await r.json();
    } catch (e) {
      console.error("Erro ao consultar o Scryfall:", e);
    }
  }

  let nome = info.selectionText;
  if (!nome && info.linkUrl) {
    const l = new URL(info.linkUrl).pathname.match(/^\/cards\/([^/]+)/);
    if (l) nome = decodeURIComponent(l[1]).replace(/-/g, " ");
  }
  if (nome) {
    try {
      const r = await fetch(
        "https://api.scryfall.com/cards/named?fuzzy=" + encodeURIComponent(nome.trim())
      );
      if (r.ok) return await r.json();
    } catch (e) {
      console.error("Erro ao consultar o Scryfall:", e);
    }
  }
  return null;
}

// ---------- Cliques nos menus ----------
chrome.contextMenus.onClicked.addListener(async (info) => {
  // Novo fluxo: Abrir texto selecionado diretamente como query no Scryfall
  if (info.menuItemId === "abrir-comando-scryfall") {
    if (info.selectionText) {
      const queryLimpa = info.selectionText.trim();
      return abrir("https://scryfall.com/search?q=" + encodeURIComponent(queryLimpa));
    }
    return;
  }

  if (info.menuItemId === "open-tagger") {
    const carta = await acharCarta(info);
    if (carta && carta.set && carta.collector_number) {
      return abrir(
        `https://tagger.scryfall.com/card/${carta.set}/${encodeURIComponent(carta.collector_number)}`
      );
    }
    if (info.selectionText) {
      return abrir("https://scryfall.com/search?q=" + encodeURIComponent(info.selectionText));
    }
    return;
  }

  if (info.menuItemId !== "open-scryfall") return;

  if (info.selectionText) {
    return abrir("https://scryfall.com/search?q=" + encodeURIComponent(info.selectionText));
  }

  const m = info.srcUrl && info.srcUrl.match(UUID);
  if (m) {
    try {
      const r = await fetch("https://api.scryfall.com/cards/" + m[0]);
      const card = await r.json();
      if (card.scryfall_uri) return abrir(card.scryfall_uri);
    } catch (e) {
      console.error("Erro ao consultar o Scryfall:", e);
    }
  }

  if (info.linkUrl) {
    const l = new URL(info.linkUrl).pathname.match(/^\/cards\/([^/]+)/);
    if (l) {
      const nome = decodeURIComponent(l[1]).replace(/-/g, " ");
      return abrir("https://scryfall.com/search?q=" + encodeURIComponent(nome));
    }
  }
});

// ---------- Ícone da extensão: abre o seletor de sets ----------
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("setSelector.html");

  const janelas = await chrome.windows.getAll({ populate: true });
  const existente = janelas.find(
    (j) => j.tabs && j.tabs.some((t) => t.url === url)
  );
  if (existente) {
    await chrome.windows.update(existente.id, { focused: true });
    return;
  }

  await chrome.windows.create({
    url,
    type: "popup",
    width: 560,
    height: 1000,
    top: 0
  });
});