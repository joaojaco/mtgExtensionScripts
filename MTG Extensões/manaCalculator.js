const $ = (id) => document.getElementById(id);

const CORES = {
  W: { nome: "Branco", basico: "Plains", classe: "cor-w" },
  U: { nome: "Azul", basico: "Island", classe: "cor-u" },
  B: { nome: "Preto", basico: "Swamp", classe: "cor-b" },
  R: { nome: "Vermelho", basico: "Mountain", classe: "cor-r" },
  G: { nome: "Verde", basico: "Forest", classe: "cor-g" },
  C: { nome: "Incolor", basico: "Wastes", classe: "cor-c" }
};

const BASICOS_NOMES = new Set([
  "plains", "island", "swamp", "mountain", "forest", "wastes",
  "snow-covered plains", "snow-covered island", "snow-covered swamp",
  "snow-covered mountain", "snow-covered forest"
]);

const CACHE_PIPS = "cachePipsV2";
const frente = (nome) => nome.split(" // ")[0].trim().toLowerCase();
const avisar = (msg) => { $("status").textContent = msg; };

let analiseAtual = null;

function lerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_PIPS) || "{}"); } catch (e) { return {}; }
}

function salvarCache(cache) {
  try { localStorage.setItem(CACHE_PIPS, JSON.stringify(cache)); } catch (e) {}
}

function lerLinha(linha) {
  const linhaLimpa = linha.trim();
  const m = linhaLimpa.match(/^(\d+)\s*x?\s+(.*)$/i);
  if (!m) return null;

  const qtd = parseInt(m[1], 10);
  let resto = m[2];
  let sufixo = "";

  // Isola a categoria/tag do Archidekt no final da linha (ex: [Commander{top}], [Ramp], etc.)
  const idxCorchete = resto.indexOf("[");
  if (idxCorchete !== -1) {
    sufixo = " " + resto.slice(idxCorchete).trim();
    resto = resto.slice(0, idxCorchete).trim();
  }

  let nome = resto.trim();
  const p = nome.match(/^(.*?)\s+\(([A-Za-z0-9]+)\)(?:\s+(\S+))?\s*$/);
  if (p) {
    nome = p[1].trim();
  }

  return { qtd, nome, sufixo, linhaOriginal: linhaLimpa };
}

function extrairPips(manaCost) {
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  if (!manaCost) return pips;

  const simbolos = manaCost.match(/\{([^}]+)\}/g) || [];
  for (const s of simbolos) {
    const limpo = s.replace(/[{}]/g, "");
    if (["W", "U", "B", "R", "G", "C"].includes(limpo)) {
      pips[limpo]++;
    } else if (limpo.includes("/")) {
      const partes = limpo.split("/");
      partes.forEach((p) => {
        if (pips[p] !== undefined) pips[p] += 0.5;
      });
    }
  }
  return pips;
}

async function carregarDadosCartas(nomes) {
  const cache = lerCache();
  const resultado = new Map();
  const pendentes = [];

  for (const nome of nomes) {
    const k = frente(nome);
    if (cache[k]) {
      resultado.set(k, cache[k]);
    } else if (!BASICOS_NOMES.has(k)) {
      pendentes.push(nome);
    }
  }

  if (pendentes.length > 0) {
    avisar(`Buscando dados no Scryfall (0/${pendentes.length})...`);
    
    for (let i = 0; i < pendentes.length; i += 15) {
      const lote = pendentes.slice(i, i + 15);
      const ou = lote.map((n) => `!"${n.replace(/"/g, "")}"`).join(" or ");
      const url = "https://api.scryfall.com/cards/search?q=" + encodeURIComponent(`(${ou})`);

      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const json = await resp.json();
          for (const c of json.data || []) {
            const k = frente(c.name);
            const info = {
              cost: c.mana_cost || (c.card_faces ? c.card_faces[0].mana_cost : ""),
              cmc: c.cmc !== undefined ? c.cmc : 0,
              type: c.type_line || ""
            };
            cache[k] = info;
            resultado.set(k, info);
          }
        }
      } catch (e) {}

      avisar(`Buscando dados no Scryfall (${Math.min(i + 15, pendentes.length)}/${pendentes.length})...`);
      await new Promise((r) => setTimeout(r, 100));
    }
    salvarCache(cache);
  }

  return resultado;
}

