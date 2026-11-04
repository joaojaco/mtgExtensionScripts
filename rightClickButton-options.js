// ---------- Menus de clique direito (EDHREC) ----------
function criarMenu() {
  chrome.contextMenus.removeAll(() => {
    const contexts = ["image", "link", "selection"];
    const documentUrlPatterns = ["https://edhrec.com/*"];
    const itens = [
      ["open-scryfall", "Abrir essa carta no Scryfall"],
      ["open-tagger", "Abrir essa carta no Scryfall Tagger"]
    ];
    for (const [id, title] of itens) {
      chrome.contextMenus.create({ id, title, contexts, documentUrlPatterns });
    }
  });
}

chrome.runtime.onInstalled.addListener(criarMenu);
chrome.runtime.onStartup.addListener(criarMenu);

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function abrir(url) {
  chrome.tabs.create({ url });
}

// ---------- Descobrir a carta clicada ----------
// Devolve o objeto da carta do Scryfall (ou null)
async function acharCarta(info) {
  // 1) Imagem da carta (o UUID da imagem é o ID da carta no Scryfall)
  const m = info.srcUrl && info.srcUrl.match(UUID);
  if (m) {
    try {
      const r = await fetch("https://api.scryfall.com/cards/" + m[0]);
      if (r.ok) return await r.json();
    } catch (e) {
      console.error("Erro ao consultar o Scryfall:", e);
    }
  }

  // 2) Nome selecionado ou link de carta (edhrec.com/cards/nome-da-carta)
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
  if (info.menuItemId === "open-tagger") {
    const carta = await acharCarta(info);
    if (carta && carta.set && carta.collector_number) {
      return abrir(
        `https://tagger.scryfall.com/card/${carta.set}/${encodeURIComponent(carta.collector_number)}`
      );
    }
    // Se não achou a carta, abre a busca do Scryfall como plano B
    if (info.selectionText) {
      return abrir("https://scryfall.com/search?q=" + encodeURIComponent(info.selectionText));
    }
    return;
  }

  if (info.menuItemId !== "open-scryfall") return;

  // ----- Abrir no Scryfall -----
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

// ---------- Ícone da extensão: abre a janela própria ----------
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL("setSelector.html");

  // Se a janela já está aberta, só traz para a frente
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