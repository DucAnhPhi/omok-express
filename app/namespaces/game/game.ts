import socketIo from "socket.io";
import {
  IGame,
  IMove,
  IUpdateGameParams,
  IGameEndedParams
} from "../../interfaces";
import GameLogic from "../../lib/gameLogic";
import RedisGame from "./game.redis";

export default class GameNamespace {
  io: socketIo.Server;
  redis: RedisGame;

  constructor(io: socketIo.Server, redisClient: any, firebaseFunctions: any) {
    this.redis = new RedisGame(redisClient, firebaseFunctions);
    this.io = io;
    io.of("game").on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket: socketIo.Socket): void {
    socket.on("disconnect", () => this.disconnect(socket));

    socket.on("createGame", (params: { timeMode: number }) =>
      this.createGame(params, socket)
    );

    socket.on("joinGame", (params: { gameId: string }) =>
      this.joinGame(params, socket)
    );

    socket.on("playerReady", (params: { gameId: string }) =>
      this.handlePlayerReady(params, socket)
    );

    socket.on("tick", (params: { gameId: string }) => {
      this.tick(params, socket);
    });

    socket.on("offer", (params: { gameId: string; type: "redo" | "draw" }) => {
      this.offer(params, socket);
    });

    socket.on(
      "offerAccepted",
      (params: { gameId: string; type: "redo" | "draw" }) => {
        this.handleOfferAccepted(params, socket);
      }
    );

    socket.on(
      "move",
      (params: { gameId: string; position: { x: number; y: number } }) => {
        this.move(params, socket);
      }
    );
  }

  disconnect(socket: socketIo.Socket): void {
    this.redis.handleLeaveGame(socket.id);
    // emit to opponent that player left
    this.redis
      .getGameIdBySocketId(socket.id)
      .then((gameId: string) => {
        socket.to(gameId).emit("playerLeft");
      })
      .catch((e: any) => console.log("get gameId by socketId failed: ", e));
  }

  createGame(params: { timeMode: number }, socket: socketIo.Socket): void {
    this.redis
      .handleCreateGame(socket.id, params.timeMode)
      .then((initialGame: IGame) => {
        socket.join(initialGame.gameId);
        const update: IUpdateGameParams = { gameProps: initialGame };
        socket.emit("updateGame", update);
      })
      .catch((e: any) => console.log("create game failed: ", e));
  }

  joinGame(params: { gameId: string }, socket: socketIo.Socket): void {
    this.redis
      .handleJoinGame(socket.id, params.gameId)
      .then((game: IGame) => {
        socket.join(params.gameId);
        const update: IUpdateGameParams = { gameProps: game };
        this.io
          .of("/game")
          .to(params.gameId)
          .emit("updateGame", update);
      })
      .catch((e: any) => console.log("join game failed: ", e));
  }

  async handlePlayerReady(
    params: { gameId: string },
    socket: socketIo.Socket
  ): Promise<void> {
    try {
      const isPlayer1: boolean = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const updatePlayerReady: IUpdateGameParams = {
        gameProps: isPlayer1 ? { player1Ready: true } : { player2Ready: true }
      };
      socket.in(params.gameId).emit("updateGame", updatePlayerReady);
      const bothReady: boolean = await this.redis.checkPlayersReady(
        params.gameId,
        isPlayer1
      );
      if (bothReady) {
        // start game
        const updateBothReady: IUpdateGameParams = {
          gameProps: {
            playing: true,
            player1Ready: false,
            player2Ready: false
          }
        };
        this.redis.startGame(params.gameId).then(async () => {
          this.io
            .of("game")
            .in(params.gameId)
            .emit("updateGame", updateBothReady);
          const player1Starts: boolean = await this.redis.getPlayer1Starts(
            params.gameId
          );
          if (isPlayer1 === player1Starts) {
            socket.emit("turn");
          } else {
            socket.in(params.gameId).emit("turn");
          }
        });
      }
    } catch (e) {
      console.log("handle player ready failed: ", e);
    }
  }