$("calcular").addEventListener("click", async () => {
  const linhasBrutas = $("entrada").value.split("\n");
  const linhas = linhasBrutas.map(lerLinha).filter(Boolean);
  if (!linhas.length) return avisar("Cole a lista do deck.");

  const totalCartasOriginal = linhas.reduce((acc, l) => acc + l.qtd, 0);

  const nomes = [...new Set(linhas.map((l) => l.nome))];
  const dadosCartas = await carregarDadosCartas(nomes);

  const totaisPips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  let totalSintetizadoPips = 0;
  let somaCmcTotal = 0;
  let totalCartasNaoTerreno = 0;

  linhas.forEach((l) => {
    const k = frente(l.nome);
    const info = dadosCartas.get(k);
    
    if (info) {
      if (info.cost) {
        const pips = extrairPips(info.cost);
        Object.keys(pips).forEach((cor) => {
          totaisPips[cor] += pips[cor] * l.qtd;
          totalSintetizadoPips += pips[cor] * l.qtd;
        });
      }
      
      const eTerreno = info.type.toLowerCase().includes("land");
      if (!eTerreno) {
        somaCmcTotal += (info.cmc || 0) * l.qtd;
        totalCartasNaoTerreno += l.qtd;
      }
    }
  });

  if (totalSintetizadoPips === 0) {
    return avisar("Não foram encontrados pips coloridos para calcular.");
  }

  const cmcMedio = totalCartasNaoTerreno > 0 ? somaCmcTotal / totalCartasNaoTerreno : 2.5;
  let terrenosSugeridos = Math.round(30 + (cmcMedio * 1.8));
  terrenosSugeridos = Math.max(30, Math.min(42, terrenosSugeridos));

  $("totalLands").value = terrenosSugeridos;

  const barra = $("barraProgressoCores");
  barra.innerHTML = "";
  Object.keys(totaisPips).forEach((cor) => {
    const qtd = totaisPips[cor];
    if (qtd > 0) {
      const pct = ((qtd / totalSintetizadoPips) * 100).toFixed(1);
      const div = document.createElement("div");
      div.className = CORES[cor].classe;
      div.style.width = pct + "%";
      div.title = `${CORES[cor].nome}: ${qtd} pips (${pct}%)`;
      barra.appendChild(div);
    }
  });

  analiseAtual = { totaisPips, totalSintetizadoPips, linhas, dadosCartas, totalCartasOriginal };

  let log = `--- ANÁLISE INTELIGENTE DO DECK ---\n`;
  log += `• Total de cartas detectadas na entrada: ${totalCartasOriginal}\n`;
  log += `• CMC Médio da Curva: ${cmcMedio.toFixed(2)}\n`;
  log += `• Sugestão ideal de terrenos: ${terrenosSugeridos}\n\n`;
  log += `Distribuição de Pips:\n`;
  Object.keys(totaisPips).forEach((cor) => {
    if (totaisPips[cor] > 0) {
      const pct = ((totaisPips[cor] / totalSintetizadoPips) * 100).toFixed(1);
      log += `- ${CORES[cor].nome} (${cor}): ${totaisPips[cor]} pips (${pct}%)\n`;
    }
  });

  log += `\nClique em "2. Gerar Lista Atualizada" para aplicar.`;
  avisar(log);
});

