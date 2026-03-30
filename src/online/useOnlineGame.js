import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
const SESSION_KEY = 'tto_session_token';

function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

function storeSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(SESSION_KEY, token);
    }
  } catch {
  }
}

const INITIAL_STATE = {
  connection: 'idle',
  status: 'idle',
  roomCode: '',
  role: '',
  nickname: '',
  players: [],
  board: Array(9).fill(null),
  turn: 'X',
  winner: null,
  isDraw: false,
  lastMove: null,
  error: ''
};

export function useOnlineGame() {
  const socketRef = useRef(null);
  const [state, setState] = useState(INITIAL_STATE);

  const setError = useCallback((message) => {
    setState((prev) => ({
      ...prev,
      error: message,
      status: message ? 'error' : prev.status
    }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: '' }));
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) {
      return;
    }

    setState((prev) => ({ ...prev, connection: 'connecting', status: 'connecting', error: '' }));

    const socket = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket'],
      auth: {
        sessionToken: getStoredSessionToken()
      }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setState((prev) => ({ ...prev, connection: 'connected', error: '' }));
    });

    socket.on('disconnect', () => {
      setState((prev) => ({ ...prev, connection: 'disconnected' }));
    });

    socket.on('online:session', ({ sessionToken }) => {
      storeSessionToken(sessionToken);
    });

    socket.on('online:room_created', ({ roomCode, playerSymbol }) => {
      setState((prev) => ({
        ...prev,
        roomCode,
        role: playerSymbol,
        status: 'waiting',
        error: ''
      }));
    });

    socket.on('online:match_ready', ({ roomCode, players, yourSymbol, board, currentTurn }) => {
      setState((prev) => ({
        ...prev,
        roomCode,
        role: yourSymbol,
        players,
        board,
        turn: currentTurn,
        status: players.length < 2 ? 'waiting' : 'matched',
        error: ''
      }));
    });

    socket.on('online:state_update', ({ board, currentTurn, winner, isDraw, lastMove }) => {
      setState((prev) => ({
        ...prev,
        board,
        turn: currentTurn,
        winner,
        isDraw,
        lastMove,
        status: winner || isDraw ? 'finished' : 'in_game',
        error: ''
      }));
    });

    socket.on('online:restart_applied', ({ board, currentTurn }) => {
      setState((prev) => ({
        ...prev,
        board,
        turn: currentTurn,
        winner: null,
        isDraw: false,
        lastMove: null,
        status: 'in_game',
        error: ''
      }));
    });

    socket.on('online:player_left', ({ reason }) => {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: reason === 'opponent_disconnected'
          ? 'Opponent disconnected. Waiting for reconnect...'
          : 'Opponent left the room.'
      }));
    });

    socket.on('online:error', ({ code, message }) => {
      setState((prev) => ({
        ...prev,
        status: code === 'WAITING_FOR_MATCH' ? 'waiting' : 'error',
        error: message || 'Unexpected online error.'
      }));
    });
  }, []);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.disconnect();
    socketRef.current = null;

    setState((prev) => ({
      ...prev,
      connection: 'idle',
      status: 'idle'
    }));
  }, []);

  const createRoom = useCallback((nickname) => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((prev) => ({ ...prev, nickname }));
    socket.emit('online:create_room', { nickname });
  }, []);

  const joinRoom = useCallback((nickname, roomCode) => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((prev) => ({ ...prev, nickname }));
    socket.emit('online:join_room', { nickname, roomCode });
  }, []);

  const quickMatch = useCallback((nickname) => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((prev) => ({ ...prev, nickname }));
    socket.emit('online:quick_match', { nickname });
  }, []);

  const makeMove = useCallback((index) => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((prev) => {
      socket.emit('online:make_move', { roomCode: prev.roomCode, index });
      return prev;
    });
  }, []);

  const requestRestart = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;

    setState((prev) => {
      socket.emit('online:restart_request', { roomCode: prev.roomCode });
      return prev;
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      const roomCode = state.roomCode;
      if (roomCode) {
        socket.emit('online:leave_room', { roomCode });
      }
    }

    setState((prev) => ({
      ...INITIAL_STATE,
      connection: prev.connection
    }));
  }, [state.roomCode]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    state,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    quickMatch,
    makeMove,
    requestRestart,
    leaveRoom,
    clearError,
    setError
  };
}
