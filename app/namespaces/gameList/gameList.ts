import socketIo from "socket.io";
import { IGame } from "../../interfaces";
import RedisGameList from "./gameList.redis";
import FirebaseFunctions from "../../lib/firebaseFunctions";

export default class GameListNamespace {
  redis: RedisGameList;

  constructor(
    io: socketIo.Server,
    redisClient: any,
    firebaseFunctions: FirebaseFunctions
  ) {
    this.redis = new RedisGameList(redisClient, firebaseFunctions);
    io.of("gameList").on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket: socketIo.Socket): void {
    // initially send back open games
    this.emitOpenGames(socket);

    // subscribe to game list changes
    const subscription = this.redis.subscribeGameList();
    subscription.on("message", (channel: string, message: string) => {
      this.handleSubscription(channel, message, socket);
    });

    // handle disconnect from namespace
    socket.on("disconnect", () => {
      this.disconnect(socket.id);
    });
  }

  handleSubscription(
    channel: string,
    message: any,
    socket: socketIo.Socket
  ): void {
    this.emitOpenGames(socket);
  }

  disconnect(socketId: string): void {
    this.redis.unsubscribeGameList();
    this.redis
      .deleteGuest(socketId)
      .then(() => {
        this.redis.deleteSocketRef(socketId);
      })
      .catch(e => {
        console.log(e);
        this.redis.deleteSocketRef(socketId);
      });
  }

  async emitOpenGames(socket: socketIo.Socket): Promise<void> {
    try {
      const openGames: IGame[] = await this.redis.getOpenGames();
      socket.emit("openGames", openGames);
    } catch (e) {
      console.log("emit open games failed: ", e);
    }
  }
}
