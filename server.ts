import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      "https://*.vercel.app",
    ],
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

interface Player {
  id: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  shipModel: string;
  lastUpdate: number;
  health: number;
  maxHealth: number;
}

interface Bullet {
  id: string;
  playerId: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  timestamp: number;
}

const players = new Map<string, Player>();
const activeBullets = new Map<string, Bullet>();

function checkBulletPlayerCollision(bullet: Bullet, player: Player): boolean {
  const bulletSize = 0.2;
  const playerSize = 1.5;

  const dx = Math.abs(bullet.position.x - player.position.x);
  const dy = Math.abs(bullet.position.y - player.position.y);
  const dz = Math.abs(bullet.position.z - player.position.z);

  return (
    dx < bulletSize + playerSize &&
    dy < bulletSize + playerSize &&
    dz < bulletSize + playerSize
  );
}

setInterval(() => {
  const now = Date.now();

  for (const [bulletId, bullet] of activeBullets.entries()) {
    if (now - bullet.timestamp > 5000) {
      activeBullets.delete(bulletId);
      continue;
    }

    const deltaTime = 0.016;
    bullet.position.x += bullet.velocity.x * deltaTime;
    bullet.position.y += bullet.velocity.y * deltaTime;
    bullet.position.z += bullet.velocity.z * deltaTime;

    for (const [playerId, player] of players.entries()) {
      if (
        playerId !== bullet.playerId &&
        checkBulletPlayerCollision(bullet, player)
      ) {
        player.health -= 25;
        io.emit("player_hit", {
          playerId,
          health: player.health,
          maxHealth: player.maxHealth,
        });
        if (player.health <= 0) {
          io.emit("player_died", playerId);
          players.delete(playerId);
        }
        activeBullets.delete(bulletId);
        break;
      }
    }
  }
}, 16);

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.emit("players_list", Array.from(players.values()));

  const newPlayer: Player = {
    id: socket.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    shipModel: "Bob",
    lastUpdate: Date.now(),
    health: 100,
    maxHealth: 100,
  };

  players.set(socket.id, newPlayer);

  socket.broadcast.emit("player_joined", newPlayer);

  socket.on("update_position", (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.position = data.position;
      player.rotation = data.rotation;
      player.velocity = data.velocity;
      player.lastUpdate = Date.now();

      socket.broadcast.emit("player_moved", {
        id: socket.id,
        position: data.position,
        rotation: data.rotation,
        velocity: data.velocity,
        health: player.health,
        maxHealth: player.maxHealth,
      });
    }
  });

  socket.on("fire_bullet", (data) => {
    const bulletId = `${socket.id}_${Date.now()}`;
    const bullet: Bullet = {
      id: bulletId,
      playerId: socket.id,
      position: data.position,
      velocity: data.velocity,
      timestamp: Date.now(),
    };

    activeBullets.set(bulletId, bullet);

    io.emit("bullet_fired", bullet);
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);

    for (const [id, bullet] of activeBullets.entries()) {
      if (bullet.playerId === socket.id) {
        activeBullets.delete(id);
      }
    }

    socket.broadcast.emit("player_left", socket.id);
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "online",
    players: players.size,
    uptime: process.uptime(),
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🎮 WebSocket ready for connections`);
});
