import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

const PORT = Number(process.env.PORT || 3001);
const RECONNECT_GRACE_MS = 30_000;
const ROOM_CODE_LENGTH = 6;

const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

const rooms = new Map();
const quickMatchQueue = [];
const socketSessionMap = new Map();

function createEmptyBoard() {
  return Array(9).fill(null);
}

function normalizeNickname(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 20);
}

function normalizeRoomCode(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
}

function calculateWinner(board) {
  for (const [a, b, c] of WINNING_COMBINATIONS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function getPlayersSnapshot(room) {
  return ['X', 'O']
    .map((symbol) => {
      const player = room.players[symbol];
      if (!player) return null;
      return {
        symbol,
        nickname: player.nickname,
        connected: player.connected
      };
    })
    .filter(Boolean);
}

function getRoomStatePayload(room) {
  const winner = calculateWinner(room.board);
  const isDraw = !winner && room.board.every((cell) => cell !== null);

  room.winner = winner;
  room.isDraw = isDraw;

  if (winner || isDraw) {
    room.status = 'finished';
  }

  return {
    board: room.board,
    currentTurn: room.currentTurn,
    winner,
    isDraw,
    lastMove: room.lastMove
  };
}

function emitRoomState(io, room) {
  io.to(room.roomCode).emit('online:state_update', getRoomStatePayload(room));
}

function getSeatBySessionToken(room, sessionToken) {
  for (const symbol of ['X', 'O']) {
    const player = room.players[symbol];
    if (player && player.sessionToken === sessionToken) {
      return symbol;
    }
  }

  return null;
}

function findRoomBySessionToken(sessionToken) {
  for (const room of rooms.values()) {
    const seat = getSeatBySessionToken(room, sessionToken);
    if (seat) {
      return { room, seat };
    }
  }

  return null;
}

function ensureRoomWithCode() {
  for (let i = 0; i < 10_000; i += 1) {
    const code = Math.random().toString(36).slice(2, 10).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH);
    if (code.length === ROOM_CODE_LENGTH && !rooms.has(code)) {
      return code;
    }
  }

  return randomUUID().replace(/-/g, '').slice(0, ROOM_CODE_LENGTH).toUpperCase();
}

function clearPlayerDisconnectTimer(player) {
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = null;
  }
}

function removeFromQuickMatchQueueBySession(sessionToken) {
  const index = quickMatchQueue.findIndex((entry) => entry.sessionToken === sessionToken);
  if (index >= 0) {
    quickMatchQueue.splice(index, 1);
  }
}

function cleanupRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  for (const symbol of ['X', 'O']) {
    const player = room.players[symbol];
    if (!player) continue;
    clearPlayerDisconnectTimer(player);
    socketSessionMap.delete(player.socketId);
  }

  rooms.delete(roomCode);
}

function emitMatchReady(io, room) {
  for (const symbol of ['X', 'O']) {
    const player = room.players[symbol];
    if (!player?.connected || !player.socketId) continue;

    io.to(player.socketId).emit('online:match_ready', {
      roomCode: room.roomCode,
      players: getPlayersSnapshot(room),
      yourSymbol: symbol,
      board: room.board,
      currentTurn: room.currentTurn
    });
  }
}

function finalizeJoin(io, room) {
  room.status = 'in_game';
  room.currentTurn = 'X';
  room.lastMove = null;
  room.restartVotes.clear();
  emitMatchReady(io, room);
  emitRoomState(io, room);
}

function createRoomForPlayer(io, socket, nickname, source) {
  const roomCode = ensureRoomWithCode();
  const playerX = {
    nickname,
    sessionToken: socket.data.sessionToken,
    socketId: socket.id,
    connected: true,
    disconnectTimer: null
  };

  const room = {
    roomCode,
    board: createEmptyBoard(),
    currentTurn: 'X',
    status: 'waiting',
    winner: null,
    isDraw: false,
    lastMove: null,
    createdAt: Date.now(),
    source,
    players: {
      X: playerX,
      O: null
    },
    restartVotes: new Set()
  };

  rooms.set(roomCode, room);
  socket.join(roomCode);
  socketSessionMap.set(socket.id, socket.data.sessionToken);

  socket.emit('online:room_created', {
    roomCode,
    playerSymbol: 'X'
  });

  socket.emit('online:match_ready', {
    roomCode,
    players: getPlayersSnapshot(room),
    yourSymbol: 'X',
    board: room.board,
    currentTurn: room.currentTurn
  });

  return room;
}

function joinRoomAsSecondPlayer(io, socket, room, nickname) {
  room.players.O = {
    nickname,
    sessionToken: socket.data.sessionToken,
    socketId: socket.id,
    connected: true,
    disconnectTimer: null
  };

  socket.join(room.roomCode);
  socketSessionMap.set(socket.id, socket.data.sessionToken);
  finalizeJoin(io, room);
}

