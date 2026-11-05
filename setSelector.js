// 1. Ajuste de tamanho inicial na proporção da carta (822x1122)
window.addEventListener("DOMContentLoaded", () => {
  if (window.resizeTo) {
    window.resizeTo(822, 1122);
  }
});

const $ = (id) => document.getElementById(id);

const BASICOS = new Set([
  "plains", "island", "swamp", "mountain", "forest", "wastes",
  "snow-covered plains", "snow-covered island", "snow-covered swamp",
  "snow-covered mountain", "snow-covered forest"
]);

const TAMANHO_LOTE = 15;
const CACHE_CHAVE = "cachePrintsV3";
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 30000;

const frente = (nome) => nome.split(" // ")[0].trim().toLowerCase();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const avisar = (msg) => {
  $("status").textContent = msg;
};

let dados = new Map();
let assinatura = "";
let selecionados = [];
let tiposSelecionados = [];

const serial = (p) => p.pt && p.pt.includes("serialized");

const FILTROS = {
  qualquer: () => true,
  normal: (p) =>
    !p.fa && !p.fe.includes("showcase") && !p.fe.includes("extendedart") && p.b !== "borderless",
  full: (p) => p.fa,
  showcase: (p) => p.fe.includes("showcase"),
  borderless: (p) => p.b === "borderless",
  extended: (p) => p.fe.includes("extendedart")
};

const ROTULOS = {
  qualquer: "Qualquer versão",
  normal: "Normal",
  full: "Full art",
  showcase: "Showcase",
  borderless: "Borderless",
  extended: "Extended art"
};

function tiposEfetivos() {
  const tipos = tiposSelecionados.length ? [...tiposSelecionados] : ["normal"];
  if ($("fallback").checked && !tipos.includes("normal")) tipos.push("normal");
  return tipos;
}

function lerCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_CHAVE) || "{}");
  } catch (e) {
    return {};
  }
}

function salvarCache(cache) {
  try {
    localStorage.setItem(CACHE_CHAVE, JSON.stringify(cache));
  } catch (e) {}
}

const minimo = (c) => ({
  s: c.set,
  sn: c.set_name,
  c: c.collector_number,
  fa: !!c.full_art,
  fe: c.frame_effects || [],
  b: c.border_color || "",
  pt: c.promo_types || []
});

function lerLinha(linha) {
  const m = linha.trim().match(/^(\d+)\s*x?\s+(.*)$/i);
  if (!m) return null;

  const qtd = m[1];
  let resto = m[2];
  let sufixo = "";

  const s = resto.search(/\s+(?:\[|\^|\*[A-Za-z]\*)/);
  if (s >= 0) {
    sufixo = resto.slice(s);
    resto = resto.slice(0, s);
  }

  let nome = resto.trim();
  let setEspecifico = null;
  let numeroEspecifico = null;

  const p = resto.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)(?:\s+(\S+))?\s*$/);
  if (p) {
    nome = p[1].trim();
    setEspecifico = p[2].toLowerCase();
    numeroEspecifico = p[3] ? p[3].toLowerCase() : null;
  }

  return { qtd, nome, sufixo, setEspecifico, numeroEspecifico };
}

function nomesDoDeck(lidas) {
  const incluirBasicos = $("basicos").checked;
  return [
    ...new Set(
      lidas
        .filter((l) => l && (incluirBasicos || !BASICOS.has(l.nome.toLowerCase())))
        .map((l) => l.nome)
    )
  ];
}

const assinaturaDe = (nomes) => nomes.map(frente).sort().join("|");

async function buscarComTimeout(url, opcoes) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opcoes, signal: controle.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error("O Scryfall demorou mais de 30 s para responder. Tente de novo.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function pedir(url, opcoes, rotulo = "") {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const resposta = await buscarComTimeout(url, opcoes);
    if (resposta.status !== 429) return resposta;

    const retryAfter = Number(resposta.headers.get("Retry-After"));
    const base = retryAfter > 0 ? Math.min(retryAfter, 60) : 10;
    for (let s = base * tentativa; s > 0; s--) {
      avisar(
        `${rotulo}O Scryfall pediu para esperar (429). Tentativa ${tentativa}/3, retomando em ${s}s...`
      );
      await esperar(1000);
    }
  }
  throw new Error(
    "O Scryfall limitou as requisições (429). Espere uns 10 minutos e tente de novo."
  );
}

