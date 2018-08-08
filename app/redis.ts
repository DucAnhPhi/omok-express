import redis from "redis";
import uuidv4 from "uuid/v4";
import { promisify } from "util";
import { Dictionary, IGame } from "./models";

const timeDict: Dictionary = {
  "5": "300",
  "10": "600",
  "15": "900"
};

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
  const initialGame: IGame = getDefaultGame({
    gameId,
    timeMode: String(timeMode),
    player1: socketId,
    player1Name: user.username,
    player1Points: String(user.points)
  });
  return Promise.all([
    updateGame(gameId, initialGame),
    addSocketRef(socketId, gameId),
    addToOpenGames(gameId)
  ]).then(() => {
    publishGameListChange("game created");
    return initialGame;
  });
};

const getDefaultGame = (options: {
  gameId: string;
  timeMode: string;
  player1?: string;
  player1Name?: string;
  player1Points?: string;
  player2?: string;
  player2Name?: string;
  player2Points?: string;
}): IGame => ({
  player1: options.player1 ? options.player1 : "",
  player1Name: options.player1Name ? options.player1Name : "",
  player1Points: options.player1Points ? options.player1Points : "",
  player1Ready: "false",
  player1Time: timeDict[options.timeMode],
  player2: options.player2 ? options.player2 : "",
  player2Name: options.player2Name ? options.player2Name : "",
  player2Points: options.player2Points ? options.player2Points : "",
  player2Ready: "false",
  player2Time: timeDict[options.timeMode],
  timeMode: options.timeMode,
  playing: "false",
  player1HasTurn: "true",
  gameId: options.gameId
});

export const joinGame = async (
  socketId: string,
  user: { username: string; points: number },
  gameId: string
): Promise<IGame> => {
  const game: IGame = await getGameById(gameId);
  game.player2 = socketId;
  game.player2Name = user.username;
  game.player2Points = `${user.points}`;
  console.log(game);
  return Promise.all([
    updateGame(gameId, game),
    addSocketRef(socketId, gameId),
    removeFromOpenGames(gameId)
  ]).then(() => {
    publishGameListChange("game matched");
    return game;
  });
};

export const leaveGame = async (socketId: string) => {
  const leavingGameId: string = await getGameIdBySocketId(socketId);
  const isPlayer1: boolean = await checkIsPlayer1(socketId, leavingGameId);
  const leavingGame: IGame = await getGameById(leavingGameId);
  if (isPlayer1 && leavingGame.player2 === "") {
    // if last player leaves, delete game
    removeFromOpenGames(leavingGameId).then(async () => {
      publishGameListChange("game deleted");
    });
    deleteGame(leavingGameId);
    deleteMoves(leavingGameId);
  } else {
    // set whoever is left as player1 and clear player2
    const updatedGameProps = {
      player1: isPlayer1 ? leavingGame.player2 : leavingGame.player1,
      player1Name: isPlayer1
        ? leavingGame.player2Name
        : leavingGame.player1Name,
      player1Points: isPlayer1
        ? leavingGame.player2Points
        : leavingGame.player1Points,
      player2: "",
      player2Name: "",
      player2Points: ""
    };
    const updatedGame = getDefaultGame({
      gameId: leavingGameId,
      timeMode: leavingGame.timeMode,
      ...updatedGameProps
    });
    Promise.all([
      updateGame(leavingGameId, updatedGame),
      deleteMoves(leavingGameId)
    ]).then(() => {
      addToOpenGames(leavingGameId).then(() => {
        publishGameListChange("player2 left");
      });
    });
  }
  deleteSocketRef(socketId);
};

const removeFromOpenGames = (gameId: string) => {
  return sremAsync("openGames", gameId);
};

const addToOpenGames = (gameId: string) => {
  return saddAsync("openGames", gameId);
};

const updateGame = (gameId: string, game: IGame) => {
  return hmsetAsync(gameId, game);
};

const deleteGame = (gameId: string) => {
  return delAsync(gameId);
};

const addSocketRef = (socketId: string, gameId: string) => {
  return setAsync(socketId, gameId);
};

const deleteSocketRef = (socketId: string) => {
  return delAsync(socketId);
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

export const subscribeGameList = () => {
  sub.subscribe("gameListChange");
  return sub;
};

export const unsubscribeGameList = () => {
  sub.unsubscribe("gameListChange");
};

const publishGameListChange = (message: string) => {
  pub.publish("gameListChange", message);
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

export const deleteMoves = (gameId: string) => {
  return delAsync(`${gameId}moves`);
};
