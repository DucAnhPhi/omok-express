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
          redis.getGame(gameId).then((game: any) => ({ ...game, gameId }))
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
  redis.clearAll();
  console.log("clean");
  console.log("user connected", socket.id);
  socket.on("disconnect", () => {
    console.log("user disconnected");
    redis.leaveGame(socket.id);
  });

  socket.on(
    "createGame",
    (params: {
      userId: string;
      user: { username: string; points: number };
      time: number;
    }) => {
      redis
        .createGame(socket.id, params.userId, params.user, params.time)
        .then(initialGame => {
          socket.emit("gameCreated", initialGame);
        });
    }
  );
});
