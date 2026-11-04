// popup.js - Menu principal: só abre cada ferramenta em uma janela própria

document.addEventListener("DOMContentLoaded", () => {
  // Abre a janela da ferramenta, ou traz para a frente se ela já estiver aberta
  async function abrirJanelaDedicada(pagina, largura, altura) {
    const url = chrome.runtime.getURL(pagina);

    const janelas = await chrome.windows.getAll({ populate: true });
    const existente = janelas.find(
      (j) => j.tabs && j.tabs.some((t) => t.url === url)
    );

    if (existente) {
      await chrome.windows.update(existente.id, { focused: true });
    } else {
      await chrome.windows.create({
        url,
        type: "popup",
        width: largura,
        height: altura,
        top: 0
      });
    }
    window.close(); // fecha o menu
  }

  const ligar = (id, pagina, largura, altura) => {
    const botao = document.getElementById(id);
    if (botao) botao.addEventListener("click", () => abrirJanelaDedicada(pagina, largura, altura));
  };

  ligar("btnAbrirBuscaIA", "buscaIA.html", 560, 600);
  ligar("btnAbrirSetSelector", "setSelector.html", 650, 1000);
  ligar("btnAbrirManaCalc", "manaCalculator.html", 750, 720);
});