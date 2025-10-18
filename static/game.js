// static/game.js
// Colonist-style UI - frontend (keeps backend same)
console.log("Colonist-style UI loaded");

const board = document.getElementById("board");
const playersDiv = document.getElementById("players");
const logDiv = document.getElementById("gamelog");
const turnIndicator = document.getElementById("turnIndicator");
const diceDisplay = document.getElementById("diceDisplay");

function addLog(text){
  const time = new Date().toLocaleTimeString();
  logDiv.textContent = `[${time}] ${text}\n` + logDiv.textContent;
}

// tile positions for 19-hex Catan layout, relative to board center
// These were hand-tuned for nice spacing; JS will convert to px using board size.
const layoutOffsets = [
  // row -2 (3)
  {x:-2,y:-2},{x:0,y:-2},{x:2,y:-2},
  // row -1 (4)
  {x:-3,y:-1},{x:-1,y:-1},{x:1,y:-1},{x:3,y:-1},
  // row 0 (5)
  {x:-4,y:0},{x:-2,y:0},{x:0,y:0},{x:2,y:0},{x:4,y:0},
  // row +1 (4)
  {x:-3,y:1},{x:-1,y:1},{x:1,y:1},{x:3,y:1},
  // row +2 (3)
  {x:-2,y:2},{x:0,y:2},{x:2,y:2}
];

// Renders tiles given state.tiles (array of 19)
function renderTiles(tiles){
  // clear
  board.innerHTML = "";
  const boardRect = board.getBoundingClientRect();
  const centerX = boardRect.width / 2;
  const centerY = boardRect.height / 2;
  const spacing = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 96;
  const hSpacing = spacing * 0.86; // horizontal distance between columns
  const vSpacing = spacing * 0.74; // vertical distance between rows

  tiles.forEach((tile, idx) => {
    const off = layoutOffsets[idx];
    const tileEl = document.createElement("div");
    tileEl.className = `tile ${tile.resource}` + (tile.robbed ? " robbed" : "");
    // calc pos
    const left = centerX + off.x * hSpacing - (spacing/2);
    const top  = centerY + off.y * vSpacing - (spacing*0.55);
    tileEl.style.left = `${left}px`;
    tileEl.style.top = `${top}px`;

    tileEl.innerHTML = `<div class="res">${tile.resource}</div>
                        <div class="num">${tile.number}</div>`;
    board.appendChild(tileEl);
  });
}

// Render players side bar
function renderPlayers(state){
  playersDiv.innerHTML = "";
  state.players.forEach(p=>{
    const el = document.createElement("div");
    el.className = "player-card";
    el.innerHTML = `<div class="player-left">
                      <div class="player-name">${p.name} ${state.current_player === p.id ? "←" : ""}</div>
                      <div class="player-resources">VP: ${p.vp} • Resources: wood:${p.resources.wood} brick:${p.resources.brick} wheat:${p.resources.wheat} sheep:${p.resources.sheep} ore:${p.resources.ore}</div>
                    </div>
                    <div class="player-right">
                      <div style="font-size:12px;color:#666">id:${p.id}</div>
                    </div>`;
    playersDiv.appendChild(el);
  });
  turnIndicator.textContent = `Turn: ${state.turn} | Current: ${state.players[state.current_player].name}`;
}

// Fetch state and update UI
async function fetchStateAndRender(){
  try {
    const res = await fetch("/api/state");
    const state = await res.json();
    renderTiles(state.tiles);
    renderPlayers(state);
  } catch(err){
    addLog("Failed to fetch state: " + err.message);
  }
}

// Start new game
async function newGame(){
  try {
    const res = await fetch("/api/new_game", {method:"POST"});
    const data = await res.json();
    addLog("New game started: " + data.state.game_id);
    renderTiles(data.state.tiles);
    renderPlayers(data.state);
    animateDice(null);
  } catch(err){
    addLog("New game failed: " + err.message);
  }
}

// Roll dice with simple animation
function animateDice(result){
  // simple CSS text rotation & temporary animation
  diceDisplay.textContent = "🎲 Rolling...";
  diceDisplay.style.transform = "rotate(-10deg) scale(1.04)";
  setTimeout(()=>{
    if(result){
      diceDisplay.textContent = `🎲 ${result.d1} + ${result.d2} = ${result.total}`;
    } else {
      diceDisplay.textContent = "🎲";
    }
    diceDisplay.style.transform = "";
  }, 700);
}

async function rollDice(){
  try {
    animateDice(null);
    const res = await fetch("/api/roll", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({})});
    const data = await res.json();
    const [d1,d2] = data.dice;
    animateDice({d1,d2,total:data.total});
    addLog(`Rolled ${d1}+${d2} = ${data.total}`);
    // show distribution if any
    if(data.distribution && data.distribution.length){
      data.distribution.forEach(dist=>{
        addLog(`Player ${dist.player} gained ${dist.resource} (node ${dist.node})`);
      });
    }
    // update the UI with new state from backend
    renderTiles(data.state.tiles);
    renderPlayers(data.state);
  } catch(err){
    addLog("Roll failed: " + err.message);
  }
}

// Attach event listeners
document.getElementById("newGameBtn").addEventListener("click", newGame);
document.getElementById("rollBtn").addEventListener("click", rollDice);

// initial load
fetchStateAndRender();
addLog("UI ready. Click New Game to start.");
