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
app.use(express.static('public'));
app.use(cors());
app.use(express.json());


const matrixSizeOptions = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6];
let board,hintGrid,hintGrid3;
let matrixSize = 3;
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
    // console.log(hintGrid)
    if (isValidPosition(row, col, grid)) {
        grid[row][col] = (grid[row][col] + 1) % n;
        hintGrid[row][col] = (hintGrid[row][col] + 1) % n;
        // console.log("Hint board: ",hintGrid);
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
    // console.log("Game board:", board);
    // console.log("Hint board: ", hintGrid);
    res.render("index.ejs", { board, level, matrixSize });
});

app.get("/team",(req,res) => {
    res.render("team.ejs");
})

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
    console.log(req.body);
    toggleLights(board, parseInt(row), parseInt(col),2);
    console.log(board);

    const gameEnded = board.every(row => row.every(cell => !cell));
    res.json({ board, gameEnded });
});

app.get("/api/getHint", (req,res) => {
    // console.log("hint api is called successfully.");
    res.json({hintGrid});
})

app.post("/levels", (req, res) => {
    level = parseInt(req.body.level);
    matrixSize = matrixSizeOptions[level - 1];
    res.redirect('/');
});

// 3-state lights out Start here.

app.post("/state", (req, res) => {
    let state = req.body.level;

    if(state == 'Pro') {
     res.redirect("/state3");
    } else {
        res.redirect("/");
    }
})

const create3Grid = (matrixSize3, level3) => {
    const initialGrid = new Array(matrixSize3).fill().map(() =>
        new Array(matrixSize3).fill(0) // Initialize with color white (0)
    );
    
    // Hint grid for 3-state LightsOut game.
    hintGrid3 = Array.from({length: matrixSize}, () => 
        Array(matrixSize).fill(0)
     );

    // Apply a series of random moves to make the grid solvable
    const moves = level3; // Adjust the number of moves as needed

    for (let i = 0; i < moves; i++) {
        let randomRow, randomCol;
    
        // Generate unique random values
        do {
            randomRow = Math.floor(Math.random() * matrixSize3);
            randomCol = Math.floor(Math.random() * matrixSize3);
        } while (initialGrid[randomRow][randomCol] !== 0); // Continue generating until an unoccupied cell is found
    
        toggle3Lights(initialGrid, randomRow, randomCol);
    }

    return initialGrid;
};

const toggle3Lights = (grid, row, col) => {
    console.log("I am called.");

    // Ensure row and col are within bounds
    console.log(grid);
    console.log(grid.length, grid[0].length);
    if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
        // Toggle through the three colors (0, 1, 2)
        grid[row][col] = (grid[row][col] + 1) % 3;
    }

    // Toggle lights in adjacent rows and columns if within bounds
    if (row < grid.length - 1) {
        grid[row + 1][col] = (grid[row + 1][col] + 1) % 3;
    }
    if (row > 0) {
        grid[row - 1][col] = (grid[row - 1][col] + 1) % 3;
    }
    if (col < grid[0].length - 1) {
        grid[row][col + 1] = (grid[row][col + 1] + 1) % 3;
    }
    if (col > 0) {
        grid[row][col - 1] = (grid[row][col - 1] + 1) % 3;
    }
};


var board3;
var matrixSize3 = 3;
// Home route
app.get("/state3", (req, res) => {
    // const level = 2;
    board3 = create3Grid(matrixSize3, level3);
    console.log("level33:" + level3)
    console.log({ board3 });
    console.log(board3.length, board3[0].length)
    res.render("3state.ejs", { board: board3, level: level3, matrixSize: matrixSize3 },);
});


app.get('/levels3', (req, res) => {
    // Access the "level" parameter from the query string
    console.log(req.query);
    if (parseInt(req.query.id) === 0 && level3>1) { //Previous level is clicked.
        level3 = parseInt(req.query.CurrLevel) - 1;
        if(level3>3 && level3<6) matrixSize3 = 4; //Changling the matrixSize3 on going above level 7.
        else if(level3>=6 && level3<=8) matrixSize3 = 5;
        else if(level3>8) matrixSize3 = 6; //otherwise, matrixSize3 = 5.
    } else if(parseInt(req.query.id)===1 && level3<=9) { //Next level3 is clicked.
        level3 = parseInt(req.query.CurrLevel) + 1;
        if(level3>3 && level3<6) matrixSize3 = 4;
        else if(level3>=6 && level3<=8) matrixSize3 = 5;
        else if(level3>8) matrixSize3 = 6;
    } else {
       res.send(`<script>alert("Crossing the edge limit!");window.location.href = "/";</script>`);


    }
    res.redirect("/state3");

    // Use the "level" value as needed
    // console.log('Level:', typeof level);

    // Your logic for handling the level value goes here

    // Send a response if needed
    // res.send(`Level: ${level}`);
});

// API endpoint to toggle lights based on user input
app.post("/api/toggle3Lights", (req, res) => {
    let { row, col } = req.body;
    row = parseInt(row), col = parseInt(col); // parsing string to number.
    // console.log(typeof (row));
    // Toggle lights on the server 
    toggle3Lights(board3, row, col);
    // console.log(board3);
    console.log(board3);
    // Check if the game has ended
    const gameEnded = board3.every(row => row.every(c => !c));
    // console.log(gameEnded);

    res.json({ board3, gameEnded });
});
var level3 = 1;
app.post("/levels3", (req, res) => {
    // console.log(req.body);
    level3 = parseInt(req.body.level);
    if(level3<=3) matrixSize3=4;
    else if(level3>3 && level3<6) {
        matrixSize3 = 4;
    } else if(level3>=6 && level3 <=8) {
        matrixSize3 = 5;
    } else if(level3>8) matrixSize3 = 6;
    res.redirect('/state3');
})

// 3-state lights out game ends here.

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
