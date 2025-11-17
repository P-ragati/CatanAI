// game.js — Step 5 (Variant A): Smooth robber steal animation + victim hover sounds
// Replaces previous game.js. Keep existing HTML/CSS and Flask backend.

const board = document.getElementById("board");
const tilesLayer = document.getElementById("tilesLayer");
const nodesLayer = document.getElementById("nodesLayer");
const roadsLayer = document.getElementById("roadsLayer");
const playersDiv = document.getElementById("players");
const logDiv = document.getElementById("gamelog");
const turnIndicator = document.getElementById("turnIndicator");
const diceDisplay = document.getElementById("diceDisplay");
const resourceCardsDiv = document.getElementById("resourceCards");
const devHandDiv = document.getElementById("devHand");
const devDeckInfo = document.getElementById("devDeckInfo");
const buyDevBtn = document.getElementById("buyDevBtn");

const robberDrawer = document.getElementById("robberDrawer");
const robberVictimList = document.getElementById("robberVictimList");
const robberCancelBtn = document.getElementById("robberCancelBtn");

let buildMode = null;
let selectedNodesForRoad = [];
let nodePositions = {};
let currentGameState = null;

let waitingForRobberMove = false;
let pendingRobberTile = null;
let animatingRobber = false;

// Knight awaiting mode (player used knight card and must pick tile)
let awaitingKnight = null; // { playerId, devIndex } or null

// Logging helper
function addLog(text) {
  const time = new Date().toLocaleTimeString();
  logDiv.textContent = `[${time}] ${text}\n` + logDiv.textContent;
}

// Build buttons
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
  if (e.key === "Escape") {
    if (buildMode) {
      buildMode = null;
      selectedNodesForRoad = [];
      addLog("❌ Build mode cancelled.");
      updateNodeVisuals();
    }
    if (awaitingKnight) {
      awaitingKnight = null;
      addLog("❌ Knight placement cancelled.");
    }
    if (waitingForRobberMove) {
      waitingForRobberMove = false;
      addLog("❌ Robber selection cancelled.");
      if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
    }
  }
});

// robber drawer cancel
robberCancelBtn.addEventListener("click", () => {
  closeRobberDrawer();
  addLog("🛑 Robber move cancelled by player.");
  waitingForRobberMove = false;
  pendingRobberTile = null;
  if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
});

// Hex layout helper (used by renderTiles)
const hexRows = [[0,1,2],[3,4,5,6],[7,8,9,10,11],[12,13,14,15],[16,17,18]];

// Settlement placement rule (backend state used)
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

// Highlight buildable nodes
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

// Settlement icon (same as your previous helper)
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

// Remove any existing robber DOM element
function removeRobberDom() {
  const existing = document.getElementById("robberDom");
  if (existing) existing.remove();
}

