import { expect } from "chai";
import redis from "redis-mock";
import RedisGame from "./game.redis";
import Bluebird from "bluebird";
import { IRedisGame } from "../../interfaces";
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
const seededGameId = "gameId123";
const move = { x: 1, y: 1, isPlayer1: true };
const firebaseFunctions = {
  updateProfilePoints: (uid: string, points: number) => {}
};
const mockClient: any = redis.createClient();

describe("createGame()", () => {
  it("should create game", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);
    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);

    const expectedGame: IRedisGame = {
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
      gameId: "gameId123"
    };

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualSocketRef = await mockClient.hgetAsync(socketId1, "gameId");
    const actualOpenGames = await mockClient.smembersAsync("openGames");

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
  });
});

describe("joinGame()", () => {
  it("should join game", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualSocketRef = await mockClient.hgetAsync(socketId2, "gameId");
    const actualOpenGames = await mockClient.smembersAsync("openGames");

    const expectedGame: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1500",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Uid: "uid2",
      player2Name: "david",
      player2Points: "1400",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      player1Starts: "true",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualOpenGames).to.deep.equal([]);
  });
});

describe("handleLeaveGame()", () => {
  it("should delete game and all its meta data if last player leaves", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);
    mockClient.flushall();

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.handleLeaveGame(socketId1);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.hgetAsync(socketId1, "gameId");
    const actualGameMoves = await gameRedis.getMoves(seededGameId);
    const actualKeyLength = (await mockClient.keysAsync("*")).length;

    expect(actualGame).to.deep.equal(null);
    expect(actualOpenGames).to.deep.equal([]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
    expect(actualKeyLength).to.equal(1);
  });

  it("should set player2 as player1 if player1 leaves", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.handleLeaveGame(socketId1);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.hgetAsync(socketId1, "gameId");
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IRedisGame = {
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
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
  });

  it("should clear player2 if player2 leaves and player1 stays", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.handleLeaveGame(socketId2);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.getAsync(socketId2);
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IRedisGame = {
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
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([seededGameId]);
    expect(actualSocketRef).to.equal(null);
    expect(actualGameMoves).to.deep.equal([]);
  });

  it("should update points correctly if player leaves while playing", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);
    await gameRedis.startGame(seededGameId);
    await gameRedis.handleLeaveGame(socketId2);

    const actualGame = await mockClient.hgetallAsync(seededGameId);

    const expectedGame: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1550",
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
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
  });
});

describe("endGame()", () => {
  it("should clear game state and clear moves", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);
    await gameRedis.checkPlayersReady(seededGameId, true);
    await gameRedis.checkPlayersReady(seededGameId, false);
    await gameRedis.startGame(seededGameId);
    await gameRedis.tick(seededGameId, true);
    await gameRedis.makeMove(seededGameId, move);
    await gameRedis.endGame(seededGameId, true);

    const actualGame = await mockClient.hgetallAsync(seededGameId);
    const actualOpenGames = await mockClient.smembersAsync("openGames");
    const actualSocketRef = await mockClient.hgetAsync(socketId2, "gameId");
    const actualGameMoves = await gameRedis.getMoves(seededGameId);

    const expectedGame: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1550",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Uid: "uid2",
      player2Name: "david",
      player2Points: "1370",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "false",
      player1Starts: "false",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);
    expect(actualOpenGames).to.deep.equal([]);
    expect(actualSocketRef).to.equal(seededGameId);
    expect(actualGameMoves).to.deep.equal([]);
  });

  it("should switch first turn correctly", async () => {
    mockClient.flushall();
    const gameRedis = new RedisGame(mockClient, firebaseFunctions);

    await gameRedis.createGame(socketId1, uid1, user1, timeMode, seededGameId);
    await gameRedis.joinGame(socketId2, uid2, user2, seededGameId);
    await gameRedis.checkPlayersReady(seededGameId, true);
    await gameRedis.checkPlayersReady(seededGameId, false);
    await gameRedis.startGame(seededGameId);
    await gameRedis.endGame(seededGameId, true);

    const actualGame = await mockClient.hgetallAsync(seededGameId);

    const expectedGame: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1550",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Uid: "uid2",
      player2Name: "david",
      player2Points: "1370",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "false",
      player1Starts: "false",
      gameId: "gameId123"
    };

    expect(actualGame).to.deep.equal(expectedGame);

    await gameRedis.startGame(seededGameId);
    await gameRedis.endGame(seededGameId, true);

    const actualGame2 = await mockClient.hgetallAsync(seededGameId);

    const expectedGame2: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1600",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Uid: "uid2",
      player2Name: "david",
      player2Points: "1340",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "true",
      player1Starts: "true",
      gameId: "gameId123"
    };

    expect(actualGame2).to.deep.equal(expectedGame2);

    await gameRedis.startGame(seededGameId);
    await gameRedis.endGame(seededGameId, true);

    const actualGame3 = await mockClient.hgetallAsync(seededGameId);

    const expectedGame3: IRedisGame = {
      player1: "socketId1",
      player1Uid: "uid1",
      player1Name: "duc",
      player1Points: "1650",
      player1Ready: "false",
      player1Time: "300",
      player2: "socketId2",
      player2Uid: "uid2",
      player2Name: "david",
      player2Points: "1310",
      player2Ready: "false",
      player2Time: "300",
      timeMode: "5",
      playing: "false",
      player1HasTurn: "false",
      player1Starts: "false",
      gameId: "gameId123"
    };

    expect(actualGame3).to.deep.equal(expectedGame3);
  });
});
