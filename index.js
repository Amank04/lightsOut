import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";


const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

// Set up session middleware
// app.use(
//     session({
//         secret: process.env.SESSION_SECRET,
//         resave: false,
//         saveUninitialized: true,
//         cookie: {
//             secure: true,
//         }
//     })
// );

// Configure middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Initialize Passport and Passport session
// app.use(passport.initialize());
// app.use(passport.session());


// Home route
app.get("/", (req, res) => {
    res.render("index.ejs");
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});