// Create the robber token element (classic pawn SVG)
function createRobberTokenElement() {
  const el = document.createElement("div");
  el.id = "robberDom";
  el.className = "robber-token";
  el.innerHTML = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g fill="none" fill-rule="evenodd">
      <path d="M32 6c-6.6 0-12 5.4-12 12 0 2.8 1 5.4 2.7 7.4C14 28 8 36 8 44c0 8.8 7.2 16 16 16h24c8.8 0 16-7.2 16-16 0-8-6-16-14.7-18.6C42.9 23.4 44 20.8 44 18c0-6.6-5.4-12-12-12z" fill="#111"/>
      <circle cx="32" cy="18" r="8" fill="#000"/>
    </g>
  </svg>`;
  // ensure pointer-events none so it doesn't intercept clicks
  el.style.pointerEvents = "none";
  return el;
}

// Render tiles & nodes (robber rendering included)
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
      if (tile.robbed) tileEl.classList.add("robbed");
      tileEl.style.left = `${x}px`;
      tileEl.style.top = `${y}px`;
      tileEl.style.backgroundImage = `url("/static/textures/${tile.resource}.jpg")`;
      tileEl.dataset.tileIndex = tileIdx;
      tileEl.innerHTML = `<div class="num">${tile.number}</div>`;

      tilesLayer.appendChild(tileEl);
      tileIdx++;
    }
  }

  // robber token — if not currently animating, render at state's robber tile
  if (!animatingRobber) {
    removeRobberDom();
    if (currentGameState && currentGameState.robber_tile !== null && currentGameState.robber_tile !== undefined) {
      const tileEl = tilesLayer.querySelector(`.tile[data-tile-index='${currentGameState.robber_tile}']`);
      if (tileEl) {
        const rect = tileEl.getBoundingClientRect();
        const parentRect = tilesLayer.getBoundingClientRect();
        const centerX = (rect.left - parentRect.left) + rect.width/2;
        const centerY = (rect.top - parentRect.top) + rect.height/2;
        const robber = createRobberTokenElement();
        robber.style.left = `${centerX - 15}px`;
        robber.style.top = `${centerY - 18}px`;
        tilesLayer.appendChild(robber);
      }
    }
  }

  // nodes
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

  // tile click selection for robber or knight
  if (waitingForRobberMove || awaitingKnight) {
    document.querySelectorAll(".tile").forEach(t => {
      t.classList.add("robber-selectable");
      t.style.cursor = "pointer";
      // ensure single handler binding by wrapping in a once-flag
      t.addEventListener("click", selectionTileClickHandler);
    });
  } else {
    document.querySelectorAll(".tile.robber-selectable").forEach(t => {
      t.classList.remove("robber-selectable");
      t.style.cursor = "";
      t.removeEventListener("click", selectionTileClickHandler);
    });
  }
}

// Unified click handler for tiles when expecting a tile selection (robber or knight)
async function selectionTileClickHandler(e) {
  if (animatingRobber) return;
  const tileEl = e.currentTarget;
  const tid = parseInt(tileEl.dataset.tileIndex);
  if (isNaN(tid)) return;

  if (awaitingKnight) {
    const { playerId, devIndex } = awaitingKnight;
    awaitingKnight = null;
    addLog(`♞ Knight used — selected tile ${tid}. Moving robber...`);
    playSFX("robber");
    try {
      const res = await fetch("/api/use_dev", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ player: playerId, index: devIndex, target_tile: tid })
      });
      const data = await res.json();
      if (data.error) {
        addLog(`❌ Knight use failed: ${data.error}`);
        if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
        return;
      }
      const oldTile = currentGameState ? currentGameState.robber_tile : null;
      const victims = data.eligible_victims || [];
      const newState = data.state;

      await animateRobberMovement(oldTile, tid); // includes thump/puff
      currentGameState = newState;
      renderTiles(currentGameState.tiles, currentGameState.nodes);
      renderPlayers(currentGameState);
      renderResourceCards();
      renderDevHand();

      if (!victims.length) {
        addLog(`🧭 Robber moved to tile ${tid}. No eligible victims to steal from.`);
        return;
      } else if (victims.length === 1) {
        addLog(`🧭 One eligible victim: ${victims[0].name}. Stealing automatically...`);
        await executeRobberStealPhase2(tid, victims[0].id);
        return;
      } else {
        openRobberDrawer(victims);
        return;
      }
    } catch (err) {
      addLog("Knight flow failed: " + err.message);
      if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
      return;
    }
  }

  if (waitingForRobberMove) {
    waitingForRobberMove = false;
    pendingRobberTile = tid;
    addLog(`🧭 Selected tile ${tid} to move robber.`);
    try {
      const res = await fetch("/api/move_robber", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ player: currentGameState.current_player, tile: tid })
      });
      const data = await res.json();
      if (data.error) {
        addLog(`❌ Move robber failed: ${data.error}`);
        pendingRobberTile = null;
        if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
        return;
      }
      const victims = data.eligible_victims || [];
      const newState = data.state;
      const oldTile = currentGameState ? currentGameState.robber_tile : null;

      await animateRobberMovement(oldTile, tid);
      currentGameState = newState;
      renderTiles(currentGameState.tiles, currentGameState.nodes);
      renderPlayers(currentGameState);
      renderResourceCards();
      renderDevHand();

      if (!victims.length) {
        addLog(`🧭 Robber moved to tile ${tid}. No eligible victims.`);
        pendingRobberTile = null;
        return;
      } else if (victims.length === 1) {
        addLog(`🧭 One eligible victim: ${victims[0].name}. Stealing automatically...`);
        await executeRobberStealPhase2(tid, victims[0].id);
        pendingRobberTile = null;
        return;
      } else {
        openRobberDrawer(victims);
        return;
      }

    } catch (err) {
      addLog("Move robber (phase1) failed: " + err.message);
      pendingRobberTile = null;
      if (currentGameState) renderTiles(currentGameState.tiles, currentGameState.nodes);
    }
  }
}

// get center coords for tile index (relative to tilesLayer)
function getTileCenterPosition(tileIndex) {
  const tileEl = tilesLayer.querySelector(`.tile[data-tile-index='${tileIndex}']`);
  if (!tileEl) return null;
  const rect = tileEl.getBoundingClientRect();
  const parentRect = tilesLayer.getBoundingClientRect();
  const centerX = (rect.left - parentRect.left) + rect.width/2;
  const centerY = (rect.top - parentRect.top) + rect.height/2;
  return { x: centerX - 15, y: centerY - 18 }; // offsets to center robber token
}

function ensureRobberTokenAt(pos) {
  removeRobberDom();
  const robber = createRobberTokenElement();
  robber.style.left = `${pos.x}px`;
  robber.style.top = `${pos.y}px`;
  tilesLayer.appendChild(robber);
  return robber;
}

// Create a small smoke/puff visual at given page-relative coords (x,y in tilesLayer coordinates)
function createPuffAt(x, y) {
  const puff = document.createElement("div");
  puff.className = "robber-puff";
  puff.style.position = "absolute";
  puff.style.left = `${x - 18}px`;
  puff.style.top = `${y - 18}px`;
  puff.style.width = "36px";
  puff.style.height = "36px";
  puff.style.borderRadius = "50%";
  puff.style.pointerEvents = "none";
  puff.style.zIndex = 999;
  puff.style.background = "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(255,255,255,0.6) 20%, rgba(200,200,200,0.1) 40%, rgba(0,0,0,0.02) 60%)";
  puff.style.transform = "scale(0.2)";
  puff.style.opacity = "0.0";
  tilesLayer.appendChild(puff);

  requestAnimationFrame(() => {
    puff.style.transition = "transform 420ms ease-out, opacity 420ms ease-out";
    puff.style.transform = "scale(1.05)";
    puff.style.opacity = "1";
    setTimeout(() => {
      puff.style.transform = "scale(1.6)";
      puff.style.opacity = "0";
      setTimeout(() => puff.remove(), 480);
    }, 120);
  });
  return puff;
}

// animate robber movement with thump + puff + small shake
function animateRobberMovement(oldTile, newTile) {
  return new Promise((resolve) => {
    animatingRobber = true;
    // Play whoosh first
    playSFX("robber");

    const startPos = (oldTile !== null && oldTile !== undefined) ? getTileCenterPosition(oldTile) : null;
    const endPos = getTileCenterPosition(newTile);

    if (!endPos) {
      // fallback: short delay
      setTimeout(() => { animatingRobber = false; resolve(); }, 200);
      return;
    }

    // create token at start or above center
    let token;
    if (startPos) {
      token = ensureRobberTokenAt(startPos);
      // animate to end
      requestAnimationFrame(() => {
        token.style.transition = 'left 0.45s cubic-bezier(.2,.9,.25,1), top 0.45s cubic-bezier(.2,.9,.25,1), transform 0.25s ease';
        token.style.left = `${endPos.x}px`;
        token.style.top = `${endPos.y}px`;
      });
    } else {
      const parentRect = tilesLayer.getBoundingClientRect();
      const cx = parentRect.width / 2 - 15;
      token = ensureRobberTokenAt({ x: cx, y: -68 });
      requestAnimationFrame(() => {
        token.style.transition = 'left 0.45s cubic-bezier(.2,.9,.25,1), top 0.45s cubic-bezier(.2,.9,.25,1), transform 0.25s ease';
        token.style.left = `${endPos.x}px`;
        token.style.top = `${endPos.y}px`;
      });
    }

    // mark target tile visually robbed during animation
    const targetTileEl = tilesLayer.querySelector(`.tile[data-tile-index='${newTile}']`);
    if (targetTileEl) targetTileEl.classList.add("robbed");

    // when transition ends -> thump + puff + shake
    const onTransitionEnd = (ev) => {
      if (ev.propertyName === 'left' || ev.propertyName === 'top') {
        token.removeEventListener('transitionend', onTransitionEnd);

        // Thump sound
        playSFX("thump");

        // create puff at robber center (use endPos)
        createPuffAt(endPos.x + 15, endPos.y + 18); // adjust so puff appears over tile

        // small landing bounce & shake
        token.style.transform = 'translateY(-10px) scale(1.06)';
        setTimeout(() => {
          token.style.transform = 'translateY(0) scale(1)';
          // quick lateral shake
          const shake = [{x:0},{x:-6},{x:5},{x:-3},{x:2},{x:0}];
          let i=0;
          const sh = setInterval(()=> {
            token.style.left = `${endPos.x + (shake[i].x||0)}px`;
            i++;
            if (i>=shake.length) { clearInterval(sh); token.style.left = `${endPos.x}px`; animatingRobber = false; resolve(); }
          }, 38);
        }, 140);
      }
    };
    token.addEventListener('transitionend', onTransitionEnd);

    // safety timeout
    setTimeout(() => {
      if (animatingRobber) {
        animatingRobber = false;
        resolve();
      }
    }, 1500);
  });
}

// Node click handler
async function handleNodeClick(nodeId) {
  if (!buildMode) return;

  if (buildMode === "settlement") {
    if (!canPlaceSettlement(nodeId, currentGameState.current_player)) {
      addLog(`⚠️ Cannot place settlement at node ${nodeId}.`);
      return;
    }

    const playerId = currentGameState.current_player;
    addSettlementToBoard(nodeId, playerId);
    playSFX("buildSettlement");
    addLog(`🏠 Placed settlement on node ${nodeId}.`);
    await sendBuild({ player: playerId, type: "settlement", node: nodeId });
  }

  else if (buildMode === "road") {
    selectedNodesForRoad.push(nodeId);
    if (selectedNodesForRoad.length === 2) {
      const [n1, n2] = selectedNodesForRoad;
      const playerId = currentGameState.current_player;
      addRoadToBoard(n1, n2, playerId);
      playSFX("buildRoad");
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

// Add settlement DOM instantly
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

// Add road DOM
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

// Send build request
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
      renderResourceCards();
      renderDevHand();
    }
    buildMode = null;
    updateNodeVisuals();
  } catch (err) {
    addLog("Build request failed: " + err.message);
  }
}

// Render players, roads, settlements
function renderPlayers(state) {
  playersDiv.innerHTML = "";
  roadsLayer.innerHTML = "";
  document.querySelectorAll(".settlement").forEach(e => e.remove());

  state.players.forEach(p => {
    const el = document.createElement("div");
    el.className = "player-card" + (state.current_player === p.id ? " active" : "");
    el.innerHTML = `
      <div class="card-header">${p.name} ${state.current_player === p.id ? '(Your Turn)' : ''}</div>
      <div class="card-body">
        <div><strong>VP:</strong> ${p.vp}</div>
        <div><strong>Free Roads:</strong> ${p.pending_free_roads || 0}</div>
      </div>`;
    playersDiv.appendChild(el);

    p.settlements.forEach(nodeId => addSettlementToBoard(nodeId, p.id));
    p.roads.forEach(edge => addRoadToBoard(edge[0], edge[1], p.id));
  });

  turnIndicator.textContent = `Turn: ${state.turn} | Current: Player ${state.current_player + 1}`;
}

// Animate stolen resource flying from victim → current player (with puff at source)
function animateResourceTransfer(resourceSymbol, fromPlayerId, toPlayerId) {
  const fxLayer = document.getElementById("fxLayer");
  const startCard = document.querySelectorAll(".player-card")[fromPlayerId];
  const endCard = document.querySelectorAll(".player-card")[toPlayerId];

  if (!startCard || !endCard) return;

  const startRect = startCard.getBoundingClientRect();
  const endRect = endCard.getBoundingClientRect();

  // create little puff on victim card
  const puff = document.createElement("div");
  puff.className = "transfer-puff";
  puff.style.position = "fixed";
  puff.style.left = (startRect.left + 8) + "px";
  puff.style.top = (startRect.top - 6) + "px";
  puff.style.width = "14px";
  puff.style.height = "14px";
  puff.style.borderRadius = "50%";
  puff.style.background = "rgba(200,200,200,0.9)";
  puff.style.zIndex = 5000;
  puff.style.opacity = "0.0";
  puff.style.transform = "scale(0.2)";
  fxLayer.appendChild(puff);
  requestAnimationFrame(() => {
    puff.style.transition = "transform 220ms ease-out, opacity 220ms ease-out";
    puff.style.transform = "scale(1)";
    puff.style.opacity = "1";
  });
  setTimeout(() => {
    puff.remove();
  }, 360);

  const el = document.createElement("div");
  el.className = "flying-resource";
  el.textContent = resourceSymbol;

  // position fixed near victim card
  el.style.position = "fixed";
  el.style.left = (startRect.left + 24) + "px";
  el.style.top = (startRect.top + 12) + "px";

  fxLayer.appendChild(el);

  requestAnimationFrame(() => {
    el.style.transition = "transform 0.72s cubic-bezier(.2,1.0,.2,1), opacity 0.35s ease";
    const dx = endRect.left - startRect.left;
    const dy = endRect.top - startRect.top;
    el.style.transform = `translate(${dx}px, ${dy}px) scale(1.3)`;
    el.style.opacity = "0";
  });

  setTimeout(() => {
    if (el.parentElement) el.parentElement.removeChild(el);
    // flash receiver
    const endCardEl = document.querySelectorAll(".player-card")[toPlayerId];
    if (endCardEl) {
      endCardEl.classList.add("flash");
      setTimeout(() => endCardEl.classList.remove("flash"), 450);
    }
  }, 820);
}

// Map resource → emoji
const RES_SYMBOL = {
  wood: "🪵",
  brick: "🧱",
  wheat: "🌾",
  sheep: "🐑",
  ore: "⛏️"
};

// Phase 2: execute steal from chosen victim
async function executeRobberStealPhase2(tileIndex, victimId) {
  try {
    const res = await fetch("/api/move_robber", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ player: currentGameState.current_player, tile: tileIndex, victim_id: victimId })
    });

    const data = await res.json();
    if (data.error) {
      addLog(`❌ Steal failed: ${data.error}`);
    } else {
      const r = data.result || {};
      const thiefId = currentGameState.current_player;
      const victim = r.victim;

      if (r.stolen) {
        addLog(`🦹‍♂️ Stole 1 ${r.stolen} from ${victim.name}.`);
        const symbol = RES_SYMBOL[r.stolen] || "💰";
        animateResourceTransfer(symbol, victimId, thiefId);
        playSFX("steal");
      } else if (r.note) {
        addLog(`🧭 Robber moved to tile ${r.moved_to}. ${r.note}`);
      } else {
        addLog(`🧭 Robber moved to tile ${r.moved_to}. No resource stolen.`);
      }

      currentGameState = data.state;
      renderTiles(currentGameState.tiles, currentGameState.nodes);
      renderPlayers(currentGameState);
      renderResourceCards();
      renderDevHand();
    }
  } catch (err) {
    addLog("Steal (phase2) failed: " + err.message);
  } finally {
    closeRobberDrawer();
    pendingRobberTile = null;
  }
}

// Open drawer showing victims — enhance hover & sound
function openRobberDrawer(victims) {
  robberVictimList.innerHTML = "";
  victims.forEach(v => {
    const el = document.createElement("div");
    el.className = "drawer-victim";
    el.innerHTML = `
      <div class="victim-meta">${v.name} — ${v.resource_count} cards</div>
      <button data-victim-id="${v.id}">Steal from ${v.name}</button>
    `;
    const btn = el.querySelector("button");
    // play a soft hover sound when hovering victims, and pulse highlight CSS
    btn.addEventListener("mouseenter", () => {
      btn.classList.add("victim-hover");
      playSFX("hover");
    });
    btn.addEventListener("mouseleave", () => btn.classList.remove("victim-hover"));

    btn.addEventListener("click", async () => {
      playSFX("click");
      addLog(`🫵 Chosen to steal from ${v.name}...`);
      const tileToUse = pendingRobberTile;
      await executeRobberStealPhase2(tileToUse, v.id);
    });
    robberVictimList.appendChild(el);
  });
  robberDrawer.classList.add("open");
  robberDrawer.setAttribute("aria-hidden", "false");
}

function closeRobberDrawer() {
  robberDrawer.classList.remove("open");
  robberDrawer.setAttribute("aria-hidden", "true");
  robberVictimList.innerHTML = "";
}

// Roll dice
async function rollDice() {
  if (animatingRobber || awaitingKnight) return;
  try {
    const res = await fetch("/api/roll", { method: "POST" });
    const data = await res.json();
    const [d1, d2] = data.dice;
    diceDisplay.textContent = `🎲 ${d1} + ${d2} = ${data.total}`;
    addLog(`🎲 Rolled ${d1}+${d2} = ${data.total}`);
    playSFX("dice");
    currentGameState = data.state;
    renderPlayers(data.state);
    renderTiles(data.state.tiles, data.state.nodes);
    renderResourceCards();
    renderDevHand();

    if (data.total === 7) {
      addLog("🧭 7 rolled — choose a tile to move the robber.");
      waitingForRobberMove = true;
      pendingRobberTile = null;
      renderTiles(currentGameState.tiles, currentGameState.nodes);
    }
  } catch (err) {
    addLog("Roll failed: " + err.message);
  }
}

// New game
async function newGame() {
  const res = await fetch("/api/new_game", { method: "POST" });
  const data = await res.json();
  currentGameState = data.state;
  addLog("🎮 New Game Started");
  renderTiles(data.state.tiles, data.state.nodes);
  renderPlayers(data.state);
  renderResourceCards();
  renderDevHand();
}

// Resource cards rendering
function renderResourceCards() {
  resourceCardsDiv.innerHTML = "";
  if (!currentGameState) return;
  const current = currentGameState.players[currentGameState.current_player];
  const resources = current.resources;
  const types = [
    {key:'wood', label:'Wood', cls:'res-wood', symbol:'🪵'},
    {key:'brick', label:'Brick', cls:'res-brick', symbol:'🧱'},
    {key:'wheat', label:'Wheat', cls:'res-wheat', symbol:'🌾'},
    {key:'sheep', label:'Sheep', cls:'res-sheep', symbol:'🐑'},
    {key:'ore', label:'Ore', cls:'res-ore', symbol:'⛏️'},
  ];

  types.forEach(t => {
    const card = document.createElement("div");
    card.className = "resource-card";
    card.dataset.res = t.key;
    card.innerHTML = `
      <div class="resource-icon ${t.cls}">${t.symbol}</div>
      <div class="resource-label">${t.label}</div>
      <div class="resource-count" id="res-${t.key}">${resources[t.key] || 0}</div>
    `;
    card.addEventListener("click", () => {
      addLog(`🔍 ${t.label} count: ${resources[t.key] || 0}`);
      playSFX("click");
    });
    resourceCardsDiv.appendChild(card);
  });
}

// Render dev hand
function renderDevHand() {
  devHandDiv.innerHTML = "";
  devDeckInfo.textContent = `Deck: ${currentGameState.dev_deck_count}`;
  const cur = currentGameState.players[currentGameState.current_player];
  (cur.dev_hand || []).forEach((card, idx) => {
    const dc = document.createElement("div");
    dc.className = "dev-card";
    dc.dataset.idx = idx;
    dc.innerHTML = `<div class="dev-type">${card.toUpperCase()}</div><div class="dev-sub">Click to use</div>`;
    dc.addEventListener("click", async () => {
      await useDevCard(idx, card);
    });
    devHandDiv.appendChild(dc);
  });
}

// Buy dev card
buyDevBtn.addEventListener("click", async () => {
  const playerId = currentGameState.current_player;
  try {
    const res = await fetch("/api/buy_dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player: playerId })
    });
    const data = await res.json();
    if (data.error) {
      addLog(`❌ Buy failed: ${data.error}`);
    } else {
      addLog(`🎴 Bought dev card: ${data.card}`);
      playSFX("devBuy");
      currentGameState = data.state;
      renderPlayers(data.state);
      renderResourceCards();
      renderDevHand();
    }
  } catch (err) {
    addLog("Buy dev failed: " + err.message);
  }
});

// Use dev card flow
async function useDevCard(index, cardType) {
  const playerId = currentGameState.current_player;
  if (cardType === "knight") {
    awaitingKnight = { playerId, devIndex: index };
    addLog("♞ Knight selected — click a tile to move the robber.");
    renderTiles(currentGameState.tiles, currentGameState.nodes);
    return;
  } else if (cardType === "monopoly") {
    const resource = prompt("Enter resource to monopolize: wood, brick, wheat, sheep, ore");
    if (!resource) return;
    await postUseDev({ player: playerId, index, resource });
  } else if (cardType === "year_of_plenty") {
    const a = prompt("Choose first resource (wood, brick, wheat, sheep, ore)");
    if (!a) return;
    const b = prompt("Choose second resource (wood, brick, wheat, sheep, ore)");
    if (!b) return;
    await postUseDev({ player: playerId, index, choices: [a, b] });
  } else if (cardType === "road_building") {
    alert("You received 2 free roads — build them using the Build Road button. They will be consumed when used.");
    await postUseDev({ player: playerId, index });
  } else if (cardType === "victory") {
    addLog("🏆 Victory point dev card revealed (VP already counted).");
    await postUseDev({ player: playerId, index });
  } else {
    addLog("Unknown card type.");
  }
}

async function postUseDev(payload) {
  try {
    const res = await fetch("/api/use_dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) {
      addLog(`❌ Use dev failed: ${data.error}`);
    } else {
      addLog(`✅ Dev used: ${JSON.stringify(data.result || data)}`);
      currentGameState = data.state;
      renderPlayers(data.state);
      renderResourceCards();
      renderDevHand();
    }
  } catch (err) {
    addLog("Use dev failed: " + err.message);
  }
}

// ----------------- SOUNDS: WebAudio synth (extended) -----------------
const Sound = (function () {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);

  function env(gainNode, now, attack = 0.005, decay = 0.08, sustain = 0.0, release = 0.12, peak = 1) {
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.linearRampToValueAtTime(peak, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustain * peak, now + attack + decay);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + attack + decay + release);
  }

  let noiseBuffer = null;
  function ensureNoise() {
    if (noiseBuffer) return noiseBuffer;
    const sampleRate = ctx.sampleRate;
    const length = sampleRate * 1.0;
    const buf = ctx.createBuffer(1, length, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffer = buf;
    return buf;
  }

  function resumeCtx() {
    if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
  }

  // basic sounds
  function playClick() {
    resumeCtx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 1200;
    const g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, now, 0.002, 0.02, 0.0, 0.06, 0.75);
    o.start(now); o.stop(now + 0.08);
  }

  function playDice() {
    resumeCtx();
    const now = ctx.currentTime;
    for (let i=0;i<3;i++){
      const src = ctx.createBufferSource();
      src.buffer = ensureNoise();
      const flt = ctx.createBiquadFilter();
      flt.type = 'bandpass';
      flt.frequency.value = 1000 + Math.random()*1200;
      const g = ctx.createGain();
      src.connect(flt); flt.connect(g); g.connect(master);
      const t = now + i*0.04;
      env(g, t, 0.001, 0.03, 0.0, 0.06, 0.7 - i*0.12);
      src.start(t);
      src.stop(t + 0.18);
    }
  }

  function playBuildSettlement() {
    resumeCtx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 220;
    const g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, now, 0.01, 0.08, 0.0, 0.18, 0.9);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 440;
    const g2 = ctx.createGain(); o2.connect(g2); g2.connect(master);
    env(g2, now, 0.01, 0.08, 0.0, 0.18, 0.18);
    o.start(now); o.stop(now + 0.28);
    o2.start(now); o2.stop(now + 0.28);
  }

  function playBuildRoad() {
    resumeCtx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 420;
    const g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, now, 0.002, 0.04, 0.0, 0.12, 0.7);
    o.start(now); o.stop(now + 0.14);
  }

  function playRobber() {
    resumeCtx();
    const now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = ensureNoise();
    const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.Q.value = 1.2;
    flt.frequency.value = 300;
    const g = ctx.createGain();
    src.connect(flt); flt.connect(g); g.connect(master);
    env(g, now, 0.01, 0.12, 0.0, 0.24, 0.8);
    flt.frequency.setValueAtTime(120, now);
    flt.frequency.linearRampToValueAtTime(2200, now + 0.45);
    src.start(now); src.stop(now + 0.6);
  }

  function playSteal() {
    resumeCtx();
    const now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = ensureNoise();
    const flt = ctx.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 800;
    const g = ctx.createGain();
    src.connect(flt); flt.connect(g); g.connect(master);
    env(g, now, 0.002, 0.02, 0.0, 0.08, 0.9);
    src.start(now); src.stop(now + 0.12);

    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1200;
    const g2 = ctx.createGain(); o.connect(g2); g2.connect(master);
    env(g2, now+0.01, 0.001, 0.03, 0.0, 0.08, 0.45);
    o.start(now); o.stop(now + 0.12);
  }

  function playDevBuy() {
    resumeCtx();
    const now = ctx.currentTime;
    const o1 = ctx.createOscillator(); o1.type='sine'; o1.frequency.value=880;
    const g1 = ctx.createGain(); o1.connect(g1); g1.connect(master);
    env(g1, now, 0.002, 0.03, 0.0, 0.08, 0.65);
    o1.start(now); o1.stop(now + 0.12);
    const o2 = ctx.createOscillator(); o2.type='sine'; o2.frequency.value=660;
    const g2 = ctx.createGain(); o2.connect(g2); g2.connect(master);
    env(g2, now+0.06, 0.002, 0.03, 0.0, 0.12, 0.45);
    o2.start(now+0.06); o2.stop(now + 0.18);
  }

  // Thump for landing
  function playThump() {
    resumeCtx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 120;
    const g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, now, 0.005, 0.06, 0.0, 0.12, 0.9);
    o.start(now); o.stop(now + 0.14);

    // low rumble
    const src = ctx.createBufferSource(); src.buffer = ensureNoise();
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 200;
    const g2 = ctx.createGain();
    src.connect(flt); flt.connect(g2); g2.connect(master);
    env(g2, now, 0.01, 0.1, 0.0, 0.2, 0.3);
    src.start(now); src.stop(now + 0.16);
  }

  // Soft hover/pop for victim hover
  function playHover() {
    resumeCtx();
    const now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 980;
    const g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, now, 0.001, 0.02, 0.0, 0.06, 0.25);
    o.start(now); o.stop(now + 0.08);
  }

  return {
    play(name) {
      switch((name||'').toString()){
        case 'dice': return playDice();
        case 'buildSettlement': return playBuildSettlement();
        case 'buildRoad': return playBuildRoad();
        case 'robber': return playRobber();
        case 'steal': return playSteal();
        case 'devBuy': return playDevBuy();
        case 'thump': return playThump();
        case 'hover': return playHover();
        case 'click': return playClick();
        default: return playClick();
      }
    },
    setVolume(v) { master.gain.value = Math.max(0, Math.min(1, v)); },
    resume() { resumeCtx(); }
  };
})();

// compatibility wrapper: playSFX accepts string keys (or old HTMLAudioElements)
function playSFX(nameOrAudio) {
  if (nameOrAudio && typeof nameOrAudio === 'object' && nameOrAudio instanceof HTMLAudioElement) {
    try { nameOrAudio.currentTime = 0; nameOrAudio.play().catch(()=>{}); return; } catch(e){}
  }
  const name = (typeof nameOrAudio === 'string') ? nameOrAudio : null;
  if (name) Sound.play(name);
  else Sound.play('click');
}

// attach volume slider to synth
document.addEventListener('DOMContentLoaded', () => {
  const v = document.getElementById("volumeSlider");
  if (v) {
    Sound.setVolume(parseFloat(v.value || 0.7));
    v.addEventListener("input", e => Sound.setVolume(parseFloat(e.target.value)));
  }
  document.addEventListener('click', () => Sound.resume(), { once: true });
});

// Init
(async function init() {
  try {
    const res = await fetch("/api/state");
    currentGameState = await res.json();
    renderTiles(currentGameState.tiles, currentGameState.nodes);
    renderPlayers(currentGameState);
    renderResourceCards();
    renderDevHand();
    addLog("🟢 UI Ready. Click 'New Game' to begin.");
  } catch (err) {
    addLog("Init failed: " + err.message);
  }
})();

// Buttons wiring
document.getElementById("newGameBtn").addEventListener("click", newGame);
document.getElementById("rollBtn").addEventListener("click", rollDice);

// small animation style injection (kept existing + puff styles)
const style = document.createElement("style");
style.textContent = `
  @keyframes popIn { from { transform: scale(0.2); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .settlement { position: absolute; width: 28px; height: 28px; cursor: pointer; }
  .node.buildable { box-shadow: 0 0 8px 2px limegreen; }
  .node.blocked { opacity: 0.4; }
  .node.hover-preview { transform: scale(1.2); }

  .tile.robber-selectable { outline: 4px dashed rgba(80,80,80,0.18); transform: translateY(-6px); transition: transform 0.12s ease; }
  .tile.robber-selectable:hover { transform: translateY(-10px) scale(1.02); cursor: pointer; }

  .flying-resource {
    position: fixed;
    width: 36px; height: 36px; border-radius: 8px; background: white;
    display:flex; align-items:center; justify-content:center;
    font-size:18px; font-weight:800; z-index:5000; pointer-events:none;
    box-shadow:0 4px 10px rgba(0,0,0,0.25);
    transition: transform 0.72s cubic-bezier(.2,1.0,.2,1), opacity 0.35s ease;
  }

  .player-card.flash { animation: flashPlayer 0.45s ease; }
  @keyframes flashPlayer {
    0% { box-shadow: 0 0 0px rgba(91,135,250,0.0); }
    50% { box-shadow: 0 0 20px rgba(91,135,250,0.7); }
    100% { box-shadow: 0 0 0px rgba(91,135,250,0.0); }
  }

  /* robber token */
  .robber-token { position: absolute; width: 30px; height: 36px; z-index: 999; transform-origin:center; pointer-events:none; transition: left 0.45s cubic-bezier(.2,.9,.25,1), top 0.45s cubic-bezier(.2,.9,.25,1), transform 0.28s ease; }
  .robber-token svg { width:28px; height:28px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.25)); }

  /* puff (transient) */
  .robber-puff { transition: transform 420ms ease-out, opacity 420ms ease-out; }

  /* drawer victim hover class */
  .drawer-victim button.victim-hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(225,70,70,0.12); outline: 2px solid rgba(225,70,70,0.12); }

  .victim-meta { font-weight:700; margin-bottom:6px; color:#222; }

  .transfer-puff { border-radius:50%; transition: transform 240ms ease-out, opacity 240ms ease-out; }

  .flying-resource, .transfer-puff { will-change: transform, opacity; }
`;
document.head.appendChild(style);
