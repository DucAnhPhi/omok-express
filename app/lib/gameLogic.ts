import { Move } from "../interfaces";

export default class GameLogic {
  static convertToPositions(moves: string[]) {
    console.log("moves", moves);
    const boardPositions = Array(15)
      .fill(null)
      .map(() => Array(15).fill(null));
    moves.map((moveStr: string) => {
      const move: Move = JSON.parse(moveStr);
      boardPositions[move.y][move.x] = move.isPlayer1;
    });
    return boardPositions;
  }

  private static checkRow(
    row: number,
    col: number,
    positions: boolean[][],
    currentToken: boolean
  ) {
    let inALine = 0;
    for (let colOffset = 1; colOffset < 5; colOffset++) {
      if (positions[row][col + colOffset] === currentToken) {
        inALine++;
      } else {
        break;
      }
    }
    return inALine === 4;
  }

  private static checkColumn(
    row: number,
    col: number,
    positions: boolean[][],
    currentToken: boolean
  ) {
    let inALine = 0;
    for (let rowOffset = 1; rowOffset < 5; rowOffset++) {
      if (positions[row + rowOffset][col] === currentToken) {
        inALine++;
      } else {
        break;
      }
    }
    return inALine === 4;
  }

  private static checkDiagonalRight(
    row: number,
    col: number,
    positions: boolean[][],
    currentToken: boolean
  ) {
    let inALine = 0;
    for (let offset = 1; offset < 5; offset++) {
      if (positions[row + offset][col + offset] === currentToken) {
        inALine++;
      } else {
        break;
      }
    }
    return inALine === 4;
  }

  private static checkDiagonalLeft(
    row: number,
    col: number,
    positions: boolean[][],
    currentToken: boolean
  ) {
    let inALine = 0;
    for (let offset = 1; offset < 5; offset++) {
      if (positions[row + offset][col - offset] === currentToken) {
        inALine++;
      } else {
        break;
      }
    }
    return inALine === 4;
  }

  static checkFieldOccupied(moves: string[], currentMove: Move) {
    for (let i = 0; i < moves.length; i++) {
      const move: Move = JSON.parse(moves[i]);
      if (move.x === currentMove.x && move.y === currentMove.y) {
        return true;
      }
    }
    return false;
  }

  static checkVictory(positions: boolean[][]) {
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 15; col++) {
        const currentToken = positions[row][col];
        if (currentToken === null) {
          continue;
        }
        const overBottomLimit = row + 4 > 14;
        const overRightLimit = col + 4 > 14;
        const overLeftLimit = col - 4 < 0;
        // lookup the next 4 same tokens on the right if col + 4 <15
        if (!overRightLimit) {
          if (this.checkRow(row, col, positions, currentToken)) {
            return true;
          }
        }
        // lookup the next 4 same tokens south if row + 4 <15
        if (!overBottomLimit) {
          if (this.checkColumn(row, col, positions, currentToken)) {
            return true;
          }
        }
        // lookup the next 4 same tokens diagonally right if col+4<15 && row+4<15
        if (!overRightLimit && !overBottomLimit) {
          if (this.checkDiagonalRight(row, col, positions, currentToken)) {
            return true;
          }
        }
        // lookup the next 4 same tokens diagonally left if col-4 >=0 && row+4<15
        if (!overLeftLimit && !overBottomLimit) {
          if (this.checkDiagonalLeft(row, col, positions, currentToken)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