function reconnectToExistingRoom(io, socket) {
  const sessionToken = socket.data.sessionToken;
  const found = findRoomBySessionToken(sessionToken);
  if (!found) return;

  const { room, seat } = found;
  const player = room.players[seat];
  clearPlayerDisconnectTimer(player);

  player.connected = true;
  player.socketId = socket.id;
  socket.join(room.roomCode);
  socketSessionMap.set(socket.id, sessionToken);

  emitMatchReady(io, room);
  emitRoomState(io, room);
}

function validateMoveRequest(room, sessionToken, index) {
  if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'Room not found.' };
  if (room.status !== 'in_game') return { ok: false, code: 'GAME_NOT_ACTIVE', message: 'Game is not active.' };
  if (!Number.isInteger(index) || index < 0 || index > 8) {
    return { ok: false, code: 'INVALID_MOVE', message: 'Move index must be 0-8.' };
  }

  const seat = getSeatBySessionToken(room, sessionToken);
  if (!seat) return { ok: false, code: 'NOT_IN_ROOM', message: 'You are not in this room.' };
  if (room.currentTurn !== seat) return { ok: false, code: 'NOT_YOUR_TURN', message: 'It is not your turn.' };
  if (room.board[index] !== null) return { ok: false, code: 'CELL_OCCUPIED', message: 'Cell already occupied.' };

  return { ok: true, seat };
}

function handleDisconnect(io, socket) {
  const sessionToken = socketSessionMap.get(socket.id) || socket.data.sessionToken;
  socketSessionMap.delete(socket.id);
  removeFromQuickMatchQueueBySession(sessionToken);

  if (!sessionToken) return;

  for (const room of rooms.values()) {
    const symbol = getSeatBySessionToken(room, sessionToken);
    if (!symbol) continue;

    const player = room.players[symbol];
    if (!player) continue;

    player.connected = false;
    player.socketId = null;
    clearPlayerDisconnectTimer(player);

    const otherSymbol = symbol === 'X' ? 'O' : 'X';
    const opponent = room.players[otherSymbol];

    if (opponent?.connected && opponent.socketId) {
      io.to(opponent.socketId).emit('online:player_left', {
        reason: 'opponent_disconnected',
        graceSeconds: RECONNECT_GRACE_MS / 1000
      });
    }

    player.disconnectTimer = setTimeout(() => {
      const currentRoom = rooms.get(room.roomCode);
      if (!currentRoom) return;

      const currentPlayer = currentRoom.players[symbol];
      const currentOpponent = currentRoom.players[otherSymbol];
      if (!currentPlayer || currentPlayer.connected) return;

      if (currentOpponent?.connected && currentOpponent.socketId) {
        io.to(currentOpponent.socketId).emit('online:player_left', {
          reason: 'opponent_timeout'
        });
      }

      cleanupRoom(currentRoom.roomCode);
    }, RECONNECT_GRACE_MS);

    break;
  }
}

