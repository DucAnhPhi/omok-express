import express from "express";
import http from "http";
import * as redis from "./redis";
import socketIo from "socket.io";

const app = express();
const server = new http.Server(app);
const io = socketIo(server);

server.listen(3000);

io.of("/gameList").on("connection", socket => {
  const subscription = redis.subscribeGameList();
  subscription.on("message", async (channel, message) => {
    console.log(message);
    try {
      const gameIds = await redis.getOpenGames();
      const games = await Promise.all(
        gameIds.map((gameId: string) =>
          redis.getGameById(gameId).then((game: any) => ({ ...game, gameId }))
        )
      );
      console.log("here are the games");
      console.log(games);
      socket.emit("openGames", games);
    } catch (e) {
      console.log(e);
    }
  });
  console.log("connected to gameList");
  socket.on("disconnect", () => {
    redis.unsubscribeGameList();
    console.log("disconnect gameList");
  });
});

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
        .then(initialGame => {
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
      redis.joinGame(socket.id, params.user, params.gameId).then(game => {
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
    const bothReady = await redis.checkPlayersReady(params.gameId, isPlayer1);
    if (bothReady) {
      // start game
      redis.startGame(params.gameId).then(() => {
        console.log("gameStarted");
        io.of("game")
          .in(params.gameId)
          .emit("playing");
        if (isPlayer1) {
          socket.emit("move", "moved");
        } else {
          socket.in(params.gameId).emit("move", "moved");
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
  });

  socket.on("move", (params: { gameId: string }) => {
    console.log(params.gameId);
    socket.in(params.gameId).emit("move", "moved");
  });
});
