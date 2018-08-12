import redis from "redis";
import uuidv4 from "uuid/v4";
import Bluebird from "bluebird";
import { IGame, Dictionary } from "../../models";
Bluebird.promisifyAll(redis);

export default class RedisGame {
  client: any;
  pub: redis.RedisClient;

  constructor() {
    this.client = redis.createClient();
    this.pub = this.client.duplicate();
  }

  async createGame(
    socketId: string,
    user: { username: string; points: number },
    timeMode: number
  ) {
    const gameId = uuidv4();
    const initialGame: IGame = this.getDefaultGame({
      gameId,
      timeMode: String(timeMode),
      player1: socketId,
      player1Name: user.username,
      player1Points: String(user.points)
    });
    return Promise.all([
      this.updateGame(gameId, initialGame),
      this.addSocketRef(socketId, gameId),
      this.addToOpenGames(gameId)
    ]).then(() => {
      this.publishGameListChange("game created");
      return initialGame;
    });
  }

  async joinGame(
    socketId: string,
    user: { username: string; points: number },
    gameId: string
  ): Promise<IGame> {
    const game: IGame = await this.getGameById(gameId);
    game.player2 = socketId;
    game.player2Name = user.username;
    game.player2Points = `${user.points}`;
    console.log(game);
    return Promise.all([
      this.updateGame(gameId, game),
      this.addSocketRef(socketId, gameId),
      this.removeFromOpenGames(gameId)
    ]).then(() => {
      this.publishGameListChange("game matched");
      return game;
    });
  }

  async leaveGame(socketId: string) {
    const leavingGameId: string = await this.getGameIdBySocketId(socketId);
    const isPlayer1: boolean = await this.checkIsPlayer1(
      socketId,
      leavingGameId
    );
    const leavingGame: IGame = await this.getGameById(leavingGameId);
    if (isPlayer1 && leavingGame.player2 === "") {
      // if last player leaves, delete game
      this.removeFromOpenGames(leavingGameId).then(async () => {
        this.publishGameListChange("game deleted");
      });
      // delete game in redis
      this.client.delAsync(leavingGameId);
      this.deleteMoves(leavingGameId);
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
      const updatedGame = this.getDefaultGame({
        gameId: leavingGameId,
        timeMode: leavingGame.timeMode,
        ...updatedGameProps
      });
      Promise.all([
        this.updateGame(leavingGameId, updatedGame),
        this.deleteMoves(leavingGameId)
      ]).then(() => {
        this.addToOpenGames(leavingGameId).then(() => {
          this.publishGameListChange("player2 left");
        });
      });
    }
    // delete socket reference in redis
    this.client.delAsync(socketId);
  }

  async checkPlayersReady(gameId: string, isPlayer1: boolean) {
    const player1Ready = await this.client.hgetAsync(gameId, "player1Ready");
    const player2Ready = await this.client.hgetAsync(gameId, "player2Ready");
    if (isPlayer1) {
      if (player2Ready === "true") {
        return true;
      } else {
        this.client.hsetAsync(gameId, "player1Ready", "true");
      }
    } else {
      if (player1Ready === "true") {
        return true;
      } else {
        this.client.hsetAsync(gameId, "player2Ready", "true");
      }
    }
    return false;
  }

  async endGame(gameId: string) {
    const tempGame = await this.client.getGameById(gameId);
    const updatedGame = this.getDefaultGame({
      gameId,
      timeMode: tempGame.timeMode,
      player1: tempGame.player1,
      player1Name: tempGame.player1Name,
      player1Points: tempGame.player1Points,
      player2: tempGame.player2,
      player2Name: tempGame.player2Name,
      player2Points: tempGame.player2Points
    });
    return Promise.all([
      this.updateGame(gameId, updatedGame),
      this.deleteMoves(gameId)
    ]);
  }

  async checkHasTurn(socketId: string, gameId: string) {
    const isPlayer1: boolean = await this.checkIsPlayer1(socketId, gameId);
    const player1HasTurnStr: "true" | "false" = await this.client.hgetAsync(
      gameId,
      "player1HasTurn"
    );
    console.log("isPlayer1", isPlayer1);
    console.log("player1HasTurn", player1HasTurnStr);
    const player1HasTurn = player1HasTurnStr === "true";
    return isPlayer1 === player1HasTurn;
  }

  async checkIsPlayer1(socketId: string, gameId: string) {
    const player1 = await this.client.hgetAsync(gameId, "player1");
    if (socketId === player1) {
      return true;
    }
    return false;
  }

  async tick(gameId: string, isPlayer1: boolean) {
    if (isPlayer1) {
      return this.client.hincrbyAsync(gameId, "player1Time", -1);
    } else {
      return this.client.hincrbyAsync(gameId, "player2Time", -1);
    }
  }

  getGameIdBySocketId(socketId: string) {
    return this.client.getAsync(socketId);
  }

  getMoves(gameId: string) {
    return this.client.lrangeAsync(`${gameId}moves`, 0, -1);
  }

  getGameById(gameId: string) {
    return this.client.hgetallAsync(gameId);
  }

  makeMove(gameId: string, move: { x: number; y: number; isPlayer1: boolean }) {
    return this.client.rpushAsync(`${gameId}moves`, JSON.stringify(move));
  }

  async changeTurn(gameId: string) {
    let player1HasTurn = await this.client.hgetAsync(gameId, "player1HasTurn");
    player1HasTurn = player1HasTurn === "true" ? "false" : "true";
    return this.client.hsetAsync(gameId, "player1HasTurn", player1HasTurn);
  }

  startGame(gameId: string) {
    return this.client.hsetAsync(gameId, "playing", true);
  }

  undoRecentMove(gameId: string) {
    return this.client.rpopAsync(`${gameId}moves`);
  }

  getDefaultGame(options: {
    gameId: string;
    timeMode: string;
    player1?: string;
    player1Name?: string;
    player1Points?: string;
    player2?: string;
    player2Name?: string;
    player2Points?: string;
  }): IGame {
    const timeDict: Dictionary = {
      "5": "300",
      "10": "600",
      "15": "900"
    };
    return {
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
    };
  }

  removeFromOpenGames(gameId: string) {
    return this.client.sremAsync("openGames", gameId);
  }

  addToOpenGames(gameId: string) {
    return this.client.saddAsync("openGames", gameId);
  }

  updateGame(gameId: string, game: IGame) {
    return this.client.hmsetAsync(gameId, game);
  }

  addSocketRef(socketId: string, gameId: string) {
    return this.client.setAsync(socketId, gameId);
  }

  publishGameListChange(message: string) {
    this.pub.publish("gameListChange", message);
  }

  deleteMoves(gameId: string) {
    return this.client.delAsync(`${gameId}moves`);
  }
}
