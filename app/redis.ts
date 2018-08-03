import redis from "redis";
import uuidv4 from "uuid/v4";
import { promisify } from "util";

export const client = redis.createClient();
export const pub = client.duplicate();
export const sub = client.duplicate();

// convert redis commands to promises
const hmsetAsync = promisify(client.hmset).bind(client);
const hsetAsync = promisify(client.hset).bind(client);
const hgetAsync = promisify(client.hget).bind(client);
const hgetAllAsync = promisify(client.hgetall).bind(client);
const delAsync = promisify(client.del).bind(client);
const saddAsync = promisify(client.sadd).bind(client);
const sremAsync = promisify(client.srem).bind(client);
const smembersAsync = promisify(client.smembers).bind(client);
const hincrbyAsync = promisify(client.hincrby).bind(client);

client.on("connect", () => {
  console.log("connected to redis");
});

export const createGame = async (
  sessionId: string,
  userId: string,
  user: { username: string; points: number },
  time: number
) => {
  const gameId = uuidv4();
  const initialGame = {
    player1: sessionId,
    player2: "",
    player1Name: user.username,
    player1Points: user.points,
    player1Ready: "",
    player2Ready: "",
    player1Time: time * 60,
    player2Time: time * 60,
    time,
    gameStarted: "",
    turn: sessionId,
    gameId
  };
  return Promise.all([
    hmsetAsync(gameId, initialGame),
    hmsetAsync(sessionId, { userId, gameId }),
    saddAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game created");
    return initialGame;
  });
};

export const joinGame = async (
  sessionId: string,
  userId: string,
  gameId: string
) => {
  const game = await getGame(gameId);
  game.player2 = sessionId;
  return Promise.all([
    hmsetAsync(gameId, game),
    hmsetAsync(sessionId, { userId, gameId }),
    sremAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game matched");
    return game;
  });
};

export const leaveGame = async (sessionId: string) => {
  const leavingGame = await hgetAsync(sessionId, "gameId");
  const leavingPlayer = await hgetAsync(sessionId, "userId");
  const player1 = await hgetAsync(leavingGame, "player1");
  if (player1 === leavingPlayer) {
    sremAsync("openGames", leavingGame).then(() => {
      pub.publish("gameListChange", "game deleted");
    });
    delAsync(leavingGame);
  } else {
    hsetAsync(leavingGame, "player2", "");
    saddAsync("openGames", leavingGame).then(() => {
      pub.publish("gameListChange", "player2 left");
    });
  }
  delAsync(sessionId);
};

export const checkPlayersReady = async (gameId: string, isPlayer1: boolean) => {
  const player1Ready = await hgetAsync(gameId, "player1Ready");
  const player2Ready = await hgetAsync(gameId, "player2Ready");
  if (isPlayer1) {
    if (player2Ready === "1") {
      return true;
    } else {
      hsetAsync(gameId, "player1Ready", "1");
    }
  } else {
    if (player1Ready === "1") {
      return true;
    } else {
      hsetAsync(gameId, "player2Ready", "1");
    }
  }
  return false;
};

export const getOpenGames = () => {
  return smembersAsync("openGames");
};

export const printKeys = () => {
  client.keys("*", (err, keys) => console.log(keys));
};

export const clearAll = () => {
  client.flushall();
};

export const subscribeGameList = () => {
  sub.subscribe("gameListChange");
  return sub;
};

export const unsubscribeGameList = () => {
  sub.unsubscribe("gameListChange");
};

export const getGame = (gameId: string) => {
  return hgetAllAsync(gameId);
};

export const startGame = (gameId: string) => {
  return hsetAsync(gameId, "gameStarted", "1");
};

export const checkIsPlayer1 = async (sessionId: string, gameId: string) => {
  const player1 = await hgetAsync(gameId, "player1");
  if (sessionId === player1) {
    return true;
  }
  return false;
};

export const tick = async (gameId: string, isPlayer1: boolean) => {
  if (isPlayer1) {
    return hincrbyAsync(gameId, "player1Time", -1);
  } else {
    return hincrbyAsync(gameId, "player2Time", -1);
  }
};

export const getPlayer1 = (gameId: string) => {
  return hgetAsync(gameId, "player1");
};
