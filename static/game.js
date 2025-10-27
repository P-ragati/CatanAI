console.log("Catan Colonist-style UI loaded 🏝️");

const board = document.getElementById("board");
const tilesLayer = document.getElementById("tilesLayer");
const nodesLayer = document.getElementById("nodesLayer");
const roadsLayer = document.getElementById("roadsLayer");
const playersDiv = document.getElementById("players");
const logDiv = document.getElementById("gamelog");
const turnIndicator = document.getElementById("turnIndicator");
const diceDisplay = document.getElementById("diceDisplay");

let buildMode = null;
let selectedNodesForRoad = [];
let nodePositions = {};
let currentGameState = null;

// 🎯 Build Buttons
document.getElementById("buildSettlementBtn").addEventListener("click", () => {
  buildMode = "settlement";
  selectedNodesForRoad = [];
  addLog("🏠 Build mode: Settlement. Click a glowing node to place.");
  updateNodeVisuals();
});

document.getElementById("buildRoadBtn").addEventListener("click", () => {
  buildMode = "road";
  selectedNodesForRoad = [];
  addLog("🛣️ Build mode: Road. Click two adjacent nodes to connect.");
  updateNodeVisuals();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && buildMode) {
    buildMode = null;
    selectedNodesForRoad = [];
    addLog("❌ Build mode cancelled.");
    updateNodeVisuals();
  }
});

// 🪵 Logging helper
function addLog(text) {
  const time = new Date().toLocaleTimeString();
  logDiv.textContent = `[${time}] ${text}\n` + logDiv.textContent;
}

// Hex board layout rows
const hexRows = [[0,1,2],[3,4,5,6],[7,8,9,10,11],[12,13,14,15],[16,17,18]];

// ✨ Settlement placement rule
function canPlaceSettlement(nodeId, playerId) {
  if (!currentGameState) return false;
  for (let p of currentGameState.players) {
    if (p.settlements.includes(nodeId)) return false;
  }
  const adjacentNodes = currentGameState.node_adjacency[nodeId] || [];
  for (let adjNode of adjacentNodes) {
    for (let p of currentGameState.players) {
      if (p.settlements.includes(adjNode)) return false;
    }
  }
  return true;
}

// 💡 Highlight buildable nodes
function updateNodeVisuals() {
  if (!currentGameState) return;
  document.querySelectorAll(".node").forEach(nodeEl => {
    const nodeId = parseInt(nodeEl.dataset.nodeId);
    nodeEl.classList.remove("buildable", "blocked");
    if (buildMode === "settlement") {
      canPlaceSettlement(nodeId, currentGameState.current_player)
        ? nodeEl.classList.add("buildable")
        : nodeEl.classList.add("blocked");
    } else if (buildMode === "road") {
      nodeEl.classList.add("buildable");
    }
  });
}

// 🏠 SVG icon for settlements
function createSettlementIcon(playerId) {
  const colors = ["#5b87fa", "#f0a500", "#58c472", "#e14d4d"];
  const color = colors[playerId % colors.length];
  return `
    <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="12" width="12" height="10" fill="${color}" stroke="white" stroke-width="1.5"/>
      <path d="M3 12 L12 4 L21 12 Z" fill="${color}" stroke="white" stroke-width="1.5"/>
      <rect x="10" y="16" width="4" height="6" fill="rgba(0,0,0,0.3)"/>
    </svg>`;
}

// 🧱 Render everything
function renderTiles(tiles, nodes) {
  tilesLayer.innerHTML = "";
  nodesLayer.innerHTML = "";
  roadsLayer.innerHTML = "";
  nodePositions = {};

  const centerX = board.clientWidth / 2;
  const centerY = board.clientHeight / 2;
  const tileW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 96;
  const tileH = tileW * 1.15;
  const hSpacing = tileW * 0.87;
  const vSpacing = tileH * 0.68;

  let tileIdx = 0;
  const numRows = hexRows.length;
  const startY = centerY - (numRows - 1) / 2 * vSpacing;

  for (let r = 0; r < numRows; r++) {
    const rowLen = hexRows[r].length;
    const startX = centerX - (rowLen - 1) / 2 * hSpacing;
    for (let c = 0; c < rowLen; c++) {
      if (tileIdx >= tiles.length) break;
      const tile = tiles[tileIdx];
      const x = startX + c * hSpacing - tileW / 2;
      const y = startY + r * vSpacing - tileH / 2;

      const tileEl = document.createElement("div");
      tileEl.className = `tile ${tile.resource}`;
      tileEl.style.left = `${x}px`;
      tileEl.style.top = `${y}px`;
      tileEl.style.backgroundImage = `url("/static/textures/${tile.resource}.jpg")`;
      tileEl.innerHTML = `<div class="num">${tile.number}</div>`;
      tilesLayer.appendChild(tileEl);
      tileIdx++;
    }
  }

  if (Array.isArray(nodes)) {
    nodes.forEach(n => {
      const sx = n.x, sy = n.y;
      nodePositions[n.id] = { x: sx, y: sy };
      const nodeEl = document.createElement("div");
      nodeEl.className = "node";
      nodeEl.style.left = `${sx - 6}px`;
      nodeEl.style.top = `${sy - 6}px`;
      nodeEl.dataset.nodeId = n.id;

      nodeEl.addEventListener("mouseenter", () => {
        if (buildMode === "settlement" && canPlaceSettlement(n.id, currentGameState.current_player))
          nodeEl.classList.add("hover-preview");
      });
      nodeEl.addEventListener("mouseleave", () => nodeEl.classList.remove("hover-preview"));
      nodeEl.addEventListener("click", () => handleNodeClick(n.id));
      nodesLayer.appendChild(nodeEl);
    });
    updateNodeVisuals();
  }
}