async function carregarPrints(nomes, onProgresso) {
  const cache = lerCache();
  const agora = Date.now();
  const resultado = new Map();
  const pendentes = [];

  for (const nome of nomes) {
    const k = frente(nome);
    const entrada = cache[k];
    if (entrada && agora - entrada.t < VALIDADE_MS) resultado.set(k, entrada.p);
    else pendentes.push(nome);
  }

  let feitas = nomes.length - pendentes.length;
  onProgresso(feitas, nomes.length, "");

  const totalLotes = Math.ceil(pendentes.length / TAMANHO_LOTE);

  for (let i = 0; i < pendentes.length; i += TAMANHO_LOTE) {
    const numeroLote = i / TAMANHO_LOTE + 1;
    const lote = pendentes.slice(i, i + TAMANHO_LOTE);
    const ou = lote.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ");
    const q = `(${ou}) game:paper`;
    let url =
      "https://api.scryfall.com/cards/search?unique=prints&include_variations=true&order=released&q=" +
      encodeURIComponent(q);

    const porNome = new Map(lote.map((n) => [frente(n), []]));
    let pagina = 0;
    let acumuladas = 0;

    while (url) {
      pagina++;
      const rotulo = `Lote ${numeroLote}/${totalLotes}, página ${pagina}. `;
      onProgresso(
        feitas,
        nomes.length,
        ` (lote ${numeroLote}/${totalLotes}, página ${pagina}, ${acumuladas} impressões)`
      );

      const resposta = await pedir(url, { headers: { Accept: "application/json" } }, rotulo);
      if (resposta.status === 404) break;
      if (!resposta.ok) throw new Error("Scryfall respondeu " + resposta.status);

      const json = await resposta.json();
      for (const carta of json.data || []) {
        const k = frente(carta.name);
        if (porNome.has(k)) {
          porNome.get(k).push(minimo(carta));
          acumuladas++;
        }
      }
      url = json.has_more ? json.next_page : null;
      await esperar(600);
    }

    for (const [k, lista] of porNome) {
      cache[k] = { t: agora, p: lista };
      resultado.set(k, lista);
    }
    salvarCache(cache);

    feitas += lote.length;
    onProgresso(feitas, nomes.length, "");
    await esperar(600);
  }
  return resultado;
}

// 🎨 Fundo Inteligente com cálculo real de Set Majoritário (alinhado com o painel de sets)
async function aplicarFundoInteligente(lidas) {
  try {
    let cartaAlvo = null;
    let motivoLog = "";

    // 1. TENTA POR TAG DE COMMANDER
    const linhaCommander = lidas.find(l => l && l.sufixo && /commander/i.test(l.sufixo));
    
    if (linhaCommander) {
      const k = frente(linhaCommander.nome);
      const prints = dados.get(k);
      if (prints && prints.length > 0) {
        cartaAlvo = prints[0];
        if (linhaCommander.setEspecifico) {
          const achada = prints.find(p => p.s.toLowerCase() === linhaCommander.setEspecifico);
          if (achada) cartaAlvo = achada;
        }
        motivoLog = `🖼️ Fundo aplicado via Comandante: ${linhaCommander.nome} (${cartaAlvo.s.toUpperCase()} ${cartaAlvo.c})`;
      }
    }

    // 2. FALLBACK: SET MAJORITÁRIO (Usando os mesmos dados e filtros da lista visual)
    if (!cartaAlvo && dados.size > 0) {
      const mapaSets = setsDisponiveis();

      // Encontra o set que cobre a maior quantidade de cartas únicas do deck
      let setMajoritario = null;
      let maxCartas = 0;
      for (const [codigoSet, info] of mapaSets.entries()) {
        if (info.cartas.size > maxCartas) {
          maxCartas = info.cartas.size;
          setMajoritario = codigoSet;
        }
      }

      if (setMajoritario) {
        for (const l of lidas) {
          if (!l || BASICOS.has(l.nome.toLowerCase())) continue;
          const k = frente(l.nome);
          const prints = dados.get(k);
          if (prints) {
            const printNoSet = prints.find(p => p.s === setMajoritario);
            if (printNoSet) {
              cartaAlvo = printNoSet;
              motivoLog = `🖼️ Fundo aplicado via Set Majoritário [${setMajoritario.toUpperCase()}]: ${l.nome}`;
              break;
            }
          }
        }
      }
    }

    // 3. FALLBACK FINAL: PRIMEIRA CARTA NÃO BÁSICA
    if (!cartaAlvo && lidas.length > 0) {
      const primeiraValida = lidas.find(l => l && !BASICOS.has(l.nome.toLowerCase()));
      if (primeiraValida) {
        const prints = dados.get(frente(primeiraValida.nome));
        if (prints && prints.length > 0) {
          cartaAlvo = prints[0];
          motivoLog = `🖼️ Fundo aplicado via Primeira Carta: ${primeiraValida.nome}`;
        }
      }
    }

    // CARREGA A IMAGEM NO SCRYFALL E ATUALIZA O LOG
    if (cartaAlvo) {
      const urlScryfall = `https://api.scryfall.com/cards/${cartaAlvo.s}/${cartaAlvo.c}`;
      const resp = await fetch(urlScryfall);
      if (resp.ok) {
        const json = await resp.json();
        
        const urlImagem = json.image_uris 
          ? json.image_uris.art_crop 
          : (json.card_faces && json.card_faces[0].image_uris 
              ? json.card_faces[0].image_uris.art_crop 
              : null);

        if (urlImagem) {
          document.body.style.backgroundImage = `url('${urlImagem}')`;

          const logAtual = $("status").textContent;
          $("status").textContent = motivoLog + (logAtual ? "\n\n" + logAtual : "");
          return;
        }
      }
    }

    document.body.style.backgroundImage = "none";

  } catch (e) {
    console.warn("Erro ao definir imagem de fundo inteligente:", e);
  }
}

