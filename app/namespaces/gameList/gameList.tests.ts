import { expect } from "chai";
import redis from "redis-mock";
import RedisGameList from "./gameList.redis";
import Bluebird from "bluebird";
import { IRedisGame } from "../../interfaces";
import RedisGame from "../game/game.redis";
Bluebird.promisifyAll(redis);

const user1 = {
  username: "duc",
  points: 1500
};
const user2 = {
  username: "david",
  points: 1400
};
const timeMode = 5;
const socketId1 = "socketId1";
const socketId2 = "socketId2";
const uid1 = "uid1";
const uid2 = "uid2";
const seededGameId1 = "seededGameId1";
const seededGameId2 = "seededGameId2";
const firebaseFunctions = {
  updateProfilePoints: (uid: string, points: number) => {}
};

describe("getOpenGames()", () => {
  it("should return open games", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);
    const gameListRedis = new RedisGameList(mockClient);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId1);
    await gameRedis.createGame(socketId2, uid2, user2, timeMode, seededGameId2);

    const actualOpenGames = await gameListRedis.getOpenGames();

    const expectedGame1: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "",
      player2Uid: "",
      player2Name: "",
      player2Points: "1500",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      player1Starts: "true",
      gameId: "seededGameId1"
    };

    const expectedGame2: IRedisGame = {
      player1: "socketId2",
      player1Uid: "uid2",
      player1Name: "david",
      player1Points: "1400",
      player1Ready: "false",
      player1Time: "300",
      player2: "",
      player2Uid: "",
      player2Name: "",
      player2Points: "1500",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      player1Starts: "true",
      gameId: "seededGameId2"
    };

    expect(actualOpenGames).to.deep.equal([expectedGame1, expectedGame2]);
  });
});
