const http = require("http");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Multiplayer signaling server is running.");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  let roomCode = null;

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      // Create a new room
      if (data.type === "create") {
        const code = makeCode();

        rooms.set(code, {
          host: ws,
          guest: null
        });

        roomCode = code;

        ws.send(JSON.stringify({
          type: "created",
          code
        }));

        return;
      }

      // Join an existing room
      if (data.type === "join") {
        const code = String(data.code || "").trim();
        const room = rooms.get(code);

        if (!room) {
          ws.send(JSON.stringify({
            type: "error",
            message: "Game code not found."
          }));
          return;
        }

        if (room.guest) {
          ws.send(JSON.stringify({
            type: "error",
            message: "This game is already full."
          }));
          return;
        }

        room.guest = ws;
        roomCode = code;

        room.host.send(JSON.stringify({
          type: "player_joined"
        }));

        ws.send(JSON.stringify({
          type: "joined",
          code
        }));

        return;
      }

      // Relay WebRTC signaling messages
      if (data.type === "signal") {
        const room = rooms.get(roomCode);
        if (!room) return;

        const other =
          ws === room.host ? room.guest : room.host;

        if (other && other.readyState === WebSocket.OPEN) {
          other.send(JSON.stringify({
            type: "signal",
            data: data.data
          }));
        }

        return;
      }

    } catch (error) {
      console.error("Message error:", error);
    }
  });

  ws.on("close", () => {
    if (!roomCode) return;

    const room = rooms.get(roomCode);

    if (!room) return;

    const other =
      ws === room.host ? room.guest : room.host;

    if (other && other.readyState === WebSocket.OPEN) {
      other.send(JSON.stringify({
        type: "player_left"
      }));
    }

    rooms.delete(roomCode);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
