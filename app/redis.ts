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
const delAsync = promisify(client.del).bind(client);
const saddAsync = promisify(client.sadd).bind(client);
const sremAsync = promisify(client.srem).bind(client);
const smembersAsync = promisify(client.smembers).bind(client);

client.on("connect", () => {
  console.log("connected to redis");
});

export const createGame = async (sessionId: string, userId: string) => {
  const gameId = uuidv4();
  const initialGame = { player1: userId, player2: "" };
  return Promise.all([
    hmsetAsync(gameId, initialGame),
    hmsetAsync(sessionId, { userId, gameId }),
    saddAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game created");
    return initialGame;
  });
};

export const matchGame = (
  sessionId: string,
  userId: string,
  gameId: string
) => {
  return Promise.all([
    hsetAsync(gameId, { player2: userId }),
    hmsetAsync(sessionId, { userId, gameId }),
    sremAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game matched");
    return gameId;
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
    hsetAsync(leavingGame, { player2: "" });
    saddAsync("openGames", leavingGame).then(() => {
      pub.publish("gameListChange", "player2 left");
    });
  }
  delAsync(sessionId);
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
