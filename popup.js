// popup.js - Menu principal: abre apenas Seletor de Sets e Calculadora de Mana

document.addEventListener("DOMContentLoaded", () => {
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
    window.close();
  }

  const ligar = (id, pagina, largura, altura) => {
    const botao = document.getElementById(id);
    if (botao) botao.addEventListener("click", () => abrirJanelaDedicada(pagina, largura, altura));
  };

  ligar("btnAbrirSetSelector", "setSelector.html", 650, 1000);
  ligar("btnAbrirManaCalc", "manaCalculator.html", 750, 720);
});