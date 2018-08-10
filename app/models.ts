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

export interface Profile {
  username: string;
  points: number;
}

export interface Dictionary {
  [key: string]: string;
}