  async tick(
    params: { gameId: string },
    socket: socketIo.Socket
  ): Promise<void> {
    try {
      const isPlayer1: boolean = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const playerTime: number = await this.redis.tick(
        params.gameId,
        isPlayer1
      );
      const update: IUpdateGameParams = {
        gameProps: isPlayer1
          ? { player1Time: playerTime }
          : { player2Time: playerTime }
      };
      this.io
        .of("/game")
        .to(params.gameId)
        .emit("updateGame", update);
      if (playerTime === 0) {
        this.redis
          .endGame(params.gameId, !isPlayer1)
          .then((updatedGame: IGame) => {
            const endParams: IGameEndedParams = {
              victory: { isPlayer1: !isPlayer1 },
              updatedGame
            };
            this.io
              .of("/game")
              .in(params.gameId)
              .emit("gameEnded", endParams);
          });
      }
    } catch (e) {
      console.log("tick failed: ", e);
    }
  }

  offer(
    params: { gameId: string; type: "redo" | "draw" },
    socket: socketIo.Socket
  ): void {
    socket.in(params.gameId).emit("offer", params.type);
  }

  async handleOfferAccepted(
    params: { gameId: string; type: "redo" | "draw" },
    socket: socketIo.Socket
  ): Promise<void> {
    try {
      if (params.type === "redo") {
        const hasTurn: boolean = await this.redis.checkHasTurn(
          socket.id,
          params.gameId
        );
        if (!hasTurn) {
          throw new Error("Invalid redo. Offering Player still has turn.");
        }
        const moves: IMove[] = await this.redis.getMoves(params.gameId);
        if (moves.length === 0) {
          throw new Error("Invalid redo. No moves made yet.");
        }
        Promise.all([
          this.redis.undoRecentMove(params.gameId),
          this.redis.changeTurn(params.gameId)
        ]).then(async () => {
          const updatedMoves: IMove[] = moves.slice(0, -1);
          // emit updated moves to players
          const update: IUpdateGameParams = {
            moves: updatedMoves
          };
          this.io
            .of("/game")
            .in(params.gameId)
            .emit("updateGame", update);
          // emit next turn to opponent
          socket.in(params.gameId).emit("turn");
        });
      }
      if (params.type === "draw") {
        this.redis.endGame(params.gameId, null).then((updatedGame: IGame) => {
          const endParams: IGameEndedParams = { draw: true, updatedGame };
          this.io
            .of("/game")
            .in(params.gameId)
            .emit("gameEnded", endParams);
        });
      }
    } catch (e) {
      console.log("handle offer accept failed: ", e);
    }
  }

  async move(
    params: { gameId: string; position: { x: number; y: number } },
    socket: socketIo.Socket
  ): Promise<void> {
    try {
      const game: IGame = await this.redis.getGameById(params.gameId);
      const isPlayer1: boolean = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const moves: IMove[] = await this.redis.getMoves(params.gameId);
      const currentMove: IMove = {
        x: params.position.x,
        y: params.position.y,
        isPlayer1
      };
      if (!game) {
        // game does not exists
        throw new Error("Invalid move: Game does not exist");
      } else {
        // game haven't started or aleady terminated
        if (!game.playing) {
          throw new Error(
            "Invalid move: Game has not started or already terminated"
          );
        }
        // not players turn
        if (game.player1HasTurn !== isPlayer1) {
          throw new Error("Invalid move: Not Player's turn");
        }
        // field already occupied
        if (GameLogic.checkFieldOccupied(moves, currentMove)) {
          throw new Error("Invalid move: Field already occupied");
        }
      }
      this.redis.makeMove(params.gameId, currentMove).then(() => {
        const updatedMoves: IMove[] = [...moves, currentMove];
        const boardPositions = GameLogic.convertToPositions(updatedMoves);
        // emit updated board positions to players
        const update: IUpdateGameParams = { moves: updatedMoves };
        this.io
          .of("/game")
          .in(params.gameId)
          .emit("updateGame", update);
        // check for victory
        if (GameLogic.checkVictory(boardPositions)) {
          this.redis
            .endGame(params.gameId, isPlayer1)
            .then((updatedGame: IGame) => {
              const endParams: IGameEndedParams = {
                victory: { isPlayer1 },
                updatedGame
              };
              this.io
                .of("/game")
                .in(params.gameId)
                .emit("gameEnded", endParams);
            });
        } else {
          this.redis.changeTurn(params.gameId).then(() => {
            // emit next turn to opponent
            socket.in(params.gameId).emit("turn");
          });
        }
      });
    } catch (e) {
      console.log("move failed: ", e);
    }
  }
}