function atualizarPrioridadeTipos() {
  const ordem = tiposEfetivos().map((t) => ROTULOS[t]);
  $("prioridadeTipos").textContent = "Prioridade das versões: " + ordem.join(" › ");
}

document.querySelectorAll("#listaTipos input").forEach((caixa) => {
  caixa.addEventListener("change", () => {
    if (caixa.checked) tiposSelecionados.push(caixa.value);
    else tiposSelecionados = tiposSelecionados.filter((t) => t !== caixa.value);
    atualizarPrioridadeTipos();
    desenharSets();
  });
});

$("fallback").addEventListener("change", () => {
  atualizarPrioridadeTipos();
  desenharSets();
});

function setsDisponiveis() {
  const filtros = tiposEfetivos().map((t) => FILTROS[t]);
  const mapa = new Map();
  for (const [k, lista] of dados) {
    for (const p of lista) {
      if (serial(p) || !filtros.some((f) => f(p))) continue;
      if (!mapa.has(p.s)) mapa.set(p.s, { nome: p.sn, cartas: new Set() });
      mapa.get(p.s).cartas.add(k);
    }
  }
  return mapa;
}

function atualizarPrioridade() {
  $("prioridade").textContent = selecionados.length
    ? "Prioridade dos sets: " + selecionados.map((s) => s.toUpperCase()).join(" › ")
    : "";
}

function desenharSets() {
  const lista = $("listaSets");
  lista.textContent = "";

  if (!dados.size) {
    const vazio = document.createElement("div");
    vazio.className = "vazio";
    vazio.textContent = 'Cole a lista e clique em "Carregar sets disponíveis".';
    lista.appendChild(vazio);
    return;
  }

  const mapa = setsDisponiveis();
  selecionados = selecionados.filter((s) => mapa.has(s));
  atualizarPrioridade();

  const busca = $("filtroSets").value.trim().toLowerCase();
  const itens = [...mapa.entries()]
    .filter(([codigo, info]) => !busca || codigo.includes(busca) || info.nome.toLowerCase().includes(busca))
    .sort((a, b) => b[1].cartas.size - a[1].cartas.size || a[1].nome.localeCompare(b[1].nome));

  if (!itens.length) {
    const vazio = document.createElement("div");
    vazio.className = "vazio";
    vazio.textContent = "Nenhum set com essas versões para essas cartas.";
    lista.appendChild(vazio);
    return;
  }

  for (const [codigo, info] of itens) {
    const linha = document.createElement("label");
    linha.className = "set";

    const caixa = document.createElement("input");
    caixa.type = "checkbox";
    caixa.checked = selecionados.includes(codigo);
    caixa.addEventListener("change", () => {
      if (caixa.checked) selecionados.push(codigo);
      else selecionados = selecionados.filter((s) => s !== codigo);
      atualizarPrioridade();
    });

    const texto = document.createElement("span");
    texto.textContent = `${codigo.toUpperCase()} — ${info.nome}`;

    const cont = document.createElement("span");
    cont.className = "cont";
    cont.textContent = `${info.cartas.size}/${dados.size}`;

    linha.append(caixa, texto, cont);
    lista.appendChild(linha);
  }
}

