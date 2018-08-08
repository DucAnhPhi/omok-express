import redis from "redis";
import uuidv4 from "uuid/v4";
import { promisify } from "util";

export interface IGame {
  player1: string;
  player1Name: string;
  player1Points: string;
  player1Ready: "false" | "true";
  player1Time: string;
  player2: string;
  player2Name: string;
  player2Points: string;
  player2Ready: "false" | "true";
  player2Time: string;
  timeMode: string;
  playing: "false" | "true";
  player1HasTurn: "false" | "true";
  gameId: string;
}

export const client = redis.createClient();
export const pub = client.duplicate();
export const sub = client.duplicate();

// convert redis commands to promises
const hmsetAsync = promisify(client.hmset).bind(client);
const hsetAsync = promisify(client.hset).bind(client);
const setAsync = promisify(client.set).bind(client);
const getAsync = promisify(client.get).bind(client);
const hgetAsync = promisify(client.hget).bind(client);
const hgetAllAsync = promisify(client.hgetall).bind(client);
const delAsync = promisify(client.del).bind(client);
const saddAsync = promisify(client.sadd).bind(client);
const sremAsync = promisify(client.srem).bind(client);
const smembersAsync = promisify(client.smembers).bind(client);
const hincrbyAsync = promisify(client.hincrby).bind(client);
const lrangeAsync = promisify(client.lrange).bind(client);
const rpushAsync = promisify(client.rpush).bind(client);
const rpopAsync = promisify(client.rpop).bind(client);

client.on("connect", () => {
  console.log("connected to redis");
});

export const createGame = async (
  socketId: string,
  user: { username: string; points: number },
  timeMode: number
) => {
  const gameId = uuidv4();
  const initialGame: IGame = {
    player1: socketId,
    player1Name: user.username,
    player1Points: `${user.points}`,
    player1Ready: "false",
    player1Time: `${timeMode * 60}`,
    player2: "",
    player2Name: "",
    player2Points: "",
    player2Ready: "false",
    player2Time: `${timeMode * 60}`,
    timeMode: `${timeMode}`,
    playing: "false",
    player1HasTurn: "true",
    gameId
  };
  return Promise.all([
    hmsetAsync(gameId, initialGame),
    setAsync(socketId, gameId),
    saddAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game created");
    return initialGame;
  });
};

export const joinGame = async (
  socketId: string,
  user: { username: string; points: number },
  gameId: string
) => {
  const game = await getGameById(gameId);
  game.player2 = socketId;
  game.player2Name = user.username;
  game.player2Points = user.points;
  console.log(game);
  return Promise.all([
    hmsetAsync(gameId, game),
    setAsync(socketId, gameId),
    sremAsync("openGames", gameId)
  ]).then(() => {
    pub.publish("gameListChange", "game matched");
    return game;
  });
};

export const leaveGame = async (socketId: string) => {
  const leavingGameId = await getGameIdBySocketId(socketId);
  const isPlayer1 = await checkIsPlayer1(socketId, leavingGameId);
  const leavingGame = await getGameById(leavingGameId);
  if (isPlayer1) {
    if (leavingGame.player2) {
      // if there is player2, make player2 to player1
      const updatedGameProps = {
        player1: leavingGame.player2,
        player1Name: leavingGame.player2Name,
        player1Points: leavingGame.player2Points,
        player1Time: leavingGame.timeMode * 60,
        player1Ready: "false",
        player2: "",
        player2Name: "",
        player2Points: "",
        player2Ready: "false",
        player2Time: leavingGame.timeMode * 60,
        playing: "false",
        player1HasTurn: "true"
      };
      hmsetAsync(leavingGameId, updatedGameProps).then(() => {
        saddAsync("openGames", leavingGameId).then(() => {
          pub.publish("gameListChange", "player2 is now player1");
        });
      });
    } else {
      // if there is no other player delete game
      sremAsync("openGames", leavingGameId).then(() => {
        pub.publish("gameListChange", "game deleted");
      });
      delAsync(leavingGameId);
      delAsync(`${leavingGameId}moves`);
    }
  } else {
    const updatedGameProps = {
      player2: "",
      player2Name: "",
      player2Points: "",
      player2Ready: "false",
      player1Time: leavingGame.timeMode * 60,
      player2Time: leavingGame.timeMode * 60,
      playing: "false",
      player1HasTurn: "true"
    };
    hmsetAsync(leavingGameId, updatedGameProps).then(() => {
      saddAsync("openGames", leavingGameId).then(() => {
        pub.publish("gameListChange", "player2 left");
      });
    });
  }
  delAsync(socketId);
};

export const checkPlayersReady = async (gameId: string, isPlayer1: boolean) => {
  const player1Ready = await hgetAsync(gameId, "player1Ready");
  const player2Ready = await hgetAsync(gameId, "player2Ready");
  if (isPlayer1) {
    if (player2Ready === "true") {
      return true;
    } else {
      hsetAsync(gameId, "player1Ready", "true");
    }
  } else {
    if (player1Ready === "true") {
      return true;
    } else {
      hsetAsync(gameId, "player2Ready", "true");
    }
  }
  return false;
};

const getOpenGameIds = () => {
  return smembersAsync("openGames");
};

export const getOpenGames = async () => {
  const gameIds: string[] = await getOpenGameIds();
  const games: IGame[] = await Promise.all(
    gameIds.map((gameId: string) =>
      getGameById(gameId).then((game: IGame) => game)
    )
  );
  return games;
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

export const getGameById = (gameId: string) => {
  return hgetAllAsync(gameId);
};

export const getGameIdBySocketId = (socketId: string) => {
  return getAsync(socketId);
};

export const startGame = (gameId: string) => {
  return hsetAsync(gameId, "playing", true);
};

export const checkIsPlayer1 = async (socketId: string, gameId: string) => {
  const player1 = await hgetAsync(gameId, "player1");
  if (socketId === player1) {
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

export const getMoves = (gameId: string) => {
  return lrangeAsync(`${gameId}moves`, 0, -1);
};

export const changeTurn = (gameId: string, player1HasTurn: string) => {
  return hsetAsync(gameId, "player1HasTurn", player1HasTurn);
};

export const makeMove = (
  gameId: string,
  move: { x: number; y: number; isPlayer1: boolean }
) => {
  return rpushAsync(`${gameId}moves`, JSON.stringify(move));
};

export const undoRecentMove = (gameId: string) => {
  return rpopAsync(`${gameId}moves`);
};

export const endGame = (gameId: string) => {
  return hsetAsync(gameId, "playing", "false");
};
