import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";
import cors from "cors";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

// Configure middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

const createGrid = (matrixSize, level) => {
    const initialGrid = new Array(matrixSize).fill().map(() =>
        new Array(matrixSize).fill(true) // Assuming all lights are initially on
    );

    // Apply a series of random moves to make the grid solvable
    const moves = level; // Adjust the number of moves as needed

    for (let i = 0; i < moves; i++) {
        const randomRow = Math.floor(Math.random() * matrixSize);
        const randomCol = Math.floor(Math.random() * matrixSize);
        toggleLights(initialGrid, randomRow, randomCol);
    }

    return initialGrid;
};
const toggleLights = (grid, row, col) => {
    console.log("I am called.");

    // Ensure row and col are within bounds
    console.log(grid);
    console.log(grid.length, grid[0].length);
    if (row >= 0 && row < grid.length && col >= 0 && col < grid[0].length) {
        grid[row][col] = !grid[row][col];
    }

    // Toggle lights in adjacent rows and columns if within bounds
    if (row < grid.length - 1) {
        grid[row + 1][col] = !grid[row + 1][col];
    }
    if (row > 0) {
        grid[row - 1][col] = !grid[row - 1][col];
    }
    if (col < grid[0].length - 1) {
        grid[row][col + 1] = !grid[row][col + 1];
    }
    if (col > 0) {
        grid[row][col - 1] = !grid[row][col - 1];
    }
};




// Initialize Passport and Passport session
// app.use(passport.initialize());
// app.use(passport.session());


var board;
var matrixSize = 5;
// Home route
app.get("/", (req, res) => {
    board = createGrid(matrixSize,level);
    //  console.log(level)
    // console.log({board});
    // console.log(board.length,board[0].length)
    res.render("index.ejs", { board: board, level: level,matrixSize:matrixSize },);
});

app.get('/levels', (req, res) => {
    // Access the "level" parameter from the query string
    console.log(req.query);
    if (parseInt(req.query.id) === 0 && level>1) { //Previous level is clicked.
        level = parseInt(req.query.CurrLevel) - 1;
        if(level>7 && level<11) matrixSize = 7; //Changling the matrixsize on going above level 7.
        else matrixSize = 5; //otherwise, matrixsize = 5.
    } else if(parseInt(req.query.id)===1 && level<=9) { //Next level is clicked.
        level = parseInt(req.query.CurrLevel) + 1;
        if(level>7 && level<11) matrixSize = 7;
        else matrixSize = 5;
    } else {
       res.send(`<script>alert("Crossing the edge limit!");window.location.href = "/";</script>`);


    }
    res.redirect("/");

    // Use the "level" value as needed
    // console.log('Level:', typeof level);

    // Your logic for handling the level value goes here

    // Send a response if needed
    // res.send(`Level: ${level}`);
});

// API endpoint to toggle lights based on user input
app.post("/api/toggleLights", (req, res) => {
    let { row, col } = req.body;
    row = parseInt(row), col = parseInt(col); // parsing string to number.
    // console.log(typeof (row));
    // Toggle lights on the server 
    toggleLights(board, row, col);
    // console.log(board);
    console.log(board);
    // Check if the game has ended
    const gameEnded = board.every(row => row.every(c => c));
    // console.log(gameEnded);

    res.json({ board, gameEnded });
});
var level = 1;
app.post("/levels", (req, res) => {
    // console.log(req.body);
    level = parseInt(req.body.level);
    if(level>7 && level<11) {
        matrixSize = 7;
    } else {
        matrixSize = 5;
    }
    res.redirect('/');
})

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});