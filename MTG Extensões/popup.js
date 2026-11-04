document.getElementById("btnSets").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("setSelector.html");
  const janelas = await chrome.windows.getAll({ populate: true });
  const existente = janelas.find(j => j.tabs && j.tabs.some(t => t.url === url));
  
  if (existente) {
    await chrome.windows.update(existente.id, { focused: true });
  } else {
    await chrome.windows.create({ url, type: "popup", width: 560, height: 1000, top: 0 });
  }
  window.close();
});

document.getElementById("btnCalc").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("manaCalculator.html");
  const janelas = await chrome.windows.getAll({ populate: true });
  const existente = janelas.find(j => j.tabs && j.tabs.some(t => t.url === url));
  
  if (existente) {
    await chrome.windows.update(existente.id, { focused: true });
  } else {
    await chrome.windows.create({ url, type: "popup", width: 520, height: 750, top: 0 });
  }
  window.close();
});