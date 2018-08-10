import socketIo from "socket.io";
import * as redis from "../redis";
import { IGame } from "../models";

export default class GameListNamespace {
  constructor(io: socketIo.Server) {
    io.of("gameList").on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket: socketIo.Socket) {
    console.log("connected to gameList");
    // initially send back open games
    this.emitOpenGames(socket);

    // subscribe to game list changes
    const subscription = redis.subscribeGameList();
    subscription.on("message", (channel: string, message: string) => {
      this.handleSubscription(channel, message, socket);
    });

    // handle disconnect from namespace
    socket.on("disconnect", this.handleDisconnect);
  }

  handleSubscription(channel: string, message: any, socket: socketIo.Socket) {
    console.log(message);
    this.emitOpenGames(socket);
  }

  handleDisconnect() {
    console.log("disconnected from gameList");
    redis.unsubscribeGameList();
  }

  async emitOpenGames(socket: socketIo.Socket) {
    try {
      const openGames: IGame[] = await redis.getOpenGames();
      console.log("open games:", openGames);
      socket.emit("openGames", openGames);
    } catch (e) {
      console.log("Error: could get open games:", e);
    }
  }
}
