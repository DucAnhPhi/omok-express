import uuidv4 from "uuid/v4";
import {
  IGame,
  IProfile,
  convertIRedisGameToIGame,
  IRedisGame,
  convertRedisMovesToIMoves,
  IMove
} from "../../interfaces";

export default class RedisGame {
  client: any;
  pub: any;
  firebaseFunctions: any;

  constructor(redisClient: any, firebaseFunctions: any) {
    this.client = redisClient;
    // check if redisClient is a mock
    this.pub = this.client.duplicate ? this.client.duplicate() : redisClient;
    this.firebaseFunctions = firebaseFunctions;
  }

  async handleCreateGame(socketId: string, timeMode: number): Promise<IGame> {
    const uid = await this.client.hgetAsync(socketId, "userId");
    const profile: IProfile = await this.firebaseFunctions.getProfileById(uid);
    return this.createGame(socketId, uid, profile, timeMode);
  }

  async createGame(
    socketId: string,
    uid: string,
    user: IProfile,
    timeMode: number,
    seededGameId?: string
  ): Promise<IGame> {
    const gameId = seededGameId || uuidv4();
    const initialGame: IGame = this.getDefaultGame({
      gameId,
      timeMode: timeMode,
      player1: socketId,
      player1Uid: uid,
      player1Name: user.username,
      player1Points: user.points
    });
    return Promise.all([
      this.updateGame(gameId, initialGame),
      this.addGameRef(socketId, gameId),
      this.addToOpenGames(gameId)
    ]).then(() => {
      this.publishGameListChange("game created");
      return initialGame;
    });
  }

  async handleJoinGame(socketId: string, gameId: string): Promise<IGame> {
    const uid = await this.client.hgetAsync(socketId, "userId");
    const profile: IProfile = await this.firebaseFunctions.getProfileById(uid);
    return this.joinGame(socketId, uid, profile, gameId);
  }

  async joinGame(
    socketId: string,
    uid: string,
    user: IProfile,
    gameId: string
  ): Promise<IGame> {
    const game: IGame = await this.getGameById(gameId);
    game.player2 = socketId;
    game.player2Uid = uid;
    game.player2Name = user.username;
    game.player2Points = user.points;
    return Promise.all([
      this.updateGame(gameId, game),
      this.addGameRef(socketId, gameId),
      this.removeFromOpenGames(gameId)
    ]).then(() => {
      this.publishGameListChange("game matched");
      return game;
    });
  }

