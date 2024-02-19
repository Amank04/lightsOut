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
app.use(express.static("public"));
app.use(cors());
app.use(express.json());

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
    }

    return initialGrid;
};

const toggleLights = (grid, row, col) => {
    grid[row][col] = !grid[row][col];
    if (row < 4) grid[row + 1][col] = !grid[row + 1][col];
    if (row > 0) grid[row - 1][col] = !grid[row - 1][col];
    if (col < 4) grid[row][col + 1] = !grid[row][col + 1];
    if (col > 0) grid[row][col - 1] = !grid[row][col - 1];
};


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
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});