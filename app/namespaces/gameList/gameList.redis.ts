import { IGame } from "../../interfaces";

export default class RedisGameList {
  client: any;
  sub: any;
  firebaseFunctions: any;

  constructor(redisClient: any, firebaseFunctions: any) {
    this.client = redisClient;
    this.firebaseFunctions = firebaseFunctions;
    // check if redisClient is a mock
    this.sub = this.client.duplicate ? this.client.duplicate() : redisClient;
  }

  subscribeGameList() {
    this.sub.subscribe("gameListChange");
    return this.sub;
  }

  unsubscribeGameList() {
    this.sub.unsubscribe("gameListChange");
  }

  async getOpenGames() {
    const gameIds: string[] = await this.client.smembersAsync("openGames");
    const games: IGame[] = await Promise.all(
      gameIds.map((gameId: string) =>
        this.client.hgetallAsync(gameId).then((game: IGame) => game)
      )
    );
    return games;
  }

  async deleteGuest(socketId: string): Promise<void> {
    const isGuest: boolean =
      (await this.client.hgetAsync(socketId, "isGuest")) === "true";
    if (!isGuest) {
      return;
    }
    const uid = await this.client.hgetAsync(socketId, "userId");
    return this.firebaseFunctions.deleteGuest(uid);
  }

  deleteSocketRef(socketId: string): void {
    return this.client.delAsync(socketId);
  }
}