  async leaveGame(socketId: string): Promise<void> {
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
      let newPlayer1Points = leavingGame.player1Points;
      let newPlayer2Points = leavingGame.player2Points;
      if (leavingGame.playing) {
        // update points if player leaves while playing
        newPlayer1Points = isPlayer1
          ? newPlayer1Points - 30
          : newPlayer1Points + 50;
        newPlayer2Points = !isPlayer1
          ? newPlayer2Points - 30
          : newPlayer2Points + 50;
        this.firebaseFunctions.updateProfilePoints(
          leavingGame.player1Uid,
          newPlayer1Points
        );
        this.firebaseFunctions.updateProfilePoints(
          leavingGame.player2Uid,
          newPlayer2Points
        );
      }
      // set whoever is left as player1 and clear player2
      const updatedGameProps = {
        player1: isPlayer1 ? leavingGame.player2 : leavingGame.player1,
        player1Uid: isPlayer1 ? leavingGame.player2Uid : leavingGame.player1Uid,
        player1Name: isPlayer1
          ? leavingGame.player2Name
          : leavingGame.player1Name,
        player1Points: isPlayer1 ? newPlayer2Points : newPlayer1Points
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

  async checkPlayersReady(
    gameId: string,
    isPlayer1: boolean
  ): Promise<boolean> {
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

  async endGame(gameId: string, player1Win: boolean | null): Promise<IGame> {
    const tempGame: IGame = await this.getGameById(gameId);
    let newP1Points: number = tempGame.player1Points;
    let newP2Points: number = tempGame.player2Points;
    if (player1Win === null) {
      newP1Points += 10;
      newP2Points += 10;
    } else {
      if (player1Win === true) {
        newP1Points += 50;
        newP2Points -= 30;
      } else {
        newP1Points -= 30;
        newP2Points += 50;
      }
    }
    this.firebaseFunctions.updateProfilePoints(
      tempGame.player1Uid,
      newP1Points
    );
    this.firebaseFunctions.updateProfilePoints(
      tempGame.player2Uid,
      newP2Points
    );
    const updatedGame = this.getDefaultGame({
      gameId,
      timeMode: tempGame.timeMode,
      player1: tempGame.player1,
      player1Uid: tempGame.player1Uid,
      player1Name: tempGame.player1Name,
      player1Points: newP1Points,
      player2: tempGame.player2,
      player2Uid: tempGame.player2Uid,
      player2Name: tempGame.player2Name,
      player2Points: newP2Points,
      player1Starts: !tempGame.player1Starts
    });
    return Promise.all([
      this.updateGame(gameId, updatedGame),
      this.deleteMoves(gameId)
    ]).then(() => updatedGame);
  }

  async checkHasTurn(socketId: string, gameId: string): Promise<boolean> {
    const isPlayer1: boolean = await this.checkIsPlayer1(socketId, gameId);
    const player1HasTurnStr: "true" | "false" = await this.client.hgetAsync(
      gameId,
      "player1HasTurn"
    );
    const player1HasTurn = player1HasTurnStr === "true";
    return isPlayer1 === player1HasTurn;
  }

  async checkIsPlayer1(socketId: string, gameId: string): Promise<boolean> {
    const player1 = await this.client.hgetAsync(gameId, "player1");
    if (socketId === player1) {
      return true;
    }
    return false;
  }

  async tick(gameId: string, isPlayer1: boolean): Promise<number> {
    if (isPlayer1) {
      return this.client.hincrbyAsync(gameId, "player1Time", -1);
    } else {
      return this.client.hincrbyAsync(gameId, "player2Time", -1);
    }
  }

  getGameIdBySocketId(socketId: string): Promise<string> {
    return this.client.hgetAsync(socketId, "gameId");
  }

  getMoves(gameId: string): Promise<IMove[]> {
    return this.client
      .lrangeAsync(`${gameId}moves`, 0, -1)
      .then((movesRedis: string[]) => convertRedisMovesToIMoves(movesRedis));
  }

  getGameById(gameId: string): Promise<IGame> {
    return this.client
      .hgetallAsync(gameId)
      .then((gameRedis: IRedisGame) => convertIRedisGameToIGame(gameRedis));
  }

  makeMove(
    gameId: string,
    move: { x: number; y: number; isPlayer1: boolean }
  ): Promise<void> {
    return this.client.rpushAsync(`${gameId}moves`, JSON.stringify(move));
  }

  async changeTurn(gameId: string): Promise<void> {
    let player1HasTurn = await this.client.hgetAsync(gameId, "player1HasTurn");
    player1HasTurn = player1HasTurn === "true" ? "false" : "true";
    return this.client.hsetAsync(gameId, "player1HasTurn", player1HasTurn);
  }

  startGame(gameId: string): Promise<void> {
    return this.client.hsetAsync(gameId, "playing", true);
  }

  undoRecentMove(gameId: string): Promise<void> {
    return this.client.rpopAsync(`${gameId}moves`);
  }

  getDefaultGame(options: {
    gameId: string;
    timeMode: number;
    player1?: string;
    player1Uid?: string;
    player1Name?: string;
    player1Points?: number;
    player2?: string;
    player2Uid?: string;
    player2Name?: string;
    player2Points?: number;
    player1Starts?: boolean;
  }): IGame {
    return {
      player1: options.player1 ? options.player1 : "",
      player1Uid: options.player1Uid ? options.player1Uid : "",
      player1Name: options.player1Name ? options.player1Name : "",
      player1Points: options.player1Points ? options.player1Points : 1500,
      player1Ready: false,
      player1Time: options.timeMode * 60,
      player2: options.player2 ? options.player2 : "",
      player2Uid: options.player2Uid ? options.player2Uid : "",
      player2Name: options.player2Name ? options.player2Name : "",
      player2Points: options.player2Points ? options.player2Points : 1500,
      player2Ready: false,
      player2Time: options.timeMode * 60,
      timeMode: options.timeMode,
      playing: false,
      player1HasTurn:
        options.player1Starts !== undefined ? options.player1Starts : true,
      player1Starts:
        options.player1Starts !== undefined ? options.player1Starts : true,
      gameId: options.gameId
    };
  }

  removeFromOpenGames(gameId: string): Promise<void> {
    return this.client.sremAsync("openGames", gameId);
  }

  addToOpenGames(gameId: string): Promise<void> {
    return this.client.saddAsync("openGames", gameId);
  }

  updateGame(gameId: string, game: IGame): Promise<void> {
    return this.client.hmsetAsync(gameId, game);
  }

  addGameRef(socketId: string, gameId: string): Promise<void> {
    return this.client.hsetAsync(socketId, "gameId", gameId);
  }

  publishGameListChange(message: string): void {
    this.pub.publish("gameListChange", message);
  }

  deleteMoves(gameId: string): Promise<void> {
    return this.client.delAsync(`${gameId}moves`);
  }

  getPlayer1Starts(gameId: string): boolean {
    return this.client
      .hgetAsync(gameId, "player1Starts")
      .then((player1Starts: "true" | "false") => player1Starts === "true");
  }
}
