import express from "express";
import http from "http";
import socketIo from "socket.io";
import GameListNamespace from "./namespaces/gameList";
import GameNamespace from "./namespaces/game";
import * as admin from "firebase-admin";

const firebaseAccountKey = require("../config/firebaseAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(firebaseAccountKey),
  databaseURL: "https://omok-8943b.firebaseio.com"
});

const app = express();
const server = new http.Server(app);
const io = socketIo(server);

server.listen(3000);

io.use((socket: socketIo.Socket, next: (err?: any) => void) => {
  if (socket.handshake.query && socket.handshake.query.token) {
    admin
      .auth()
      .verifyIdToken(socket.handshake.query.token)
      .then(() => next())
      .catch(() => next(new Error("Authentication error")));
  } else {
    next(new Error("Authentication error"));
  }
});

const gameListNamespace = new GameListNamespace(io);
const gameNamespace = new GameNamespace(io);
