console.log("Catan Colonist-style UI loaded");

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

document.getElementById("buildSettlementBtn").addEventListener("click", ()=>{
  buildMode="settlement";
  addLog("Build mode: Settlement. Click a node to place.");
});
document.getElementById("buildRoadBtn").addEventListener("click", ()=>{
  buildMode="road";
  selectedNodesForRoad=[];
  addLog("Build mode: Road. Click two nodes in sequence.");
});

function addLog(text){
  const time = new Date().toLocaleTimeString();
  logDiv.textContent = `[${time}] ${text}\n` + logDiv.textContent;
}

// Hex rows layout
const hexRows = [[0,1,2],[3,4,5,6],[7,8,9,10,11],[12,13,14,15],[16,17,18]];

// Render tiles
function renderTiles(tiles){
  tilesLayer.innerHTML="";
  nodesLayer.innerHTML="";
  roadsLayer.innerHTML="";

  const centerX = board.clientWidth/2;
  const centerY = board.clientHeight/2;
  const tileW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tile-size')) || 96;
  const tileH = tileW*1.15;
  const hSpacing = tileW*0.75;
  const vSpacing = tileH*0.85;

  let tileIdx = 0;
  const numRows = hexRows.length;
  const startY = centerY - (numRows-1)/2*vSpacing;

  for(let r=0;r<numRows;r++){
    const cols = hexRows[r];
    const startX = centerX - (cols.length-1)/2*hSpacing;
    for(let c=0;c<cols.length;c++){
      if(tileIdx>=tiles.length) break;
      const tile = tiles[tileIdx];
      const x = startX + c*hSpacing - tileW/2;
      const y = startY + r*vSpacing - tileH/2;

      const tileEl = document.createElement("div");
      tileEl.className=`tile ${tile.resource}` + (tile.robbed?" robbed":"");
      tileEl.style.left=`${x}px`;
      tileEl.style.top=`${y}px`;
      tileEl.innerHTML=`<div class="res">${tile.resource}</div><div class="num">${tile.number}</div>`;
      tilesLayer.appendChild(tileEl);

      // Nodes
      const nodeCoords = getHexCorners(x,y,tileW,tileH);
      nodeCoords.forEach((coord,nidOffset)=>{
        const node = document.createElement("div");
        node.className="node";
        node.style.left=`${coord.x-6}px`;
        node.style.top=`${coord.y-6}px`;
        node.title=`Node ${tileIdx*6+nidOffset}`;
        node.addEventListener("click",()=>handleNodeClick(tileIdx*6+nidOffset));
        nodesLayer.appendChild(node);
      });

      tileIdx++;
    }
  }
}

// Hex corner calculation
function getHexCorners(x,y,w,h){
  const cx = x+w/2;
  const cy = y+h/2;
  const r = w/2;
  const hRatio = Math.sqrt(3)/2;
  return [
    {x:cx,y:cy-r*hRatio},
    {x:cx+r*0.87,y:cy-r*hRatio/2},
    {x:cx+r*0.87,y:cy+r*hRatio/2},
    {x:cx,y:cy+r*hRatio},
    {x:cx-r*0.87,y:cy+r*hRatio/2},
    {x:cx-r*0.87,y:cy-r*hRatio/2},
  ];
}

// Node click
async function handleNodeClick(nodeId){
  if(!buildMode) return;
  const stateRes = await fetch("/api/state");
  const state = await stateRes.json();

  if(buildMode==="settlement"){
    const payload={player:state.current_player,type:"settlement",node:nodeId};
    await sendBuild(payload);
  } else if(buildMode==="road"){
    selectedNodesForRoad.push(nodeId);
    if(selectedNodesForRoad.length===2){
      const payload={player:state.current_player,type:"road",edge:selectedNodesForRoad};
      await sendBuild(payload);
      selectedNodesForRoad=[];
    } else {
      addLog("Selected first node for road. Click another node.");
    }
  }
}