function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: {
      origin: '*'
    }
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, queue: quickMatchQueue.length });
  });

  io.on('connection', (socket) => {
    const incomingToken = typeof socket.handshake.auth?.sessionToken === 'string'
      ? socket.handshake.auth.sessionToken.trim()
      : '';

    socket.data.sessionToken = incomingToken || randomUUID();
    socket.emit('online:session', { sessionToken: socket.data.sessionToken });

    reconnectToExistingRoom(io, socket);

    socket.on('online:create_room', ({ nickname }) => {
      const normalizedNickname = normalizeNickname(nickname);
      if (!normalizedNickname) {
        socket.emit('online:error', { code: 'INVALID_NICKNAME', message: 'Nickname is required.' });
        return;
      }

      const existing = findRoomBySessionToken(socket.data.sessionToken);
      if (existing) {
        reconnectToExistingRoom(io, socket);
        return;
      }

      createRoomForPlayer(io, socket, normalizedNickname, 'code');
    });

    socket.on('online:join_room', ({ nickname, roomCode }) => {
      const normalizedNickname = normalizeNickname(nickname);
      const normalizedRoomCode = normalizeRoomCode(roomCode);

      if (!normalizedNickname) {
        socket.emit('online:error', { code: 'INVALID_NICKNAME', message: 'Nickname is required.' });
        return;
      }

      if (normalizedRoomCode.length !== ROOM_CODE_LENGTH) {
        socket.emit('online:error', { code: 'INVALID_ROOM_CODE', message: 'Room code must be 6 characters.' });
        return;
      }

      const existing = findRoomBySessionToken(socket.data.sessionToken);
      if (existing) {
        reconnectToExistingRoom(io, socket);
        return;
      }

      const room = rooms.get(normalizedRoomCode);
      if (!room) {
        socket.emit('online:error', { code: 'ROOM_NOT_FOUND', message: 'Room code not found.' });
        return;
      }

      if (room.players.O) {
        socket.emit('online:error', { code: 'ROOM_FULL', message: 'Room is already full.' });
        return;
      }

      joinRoomAsSecondPlayer(io, socket, room, normalizedNickname);
    });

    socket.on('online:quick_match', ({ nickname }) => {
      const normalizedNickname = normalizeNickname(nickname);
      if (!normalizedNickname) {
        socket.emit('online:error', { code: 'INVALID_NICKNAME', message: 'Nickname is required.' });
        return;
      }

      const existing = findRoomBySessionToken(socket.data.sessionToken);
      if (existing) {
        reconnectToExistingRoom(io, socket);
        return;
      }

      removeFromQuickMatchQueueBySession(socket.data.sessionToken);

      const waiting = quickMatchQueue.shift();

      if (!waiting || waiting.sessionToken === socket.data.sessionToken) {
        quickMatchQueue.push({
          sessionToken: socket.data.sessionToken,
          nickname: normalizedNickname,
          socketId: socket.id,
          createdAt: Date.now()
        });

        const room = createRoomForPlayer(io, socket, normalizedNickname, 'quick');
        socket.emit('online:error', {
          code: 'WAITING_FOR_MATCH',
          message: 'Waiting for another player...'
        });

        return;
      }

      const waitingSocket = io.sockets.sockets.get(waiting.socketId);
      if (!waitingSocket) {
        createRoomForPlayer(io, socket, normalizedNickname, 'quick');
        return;
      }

      let room = null;
      for (const candidate of rooms.values()) {
        const candidateSeat = getSeatBySessionToken(candidate, waiting.sessionToken);
        if (candidateSeat === 'X' && candidate.status === 'waiting') {
          room = candidate;
          break;
        }
      }

      if (!room) {
        room = createRoomForPlayer(io, waitingSocket, waiting.nickname, 'quick');
      }

      if (room.players.O) {
        socket.emit('online:error', { code: 'MATCH_CONFLICT', message: 'Could not join quick match. Try again.' });
        return;
      }

      joinRoomAsSecondPlayer(io, socket, room, normalizedNickname);
    });

    socket.on('online:make_move', ({ roomCode, index }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      const validation = validateMoveRequest(room, socket.data.sessionToken, index);

      if (!validation.ok) {
        socket.emit('online:error', { code: validation.code, message: validation.message });
        return;
      }

      room.board[index] = validation.seat;
      room.currentTurn = validation.seat === 'X' ? 'O' : 'X';
      room.lastMove = index;
      room.restartVotes.clear();

      emitRoomState(io, room);
    });

    socket.on('online:restart_request', ({ roomCode }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      if (!room) {
        socket.emit('online:error', { code: 'ROOM_NOT_FOUND', message: 'Room not found.' });
        return;
      }

      const seat = getSeatBySessionToken(room, socket.data.sessionToken);
      if (!seat) {
        socket.emit('online:error', { code: 'NOT_IN_ROOM', message: 'You are not in this room.' });
        return;
      }

      room.restartVotes.add(socket.data.sessionToken);

      const playerX = room.players.X;
      const playerO = room.players.O;
      if (!playerX || !playerO) {
        socket.emit('online:error', { code: 'WAITING_FOR_PLAYER', message: 'Waiting for second player.' });
        return;
      }

      const bothApproved = room.restartVotes.has(playerX.sessionToken) && room.restartVotes.has(playerO.sessionToken);

      if (!bothApproved) {
        socket.emit('online:error', { code: 'RESTART_WAITING', message: 'Waiting for opponent to approve restart.' });
        return;
      }

      room.board = createEmptyBoard();
      room.currentTurn = 'X';
      room.status = 'in_game';
      room.lastMove = null;
      room.restartVotes.clear();

      io.to(room.roomCode).emit('online:restart_applied', {
        board: room.board,
        currentTurn: room.currentTurn
      });

      emitRoomState(io, room);
    });

    socket.on('online:leave_room', ({ roomCode }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = rooms.get(normalizedRoomCode);
      if (!room) return;

      const seat = getSeatBySessionToken(room, socket.data.sessionToken);
      if (!seat) return;

      const otherSeat = seat === 'X' ? 'O' : 'X';
      const opponent = room.players[otherSeat];

      if (opponent?.connected && opponent.socketId) {
        io.to(opponent.socketId).emit('online:player_left', {
          reason: 'opponent_left'
        });
      }

      cleanupRoom(normalizedRoomCode);
    });

    socket.on('disconnect', () => {
      handleDisconnect(io, socket);
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Online server listening on http://localhost:${PORT}`);
  });
}

bootstrap();
