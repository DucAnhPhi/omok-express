import express from "express";
import http from "http";
import socketIo from "socket.io";
import GameListNamespace from "./namespaces/gameList";
import GameNamespace from "./namespaces/game";

const app = express();
const server = new http.Server(app);
const io = socketIo(server);

server.listen(3000);

const gameListNamespace = new GameListNamespace(io);
const gameNamespace = new GameNamespace(io);
