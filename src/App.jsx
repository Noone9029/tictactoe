import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useOnlineGame } from './online/useOnlineGame.js';

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

const DIFFICULTY_LABELS = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard'
};

function calculateWinner(board) {
  for (const [a, b, c] of WINNING_COMBINATIONS) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a], line: [a, b, c] };
    }
  }

  return null;
}

function getEmptyIndices(board) {
  return board
    .map((cell, index) => (cell === null ? index : null))
    .filter((index) => index !== null);
}

function pickRandomMove(board) {
  const emptyIndices = getEmptyIndices(board);
  if (emptyIndices.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * emptyIndices.length);
  return emptyIndices[randomIndex];
}

function findCriticalMove(board, player) {
  for (const [a, b, c] of WINNING_COMBINATIONS) {
    const line = [board[a], board[b], board[c]];
    const playerCount = line.filter((cell) => cell === player).length;
    const emptyCount = line.filter((cell) => cell === null).length;

    if (playerCount === 2 && emptyCount === 1) {
      if (board[a] === null) return a;
      if (board[b] === null) return b;
      if (board[c] === null) return c;
    }
  }

  return null;
}

function pickMediumMove(board) {
  const winMove = findCriticalMove(board, 'O');
  if (winMove !== null) {
    return winMove;
  }

  const blockMove = findCriticalMove(board, 'X');
  if (blockMove !== null) {
    return blockMove;
  }

  if (board[4] === null) {
    return 4;
  }

  const corners = [0, 2, 6, 8].filter((index) => board[index] === null);
  if (corners.length > 0) {
    return corners[Math.floor(Math.random() * corners.length)];
  }

  return pickRandomMove(board);
}

function minimax(board, isMaximizing) {
  const winner = calculateWinner(board);
  if (winner?.player === 'O') return 1;
  if (winner?.player === 'X') return -1;

  const emptyIndices = getEmptyIndices(board);
  if (emptyIndices.length === 0) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;

    for (const index of emptyIndices) {
      board[index] = 'O';
      const score = minimax(board, false);
      board[index] = null;
      bestScore = Math.max(bestScore, score);
    }

    return bestScore;
  }

  let bestScore = Infinity;

  for (const index of emptyIndices) {
    board[index] = 'X';
    const score = minimax(board, true);
    board[index] = null;
    bestScore = Math.min(bestScore, score);
  }

  return bestScore;
}

function pickHardMove(board) {
  const emptyIndices = getEmptyIndices(board);
  if (emptyIndices.length === 0) {
    return null;
  }

  let bestScore = -Infinity;
  let bestMove = emptyIndices[0];

  for (const index of emptyIndices) {
    const boardCopy = [...board];
    boardCopy[index] = 'O';
    const score = minimax(boardCopy, false);

    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }

  return bestMove;
}

function pickComputerMove(board, difficulty) {
  if (difficulty === 'easy') {
    return pickRandomMove(board);
  }

  if (difficulty === 'medium') {
    return pickMediumMove(board);
  }

  return pickHardMove(board);
}

function Square({ value, onClick, highlighted, disabled }) {
  return (
    <button
      className={`square ${highlighted ? 'highlighted' : ''}`}
      onClick={onClick}
      disabled={Boolean(value) || disabled}
      type="button"
      aria-label={value ? `Square ${value}` : 'Empty square'}
    >
      {value}
    </button>
  );
}

function SceneArt() {
  return (
    <section className="scene-art" aria-hidden="true">
      <div className="ring ring-a" />
      <div className="ring ring-b" />
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="mini-board">
        <span>X</span>
        <span>O</span>
        <span />
        <span />
        <span>X</span>
        <span>O</span>
        <span />
        <span />
        <span>X</span>
      </div>
    </section>
  );
}

function HomeScreen({ onChooseMode }) {
  return (
    <main className="game home">
      <SceneArt />
      <h1>Tic Tac Toe</h1>
      <p className="subtitle">Choose how you want to play</p>
      <div className="mode-list">
        <button className="mode-button" type="button" onClick={() => onChooseMode('inPerson')}>
          Play in person
        </button>
        <button className="mode-button" type="button" onClick={() => onChooseMode('computer')}>
          Play against a computer
        </button>
        <button className="mode-button" type="button" onClick={() => onChooseMode('online')}>
          Play online
        </button>
      </div>
    </main>
  );
}

