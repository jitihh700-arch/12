const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static('.'));

const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

io.on('connection', (socket) => {
    console.log('🟢 Client connecté:', socket.id);

    socket.on('createRoom', (playerName) => {
        let roomCode = generateRoomCode();
        while (rooms[roomCode]) roomCode = generateRoomCode();
        
        rooms[roomCode] = {
            players: {},
            scores: {},
            host: socket.id
        };
        
        rooms[roomCode].players[socket.id] = playerName || 'Joueur';
        rooms[roomCode].scores[socket.id] = 0;
        socket.join(roomCode);
        
        socket.emit('roomCreated', {
            roomCode: roomCode,
            players: rooms[roomCode].players,
            scores: rooms[roomCode].scores
        });
        
        io.to(roomCode).emit('playersUpdate', {
            players: rooms[roomCode].players,
            scores: rooms[roomCode].scores,
            host: rooms[roomCode].host
        });
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) {
            socket.emit('joinError', '❌ Salle introuvable');
            return;
        }
        
        rooms[code].players[socket.id] = playerName || 'Joueur';
        rooms[code].scores[socket.id] = 0;
        socket.join(code);
        
        io.to(code).emit('playersUpdate', {
            players: rooms[code].players,
            scores: rooms[code].scores,
            host: rooms[code].host
        });
        
        socket.emit('joinSuccess', {
            roomCode: code,
            players: rooms[code].players,
            scores: rooms[code].scores,
            isHost: socket.id === rooms[code].host
        });
    });

    socket.on('startGame', ({ roomCode, category }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code] || rooms[code].host !== socket.id) {
            socket.emit('gameError', '❌ Seul l\'hôte peut lancer');
            return;
        }
        
        Object.keys(rooms[code].scores).forEach(id => rooms[code].scores[id] = 0);
        io.to(code).emit('gameStarted', { category });
    });

    socket.on('scoreUpdate', ({ roomCode, score }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) return;
        rooms[code].scores[socket.id] = score;
        io.to(code).emit('playersUpdate', {
            players: rooms[code].players,
            scores: rooms[code].scores,
            host: rooms[code].host
        });
    });

    socket.on('gameEnd', ({ roomCode }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) return;
        io.to(code).emit('gameEnded', {});
    });

    socket.on('leaveRoom', ({ roomCode }) => {
        const code = roomCode.toUpperCase();
        if (!rooms[code]) return;
        
        delete rooms[code].players[socket.id];
        delete rooms[code].scores[socket.id];
        socket.leave(code);
        
        if (Object.keys(rooms[code].players).length === 0) {
            delete rooms[code];
            return;
        }
        
        if (rooms[code].host === socket.id) {
            rooms[code].host = Object.keys(rooms[code].players)[0];
        }
        
        io.to(code).emit('playersUpdate', {
            players: rooms[code].players,
            scores: rooms[code].scores,
            host: rooms[code].host
        });
    });

    socket.on('disconnect', () => {
        for (const [code, room] of Object.entries(rooms)) {
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                delete room.scores[socket.id];
                
                if (Object.keys(room.players).length === 0) {
                    delete rooms[code];
                } else {
                    if (room.host === socket.id) {
                        room.host = Object.keys(room.players)[0];
                    }
                    io.to(code).emit('playersUpdate', {
                        players: room.players,
                        scores: room.scores,
                        host: room.host
                    });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});
