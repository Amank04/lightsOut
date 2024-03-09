import express from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import cors from "cors";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

<<<<<<< Updated upstream
const createGrid = () => {
    const initialGrid = new Array(5).fill().map(() =>
        new Array(5).fill(true) // Assuming all lights are initially on
    );

    // Apply a series of random moves to make the grid solvable
    const moves = 10; // Adjust the number of moves as needed

    for (let i = 0; i < moves; i++) {
        const randomRow = Math.floor(Math.random() * 5);
        const randomCol = Math.floor(Math.random() * 5);
        toggleLights(initialGrid, randomRow, randomCol);
=======
const matrixSizeOptions = [4, 4, 4, 5, 5, 5, 6, 6, 6, 6];
let board;
let matrixSize = 4;
let level = 1;

app.set('view engine', 'ejs');

const isValidPosition = (row, col, grid) => {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
};
const createGrid = (matrixSize, level, n) => {
    const initialGrid = Array.from({ length: matrixSize }, () =>
        Array(matrixSize).fill(0)
    );

    for (let i = 0; i < level; i++) {
        let randomRow, randomCol;
    
        // Generate unique random values
        do {
            randomRow = Math.floor(Math.random() * matrixSize);
            randomCol = Math.floor(Math.random() * matrixSize);
        } while (initialGrid[randomRow][randomCol] !== 0); // Continue generating until an unoccupied cell is found
    
        toggleLights(initialGrid, randomRow, randomCol, n);
>>>>>>> Stashed changes
    }
    

    return initialGrid;
};

<<<<<<< Updated upstream
const toggleLights = (grid, row, col) => {
    grid[row][col] = !grid[row][col];
    if (row < 4) grid[row + 1][col] = !grid[row + 1][col];
    if (row > 0) grid[row - 1][col] = !grid[row - 1][col];
    if (col < 4) grid[row][col + 1] = !grid[row][col + 1];
    if (col > 0) grid[row][col - 1] = !grid[row][col - 1];
=======
const toggleLights = (grid, row, col, n) => {
    if (isValidPosition(row, col, grid)) {
        grid[row][col] = (grid[row][col] + 1) % n;
        toggleAdjacentLights(grid, row, col, n);
    }
>>>>>>> Stashed changes
};

const toggleAdjacentLights = (grid, row, col, n) => {
    const directions = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
    ];

<<<<<<< Updated upstream
// Initialize Passport and Passport session
// app.use(passport.initialize());
// app.use(passport.session());


// Home route
app.get("/", (req, res) => {
    let board = createGrid();
    console.log({board});
    res.render("index.ejs", {board: board});
});

// Start the server
=======
    directions.forEach(([dx, dy]) => {
        const newRow = row + dx;
        const newCol = col + dy;
        if (isValidPosition(newRow, newCol, grid)) {
            grid[newRow][newCol] = (grid[newRow][newCol] + 1) % n;
        }
    });
};

app.get("/", (req, res) => {
    board = createGrid(matrixSize, level, 2);
    res.render("index.ejs", { board, level, matrixSize });
});

app.get('/levels', (req, res) => {
    const { id, CurrLevel } = req.query;

    if (id === '0' && level > 1) {
        level = parseInt(CurrLevel) - 1;
    } else if (id === '1' && level < 10) {
        level = parseInt(CurrLevel) + 1;
    } else {
        return res.send('<script>alert("Crossing the edge limit!");window.location.href = "/";</script>');
    }

    matrixSize = matrixSizeOptions[level - 1];
    res.redirect("/");
});

app.post("/api/toggleLights", (req, res) => {
    const { row, col } = req.body;
    toggleLights(board, parseInt(row), parseInt(col), 2);

    const gameEnded = board.every(row => row.every(cell => !cell));
    res.json({ board, gameEnded });
});

app.post("/levels", (req, res) => {
    level = parseInt(req.body.level);
    matrixSize = matrixSizeOptions[level - 1];
    res.redirect('/');
});

>>>>>>> Stashed changes
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