function ComputerDifficultyScreen({ onChooseDifficulty, onBack }) {
  return (
    <main className="game home">
      <SceneArt />
      <h1>Play vs Computer</h1>
      <p className="subtitle">Select a difficulty</p>
      <div className="mode-list">
        <button className="mode-button" type="button" onClick={() => onChooseDifficulty('easy')}>
          Easy
        </button>
        <button className="mode-button" type="button" onClick={() => onChooseDifficulty('medium')}>
          Medium
        </button>
        <button className="mode-button" type="button" onClick={() => onChooseDifficulty('hard')}>
          Hard
        </button>
      </div>
      <button className="back" type="button" onClick={onBack}>
        Back to home
      </button>
    </main>
  );
}

function OnlineEntryScreen({
  nickname,
  setNickname,
  joinCode,
  setJoinCode,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  error,
  onBack,
  connection
}) {
  return (
    <main className="game home">
      <SceneArt />
      <h1>Play Online</h1>
      <p className="subtitle">Create a private room or find a quick match</p>

      <div className="online-form">
        <input
          className="text-input"
          type="text"
          value={nickname}
          maxLength={20}
          onChange={(event) => setNickname(event.target.value)}
          placeholder="Your nickname"
        />

        <button className="mode-button" type="button" onClick={onCreateRoom} disabled={connection !== 'connected'}>
          Create room
        </button>

        <input
          className="text-input"
          type="text"
          value={joinCode}
          maxLength={6}
          onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
          placeholder="Room code"
        />

        <button className="mode-button" type="button" onClick={onJoinRoom} disabled={connection !== 'connected'}>
          Join room
        </button>

        <button className="mode-button alt" type="button" onClick={onQuickMatch} disabled={connection !== 'connected'}>
          Quick match
        </button>
      </div>

      {error ? <p className="online-error">{error}</p> : null}
      <p className="online-hint">Connection: {connection}</p>

      <button className="back" type="button" onClick={onBack}>
        Back to home
      </button>
    </main>
  );
}

function OnlineLobbyScreen({ roomCode, players, onBack, error, onCopy }) {
  return (
    <main className="game home">
      <SceneArt />
      <h1>Online Lobby</h1>
      <p className="subtitle">Share the code and wait for opponent</p>

      <div className="room-code-box">
        <span>{roomCode}</span>
      </div>

      <button className="mode-button" type="button" onClick={onCopy}>
        Copy room code
      </button>

      <div className="players-box">
        {players.map((player) => (
          <p key={player.symbol}>{player.symbol}: {player.nickname}</p>
        ))}
      </div>

      {error ? <p className="online-error">{error}</p> : <p className="online-hint">Waiting for second player...</p>}

      <button className="back" type="button" onClick={onBack}>
        Leave room
      </button>
    </main>
  );
}

