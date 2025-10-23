from flask import Flask, render_template, jsonify, request
import random, uuid, math

app = Flask(__name__)

RESOURCE_TYPES = ["wood", "brick", "wheat", "sheep", "ore", "desert"]

class Tile:
    def __init__(self, resource, number):
        self.resource = resource
        self.number = number
        self.robbed = False

class Player:
    def __init__(self, pid, name):
        self.id = pid
        self.name = name
        self.resources = {"wood":0,"brick":0,"wheat":0,"sheep":0,"ore":0}
        self.settlements = []
        self.roads = []
        self.vp = 0

class Game:
    def __init__(self):
        self.id = str(uuid.uuid4())
        self.players = [Player(0,"Player 1"), Player(1,"Player 2")]
        self.current_player = 0
        self.tiles = []
        self.nodes = []
        self.node_adjacency = {}
        self.initialize_board()
        self.turn = 0
    
    def initialize_board(self):
        # Standard 19-tile Catan board
        numbers = [5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11]
        resources = ["wood","brick","wheat","sheep","ore","wood","brick","wheat",
                     "sheep","wood","sheep","wheat","brick","ore","wood","sheep","brick","wheat"]
        resources.insert(9, "desert")
        numbers.insert(9, 7)
        for r, n in zip(resources, numbers):
            self.tiles.append(Tile(r, n))

        # Catan hex layout (center tile: 0, then ring by ring)
        # Board constants
        TILE_ROWS = [[0,1,2],[3,4,5,6],[7,8,9,10,11],[12,13,14,15],[16,17,18]]
        # Hex grid sizes
        NODE_RADIUS = 280
        HEX_SIZE = 50
        HEX_H = HEX_SIZE * 1.15
        HEX_W = HEX_SIZE
        
        # Generate hex tiles, nodes, and node adjacency
        node_positions = {}
        node_id_counter = 0
        tile_to_nodes = {}
        node_to_tiles = {}
        node_edges = set()
        
        center_x = 350
        center_y = 270
        hexes = []
        nodes_list = []
        for r_idx, row in enumerate(TILE_ROWS):
            row_len = len(row)
            start_x = center_x - (row_len-1)*(HEX_W*0.87)/2
            y = center_y + (r_idx-2)*(HEX_H*0.68)
            for c_idx, t_idx in enumerate(row):
                x = start_x + c_idx*HEX_W*0.87
                tile_nodes = []
                for k in range(6):
                    angle = math.pi/6 + math.pi/3*k
                    nx = x + HEX_SIZE*math.cos(angle)
                    ny = y + HEX_SIZE*math.sin(angle)
                    key = (round(nx,2), round(ny,2))
                    if key not in node_positions:
                        node_positions[key] = node_id_counter
                        nodes_list.append({"id": node_id_counter, "x": nx, "y": ny})
                        node_id_counter += 1
                    nid = node_positions[key]
                    tile_nodes.append(nid)
                    node_to_tiles.setdefault(nid, []).append(t_idx)
                tile_to_nodes[t_idx] = tile_nodes
        self.nodes = nodes_list
        # Build edge adjacency
        self.node_adjacency = {n["id"]: set() for n in nodes_list}
        for tn in tile_to_nodes.values():
            for i in range(6):
                n1, n2 = tn[i], tn[(i+1)%6]
                self.node_adjacency[n1].add(n2)
                self.node_adjacency[n2].add(n1)

        self.tile_to_nodes = tile_to_nodes
        self.node_to_tiles = node_to_tiles

GAME = Game()

def get_state():
    return {
        "game_id": GAME.id,
        "current_player": GAME.current_player,
        "turn": GAME.turn,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "resources": p.resources,
                "settlements": p.settlements,
                "roads": p.roads,
                "vp": p.vp
            } for p in GAME.players
        ],
        "tiles": [
            {"resource": t.resource, "number": t.number, "robbed": t.robbed}
            for t in GAME.tiles
        ],
        "nodes": GAME.nodes,
        "node_adjacency": {k: list(v) for k, v in GAME.node_adjacency.items()}
    }

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/new_game", methods=["POST"])
def new_game():
    global GAME
    GAME = Game()
    return jsonify({"status":"ok", "state": get_state()})

@app.route("/api/state")
def state():
    return jsonify(get_state())

@app.route("/api/roll", methods=["POST"])
def roll():
    pidx = GAME.current_player
    d1, d2 = random.randint(1,6), random.randint(1,6)
    total = d1 + d2
    GAME.turn += 1
    distribution = []
    if total == 7:
        distribution.append({"event":"robber", "number":7})
    else:
        for tid, tile in enumerate(GAME.tiles):
            if tile.number == total and tile.resource != "desert":
                for nid, adj_tiles in GAME.node_to_tiles.items():
                    if tid in adj_tiles:
                        for pl in GAME.players:
                            if nid in pl.settlements:
                                pl.resources[tile.resource] += 1
                                distribution.append({"player": pl.id, "resource": tile.resource, "node": nid})
    GAME.current_player = (GAME.current_player + 1) % len(GAME.players)
    return jsonify({"dice":[d1,d2], "total":total, "distribution":distribution, "state":get_state()})

@app.route("/api/build", methods=["POST"])
def build():
    payload = request.json
    if not payload:
        return jsonify({"error":"missing payload"}), 400
    pid = int(payload.get("player", -1))
    p = GAME.players[pid]
    typ = payload.get("type")
    if typ == "settlement":
        node = int(payload.get("node"))
        cost = {"wood":1,"brick":1,"wheat":1,"sheep":1}
        if all(p.resources[r] >= cost[r] for r in cost):
            for r in cost:
                p.resources[r] -= cost[r]
            if node not in p.settlements:
                p.settlements.append(node)
            p.vp += 1
            return jsonify({"result":"ok","state":get_state()})
        else:
            return jsonify({"error":"not enough resources","have":p.resources}), 400
    elif typ == "road":
        edge = payload.get("edge")
        cost = {"wood":1,"brick":1}
        n1, n2 = edge
        if n2 not in GAME.node_adjacency.get(n1, set()):
            return jsonify({"error":"invalid road edge"}), 400
        if all(p.resources[r] >= cost[r] for r in cost):
            for r in cost:
                p.resources[r] -= cost[r]
            if edge not in p.roads and list(reversed(edge)) not in p.roads:
                p.roads.append(edge)
            return jsonify({"result":"ok","state":get_state()})
        else:
            return jsonify({"error":"not enough resources"}), 400
    else:
        return jsonify({"error":"unknown build type"}), 400

if __name__ == "__main__":
    app.run(debug=True)