$("gerarLista").addEventListener("click", () => {
  if (!analiseAtual) return avisar("Execute primeiro a etapa 1 (Analisar Pips e Curva).");

  const totalLandsDesejadas = parseInt($("totalLands").value, 10) || 36;
  const manterExistentes = $("manterExistentes").checked;
  const { totaisPips, totalSintetizadoPips, linhas, dadosCartas, totalCartasOriginal } = analiseAtual;

  let linhasNaoBasicas = [];
  let qtdTerrenosUtilitarios = 0;
  const cartasRemovidasOuSubstituidas = [];

  linhas.forEach((l) => {
    const k = frente(l.nome);
    const info = dadosCartas.get(k);
    const eBasico = BASICOS_NOMES.has(k);

    if (eBasico) {
      cartasRemovidasOuSubstituidas.push(`${l.qtd}x ${l.nome} (Terreno básico antigo removido)`);
    } else if (manterExistentes && info && info.type.toLowerCase().includes("land")) {
      linhasNaoBasicas.push(l);
      qtdTerrenosUtilitarios += l.qtd;
    } else {
      linhasNaoBasicas.push(l);
    }
  });

  const terrenosBasicosRestantes = Math.max(0, totalLandsDesejadas - qtdTerrenosUtilitarios);
  const distribuicaoBasicos = {};
  let acumulado = 0;
  const logsTerrenos = [];

  const coresAtivas = Object.keys(totaisPips).filter((c) => totaisPips[c] > 0);

  coresAtivas.forEach((cor, idx) => {
    let qtd = 0;
    if (idx === coresAtivas.length - 1) {
      qtd = terrenosBasicosRestantes - acumulado;
    } else {
      qtd = Math.round((totaisPips[cor] / totalSintetizadoPips) * terrenosBasicosRestantes);
      acumulado += qtd;
    }

    distribuicaoBasicos[cor] = qtd;
    if (qtd > 0) {
      logsTerrenos.push(`${qtd}x ${CORES[cor].basico} (${CORES[cor].nome})`);
    }
  });

  const linhasSaida = [];
  
  // GARANTIA TOTAL: Usa a linha original completa (que já contém o [Commander{top}] ou outras categorias)
  linhasNaoBasicas.forEach((l) => {
    linhasSaida.push(l.linhaOriginal);
  });

  // Adiciona os novos terrenos básicos gerados (caso queira colocar uma categoria padrão de Lands, o sufixo pode ser posto aqui)
  Object.keys(distribuicaoBasicos).forEach((cor) => {
    const qtd = distribuicaoBasicos[cor];
    if (qtd > 0) {
      linhasSaida.push(`${qtd}x ${CORES[cor].basico}`);
    }
  });

  let contagemFinalCartas = 0;
  linhasSaida.forEach(ln => {
    const m = ln.trim().match(/^(\d+)/);
    if (m) contagemFinalCartas += parseInt(m[1], 10);
  });

  $("saida").value = linhasSaida.join("\n");

  let logFinal = `--- RELATÓRIO DE AUDITORIA DA LISTA ---\n`;
  logFinal += `• Cartas originais na entrada: ${totalCartasOriginal}\n`;
  logFinal += `• Cartas na lista gerada: ${contagemFinalCartas}\n`;

  const diferencaVagas = contagemFinalCartas - totalCartasOriginal;
  if (diferencaVagas !== 0) {
    const acao = diferencaVagas > 0 ? `liberou ${diferencaVagas} vaga(s) a mais` : `pediu ${Math.abs(diferencaVagas)} vaga(s) a menos`;
    logFinal += `💡 **Aviso de Vagas**: A nova sugestão de terrenos ${acao} para cartas não-terreno no deck!\n`;
  } else {
    logFinal += `✅ Contagem perfeita! O total de cartas foi mantido exatamente igual.\n`;
  }

  if (contagemFinalCartas !== totalCartasOriginal && diferencaVagas === 0) {
    logFinal += `⚠️ ATENÇÃO: Há uma divergência na contagem. Verifique se alguma linha tinha formato fora do padrão.\n\n`;
  } else {
    logFinal += `\n`;
  }

  if (cartasRemovidasOuSubstituidas.length > 0) {
    logFinal += `Terrenos básicos antigos substituídos:\n- ` + cartasRemovidasOuSubstituidas.join("\n- ") + `\n\n`;
  }

  logFinal += `Novos Terrenos Básicos Adicionados:\n- ` + logsTerrenos.join("\n- ") + `\n\n`;
  logFinal += `Lista pronta e verificada no campo acima!`;

  avisar(logFinal);
});

$("copiar").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("saida").value);
    avisar("Resultado copiado!");
  } catch (e) {
    $("saida").select();
    avisar("Use Ctrl+C para copiar.");
  }
});