from flask import Flask, render_template, jsonify, request
import random
import uuid

app = Flask(__name__)

# ----- Simplified game model -----
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
        self.node_to_tiles = {}
        self.nodes = []
        self.initialize_board()
        self.turn = 0

    def initialize_board(self):
        numbers = [5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11]
        resources = ["wood","brick","wheat","sheep","ore","wood","brick","wheat",
                     "sheep","wood","sheep","wheat","brick","ore","wood","sheep","brick","wheat"]
        resources.insert(9, "desert")
        numbers.insert(9, 7)
        for r, n in zip(resources, numbers):
            self.tiles.append(Tile(r, n))
        N_NODES = 54
        self.nodes = [{"id": i, "x": (i % 9) * 60, "y": (i // 9) * 50} for i in range(N_NODES)]
        random.seed(42)
        for nid in range(N_NODES):
            self.node_to_tiles[nid] = random.sample(range(len(self.tiles)), k=random.choice([1,2,3]))

GAME = Game()

# ----- Helpers -----
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
        "nodes": GAME.nodes
    }

# ----- Routes -----
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
    return jsonify({"dice":[d1,d2],"total":total, "distribution": distribution, "state": get_state()})

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
            p.settlements.append(node)
            p.vp += 1
            return jsonify({"result":"ok","state":get_state()})
        else:
            return jsonify({"error":"not enough resources","have":p.resources}), 400

    elif typ == "road":
        edge = payload.get("edge")
        cost = {"wood":1,"brick":1}
        if all(p.resources[r] >= cost[r] for r in cost):
            for r in cost:
                p.resources[r] -= cost[r]
            p.roads.append(edge)
            return jsonify({"result":"ok","state":get_state()})
        else:
            return jsonify({"error":"not enough resources"}), 400

    else:
        return jsonify({"error":"unknown build type"}), 400

if __name__ == "__main__":
    app.run(debug=True)
