const $ = (id) => document.getElementById(id);

const BASICOS = new Set([
  "plains", "island", "swamp", "mountain", "forest", "wastes",
  "snow-covered plains", "snow-covered island", "snow-covered swamp",
  "snow-covered mountain", "snow-covered forest"
]);

const TAMANHO_LOTE = 15;
const CACHE_CHAVE = "cachePrintsV3";
const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias
const TIMEOUT_MS = 30000;

const frente = (nome) => nome.split(" // ")[0].trim().toLowerCase();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const avisar = (msg) => {
  $("status").textContent = msg;
};

// ---------- Estado ----------
let dados = new Map();        // nome da frente -> lista de impressões
let assinatura = "";          // identifica a lista que foi carregada
let selecionados = [];        // códigos de set, na ordem em que foram marcados
let tiposSelecionados = [];   // versões de arte, na ordem em que foram marcadas

// ---------- Versões de arte (filtros aplicados localmente) ----------
const serial = (p) => p.pt.includes("serialized");

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

// Versões que valem de fato, em ordem de prioridade.
// Nenhuma marcada = normal. Com a opção de fallback ligada, a normal entra no fim.
function tiposEfetivos() {
  const tipos = tiposSelecionados.length ? [...tiposSelecionados] : ["normal"];
  if ($("fallback").checked && !tipos.includes("normal")) tipos.push("normal");
  return tipos;
}

// ---------- Cache ----------
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

// ---------- Leitura da lista ----------
// Lê uma linha como "1x Nome (set) 123 [Categoria]" e separa as partes
function lerLinha(linha) {
  const m = linha.trim().match(/^(\d+)\s*x?\s+(.*)$/i);
  if (!m) return null;

  const qtd = m[1];
  let resto = m[2];
  let sufixo = "";

  // Categorias, tags e marcador de foil ficam no sufixo e são preservados
  const s = resto.search(/\s+(?:\[|\^|\*[A-Za-z]\*)/);
  if (s >= 0) {
    sufixo = resto.slice(s);
    resto = resto.slice(0, s);
  }

  let nome = resto.trim();
  const p = resto.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)(?:\s+(\S+))?\s*$/);
  if (p) nome = p[1].trim();

  return { qtd, nome, sufixo };
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

// ---------- Requisições ----------
// fetch com limite de tempo, para nunca ficar parado em silêncio
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

// Se o Scryfall pedir calma (429), espera mostrando a contagem regressiva
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
    "O Scryfall limitou as requisições (429). Espere uns 10 minutos e tente de novo: o que já foi carregado ficou salvo."
  );
}

// Baixa todas las impressões (em papel) de cada carta, em lotes
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
      if (resposta.status === 404) break; // nenhuma carta do lote encontrada
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

// ---------- Versões: caixas e prioridade ----------
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

// ---------- Lista de sets ----------
// Quais sets têm pelo menos uma carta do deck em alguma das versões escolhidas
function setsDisponiveis() {
  const filtros = tiposEfetivos().map((t) => FILTROS[t]);
  const mapa = new Map(); // código -> { nome, cartas: Set }
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

// Desmarca todos os sets (inclusive os escondidos pelo filtro de busca)
const botaoLimpar = $("limparSets");
if (botaoLimpar) {
  botaoLimpar.addEventListener("click", () => {
    selecionados = [];
    desenharSets();
    avisar("Sets desmarcados.");
  });
}

// ---------- Etapa 1: carregar sets ----------
$("carregar").addEventListener("click", async () => {
  if (!$("entrada").value.trim()) return avisar("Cole a lista do deck.");

  try {
    const lidas = $("entrada").value.split("\n").map(lerLinha);
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
        'Marque as versões e os sets (a ordem de marcação é a prioridade) e clique em "Gerar lista".'
    );
  } catch (erro) {
    avisar("Erro: " + erro.message);
  }
});

// ---------- Etapa 2: gerar lista (sem requisições) ----------
function escolher(lista, set, filtro) {
  const candidatas = lista.filter((p) => p.s === set && !serial(p) && filtro(p));
  candidatas.sort((a, b) => a.c.localeCompare(b.c, undefined, { numeric: true }));
  return candidatas[0] || null;
}

$("gerar").addEventListener("click", () => {
  $("saida").value = "";

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
    if (!l) return linha; // linha que não é carta: mantém como está
    if (BASICOS.has(l.nome.toLowerCase()) && !incluirBasicos) return linha;

    const prints = dados.get(frente(l.nome));
    if (!prints || !prints.length) return linha;

    // Versão primeiro (na ordem marcada), depois os sets (na ordem marcada)
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
    if (!carta) return linha; // mantém a impressão atual

    const codigo = carta.s.toUpperCase();
    trocadas.push(`${l.nome} → ${codigo} ${carta.c} (${ROTULOS[tipoUsado].toLowerCase()})`);
    return `${l.qtd}x ${l.nome} (${codigo}) ${carta.c}${l.sufixo}`;
  });

  $("saida").value = saida.join("\n");

  avisar(
    trocadas.length
      ? `${trocadas.length} carta(s) trocada(s):\n- ` + trocadas.join("\n- ")
      : "Nenhuma carta foi encontrada nos sets marcados com essas versões."
  );
});

$("copiar").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("saida").value);
    avisar("Copiado!");
  } catch (erro) {
    $("saida").select();
    avisar("Não consegui copiar sozinho: use Ctrl+C no resultado.");
  }
});

atualizarPrioridadeTipos();