// 🎯 Node Click
async function handleNodeClick(nodeId) {
  if (!buildMode) return;

  if (buildMode === "settlement") {
    if (!canPlaceSettlement(nodeId, currentGameState.current_player)) {
      addLog(`⚠️ Cannot place settlement at node ${nodeId}.`);
      return;
    }

    const playerId = currentGameState.current_player;
    addSettlementToBoard(nodeId, playerId);
    addLog(`🏠 Placed settlement on node ${nodeId}.`);
    await sendBuild({ player: playerId, type: "settlement", node: nodeId });
  }

  // 🛣️ Road building
  else if (buildMode === "road") {
    selectedNodesForRoad.push(nodeId);
    if (selectedNodesForRoad.length === 2) {
      const [n1, n2] = selectedNodesForRoad;
      const playerId = currentGameState.current_player;
      addRoadToBoard(n1, n2, playerId);
      addLog(`🛣️ Built road between ${n1} and ${n2}.`);
      await sendBuild({ player: playerId, type: "road", from: n1, to: n2 });
      selectedNodesForRoad = [];
      buildMode = null;
      updateNodeVisuals();
    } else {
      addLog(`🟡 Select another adjacent node to complete the road.`);
    }
  }
}

// 🧩 Add settlement DOM element instantly
function addSettlementToBoard(nodeId, playerId) {
  const pos = nodePositions[nodeId];
  if (!pos) return;
  const el = document.createElement("div");
  el.className = `settlement p${playerId + 1}`;
  el.style.left = `${pos.x - 12}px`;
  el.style.top = `${pos.y - 12}px`;
  el.innerHTML = createSettlementIcon(playerId);
  el.style.animation = "popIn 0.3s ease";
  nodesLayer.appendChild(el);
}

// 🪵 Add road DOM element
function addRoadToBoard(nodeA, nodeB, playerId) {
  const posA = nodePositions[nodeA];
  const posB = nodePositions[nodeB];
  if (!posA || !posB) return;

  const midX = (posA.x + posB.x) / 2;
  const midY = (posA.y + posB.y) / 2;
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  const road = document.createElement("div");
  road.className = `road p${playerId + 1}`;
  road.style.width = `${length}px`;
  road.style.left = `${midX - length / 2}px`;
  road.style.top = `${midY - 4}px`;
  road.style.transform = `rotate(${angle}deg)`;
  roadsLayer.appendChild(road);
}

// 🛰️ Send build request
async function sendBuild(payload) {
  try {
    const res = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.error) {
      addLog(`❌ Build failed: ${data.error}`);
    } else {
      currentGameState = data.state;
      renderPlayers(data.state);
    }
    buildMode = null;
    updateNodeVisuals();
  } catch (err) {
    addLog("Build request failed: " + err.message);
  }
}

// 🧍 Render player panels + roads + settlements
function renderPlayers(state) {
  playersDiv.innerHTML = "";
  state.players.forEach(p => {
    const el = document.createElement("div");
    el.className = "player-card" + (state.current_player === p.id ? " active" : "");
    el.innerHTML = `
      <div class="card-header">${p.name} ${state.current_player === p.id ? '(Your Turn)' : ''}</div>
      <div class="card-body">
        <div><strong>VP:</strong> ${p.vp}</div>
      </div>`;
    playersDiv.appendChild(el);

    p.settlements.forEach(nodeId => addSettlementToBoard(nodeId, p.id));
  });
}

// 🎲 Roll dice
async function rollDice() {
  try {
    const res = await fetch("/api/roll", { method: "POST" });
    const data = await res.json();
    const [d1, d2] = data.dice;
    diceDisplay.textContent = `🎲 ${d1} + ${d2} = ${data.total}`;
    addLog(`🎲 Rolled ${d1}+${d2} = ${data.total}`);
    currentGameState = data.state;
    renderPlayers(data.state);
  } catch (err) {
    addLog("Roll failed: " + err.message);
  }
}

// 🆕 New Game
async function newGame() {
  const res = await fetch("/api/new_game", { method: "POST" });
  const data = await res.json();
  currentGameState = data.state;
  addLog("🎮 New Game Started");
  renderTiles(data.state.tiles, data.state.nodes);
  renderPlayers(data.state);
}

// Buttons
document.getElementById("newGameBtn").addEventListener("click", newGame);
document.getElementById("rollBtn").addEventListener("click", rollDice);

// Init
(async function init() {
  const res = await fetch("/api/state");
  currentGameState = await res.json();
  renderTiles(currentGameState.tiles, currentGameState.nodes);
  renderPlayers(currentGameState);
  addLog("🟢 UI Ready. Click 'New Game' to begin.");
})();

// 🔮 Small animation
const style = document.createElement("style");
style.textContent = `
  @keyframes popIn {
    from { transform: scale(0.2); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .settlement { position: absolute; width: 28px; height: 28px; cursor: pointer; }
  .node.buildable { box-shadow: 0 0 8px 2px limegreen; }
  .node.blocked { opacity: 0.4; }
  .node.hover-preview { transform: scale(1.2); }

  /* --- Road styles --- */
  .road {
    position: absolute;
    height: 8px;
    background-color: #8b4513;
    border-radius: 4px;
    box-shadow: 0 0 3px rgba(0,0,0,0.5);
    transform-origin: center center;
    z-index: 3;
  }
  .road.p1 { background-color: #5b87fa; }
  .road.p2 { background-color: #f0a500; }
  .road.p3 { background-color: #58c472; }
  .road.p4 { background-color: #e14d4d; }
`;
document.head.appendChild(style);
