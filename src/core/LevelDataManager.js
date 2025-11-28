// core/LevelDataManager.js
export class LevelDataManager {
  constructor() {
    this.levels = [];
    this.calendarCodes = [
      [3, 7, 2, 5], // Level 0
      [1, 8, 4, 6], // Level 1
      [9, 2, 3, 7], // Level 2
      [5, 1, 8, 4], // Level 3
      [6, 3, 9, 2], // Level 4
      [7, 4, 1, 8], // Level 5
      [2, 5, 6, 3], // Level 6
      [8, 9, 7, 4]  // Level 7
    ];
  }

  async loadAllLevels() {
    const promises = [];
    for (let i = 0; i < this.calendarCodes.length; i++) {
      promises.push(
        fetch(`levels/level${i + 1}.json`) // Files named level1.json to level8.json
          .then(res => res.json())
          .then(data => ({
            ...data,
            code: this.calendarCodes[i].join("")
          }))
          .catch(error => {
            console.error(`Failed to load level ${i}:`, error);
            return null;
          })
      );
    }
    this.levels = (await Promise.all(promises)).filter(Boolean);
  }

  getLevelData(index) {
    if (index < 0 || index >= this.levels.length) {
      console.error(`Invalid level index: ${index}`);
      return null;
    }
    return this.levels[index];
  }

  getLevelCode(index) {
    if (index < 0 || index >= this.calendarCodes.length) {
      console.error(`Invalid level index: ${index}`);
      return "0000";
    }
    return this.calendarCodes[index].join("");
  }

  get totalLevels() {
    return this.calendarCodes.length;
  }
}