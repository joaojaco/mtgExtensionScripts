(() => {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const MIN = 150;
  const MAX = 720;
  const PROPORCAO = 1.396;
  const ATRASO_PRELOAD = 60;

  let largura = 350;
  try {
    largura = Number(localStorage.getItem("zoomLargura")) || 350;
  } catch (e) {}

  let mouseX = 0;
  let mouseY = 0;
  let altPressionado = false;
  let qPressionado = false; // Mudança: Agora usando a tecla Q
  let urlAtualExibida = null;
  let urlsTokensExibidasJson = "";
  let timerPreload = null;
  let rafLoop = null;

  const preCarregadas = new Set();
  const cacheScryfall = new Map();

  const zoom = document.createElement("img");
  Object.assign(zoom.style, {
    position: "fixed",
    display: "none",
    zIndex: "2147483647",
    pointerEvents: "none",
    borderRadius: "5%",
    boxShadow: "0 8px 30px rgba(0,0,0,0.6)"
  });
  zoom.onerror = () => { zoom.style.display = "none"; };
  document.documentElement.appendChild(zoom);

  const containerTokens = document.createElement("div");
  Object.assign(containerTokens.style, {
    position: "fixed",
    display: "none",
    zIndex: "2147483647",
    pointerEvents: "none",
    displayFlex: "flex",
    gap: "10px"
  });
  document.documentElement.appendChild(containerTokens);

  async function buscarDadosScryfall(uuid) {
    if (cacheScryfall.has(uuid)) return cacheScryfall.get(uuid);
    try {
      const r = await fetch(`https://api.scryfall.com/cards/${uuid}`);
      if (!r.ok) return null;
      const json = await r.json();
      cacheScryfall.set(uuid, json);
      return json;
    } catch (e) {
      return null;
    }
  }

  async function obterUrlsTokens(uuidBase) {
    const carta = await buscarDadosScryfall(uuidBase);
    if (!carta || !carta.all_parts) return [];

    const urlsTokens = [];
    for (const parte of carta.all_parts) {
      if (parte.component === "token" || (parte.type_line && parte.type_line.toLowerCase().includes("token"))) {
        try {
          const r = await fetch(parte.uri);
          if (r.ok) {
            const tokenJson = await r.json();
            let imgUrl = null;
            if (tokenJson.image_uris && tokenJson.image_uris.large) {
              imgUrl = tokenJson.image_uris.large;
            } else if (tokenJson.card_faces && tokenJson.card_faces[0].image_uris) {
              imgUrl = tokenJson.card_faces[0].image_uris.large;
            }
            if (imgUrl && !urlsTokens.includes(imgUrl)) {
              urlsTokens.push(imgUrl);
            }
          }
        } catch (err) {}
      }
    }
    return urlsTokens;
  }

  async function obterUrlImagemGrande(uuidBase, ehVerso) {
    const urlFrentePadrao = `https://cards.scryfall.io/large/front/${uuidBase[0]}/${uuidBase[1]}/${uuidBase}.jpg`;
    if (!ehVerso) return urlFrentePadrao;

    const carta = await buscarDadosScryfall(uuidBase);
    if (carta && carta.card_faces && carta.card_faces.length > 1) {
      const faceVerso = carta.card_faces[1];
      if (faceVerso.image_uris && (faceVerso.image_uris.large || faceVerso.image_uris.normal)) {
        return faceVerso.image_uris.large || faceVerso.image_uris.normal;
      }
    }
    return urlFrentePadrao;
  }

  async function acharCartaSobMouse(x, y) {
    const elementos = document.elementsFromPoint(x, y);

    for (const el of elementos) {
      if (el === zoom || containerTokens.contains(el)) continue;

      let elAtual = el;
      let ehVerso = false;

      for (let i = 0; i < 4 && elAtual && elAtual !== document.body; i++) {
        const cls = (elAtual.className || "").toString().toLowerCase();
        const src = (elAtual.src || "").toString().toLowerCase();
        const alt = (elAtual.alt || "").toString().toLowerCase();
        const href = (elAtual.href || "").toString().toLowerCase();

        if (
          cls.includes("back") || cls.includes("flip") ||
          src.includes("back") || alt.includes("back") || href.includes("back") ||
          elAtual.getAttribute("data-face") === "back" ||
          elAtual.getAttribute("data-card-face") === "back"
        ) {
          ehVerso = true;
          break;
        }
        elAtual = elAtual.parentElement;
      }

      let texto = "";
      if (el.tagName === "IMG") {
        texto = (el.currentSrc || "") + " " + (el.src || "") + " " + (el.srcset || "");
      } else {
        texto = getComputedStyle(el).backgroundImage || "";
      }

      const m = texto.match(UUID);
      if (m) {
        const uuidBase = m[0].toLowerCase();
        const urlFinal = await obterUrlImagemGrande(uuidBase, ehVerso);
        const urlsTokens = qPressionado ? await obterUrlsTokens(uuidBase) : [];
        return { urlFinal, urlsTokens };
      }
    }
    return null;
  }

  function preCarregar(url) {
    if (!url || preCarregadas.has(url)) return;
    preCarregadas.add(url);
    const img = new Image();
    img.src = url;
  }

  function posicionar(temTokens) {
    const altura = largura * PROPORCAO;
    let left = mouseX + 20;
    let top = mouseY - altura / 2;

    if (left + largura > window.innerWidth - 8) {
      left = mouseX - largura - 20;
    }
    left = Math.max(8, left);
    top = Math.max(8, Math.min(top, window.innerHeight - altura - 8));

    zoom.style.width = largura + "px";
    zoom.style.left = left + "px";
    zoom.style.top = top + "px";

    if (temTokens && qPressionado && altPressionado) {
      let leftToken = left + largura + 10;
      const larguraToken = largura * 0.85;
      if (leftToken + larguraToken > window.innerWidth - 8) {
        leftToken = left - larguraToken - 10;
      }
      containerTokens.style.left = leftToken + "px";
      containerTokens.style.top = top + "px";
      containerTokens.style.display = "flex";
      containerTokens.style.flexDirection = "column";
      containerTokens.style.gap = "8px";
    } else {
      containerTokens.style.display = "none";
    }
  }

  function esconder() {
    altPressionado = false;
    qPressionado = false;
    zoom.style.display = "none";
    containerTokens.style.display = "none";
    containerTokens.innerHTML = "";
    urlAtualExibida = null;
    urlsTokensExibidasJson = "";
    if (rafLoop) {
      cancelAnimationFrame(rafLoop);
      rafLoop = null;
    }
  }

  async function atualizar() {
    if (!altPressionado) return esconder();
    const dadosCarta = await acharCartaSobMouse(mouseX, mouseY);
    if (!dadosCarta || !dadosCarta.urlFinal || !altPressionado) {
      zoom.style.display = "none";
      containerTokens.style.display = "none";
      return;
    }

    if (dadosCarta.urlFinal !== urlAtualExibida) {
      urlAtualExibida = dadosCarta.urlFinal;
      zoom.src = dadosCarta.urlFinal;
    }

    const tokensJsonStr = JSON.stringify(dadosCarta.urlsTokens);
    if (dadosCarta.urlsTokens.length > 0 && qPressionado && altPressionado) {
      if (tokensJsonStr !== urlsTokensExibidasJson) {
        urlsTokensExibidasJson = tokensJsonStr;
        containerTokens.innerHTML = "";
        
        for (const tokenUrl of dadosCarta.urlsTokens) {
          const imgToken = document.createElement("img");
          const larguraToken = Math.round(largura * 0.85);
          Object.assign(imgToken.style, {
            width: larguraToken + "px",
            borderRadius: "5%",
            boxShadow: "0 8px 30px rgba(0,0,0,0.6)",
            border: "2px solid #2563eb"
          });
          imgToken.src = tokenUrl;
          containerTokens.appendChild(imgToken);
        }
      }
      containerTokens.style.display = "flex";
    } else {
      containerTokens.style.display = "none";
    }

    posicionar(dadosCarta.urlsTokens.length > 0);
    zoom.style.display = "block";
  }

  async function iniciarLoopChecagem() {
    if (!altPressionado) return;
    await atualizar();
    if (altPressionado) {
      rafLoop = requestAnimationFrame(iniciarLoopChecagem);
    }
  }

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!e.altKey && altPressionado) {
      esconder();
      return;
    }

    if (!altPressionado) {
      clearTimeout(timerPreload);
      timerPreload = setTimeout(async () => {
        const dados = await acharCartaSobMouse(mouseX, mouseY);
        if (dados) {
          preCarregar(dados.urlFinal);
        }
      }, ATRASO_PRELOAD);
    }
  });

  document.addEventListener("keydown", async (e) => {
    if (e.repeat) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;

    if (e.key === "Alt") {
      e.preventDefault();
      if (altPressionado) return;
      altPressionado = true;
      await atualizar();
      if (!rafLoop) iniciarLoopChecagem();
      return;
    }

    if (e.key.toLowerCase() === "q") {
      qPressionado = true;
      if (altPressionado) {
        await atualizar();
      }
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.key === "Alt") {
      e.preventDefault();
      esconder();
      return;
    }

    if (e.key.toLowerCase() === "q") {
      qPressionado = false;
      if (altPressionado) {
        atualizar();
      }
    }
  });

  document.addEventListener("click", esconder);
  window.addEventListener("blur", esconder);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) esconder();
  });

  window.addEventListener(
    "wheel",
    (e) => {
      if (!altPressionado || zoom.style.display === "none") return;
      e.preventDefault();
      largura *= e.deltaY < 0 ? 1.1 : 0.9;
      largura = Math.max(MIN, Math.min(MAX, largura));
      try {
        localStorage.setItem("zoomLargura", String(Math.round(largura)));
      } catch (err) {}
      posicionar(containerTokens.children.length > 0);
    },
    { passive: false }
  );
})();