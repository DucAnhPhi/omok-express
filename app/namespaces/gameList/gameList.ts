import socketIo from "socket.io";
import { IGame } from "../../models";
import RedisGameList from "./gameList.redis";

export default class GameListNamespace {
  redis: RedisGameList;

  constructor(io: socketIo.Server, redisClient: any) {
    this.redis = new RedisGameList(redisClient);
    io.of("gameList").on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket: socketIo.Socket) {
    console.log("connected to gameList");
    // initially send back open games
    this.emitOpenGames(socket);

    // subscribe to game list changes
    const subscription = this.redis.subscribeGameList();
    subscription.on("message", (channel: string, message: string) => {
      this.handleSubscription(channel, message, socket);
    });

    // handle disconnect from namespace
    socket.on("disconnect", this.disconnect.bind(this));
  }

  handleSubscription(channel: string, message: any, socket: socketIo.Socket) {
    console.log(message);
    this.emitOpenGames(socket);
  }

  disconnect() {
    console.log("disconnected from gameList");
    this.redis.unsubscribeGameList();
  }

  async emitOpenGames(socket: socketIo.Socket) {
    try {
      const openGames: IGame[] = await this.redis.getOpenGames();
      console.log("open games:", openGames);
      socket.emit("openGames", openGames);
    } catch (e) {
      console.log("emit open games failed: ", e);
    }
  }
}
