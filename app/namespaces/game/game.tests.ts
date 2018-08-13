import { expect } from "chai";
import redis from "redis-mock";
import RedisGame from "./game.redis";
import Bluebird from "bluebird";
import { IGame } from "../../models";
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
const seededGameId = "gameId123";
const move = { x: 1, y: 1, isPlayer1: true };

describe("createGame()", () => {
  it("should create game", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);

    const expectedGame: IGame = {
      player1: "socketId1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "",
      player2Name: "",
      player2Points: "",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      gameId: "gameId123"
    };

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualSocketRef = await mockClient.getAsync(socketId1);
    const actualOpenGames = await mockClient.smembersAsync("openGames");

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
  });
});

describe("joinGame()", () => {
  it("should join game", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, user2, seededGameId);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualSocketRef = await mockClient.getAsync(socketId2);
    const actualOpenGames = await mockClient.smembersAsync("openGames");

    const expectedGame: IGame = {
      player1: "socketId1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Name: "david",
      player2Points: "1400",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualOpenGames).to.deep.equal([]);
  });
});

describe("leaveGame()", () => {
  it("should delete game and all its meta data if last player leaves", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.leaveGame(socketId1);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.getAsync(socketId1);
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    expect(actualGame).to.deep.equal(null);
    expect(actualOpenGames).to.deep.equal([]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
  });

  it("should set player2 as player1 if player1 leaves", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, user2, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.leaveGame(socketId1);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.getAsync(socketId1);
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IGame = {
      player1: "socketId2",
      player1Name: "david",
      player1Points: "1400",
      player1Ready: "false",
      player1Time: "300",
      player2: "",
      player2Name: "",
      player2Points: "",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
  });

  it("should clear player2 if player2 leaves and player1 stays", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, user2, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.leaveGame(socketId2);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.getAsync(socketId2);
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IGame = {
      player1: "socketId1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "",
      player2Name: "",
      player2Points: "",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
  });
});

describe("endGame()", () => {
  it("should clear game state and clear moves", async () => {
    const mockClient: any = redis.createClient();
    const gameRedis = new RedisGame(mockClient);

    await gameRedis.createGame(socketId1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, user2, seededGameId);
    await gameRedis.checkPlayersReady(seededGameId, true);
    await gameRedis.checkPlayersReady(seededGameId, false);
    await gameRedis.startGame(seededGameId);
    await gameRedis.tick(seededGameId, true);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.endGame(seededGameId);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.getAsync(socketId2);
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IGame = {
      player1: "socketId1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Name: "david",
      player2Points: "1400",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([]);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualGameMoves).to.deep.equal([]);
  });
});