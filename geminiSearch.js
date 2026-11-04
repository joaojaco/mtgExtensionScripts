// geminiSearch.js - Módulo de Integração de Busca em Linguagem Natural para Scryfall

// Modelo principal (o que aparece no seu Google AI Studio)
const GEMINI_MODEL = "gemini-3.8-flash";

// Modelos reserva fixos, tentados em ordem se o principal falhar
const GEMINI_MODELOS_RESERVA = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Recupera a chave da API salva no armazenamento local da extensão.
 */
async function obterApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["geminiApiKey"], (result) => {
      resolve(result.geminiApiKey || null);
    });
  });
}

/**
 * Salva a chave da API no armazenamento local da extensão.
 */
async function salvarApiKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      resolve(true);
    });
  });
}

/**
 * Função auxiliar para fazer pausas assíncronas (delay entre tentativas).
 */
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Espera crescente entre tentativas: ~1,5 s, 3 s, 6 s (com um pouco de variação)
const atrasoDaTentativa = (n) => 1500 * 2 ** (n - 1) + Math.random() * 500;

// Erros que são do servidor ou de limite de uso (e não da chave ou do pedido)
function ehSobrecarga(status, msg) {
  return (
    [429, 500, 502, 503, 504].includes(status) ||
    /high demand|overloaded|unavailable|try again later|quota|rate limit/i.test(msg || "")
  );
}

/**
 * Chama UM modelo, com novas tentativas se ele estiver sobrecarregado.
 * Em caso de falha, lança um Error com .status e .sobrecarga.
 */
async function chamarModelo(apiKey, modelo, promptText, maxTentativas) {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(modelo)}:generateContent`;
  let ultimoErro = { status: 0, msg: "Falha desconhecida", sobrecarga: false };

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    let response;
    let data;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
      });
      data = await response.json().catch(() => ({}));
    } catch (err) {
      // Falha de rede: vale tentar de novo
      ultimoErro = { status: 0, msg: err.message || "Falha de rede", sobrecarga: true };
      if (tentativa < maxTentativas) await esperar(atrasoDaTentativa(tentativa));
      continue;
    }

    if (response.ok && !data.error) {
      const partes = (data.candidates && data.candidates[0] && data.candidates[0].content.parts) || [];
      const texto = partes
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join("")
        .trim();
      if (texto) return texto;
      ultimoErro = { status: response.status, msg: "A resposta do Gemini veio vazia", sobrecarga: false };
      break;
    }

    const msg = (data.error && data.error.message) || `HTTP ${response.status}`;
    ultimoErro = { status: response.status, msg, sobrecarga: ehSobrecarga(response.status, msg) };

    // Chave inválida, pedido inválido, modelo inexistente: repetir não adianta
    if (!ultimoErro.sobrecarga) break;

    if (tentativa < maxTentativas) {
      console.warn(
        `[Gemini Search] ${modelo}: ${response.status} ${msg} (tentativa ${tentativa}/${maxTentativas}). Aguardando...`
      );
      await esperar(atrasoDaTentativa(tentativa));
    }
  }

  const erro = new Error(ultimoErro.msg);
  erro.status = ultimoErro.status;
  erro.sobrecarga = ultimoErro.sobrecarga;
  throw erro;
}

/**
 * Lista os modelos "flash" estáveis que a sua chave realmente tem.
 */
async function modelosDisponiveis(apiKey) {
  try {
    const r = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey }
    });
    if (!r.ok) return [];
    const data = await r.json();

    const nomes = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter(
        (n) =>
          /flash/i.test(n) &&
          !/(image|tts|live|audio|embedding|robotics|computer|vision|exp)/i.test(n)
      );

    // Estáveis antes de "preview", e os "lite" por último
    const nota = (n) => (/preview/i.test(n) ? 2 : 0) + (/lite/i.test(n) ? 1 : 0);
    return nomes.sort((a, b) => nota(a) - nota(b));
  } catch (e) {
    return [];
  }
}

function resumirFalhas(falhas) {
  const linhas = falhas.map(
    (f) => `- ${f.modelo}: ${f.status || "sem resposta"} ${String(f.msg).slice(0, 110)}`
  );
  const teveLimite = falhas.some((f) => f.status === 429);
  const cabecalho = teveLimite
    ? "Limite de uso ou sobrecarga no Gemini (erro 429/503). Detalhes por modelo:"
    : "Os modelos do Gemini estão sobrecarregados no momento. Detalhes por modelo:";
  return cabecalho + "\n" + linhas.join("\n");
}

/**
 * Chama o Gemini: tenta o modelo principal, depois os reservas fixos e, por fim,
 * até 3 modelos que a sua chave realmente tem.
 */
async function chamarGeminiAPI(apiKey, promptText) {
  const falhas = [];
  const tentados = new Set();

  // Devolve { texto } se deu certo, null se o modelo falhou por sobrecarga/404.
  // Erros fatais (chave ou pedido inválidos) sobem direto.
  const tentar = async (modelo, maxTentativas) => {
    tentados.add(modelo);
    try {
      return { texto: await chamarModelo(apiKey, modelo, promptText, maxTentativas) };
    } catch (err) {
      falhas.push({ modelo, status: err.status, msg: err.message });
      console.warn(`[Gemini Search] ${modelo} falhou (${err.status}): ${err.message}`);
      if (!(err.sobrecarga || err.status === 404)) throw err;
      return null;
    }
  };

  // 1) Principal e reservas fixos
  const fixos = [GEMINI_MODEL, ...GEMINI_MODELOS_RESERVA];
  for (let i = 0; i < fixos.length; i++) {
    if (tentados.has(fixos[i])) continue;
    const r = await tentar(fixos[i], i === 0 ? 3 : 2);
    if (r) return r.texto;
  }

  // 2) Modelos que a chave realmente tem
  const extras = (await modelosDisponiveis(apiKey)).filter((m) => !tentados.has(m)).slice(0, 3);
  for (const modelo of extras) {
    const r = await tentar(modelo, 2);
    if (r) return r.texto;
  }

  throw new Error(resumirFalhas(falhas));
}

/**
 * Testa se a API Key é válida SEM gerar texto: só lista os modelos disponíveis.
 * Assim, a validação não depende de o modelo estar sobrecarregado.
 */
async function testarApiKey(apiKey) {
  try {
    const response = await fetch(`${GEMINI_BASE}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey }
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      const nomes = (data.models || []).map((m) => m.name);
      if (nomes.length && !nomes.includes(`models/${GEMINI_MODEL}`)) {
        console.warn(
          `[Gemini Search] A chave é válida, mas "${GEMINI_MODEL}" não aparece na lista. Os modelos reserva serão usados.`
        );
      }
      return { ok: true, errorMsg: null };
    }

    const msg = (data.error && data.error.message) || `HTTP ${response.status}`;
    if (response.status >= 500) {
      return { ok: false, errorMsg: `Não deu para validar agora (servidor do Google instável): ${msg}` };
    }
    return { ok: false, errorMsg: msg };
  } catch (error) {
    return { ok: false, errorMsg: error.message || "Sem conexão com o Google." };
  }
}

