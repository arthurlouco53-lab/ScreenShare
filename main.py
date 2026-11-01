
from flask import Flask, render_template, request, jsonify
from threading import Lock
from datetime import datetime, timedelta
from uuid import uuid4


app = Flask(__name__)

rooms = {}
rooms_lock = Lock()

ROOM_EXPIRATION = timedelta(hours=1)


def cleanup_rooms():

    now = datetime.now()

    expired = [
        room_id
        for room_id, room in rooms.items()
        if now - room["created_at"] > ROOM_EXPIRATION
    ]

    for room_id in expired:
        del rooms[room_id]


@app.route("/")
def index():
    return render_template("index.html")


# Criar uma sala
@app.route("/api/rooms", methods=["POST"])
def create_room():

    with rooms_lock:

        cleanup_rooms()

        room_id = uuid4().hex[:12].upper()

        rooms[room_id] = {
            "created_at": datetime.now(),
            "offer": None,
            "answer": None
        }

    return jsonify({
        "success": True,
        "room_id": room_id
    })


# Enviar oferta do transmissor
@app.route("/api/rooms/<room_id>/offer", methods=["POST"])
def send_offer(room_id):

    data = request.get_json(silent=True) or {}
    sdp = data.get("sdp")

    if not isinstance(sdp, str) or not sdp:
        return jsonify({"error": "Oferta inválida."}), 400

    with rooms_lock:

        cleanup_rooms()

        room = rooms.get(room_id)

        if not room:
            return jsonify({"error": "Sala não encontrada."}), 404

        if room["offer"] is not None:
            return jsonify({"error": "Esta sala já possui uma oferta."}), 409

        room["offer"] = sdp

    return jsonify({"success": True})


# Buscar oferta do transmissor
@app.route("/api/rooms/<room_id>/offer", methods=["GET"])
def get_offer(room_id):

    with rooms_lock:

        cleanup_rooms()

        room = rooms.get(room_id)

        if not room:
            return jsonify({"error": "Sala não encontrada."}), 404

        if room["offer"] is None:
            return jsonify({"waiting": True}), 202

        return jsonify({
            "waiting": False,
            "sdp": room["offer"]
        })


# Enviar resposta do espectador
@app.route("/api/rooms/<room_id>/answer", methods=["POST"])
def send_answer(room_id):

    data = request.get_json(silent=True) or {}
    sdp = data.get("sdp")

    if not isinstance(sdp, str) or not sdp:
        return jsonify({"error": "Resposta inválida."}), 400

    with rooms_lock:

        cleanup_rooms()

        room = rooms.get(room_id)

        if not room:
            return jsonify({"error": "Sala não encontrada."}), 404

        if room["answer"] is not None:
            return jsonify({"error": "Esta sala já possui uma resposta."}), 409

        room["answer"] = sdp

    return jsonify({"success": True})


# Buscar resposta do espectador
@app.route("/api/rooms/<room_id>/answer", methods=["GET"])
def get_answer(room_id):

    with rooms_lock:

        cleanup_rooms()

        room = rooms.get(room_id)

        if not room:
            return jsonify({"error": "Sala não encontrada."}), 404

        if room["answer"] is None:
            return jsonify({"waiting": True}), 202

        return jsonify({
            "waiting": False,
            "sdp": room["answer"]
        })


if __name__ == "__main__":

    print("=" * 40)
    print("       ScreenShare iniciado!")
    print("=" * 40)
    print("Acesse: http://localhost:5000")
    print("=" * 40)

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False,
        threaded=True
    )
