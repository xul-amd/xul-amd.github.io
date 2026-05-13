# ATSsemble — Tetris Inspired

A unique twist on the classic Tetris game where instead of clearing lines, you match letters to spell "ATS" in straight lines!

## 🎮 Play Now

[Play the game](https://seaboiii.github.io/tetris/)

## 🎯 Game Objective

Match **A**, **T**, and **S** letters in a straight line to clear them and score points. Lines can be:
- Horizontal (→)
- Vertical (↓)
- Diagonal (↘ or ↗)

## ✨ Features

- **Classic Tetris-style gameplay** with a unique letter-matching twist
- **Special blocks** to create strategic plays:
  - **✱ Wildcard**: Acts as any letter (A, T, or S)
  - **B Bomb**: Clears a 3×3 area
  - **✦ Mega Bomb**: Clears an entire row and column
- **Hazards**: Junk/poison letters and rising garbage rows to increase difficulty
- **Online Leaderboard** (optional): Compete with players worldwide using Supabase integration
- **Responsive design** that works on various screen sizes

## 🕹️ Controls

- **Click** to start the game
- **←/→** arrows to move pieces
- **↓** arrow for soft drop
- **R** to restart

## 📊 Scoring System

- **+100 points** per horizontal/vertical A-T-S triple
- **+25 points** per diagonal triple
- **+50 points** per triple for each extra chain step (combos!)
- **+20 points** per block cleared by B bomb
- **+150 points** for ✦ mega bomb (row/col clear)

## 🚀 Setup & Installation

### Basic Setup (Local)

1. Clone this repository:
   ```bash
   git clone https://github.com/SeaBoiii/tetris.git
   cd tetris
   ```

2. Open `index.html` in your web browser

That's it! The game runs entirely in the browser using Phaser 3.

### Optional: Enable Online Leaderboard

To enable the online leaderboard feature:

1. Create a free [Supabase](https://supabase.com) account and project

2. Create a table named `scores` with the following schema:
   ```sql
   CREATE TABLE scores (
     id BIGSERIAL PRIMARY KEY,
     name TEXT,
     score INT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

3. Create a `config.js` file in the project root:
   ```javascript
   window.SUPABASE_URL = "your-project-url";
   window.SUPABASE_ANON_KEY = "your-anon-key";
   ```

4. The leaderboard will now save and display high scores!

> **Note**: The `config.js` file is gitignored for security. Leave these values empty to disable online leaderboard functionality.

## 🛠️ Technologies Used

- **Phaser 3**: Game framework for rendering and game logic
- **Supabase** (optional): Backend for online leaderboard
- **Vanilla JavaScript**: Core game logic
- **HTML5 & CSS3**: UI and styling

## 🎨 Game Mechanics

### Letter Blocks
- **A** (Blue): First letter in ATS sequence
- **T** (Orange): Second letter in ATS sequence
- **S** (Green): Third letter in ATS sequence

### Special Blocks
- **✱ Wildcard** (Purple): Can substitute for any letter
- **B Bomb** (Red): Explodes in a 3×3 radius
- **✦ Mega Bomb** (Gold): Clears entire row and column

### Hazards
- **Junk Letters**: Random letters that don't spell ATS
- **Poison Blocks**: Obstruct your playing field
- **Rising Garbage**: Rows that periodically rise from the bottom

## 📝 License

This project is available for personal and educational use.

## 🤝 Contributing

Feel free to fork this project and submit pull requests with improvements or bug fixes!

## 👨‍💻 Author

Created by SeaBoiii

---

Enjoy the game and aim for the high score! 🎯
