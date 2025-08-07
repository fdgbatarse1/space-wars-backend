"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
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
const players = new Map();
const activeBullets = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [id, bullet] of activeBullets.entries()) {
        if (now - bullet.timestamp > 5000) {
            activeBullets.delete(id);
        }
    }
}, 5000);
io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);
    socket.emit("players_list", Array.from(players.values()));
    const newPlayer = {
        id: socket.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        shipModel: "Bob",
        lastUpdate: Date.now(),
    };
    players.set(socket.id, newPlayer);
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
            });
        }
    });
    socket.on("fire_bullet", (data) => {
        const bulletId = `${socket.id}_${Date.now()}`;
        const bullet = {
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
