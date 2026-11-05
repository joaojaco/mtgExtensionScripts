document.addEventListener("DOMContentLoaded", async () => {
  const saidaEl = document.getElementById("saida");
  const btnCopiar = document.getElementById("copiar");

  const dados = await chrome.storage.local.get("resultadoListaMTG");

  if (dados.resultadoListaMTG) {
    saidaEl.value = dados.resultadoListaMTG;
  } else {
    saidaEl.value = "Nenhuma lista gerada.";
  }

  btnCopiar.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(saidaEl.value);
      btnCopiar.textContent = "✅ Copiado!";
      
      setTimeout(() => {
        window.close();
      }, 600);
    } catch (e) {
      saidaEl.select();
      alert("Pressione Ctrl+C para copiar a lista.");
    }
  });
});