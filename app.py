from flask import Flask, render_template, jsonify, request
import random, uuid, math

app = Flask(__name__)

RESOURCE_TYPES = ["wood", "brick", "wheat", "sheep", "ore", "desert"]

DEV_CARD_POOL = (
    ["knight"] * 14 +
    ["victory"] * 5 +
    ["road_building"] * 2 +
    ["year_of_plenty"] * 2 +
    ["monopoly"] * 2
)

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
        self.dev_hand = []
        self.pending_free_roads = 0

class Game:
    def __init__(self):
        self.id = str(uuid.uuid4())
        self.players = [Player(0,"Player 1"), Player(1,"Player 2")]
        self.current_player = 0
        self.tiles = []
        self.nodes = []
        self.node_adjacency = {}
        self.tile_to_nodes = {}
        self.node_to_tiles = {}
        self.dev_deck = []
        self.dev_discard = []
        self.robber_tile = None
        self.turn = 0
        self.initialize_board()
        self.initialize_dev_deck()

    def initialize_dev_deck(self):
        deck = DEV_CARD_POOL.copy()
        random.shuffle(deck)
        self.dev_deck = deck
        self.dev_discard = []

    def draw_dev_card(self):
        if not self.dev_deck:
            self.dev_deck = self.dev_discard.copy()
            random.shuffle(self.dev_deck)
            self.dev_discard = []
        if not self.dev_deck:
            return None
        return self.dev_deck.pop()

    def initialize_board(self):
        numbers = [5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11]
        resources = ["wood","brick","wheat","sheep","ore","wood","brick","wheat",
                     "sheep","wood","sheep","wheat","brick","ore","wood","sheep","brick","wheat"]
        resources.insert(9, "desert")
        numbers.insert(9, 7)
        self.tiles = []
        for r, n in zip(resources, numbers):
            self.tiles.append(Tile(r, n))

        TILE_ROWS = [[0,1,2],[3,4,5,6],[7,8,9,10,11],[12,13,14,15],[16,17,18]]
        HEX_SIZE = 50
        HEX_H = HEX_SIZE * 1.15
        HEX_W = HEX_SIZE

        node_positions = {}
        node_id_counter = 0
        tile_to_nodes = {}
        node_to_tiles = {}
        nodes_list = []

        center_x = 350
        center_y = 270
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
        "dev_deck_count": len(GAME.dev_deck),
        "dev_discard_count": len(GAME.dev_discard),
        "robber_tile": GAME.robber_tile,
        "players": [
            {
                "id": p.id,
                "name": p.name,
                "resources": p.resources,
                "settlements": p.settlements,
                "roads": p.roads,
                "vp": p.vp,
                "dev_hand": p.dev_hand,
                "pending_free_roads": p.pending_free_roads
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
    d1, d2 = random.randint(1,6), random.randint(1,6)
    total = d1 + d2
    GAME.turn += 1
    distribution = []
    if total == 7:
        GAME.robber_tile = None
        distribution.append({"event":"robber", "number":7})
    else:
        for tid, tile in enumerate(GAME.tiles):
            if tile.number == total and tile.resource != "desert":
                if tile.robbed:
                    continue
                for nid, adj_tiles in GAME.node_to_tiles.items():
                    if tid in adj_tiles:
                        for pl in GAME.players:
                            if nid in pl.settlements:
                                pl.resources[tile.resource] += 1
                                distribution.append({"player": pl.id, "resource": tile.resource, "node": nid})
    GAME.current_player = (GAME.current_player + 1) % len(GAME.players)
    return jsonify({"dice":[d1,d2], "total":total, "distribution":distribution, "state":get_state()})

@app.route("/api/move_robber", methods=["POST"])
def move_robber():
    payload = request.json
    if not payload:
        return jsonify({"error":"missing payload"}), 400

    try:
        pid = int(payload.get("player", -1))
        tid = int(payload.get("tile", -1))
    except Exception:
        return jsonify({"error":"invalid payload types"}), 400

    if pid < 0 or pid >= len(GAME.players):
        return jsonify({"error":"invalid player"}), 400
    if tid < 0 or tid >= len(GAME.tiles):
        return jsonify({"error":"invalid tile index"}), 400

    mover = GAME.players[pid]
    GAME.robber_tile = tid
    for i, t in enumerate(GAME.tiles):
        t.robbed = (i == tid)

    adjacent_nodes = GAME.tile_to_nodes.get(tid, [])
    victims = []
    for other in GAME.players:
        if other.id == mover.id: continue
        has_settlement = any(n in other.settlements for n in adjacent_nodes)
        if has_settlement:
            total_resources = sum(other.resources.values())
            victims.append({"id": other.id, "name": other.name, "resource_count": total_resources})

    # phase2: if victim_id present, steal
    if "victim_id" in payload and payload.get("victim_id") is not None:
        try:
            victim_id = int(payload.get("victim_id"))
        except Exception:
            return jsonify({"error":"invalid victim_id"}), 400
        victim_player = next((v for v in GAME.players if v.id == victim_id), None)
        if not victim_player:
            return jsonify({"error":"victim not found"}), 400
        if not any(n in victim_player.settlements for n in adjacent_nodes):
            return jsonify({"error":"victim not adjacent to tile"}), 400
        available = [r for r, cnt in victim_player.resources.items() if cnt > 0]
        if not available:
            return jsonify({"result":{"moved_to": tid, "victim": {"id": victim_player.id, "name": victim_player.name}, "stolen": None, "note": "victim had no resources"} , "state": get_state()})
        chosen = random.choice(available)
        victim_player.resources[chosen] -= 1
        mover.resources[chosen] += 1
        return jsonify({"result":{"moved_to": tid, "victim": {"id": victim_player.id, "name": victim_player.name}, "stolen": chosen}, "state": get_state()})

    return jsonify({"eligible_victims": victims, "state": get_state()})

@app.route("/api/build", methods=["POST"])
def build():
    payload = request.json
    if not payload:
        return jsonify({"error":"missing payload"}), 400
    pid = int(payload.get("player", -1))
    if pid < 0 or pid >= len(GAME.players):
        return jsonify({"error":"invalid player"}), 400
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
        if not edge:
            n1 = payload.get("from"); n2 = payload.get("to")
            edge = [int(n1), int(n2)]
        else:
            edge = [int(edge[0]), int(edge[1])]
        cost = {"wood":1,"brick":1}
        n1, n2 = edge
        if n2 not in GAME.node_adjacency.get(n1, set()):
            return jsonify({"error":"invalid road edge"}), 400
        if p.pending_free_roads > 0:
            p.pending_free_roads -= 1
            if edge not in p.roads and list(reversed(edge)) not in p.roads:
                p.roads.append(edge)
            return jsonify({"result":"ok","state":get_state()})
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

@app.route("/api/buy_dev", methods=["POST"])
def buy_dev():
    payload = request.json
    if not payload:
        return jsonify({"error":"missing payload"}), 400
    pid = int(payload.get("player", -1))
    if pid < 0 or pid >= len(GAME.players):
        return jsonify({"error":"invalid player"}), 400
    p = GAME.players[pid]
    cost = {"wheat":1,"sheep":1,"ore":1}
    if all(p.resources[r] >= cost[r] for r in cost):
        for r in cost:
            p.resources[r] -= cost[r]
        card = GAME.draw_dev_card()
        if not card:
            return jsonify({"error":"no dev cards left"}), 400
        p.dev_hand.append(card)
        if card == "victory":
            p.vp += 1
        return jsonify({"result":"ok", "card": card, "state": get_state()})
    else:
        return jsonify({"error":"not enough resources to buy dev card","have":p.resources}), 400

@app.route("/api/use_dev", methods=["POST"])
def use_dev():
    payload = request.json
    if not payload:
        return jsonify({"error":"missing payload"}), 400
    pid = int(payload.get("player", -1))
    card_index = int(payload.get("index", -1))
    if pid < 0 or pid >= len(GAME.players):
        return jsonify({"error":"invalid player"}), 400
    p = GAME.players[pid]
    if card_index < 0 or card_index >= len(p.dev_hand):
        return jsonify({"error":"invalid card index"}), 400
    card = p.dev_hand.pop(card_index)

    if card == "knight":
        # allow two-phase: set robber and return eligible victims (phase1)
        target_tile = payload.get("target_tile")
        if target_tile is None:
            return jsonify({"error":"knight requires target_tile (or flow via UI)"}), 400
        tid = int(target_tile)
        GAME.robber_tile = tid
        for i,t in enumerate(GAME.tiles):
            t.robbed = (i == tid)
        GAME.dev_discard.append(card)
        # compute eligible victims (same logic as move_robber)
        mover = p
        adjacent_nodes = GAME.tile_to_nodes.get(tid, [])
        victims = []
        for other in GAME.players:
            if other.id == mover.id: continue
            has_settlement = any(n in other.settlements for n in adjacent_nodes)
            if has_settlement:
                total_resources = sum(other.resources.values())
                victims.append({"id": other.id, "name": other.name, "resource_count": total_resources})
        return jsonify({"eligible_victims": victims, "state": get_state()})

    elif card == "monopoly":
        resource = payload.get("resource")
        if resource not in ["wood","brick","wheat","sheep","ore"]:
            return jsonify({"error":"invalid resource for monopoly"}), 400
        total_collected = 0
        for other in GAME.players:
            if other.id == p.id: continue
            amt = other.resources.get(resource,0)
            if amt > 0:
                total_collected += amt
                other.resources[resource] = 0
        p.resources[resource] += total_collected
        GAME.dev_discard.append(card)
        return jsonify({"result":"ok","collected":total_collected, "state": get_state()})
    elif card == "year_of_plenty":
        choices = payload.get("choices", [])
        if not isinstance(choices, list) or len(choices) != 2:
            return jsonify({"error":"year_of_plenty requires two chosen resources"}), 400
        for c in choices:
            if c not in ["wood","brick","wheat","sheep","ore"]:
                return jsonify({"error":"invalid resource in choices"}), 400
            p.resources[c] += 1
        GAME.dev_discard.append(card)
        return jsonify({"result":"ok","granted":choices, "state": get_state()})
    elif card == "road_building":
        p.pending_free_roads += 2
        GAME.dev_discard.append(card)
        return jsonify({"result":"ok","granted_free_roads":2, "state": get_state()})
    elif card == "victory":
        GAME.dev_discard.append(card)
        return jsonify({"result":"ok","effect":"victory_counted", "state": get_state()})
    else:
        return jsonify({"error":"unknown dev card type"}), 400

if __name__ == "__main__":
    app.run(debug=True)