$("filtroSets").addEventListener("input", desenharSets);

const botaoLimpar = $("limparSets");
if (botaoLimpar) {
  botaoLimpar.addEventListener("click", () => {
    selecionados = [];
    desenharSets();
    avisar("Sets desmarcados.");
  });
}

$("carregar").addEventListener("click", async () => {
  if (!$("entrada").value.trim()) return avisar("Cole a lista do deck.");

  try {
    const linhasBrutas = $("entrada").value.split("\n");
    const lidas = linhasBrutas.map(lerLinha);
    const nomes = nomesDoDeck(lidas);
    if (!nomes.length) return avisar("Não encontrei cartas na lista.");

    avisar("Carregando as impressões no Scryfall...");
    dados = await carregarPrints(nomes, (feitas, total, detalhe) => {
      avisar(`Carregando as impressões no Scryfall... ${feitas}/${total}${detalhe}`);
    });
    assinatura = assinaturaDe(nomes);

    desenharSets();

    avisar(
      `${dados.size} carta(s) carregada(s), ${setsDisponiveis().size} set(s) disponível(is).\n` +
        'Marque as versões e os sets e clique em "Gerar lista".'
    );

    // Executa a busca de fundo inteligente e injeta no topo do log
    await aplicarFundoInteligente(lidas);

  } catch (erro) {
    avisar("Erro: " + erro.message);
  }
});

function escolher(lista, set, filtro) {
  const candidatas = lista.filter((p) => p.s === set && !serial(p) && filtro(p));
  candidatas.sort((a, b) => a.c.localeCompare(b.c, undefined, { numeric: true }));
  return candidatas[0] || null;
}

$("gerar").addEventListener("click", async () => {
  if (!dados.size) return avisar('Clique primeiro em "Carregar sets disponíveis".');
  if (!selecionados.length) return avisar("Marque pelo menos um set.");

  const linhas = $("entrada").value.split("\n");
  const lidas = linhas.map(lerLinha);

  if (assinaturaDe(nomesDoDeck(lidas)) !== assinatura) {
    return avisar(
      'A lista mudou desde que os sets foram carregados. Clique em "Carregar sets disponíveis" de novo.'
    );
  }

  const tipos = tiposEfetivos();
  const incluirBasicos = $("basicos").checked;

  const trocadas = [];
  const saida = linhas.map((linha, i) => {
    const l = lidas[i];
    if (!l) return linha;
    if (BASICOS.has(l.nome.toLowerCase()) && !incluirBasicos) return linha;

    const prints = dados.get(frente(l.nome));
    if (!prints || !prints.length) return linha;

    let carta = null;
    let tipoUsado = null;
    for (const tipo of tipos) {
      for (const set of selecionados) {
        carta = escolher(prints, set, FILTROS[tipo]);
        if (carta) break;
      }
      if (carta) {
        tipoUsado = tipo;
        break;
      }
    }
    if (!carta) return linha;

    const codigo = carta.s.toUpperCase();
    trocadas.push(`${l.nome} → ${codigo} ${carta.c} (${ROTULOS[tipoUsado].toLowerCase()})`);
    return `${l.qtd}x ${l.nome} (${codigo}) ${carta.c}${l.sufixo}`;
  });

  const listaGeradaTexto = saida.join("\n");
  const relatorioTexto = trocadas.length
    ? `${trocadas.length} carta(s) trocada(s):\n- ` + trocadas.join("\n- ")
    : "Nenhuma carta foi encontrada nos sets marcados com essas versões.";

  await chrome.storage.local.set({
    resultadoListaMTG: listaGeradaTexto,
    relatorioMTG: relatorioTexto
  });

  avisar(relatorioTexto);

  const url = chrome.runtime.getURL("resultadoSet.html");
  const janelas = await chrome.windows.getAll({ populate: true });
  const existente = janelas.find((j) => j.tabs && j.tabs.some((t) => t.url === url));

  if (existente) {
    await chrome.windows.update(existente.id, { focused: true });
    const abaAlvo = existente.tabs.find((t) => t.url === url);
    if (abaAlvo) chrome.tabs.reload(abaAlvo.id);
  } else {
    await chrome.windows.create({
      url,
      type: "popup",
      width: 600,
      height: 700,
      top: 50,
      left: 100
    });
  }
});

atualizarPrioridadeTipos();