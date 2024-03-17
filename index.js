import express from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import cors from "cors";

const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

const matrixSizeOptions = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6];
let board,hintGrid;
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

     hintGrid = Array.from({length: matrixSize}, () => 
        Array(matrixSize).fill(0)
     );
    // console.log("hint board:",hintGrid);

    for (let i = 0; i < level; i++) {
        let randomRow, randomCol;
    
        // Generate unique random values
        do {
            randomRow = Math.floor(Math.random() * matrixSize);
            randomCol = Math.floor(Math.random() * matrixSize);
        } while (initialGrid[randomRow][randomCol] !== 0); // Continue generating until an unoccupied cell is found
    
        toggleLights(initialGrid, randomRow, randomCol, n);
    }
    

    return initialGrid;
};

const toggleLights = (grid, row, col, n) => {
    console.log(hintGrid)
    if (isValidPosition(row, col, grid)) {
        grid[row][col] = (grid[row][col] + 1) % n;
        hintGrid[row][col] = (hintGrid[row][col] + 1) % n;
        console.log("Hint board: ",hintGrid);
        toggleAdjacentLights(grid, row, col, n);
    }
};

const toggleAdjacentLights = (grid, row, col, n) => {
    const directions = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
    ];

    directions.forEach(([dx, dy]) => {
        const newRow = row + dx;
        const newCol = col + dy;
        if (isValidPosition(newRow, newCol, grid)) {
            grid[newRow][newCol] = (grid[newRow][newCol] + 1) % n;
        }
    });
};

app.get("/", (req, res) => {
    board = createGrid(matrixSize, level,2);
    console.log("Game board:", board);
    console.log("Hint board: ", hintGrid);
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
    toggleLights(board, parseInt(row), parseInt(col),2);
    console.log(board);

    const gameEnded = board.every(row => row.every(cell => !cell));
    res.json({ board, gameEnded });
});

app.get("/api/getHint", (req,res) => {
    console.log("hint api is called successfully.");
    res.json({hintGrid});
})

app.post("/levels", (req, res) => {
    level = parseInt(req.body.level);
    matrixSize = matrixSizeOptions[level - 1];
    res.redirect('/');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
