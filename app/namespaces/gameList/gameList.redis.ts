import { IGame } from "../../models";
import redis from "redis";
import Bluebird from "bluebird";
Bluebird.promisifyAll(redis);

export default class RedisGameList {
  client: any;
  sub: redis.RedisClient;

  constructor(mockClient?: any) {
    this.client = mockClient || redis.createClient();
    this.sub = mockClient || this.client.duplicate();
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
