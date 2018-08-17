import { IGame } from "../../interfaces";

export default class RedisGameList {
  client: any;
  sub: any;

  constructor(redisClient: any) {
    this.client = redisClient;
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
}
