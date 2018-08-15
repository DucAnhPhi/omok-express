import express from "express";
import http from "http";
import socketIo from "socket.io";
import GameListNamespace from "./namespaces/gameList/gameList";
import GameNamespace from "./namespaces/game/game";
import * as admin from "firebase-admin";
import redis from "redis";
import Bluebird from "bluebird";
import FirebaseFunctions from "./lib/firebaseFunctions";

Bluebird.promisifyAll(redis);

const firebaseAccountKey = require("../config/firebaseAccountKey.json");

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(firebaseAccountKey),
  databaseURL: "https://omok-8943b.firebaseio.com"
});

const firestore = admin.firestore(firebaseApp);
firestore.settings({ timestampsInSnapshots: true });

const firebaseFunctions = new FirebaseFunctions(admin.firestore(firebaseApp));
const app = express();
const server = new http.Server(app);
const io = socketIo(server);
const redisClient: any = redis.createClient();

server.listen(3000);

// add middleware to check authentication
io.use((socket: socketIo.Socket, next: (err?: any) => void) => {
  if (socket.handshake.query && socket.handshake.query.token) {
    admin
      .auth()
      .verifyIdToken(socket.handshake.query.token)
      .then(decodedToken => {
        console.log(decodedToken.uid);
        redisClient.hsetAsync(`/game#${socket.id}`, "userId", decodedToken.uid);
        next();
      })
      .catch(() => {
        console.log("Authentication error");
        next(new Error("Authentication error"));
      });
  } else {
    console.log("Authentication error");
    next(new Error("Authentication error"));
  }
});

const gameListNamespace = new GameListNamespace(io, redisClient);
const gameNamespace = new GameNamespace(io, redisClient, firebaseFunctions);