/**
 * O System Prompt principal que ensina o Gemini a agir como um compilador de busca do Scryfall.
 */
const SYSTEM_PROMPT = `
You are a specialized translator that converts natural language requests from Magic: The Gathering players into accurate Scryfall search syntax queries.

RULES:
1. Return ONLY the final Scryfall search string. Do NOT include markdown code blocks, quotes, explanations, or conversational filler.
2. Use standard Scryfall search syntax:
   - Colors: c:w, c:u, c:b, c:r, c:g, id:abzan, c:colorless
   - Types: t:creature, t:instant, t:artifact, t:enchantment, t:land, t:battle
   - Oracle text: o:"destroy target", o:"draw a card", o:"counter target"
   - Official Scryfall Tags (otag): otag:removal, otag:board-wipe, otag:ramp, otag:counter-plus-one-plus-one, otag:token-generator, otag:tutor, otag:card-draw
   - Stats / CMC: cmc<=3, pow>=4, tou>=5
   - Ordering: order:edhrec, order:cmc, order:price
3. Handle Portuguese or English inputs seamlessly. Translate concepts to proper English MTG mechanics.
4. Examples:
   - Input: "remoção de encantamento branca ou verde até 3 mana"
   - Output: (c:w or c:g) t:instant (o:"destroy target enchantment" or o:"exile target enchantment" or otag:enchantment-removal) cmc<=3
   
   - Input: "cartas que colocam contador +1/+1 quando artefato entra em jogo ordenado por edhrec"
   - Output: (o:"counter" or otag:counter-plus-one-plus-one) (o:"whenever an artifact enters" or otag:artifact-etb) order:edhrec
`;

/**
 * Converte o texto em linguagem natural do usuário em uma query de busca válida do Scryfall.
 */
async function traduzirParaScryfallQuery(textoUsuario) {
  const apiKey = await obterApiKey();
  if (!apiKey) {
    throw new Error("Chave da API do Gemini não configurada. Por favor, adicione sua chave nas configurações.");
  }

  const promptCompleto = `${SYSTEM_PROMPT}\n\nUser Input: "${textoUsuario}"\nScryfall Query:`;
  const respostaTexto = await chamarGeminiAPI(apiKey, promptCompleto);

  return respostaTexto.replace(/^`+|`+$/g, "").replace(/^"|"$/g, "").trim();
}