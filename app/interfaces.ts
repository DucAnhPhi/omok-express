export interface IRedisGame {
  player1: string;
  player1Uid: string;
  player1Name: string;
  player1Points: string;
  player1Ready: "false" | "true";
  player1Time: string;
  player2: string;
  player2Uid: string;
  player2Name: string;
  player2Points: string;
  player2Ready: "false" | "true";
  player2Time: string;
  timeMode: string;
  playing: "false" | "true";
  player1HasTurn: "false" | "true";
  player1Starts: "false" | "true";
  gameId: string;
}

export interface IGame {
  player1: string;
  player1Uid: string;
  player1Name: string;
  player1Points: number;
  player1Ready: boolean;
  player1Time: number;
  player2: string;
  player2Uid: string;
  player2Name: string;
  player2Points: number;
  player2Ready: boolean;
  player2Time: number;
  timeMode: number;
  playing: boolean;
  player1HasTurn: boolean;
  player1Starts: boolean;
  gameId: string;
}

export interface IProfile {
  username: string;
  points: number;
}

export interface IMove {
  x: number;
  y: number;
  isPlayer1: boolean;
}

export const convertRedisMovesToIMoves = (redisMoves: string[]): IMove[] => {
  return redisMoves.map((moveStr: string) => JSON.parse(moveStr));
};

export const convertIRedisGameToIGame = (redisGame: IRedisGame): IGame => ({
  ...redisGame,
  player1Points: parseInt(redisGame.player1Points, 10),
  player1Time: parseInt(redisGame.player1Time, 10),
  player1Ready: redisGame.player1Ready === "true",
  player2Points: parseInt(redisGame.player2Points, 10),
  player2Time: parseInt(redisGame.player2Time, 10),
  player2Ready: redisGame.player2Ready === "true",
  timeMode: parseInt(redisGame.timeMode),
  playing: redisGame.playing === "true",
  player1HasTurn: redisGame.player1HasTurn === "true",
  player1Starts: redisGame.player1Starts === "true"
});
