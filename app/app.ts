import express from "express";
import http from "http";
import * as redis from "./redis";
import socketIo from "socket.io";
import Game from "./game";
import { IGame } from "./models";
import GameListNamespace from "./namespaces/gameList";

const app = express();
const server = new http.Server(app);
const io = socketIo(server);

server.listen(3000);

const gameListNamespace = new GameListNamespace(io);

io.of("/game").on("connection", socket => {
  console.log("connected to game");
  console.log("user connected", socket.id);
  socket.on("disconnect", () => {
    console.log("user disconnected");
    redis.leaveGame(socket.id);
    redis.getGameIdBySocketId(socket.id).then((gameId: string) => {
      socket.to(gameId).emit("playerLeft");
    });
  });

  socket.on(
    "createGame",
    (params: {
      user: { username: string; points: number };
      timeMode: number;
    }) => {
      redis
        .createGame(socket.id, params.user, params.timeMode)
        .then((initialGame: IGame) => {
          console.log(initialGame.gameId);
          socket.join(initialGame.gameId);
          socket.emit("gameCreated", initialGame);
        });
    }
  );

  socket.on(
    "joinGame",
    (params: {
      user: { username: string; points: number };
      gameId: string;
    }) => {
      redis
        .joinGame(socket.id, params.user, params.gameId)
        .then((game: IGame) => {
          console.log(params.gameId);
          socket.join(params.gameId);
          io.of("/game")
            .to(params.gameId)
            .emit("gameJoined", game);
        });
    }
  );

  socket.on("playerReady", async (params: { gameId: string }) => {
    const isPlayer1 = await redis.checkIsPlayer1(socket.id, params.gameId);
    socket.in(params.gameId).emit("playerReady");
    const bothReady = await redis.checkPlayersReady(params.gameId, isPlayer1);
    if (bothReady) {
      // start game
      redis.startGame(params.gameId).then(() => {
        console.log("gameStarted");
        io.of("game")
          .in(params.gameId)
          .emit("gameStarted");
        if (isPlayer1) {
          socket.emit("turn");
        } else {
          socket.in(params.gameId).emit("turn");
        }
      });
    }
  });

  socket.on("tick", async (params: { gameId: string }) => {
    const isPlayer1 = await redis.checkIsPlayer1(socket.id, params.gameId);
    const playerTime = await redis.tick(params.gameId, isPlayer1);
    console.log(playerTime, isPlayer1);
    io.of("/game")
      .to(params.gameId)
      .emit("timeUpdated", { playerTime, isPlayer1 });
    if (playerTime === 0) {
      redis.endGame(params.gameId).then(() => {
        io.of("/game")
          .in(params.gameId)
          .emit("gameEnded", { victory: { isPlayer1: !isPlayer1 } });
      });
    }
  });

  socket.on("offer", (params: { gameId: string; type: "redo" | "draw" }) => {
    socket.in(params.gameId).emit("offer", params.type);
  });

  socket.on(
    "offerAccepted",
    async (params: { gameId: string; type: "redo" | "draw" }) => {
      if (params.type === "redo") {
        try {
          const hasTurn = await redis.checkHasTurn(socket.id, params.gameId);
          if (!hasTurn) {
            throw new Error("Invalid redo. Offering Player still has turn.");
          }
          const moves = await redis.getMoves(params.gameId);
          if (moves.length === 0) {
            throw new Error("Invalid redo. No moves made yet.");
          }
          Promise.all([
            redis.undoRecentMove(params.gameId),
            redis.changeTurn(params.gameId)
          ]).then(async () => {
            const moves = await redis.getMoves(params.gameId);
            const boardPositions = Game.convertToPositions(moves);
            // emit updated board positions to players
            io.of("/game")
              .in(params.gameId)
              .emit("updateBoard", boardPositions);
            // emit next turn to opponent
            socket.in(params.gameId).emit("turn");
          });
        } catch (e) {
          console.log(e);
        }
      }
      if (params.type === "draw") {
        redis.endGame(params.gameId).then(() => {
          io.of("/game")
            .in(params.gameId)
            .emit("gameEnded", { draw: true });
        });
      }
    }
  );

  socket.on(
    "move",
    async (params: { gameId: string; position: { x: number; y: number } }) => {
      try {
        const game = await redis.getGameById(params.gameId);
        const isPlayer1 = await redis.checkIsPlayer1(socket.id, params.gameId);
        const moves = await redis.getMoves(params.gameId);
        const currentMove = {
          x: params.position.x,
          y: params.position.y,
          isPlayer1
        };
        console.log("currentMove", currentMove);
        if (!game) {
          // game does not exists
          throw new Error("Invalid move: Game does not exist");
        } else {
          // game haven't started or aleady terminated
          if (game.playing === "false") {
            throw new Error(
              "Invalid move: Game has not started or already terminated"
            );
          }
          // not players turn
          if (game.player1HasTurn !== `${isPlayer1}`) {
            throw new Error("Invalid move: Not Player's turn");
          }
          // field already occupied
          if (Game.checkFieldOccupied(moves, currentMove)) {
            throw new Error("Invalid move: Field already occupied");
          }
        }
        const boardPositions = Game.convertToPositions([
          ...moves,
          JSON.stringify(currentMove)
        ]);
        redis.makeMove(params.gameId, currentMove).then(() => {
          // emit updated board positions to players
          io.of("/game")
            .in(params.gameId)
            .emit("updateBoard", boardPositions);
          // check for victory
          if (Game.checkVictory(boardPositions)) {
            redis.endGame(params.gameId).then(() => {
              io.of("/game")
                .in(params.gameId)
                .emit("gameEnded", { victory: { isPlayer1 } });
            });
          } else {
            redis.changeTurn(params.gameId).then(() => {
              // emit next turn to opponent
              socket.in(params.gameId).emit("turn");
            });
          }
        });
      } catch (e) {
        console.log("Error", e);
      }
    }
  );
});
