# 🃏 MTG Deck Utilities - Chrome Extension

Uma extensão para o Google Chrome desenvolvida para otimizar o fluxo de construção e análise de decks de **Magic: The Gathering (Commander)**, integrada a plataformas como **EDHREC** e com suporte completo a listas exportadas do **Archidekt**.

---

## 🚀 Funcionalidades Principais

### 1. 🔍 Alt-Hover & Visualizador de Tokens (`alt-HoverImage.js`)
* **Zoom Rápido no EDHREC**: Pressione e segure **`Alt`** sobre qualquer carta para exibi-la em alta resolução de forma flutuante.
* **Visualizador de Tokens (`Alt + Q`)**: Enquanto estiver segurando o **`Alt`** para ver a carta, mantenha a tecla **`Q`** pressionada para inspecionar instantaneamente todas as fichas/tokens geradas por ela (buscadas em tempo real e de forma assíncrona via Scryfall).
* **Redimensionamento por Scroll**: Utilize o *scroll* (rodinha) do mouse com o zoom aberto para redimensionar dinamicamente o tamanho das imagens na tela (com salvamento da preferência no `localStorage`).
* **Blindagem Anti-Travamento**: Contém proteções automáticas (checagem contínua do estado do teclado via `e.altKey`, clique de segurança na tela e perda de foco via `blur`) para garantir que o zoom nunca fique travado ou preso.

### 2. 🔗 Atalhos de Abertura Direta (`alt-HoverImage.js`)
* **Abertura Direta no Scryfall**: Atalhos integrados para abrir rapidamente a página oficial do card diretamente no Scryfall.
* **Abertura Direta no Scryfall Tagger**: Atalho para navegar direto para o **Scryfall Tagger** da carta atual, facilitando a consulta de tags de comunidade, ilustradores, mecânicas e classificações visuais.

### 3. 🧮 Calculadora de Mana Inteligente (`manaCalculator.js`)
* **Análise de Curva e Pips**: Lê os custos de mana e a curva (CMC) das cartas não-terreno do deck para calcular matematicamente a quantidade ideal de terrenos (sugerindo entre 30 e 42 cartas).
* **Distribuição Proporcional de Básicos**: Calcula a proporção exata de cada terreno básico (*Plains, Island, Swamp, Mountain, Forest, Wastes*) com base na densidade de pips coloridos predominantes no seu deck.
* **Preservação Rigorosa de Tags do Archidekt**: Isola e mantém intactas todas as marcações e categorias personalizadas do seu deck (ex: `[Commander{top}]`, `[Ramp]`, `[Removal]`, etc.), permitindo exportar a lista tratada de volta para o Archidekt sem perder a organização.
* **Relatório de Auditoria Completo**: Compara o total de cartas original com a saída gerada, alertando sobre a liberação de vagas ou contagens, e substituindo os terrenos básicos antigos de forma limpa.

### 4. 📦 Seletor de Sets (`setSelector.html`)
* **Gerenciamento de Edições**: Ferramenta dedicada para consultar, gerenciar e alternar rapidamente entre diferentes edições e impressões de cartas para o seu deck.

### 5. 🎛️ Menu Unificado da Extensão (`popup.html`)
* **Hub Centralizador**: Um pop-up limpo e organizado acionado pelo ícone da extensão no Chrome, servindo como ponto de acesso principal para navegar entre os utilitários da suíte em janelas dedicadas.

---

## 🛠️ Instalação e Uso (Modo Desenvolvedor)

Como esta extensão roda localmente no seu navegador para fins de desenvolvimento e versionamento, siga os passos abaixo para instalá-la no Chrome:

1. Clone ou baixe este repositório para uma pasta no seu computador.
2. Abra o Google Chrome e acesse: `chrome://extensions/`
3. No canto superior direito, ative o **Modo do desenvolvedor** (*Developer mode*).
4. No canto superior esquerdo, clique em **Carregar sem compactação** (*Load unpacked*).
5. Selecione a pasta raiz onde estão os arquivos da sua extensão.

Pronto! A extensão já estará ativa e funcionando nas páginas suportadas.

---

## 📂 Estrutura do Projeto

```text
├── manifest.json            # Configuração e permissões da extensão Chrome
├── popup.html               # Menu unificado da extensão
├── setSelector.html         # Utilitário de seleção de sets
├── manaCalculator.html      # Interface da Calculadora de Mana
├── manaCalculator.js        # Lógica de pips, contagem e tags do Archidekt
└── alt-HoverImage.js        # Script de hover, tokens com Alt+Q, links Scryfall e Tagger
