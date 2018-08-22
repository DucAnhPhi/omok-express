import express from "express";
import http from "http";
import socketIo from "socket.io";
import GameListNamespace from "./namespaces/gameList/gameList";
import GameNamespace from "./namespaces/game/game";
import * as admin from "firebase-admin";
import redis from "redis";
import Bluebird from "bluebird";
import FirebaseFunctions from "./lib/firebaseFunctions";
import nconf from 'nconf';

Bluebird.promisifyAll(redis);

const firebaseAccountKey = require("../config/firebaseAccountKey.json");

// Read in keys and secrets. Using nconf use can set secrets via
// environment variables, command-line arguments, or a keys.json file.
nconf.argv().env().file('./config/keys.json');

const firebaseApp = admin.initializeApp({
  credential: admin.credential.cert(firebaseAccountKey),
  databaseURL: "https://omok-8943b.firebaseio.com"
});

const firestore = admin.firestore(firebaseApp);
firestore.settings({ timestampsInSnapshots: true });
const firebaseAuth = admin.auth(firebaseApp);

const firebaseFunctions = new FirebaseFunctions(firestore, firebaseAuth);
const app = express();
const server = new http.Server(app);
const io = socketIo(server);
const redisClient: any = redis.createClient(
  nconf.get('redisPort') || '6379',
  nconf.get('redisHost') || '127.0.0.1',
  {
    'auth_pass': nconf.get('redisKey')
  }
).on('error', (err) => console.error('ERR:REDIS:', err));
const port = process.env.PORT || 3000;
server.listen(port);

// add middleware to check authentication
io.use((socket: socketIo.Socket, next: (err?: any) => void) => {
  if (socket.handshake.query && socket.handshake.query.token) {
    admin
      .auth()
      .verifyIdToken(socket.handshake.query.token)
      .then(decodedToken => {
        // store user data for later usage in namespaces
        Promise.all([
          redisClient.hmsetAsync(`/gameList#${socket.id}`, {
            isGuest: decodedToken.firebase.sign_in_provider === "anonymous",
            userId: decodedToken.uid
          }),
          redisClient.hsetAsync(
            `/game#${socket.id}`,
            "userId",
            decodedToken.uid
          )
        ])
          .then(() => next())
          .catch((e: any) => {
            console.log("Internal server error: ", e);
            next(new Error("Internal server error"));
          });
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

const gameListNamespace = new GameListNamespace(
  io,
  redisClient,
  firebaseFunctions
);
const gameNamespace = new GameNamespace(io, redisClient, firebaseFunctions);