function App() {
  const [mode, setMode] = useState(null);
  const [computerDifficulty, setComputerDifficulty] = useState(null);
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const online = useOnlineGame();

  const winner = useMemo(() => calculateWinner(board), [board]);
  const isDraw = !winner && board.every((cell) => cell !== null);

  const onlineWinner = useMemo(() => calculateWinner(online.state.board), [online.state.board]);
  const isOnlineMyTurn = online.state.role && online.state.turn === online.state.role;

  useEffect(() => {
    const isComputerTurn = mode === 'computer' && computerDifficulty && !isXNext;

    if (!isComputerTurn || winner || isDraw) {
      return;
    }

    const timeoutId = setTimeout(() => {
      const move = pickComputerMove(board, computerDifficulty);
      if (move === null) {
        return;
      }

      setBoard((currentBoard) => {
        if (currentBoard[move] || calculateWinner(currentBoard)) {
          return currentBoard;
        }

        const updatedBoard = [...currentBoard];
        updatedBoard[move] = 'O';
        return updatedBoard;
      });
      setIsXNext(true);
    }, 360);

    return () => clearTimeout(timeoutId);
  }, [board, computerDifficulty, isDraw, isXNext, mode, winner]);

  useEffect(() => {
    if (mode === 'online') {
      online.connect();
    }
  }, [mode, online.connect]);

  function handleSquareClick(index) {
    if (winner || board[index]) {
      return;
    }

    if (mode === 'computer' && !isXNext) {
      return;
    }

    const updatedBoard = [...board];
    updatedBoard[index] = isXNext ? 'X' : 'O';

    setBoard(updatedBoard);
    setIsXNext((prev) => !prev);
  }

  function restartGame() {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
  }

  function goHome() {
    if (mode === 'online') {
      online.leaveRoom();
      online.disconnect();
    }

    setMode(null);
    setComputerDifficulty(null);
    restartGame();
  }

  function chooseMode(nextMode) {
    if (mode === 'online') {
      online.leaveRoom();
      online.disconnect();
    }

    setMode(nextMode);
    setComputerDifficulty(null);
    restartGame();
  }

  function chooseComputerDifficulty(difficulty) {
    setComputerDifficulty(difficulty);
    restartGame();
  }

  function validateNickname() {
    if (!nickname.trim()) {
      online.setError('Please enter your nickname first.');
      return false;
    }

    return true;
  }

  function handleCreateRoom() {
    if (!validateNickname()) return;
    online.clearError();
    online.createRoom(nickname.trim());
  }

  function handleJoinRoom() {
    if (!validateNickname()) return;

    const normalizedCode = joinCode.trim().toUpperCase();
    if (normalizedCode.length !== 6) {
      online.setError('Room code must be 6 characters.');
      return;
    }

    online.clearError();
    online.joinRoom(nickname.trim(), normalizedCode);
  }

  function handleQuickMatch() {
    if (!validateNickname()) return;
    online.clearError();
    online.quickMatch(nickname.trim());
  }

  async function copyRoomCode() {
    if (!online.state.roomCode) return;

    try {
      await navigator.clipboard.writeText(online.state.roomCode);
      online.setError('Room code copied.');
    } catch {
      online.setError('Could not copy room code.');
    }
  }

  function leaveOnlineRoom() {
    online.leaveRoom();
    setJoinCode('');
  }

  const status = winner
    ? `Winner: ${winner.player}`
    : isDraw
      ? 'Draw game'
      : mode === 'computer'
        ? isXNext
          ? 'Your turn: X'
          : `Computer (${DIFFICULTY_LABELS[computerDifficulty]}) is thinking...`
        : `Next player: ${isXNext ? 'X' : 'O'}`;

  const onlineStatus = onlineWinner
    ? `Winner: ${onlineWinner.player}`
    : online.state.isDraw
      ? 'Draw game'
      : isOnlineMyTurn
        ? `Your turn (${online.state.role})`
        : `Opponent's turn (${online.state.turn})`;

  if (!mode) {
    return <HomeScreen onChooseMode={chooseMode} />;
  }

  if (mode === 'computer' && !computerDifficulty) {
    return <ComputerDifficultyScreen onChooseDifficulty={chooseComputerDifficulty} onBack={goHome} />;
  }

  if (mode === 'online') {
    if (!online.state.roomCode) {
      return (
        <OnlineEntryScreen
          nickname={nickname}
          setNickname={setNickname}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickMatch={handleQuickMatch}
          error={online.state.error}
          onBack={goHome}
          connection={online.state.connection}
        />
      );
    }

    if (online.state.players.length < 2 || online.state.status === 'waiting') {
      return (
        <OnlineLobbyScreen
          roomCode={online.state.roomCode}
          players={online.state.players}
          error={online.state.error}
          onBack={leaveOnlineRoom}
          onCopy={copyRoomCode}
        />
      );
    }

    return (
      <main className="game">
        <SceneArt />
        <h1>Tic Tac Toe</h1>
        <p className="subtitle">Online room: {online.state.roomCode}</p>
        <p className="status">{onlineStatus}</p>

        <section className="board" aria-label="Online Tic Tac Toe board">
          {online.state.board.map((value, index) => (
            <Square
              key={index}
              value={value}
              onClick={() => online.makeMove(index)}
              highlighted={onlineWinner?.line.includes(index)}
              disabled={!isOnlineMyTurn || Boolean(onlineWinner) || online.state.isDraw}
            />
          ))}
        </section>

        {online.state.error ? <p className="online-error">{online.state.error}</p> : null}

        <button className="restart" type="button" onClick={online.requestRestart}>
          Request restart
        </button>
        <button className="back" type="button" onClick={leaveOnlineRoom}>
          Leave room
        </button>
        <button className="back" type="button" onClick={goHome}>
          Back to home
        </button>
      </main>
    );
  }

  const subtitle =
    mode === 'computer'
      ? `Playing vs computer (${DIFFICULTY_LABELS[computerDifficulty]})`
      : 'Play in person';

  return (
    <main className="game">
      <SceneArt />
      <h1>Tic Tac Toe</h1>
      <p className="subtitle">{subtitle}</p>
      <p className="status">{status}</p>

      <section className="board" aria-label="Tic Tac Toe board">
        {board.map((value, index) => (
          <Square
            key={index}
            value={value}
            onClick={() => handleSquareClick(index)}
            highlighted={winner?.line.includes(index)}
          />
        ))}
      </section>

      <button className="restart" type="button" onClick={restartGame}>
        Restart Game
      </button>
      {mode === 'computer' ? (
        <button className="back" type="button" onClick={() => setComputerDifficulty(null)}>
          Change difficulty
        </button>
      ) : null}
      <button className="back" type="button" onClick={goHome}>
        Back to home
      </button>
    </main>
  );
}

export default App;
