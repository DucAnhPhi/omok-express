import socketIo from "socket.io";
import { Profile, IGame } from "../../models";
import GameLogic from "../../lib/gameLogic";
import RedisGame from "./game.redis";

export default class GameNamespace {
  io: socketIo.Server;
  redis: RedisGame;

  constructor(io: socketIo.Server, redisClient: any) {
    this.redis = new RedisGame(redisClient);
    this.io = io;
    io.of("game").on("connection", this.handleConnection.bind(this));
  }

  handleConnection(socket: socketIo.Socket) {
    console.log("connected to game");
    socket.on("disconnect", () => this.disconnect(socket));

    socket.on("createGame", (params: { user: Profile; timeMode: number }) =>
      this.createGame(params, socket)
    );

    socket.on("joinGame", (params: { user: Profile; gameId: string }) =>
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

  disconnect(socket: socketIo.Socket) {
    console.log("disconnected from game");
    this.redis.leaveGame(socket.id);
    // emit to opponent that player left
    this.redis
      .getGameIdBySocketId(socket.id)
      .then((gameId: string) => {
        socket.to(gameId).emit("playerLeft");
      })
      .catch((e: any) => console.log("get gameId by socketId failed: ", e));
  }

  createGame(
    params: { user: Profile; timeMode: number },
    socket: socketIo.Socket
  ) {
    this.redis
      .createGame(socket.id, params.user, params.timeMode)
      .then((initialGame: IGame) => {
        socket.join(initialGame.gameId);
        socket.emit("gameCreated", initialGame);
      })
      .catch((e: any) => console.log("create game failed: ", e));
  }

  joinGame(params: { user: Profile; gameId: string }, socket: socketIo.Socket) {
    this.redis
      .joinGame(socket.id, params.user, params.gameId)
      .then((game: IGame) => {
        console.log(params.gameId);
        socket.join(params.gameId);
        this.io
          .of("/game")
          .to(params.gameId)
          .emit("gameJoined", game);
      })
      .catch((e: any) => console.log("join game failed: ", e));
  }

  async handlePlayerReady(params: { gameId: string }, socket: socketIo.Socket) {
    try {
      socket.in(params.gameId).emit("playerReady");
      const isPlayer1 = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const bothReady = await this.redis.checkPlayersReady(
        params.gameId,
        isPlayer1
      );
      if (bothReady) {
        // start game
        this.redis.startGame(params.gameId).then(() => {
          console.log("gameStarted");
          this.io
            .of("game")
            .in(params.gameId)
            .emit("gameStarted");
          if (isPlayer1) {
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

  async tick(params: { gameId: string }, socket: socketIo.Socket) {
    try {
      const isPlayer1 = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const playerTime = await this.redis.tick(params.gameId, isPlayer1);
      console.log(playerTime, isPlayer1);
      this.io
        .of("/game")
        .to(params.gameId)
        .emit("timeUpdated", { playerTime, isPlayer1 });
      if (playerTime === 0) {
        this.redis.endGame(params.gameId).then(() => {
          this.io
            .of("/game")
            .in(params.gameId)
            .emit("gameEnded", { victory: { isPlayer1: !isPlayer1 } });
        });
      }
    } catch (e) {
      console.log("tick failed: ", e);
    }
  }

  offer(
    params: { gameId: string; type: "redo" | "draw" },
    socket: socketIo.Socket
  ) {
    socket.in(params.gameId).emit("offer", params.type);
  }

  async handleOfferAccepted(
    params: { gameId: string; type: "redo" | "draw" },
    socket: socketIo.Socket
  ) {
    try {
      if (params.type === "redo") {
        const hasTurn = await this.redis.checkHasTurn(socket.id, params.gameId);
        if (!hasTurn) {
          throw new Error("Invalid redo. Offering Player still has turn.");
        }
        const moves = await this.redis.getMoves(params.gameId);
        if (moves.length === 0) {
          throw new Error("Invalid redo. No moves made yet.");
        }
        Promise.all([
          this.redis.undoRecentMove(params.gameId),
          this.redis.changeTurn(params.gameId)
        ]).then(async () => {
          const moves = await this.redis.getMoves(params.gameId);
          const boardPositions = GameLogic.convertToPositions(moves);
          // emit updated board positions to players
          this.io
            .of("/game")
            .in(params.gameId)
            .emit("updateBoard", boardPositions);
          // emit next turn to opponent
          socket.in(params.gameId).emit("turn");
        });
      }
      if (params.type === "draw") {
        this.redis.endGame(params.gameId).then(() => {
          this.io
            .of("/game")
            .in(params.gameId)
            .emit("gameEnded", { draw: true });
        });
      }
    } catch (e) {
      console.log("handle offer accept failed: ", e);
    }
  }

  async move(
    params: { gameId: string; position: { x: number; y: number } },
    socket: socketIo.Socket
  ) {
    try {
      const game = await this.redis.getGameById(params.gameId);
      const isPlayer1 = await this.redis.checkIsPlayer1(
        socket.id,
        params.gameId
      );
      const moves = await this.redis.getMoves(params.gameId);
      const currentMove = {
        x: params.position.x,
        y: params.position.y,
        isPlayer1
      };
      console.log("currentMove", currentMove);
      if (!game) {
        // game does not exists
        throw new Error("Invalid move: Game does not exist");
      } else {
        // game haven't started or aleady terminated
        if (game.playing === "false") {
          throw new Error(
            "Invalid move: Game has not started or already terminated"
          );
        }
        // not players turn
        if (game.player1HasTurn !== `${isPlayer1}`) {
          throw new Error("Invalid move: Not Player's turn");
        }
        // field already occupied
        if (GameLogic.checkFieldOccupied(moves, currentMove)) {
          throw new Error("Invalid move: Field already occupied");
        }
      }
      const boardPositions = GameLogic.convertToPositions([
        ...moves,
        JSON.stringify(currentMove)
      ]);
      this.redis.makeMove(params.gameId, currentMove).then(() => {
        // emit updated board positions to players
        this.io
          .of("/game")
          .in(params.gameId)
          .emit("updateBoard", boardPositions);
        // check for victory
        if (GameLogic.checkVictory(boardPositions)) {
          this.redis.endGame(params.gameId).then(() => {
            this.io
              .of("/game")
              .in(params.gameId)
              .emit("gameEnded", { victory: { isPlayer1 } });
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