// Send build request
async function sendBuild(payload){
  try{
    const res = await fetch("/api/build",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data = await res.json();
    if(data.error) addLog(`Build failed: ${data.error}`);
    else {
      addLog(`Built ${payload.type} at ${payload.node||JSON.stringify(payload.edge)}`);
      renderTiles(data.state.tiles);
      renderPlayers(data.state);
    }
  }catch(err){ addLog("Build request failed: "+err.message) }
  buildMode=null;
}

// Render players
function renderPlayers(state){
  playersDiv.innerHTML="";
  state.players.forEach(p=>{
    const el=document.createElement("div");
    el.className="player-card";
    if(state.current_player===p.id) el.style.border="2px solid var(--accent)";
    el.innerHTML=`<div class="player-left">
                    <div class="player-name">${p.name}</div>
                    <div class="player-resources">VP:${p.vp} • wood:${p.resources.wood} brick:${p.resources.brick} wheat:${p.resources.wheat} sheep:${p.resources.sheep} ore:${p.resources.ore}</div>
                  </div>`;
    playersDiv.appendChild(el);

    // Render settlements
    p.settlements.forEach(nodeId=>{
      const nodeEl = document.createElement("div");
      nodeEl.className="settlement";
      const nodeDiv = document.querySelector(`.node[title="Node ${nodeId}"]`);
      if(nodeDiv){
        nodeEl.style.left=nodeDiv.style.left;
        nodeEl.style.top=nodeDiv.style.top;
        nodesLayer.appendChild(nodeEl);
      }
    });

    // Render roads
    p.roads.forEach(edge=>{
      const [n1,n2]=edge;
      const node1=document.querySelector(`.node[title="Node ${n1}"]`);
      const node2=document.querySelector(`.node[title="Node ${n2}"]`);
      if(node1 && node2){
        const road=document.createElement("div");
        road.className="road";
        const x1=parseFloat(node1.style.left)+6;
        const y1=parseFloat(node1.style.top)+6;
        const x2=parseFloat(node2.style.left)+6;
        const y2=parseFloat(node2.style.top)+6;
        const dx=x2-x1, dy=y2-y1;
        const length=Math.sqrt(dx*dx+dy*dy);
        road.style.width=length+"px";
        road.style.left=x1+"px";
        road.style.top=y1+"px";
        const angle=Math.atan2(dy,dx)*180/Math.PI;
        road.style.transform=`rotate(${angle}deg)`;
        roadsLayer.appendChild(road);
      }
    });
  });
}

// Fetch & render state
async function fetchStateAndRender(){
  try{
    const res=await fetch("/api/state");
    const state=await res.json();
    renderTiles(state.tiles);
    renderPlayers(state);
  }catch(err){ addLog("Failed to fetch state: "+err.message) }
}

// New game
async function newGame(){
  try{
    const res=await fetch("/api/new_game",{method:"POST"});
    const data=await res.json();
    addLog("New game started: "+data.state.game_id);
    renderTiles(data.state.tiles);
    renderPlayers(data.state);
    animateDice(null);
  }catch(err){ addLog("New game failed: "+err.message) }
}

// Dice
function animateDice(result){
  diceDisplay.textContent="🎲 Rolling...";
  diceDisplay.style.transform="rotate(-15deg) scale(1.05)";
  setTimeout(()=>{
    if(result) diceDisplay.textContent=`🎲 ${result.d1} + ${result.d2} = ${result.total}`;
    else diceDisplay.textContent="🎲";
    diceDisplay.style.transform="";
  },700);
}

// Roll dice
async function rollDice(){
  try{
    animateDice(null);
    const res=await fetch("/api/roll",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
    const data=await res.json();
    const [d1,d2]=data.dice;
    animateDice({d1,d2,total:data.total});
    addLog(`Rolled ${d1}+${d2} = ${data.total}`);
    if(data.distribution?.length) data.distribution.forEach(dist=>addLog(`Player ${dist.player} gained ${dist.resource} (node ${dist.node})`));
    renderTiles(data.state.tiles);
    renderPlayers(data.state);
  }catch(err){ addLog("Roll failed: "+err.message) }
}

// Attach buttons
document.getElementById("newGameBtn").addEventListener("click", newGame);
document.getElementById("rollBtn").addEventListener("click", rollDice);

// Initial render
fetchStateAndRender();
addLog("UI ready. Click New Game to start.");
