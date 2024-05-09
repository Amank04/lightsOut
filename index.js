import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import nodemailer from 'nodemailer';
import otpGenerator from 'otp-generator';
import hideEmailPhone from 'partially-hide-email-phone';
import pg from "pg";
import bcrypt from 'bcrypt';
import multer from "multer";
import session from "express-session";
import cookieParser from "cookie-parser";
// import flash from "express-flash";
import flash from "connect-flash";
import { matrix, add } from 'mathjs';
import { Strategy } from "passport-local";
import passport from "passport";
import dotenv from 'dotenv';
import GoogleStrategy from "passport-google-oauth2";
import axios from "axios";
import { Strategy as GitHubStrategy } from 'passport-github2';



const app = express();
const port = 3000;
const saltRounds = 10;
dotenv.config();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use(cors());
app.use(express.json());


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 10,
    }
}));


// Use express-flash middleware
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

// Set up multer storage
const storage = multer.memoryStorage(); // Store the file in memory
const upload = multer({ storage: storage });

const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

db.connect();



// Database code ends here


const matrixSizeOptions = [3, 3, 4, 4, 4, 5, 5, 6, 6, 6];

app.set('view engine', 'ejs');
const isValidPosition = (row, col, grid) => {
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
};

const createGrid = (req, n) => {
    const initialGrid = Array.from({ length: req.session.matrixSize }, () =>
    Array(req.session.matrixSize).fill(0)
);

req.session.hintGrid = Array.from({ length: req.session.matrixSize }, () =>
Array(req.session.matrixSize).fill(0)
);
// console.log("hint board:",hintGrid);

for (let i = 0; i < req.session.level; i++) {
    let randomRow, randomCol;
    
    // Generate unique random values
    do {
        randomRow = Math.floor(Math.random() * req.session.matrixSize);
        randomCol = Math.floor(Math.random() * req.session.matrixSize);
    } while (initialGrid[randomRow][randomCol] !== 0); // Continue generating until an unoccupied cell is found
    
    toggleLights(req,initialGrid, randomRow, randomCol, n);
}

return initialGrid;
};

const toggleLights = (req,grid, row, col, n) => {
    // console.log(hintGrid)
    if (isValidPosition(row, col, grid)) {
        grid[row][col] = (grid[row][col] + 1) % n;
        req.session.hintGrid[row][col] = (req.session.hintGrid[row][col] + 1) % n;
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
    req.session.hint = true;
    req.session.matrixSize = req.session.matrixSize || 3;
    req.session.level = req.session.level || 1;
    req.session.board = createGrid(req, 2);
    let board = req.session.board;
    // console.log("Game board:", board);
    // console.log("Hint board: ", hintGrid);
    if (req.isAuthenticated()) {
        res.render("index.ejs", { board, level:req.session.level, matrixSize:req.session.matrixSize, name: req.user.name, profileImage: req.user.profile_image });
        // res.render("submit.ejs");
    } else {
        // res.redirect("/login");
        res.render("index.ejs", { board, level:req.session.level, matrixSize:req.session.matrixSize, name: "Login" });
    }
});

app.get(
    "/auth/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })
  );

app.get(
    "/auth/google/userProfile",
    passport.authenticate("google", {
      successRedirect: "/userProfile",
      failureRedirect: "/login",
    })
  );

app.get("/login", (req, res) => {
    
    if (req.isAuthenticated()) {
        res.redirect("/userProfile");
    } else {
        
        const errorMessage = req.flash('error')[0]; // Retrieve flash message
        
        if(req.flash('error')) {

            res.render('login', { message: errorMessage, page:'login', name: "Login" }); // Pass error message to your login view
        } else {
            
            res.render("login.ejs", { page: 'login', name: "Login" });
        }
    }
});

app.get('/signup', (req, res) => {
    db.query("DELETE FROM OTP WHERE expiration_time < current_timestamp");

    res.render('login.ejs', { page: 'signup', name: "Login" });
});

app.get("/team", (req, res) => {
    if(req.isAuthenticated()) {

        res.render("team.ejs", {name:req.user.name, profileImage: req.user.profile_image });
    } else {

        res.render("team.ejs", {name:"Login" });
    }
})

app.get('/levels', (req, res) => {
    const { id, CurrLevel } = req.query;

    if (id === '0' && req.session.level > 1) {
        req.session.level = parseInt(CurrLevel) - 1;
    } else if (id === '1' && req.session.level < 10) {
        req.session.level = parseInt(CurrLevel) + 1;
    } else {
        return res.send('<script>alert("Crossing the edge limit!");window.location.href = "/";</script>');
    }

    req.session.matrixSize = matrixSizeOptions[req.session.level - 1];
    res.redirect("/");
});

app.post("/api/toggleLights", (req, res) => {
    const { row, col} = req.body;
    let board = req.session.board ;
    // console.log(req.body);
    console.log(req.session.level,req.session.board);
    console.log("Current level: ", req.session.level);
    
    toggleLights(req,req.session.board, parseInt(row), parseInt(col), 2);
    console.log(req.session.board);

    const gameEnded = req.session.board.every(row => row.every(cell => !cell));

    if (req.isAuthenticated() && gameEnded && req.session.hint) {
        const { email } = req.user;
        const {clickCount } = req.body; // Assuming level and clickCount are available from the request body
    
        // Check if data already exists for the email and level
        db.query(
            "SELECT moves, targetMoves FROM UserProgress WHERE email = $1 AND level = $2",
            [email, req.session.level]
        )
        .then(result => {
            if (result.rows.length > 0) {
                // Data exists for the email and level, check if current moves is less than stored moves
                const storedMoves = result.rows[0].moves;
                const storedTargetMoves = result.rows[0].targetMoves;
    
                if (clickCount < storedMoves) {
                    // Update the existing record with the new moves if current moves is less
                    db.query(
                        "UPDATE UserProgress SET moves = $1 WHERE email = $2 AND level = $3",
                        [clickCount, email, req.session.level]
                    )
                    .then(() => {
                        console.log(`Updated moves for level ${req.session.level} and email ${email}`);
                    })
                    .catch(error => {
                        console.error("Error updating moves:", error);
                    });
                }
                // If current moves is not less than stored moves, do nothing (leave it as is)
            } else {
                // Data does not exist for the email and level, insert a new record
                db.query(
                    "INSERT INTO UserProgress (email, level, moves, targetMoves) VALUES ($1, $2, $3, $4)",
                    [email, req.session.level, clickCount, req.session.level]
                )
                .then(() => {
                    console.log(`Inserted new progress for level ${req.session.level} and email ${email}`);
                })
                .catch(error => {
                    console.error("Error inserting progress:", error);
                });
            }
        })
        .catch(error => {
            console.error("Error checking existing progress:", error);
        });
    }
    
    res.json({ board, gameEnded });
});

app.get("/api/getHint", (req, res) => {
    req.session.hint = false;
    console.log(req.session.level, req.session.hintGrid);
    // console.log("hint api is called successfully.");
    if(req.session.matrixSize == 5 ) {
        const resultMatrix5 = performMatrixOperations5(req.session.hintGrid);
        res.json({ hintGrid:resultMatrix5 });
    } else if (req.session.matrixSize == 4) {
        const resultMatrix4 = performMatrixOperations4(req.session.hintGrid);
        res.json({ hintGrid:resultMatrix4 });

    } else {
        res.json({hintGrid:req.session.hintGrid});

    }
})

app.get("/api/getHint3", (req, res) => {
    req.session.hint = false;
    // console.log("hint api is called successfully.");
    res.json({ hintGrid3:req.session.hintGrid3 });
})

app.post("/levels", (req, res) => {
    req.session.level = parseInt(req.body.level);
    req.session.matrixSize = matrixSizeOptions[req.session.level - 1];
    res.redirect('/');
});

// 3-state lights out Start here.

app.post("/state", (req, res) => {
    let state = req.body.level;

    if (state == 'Pro') {
        res.redirect("/state3");
    } else {
        res.redirect("/");
    }
});

const create3Grid = (req, matrixSize3, level3) => {
    const initialGrid = new Array(matrixSize3).fill().map(() =>
        new Array(matrixSize3).fill(0) // Initialize with color white (0)
    );

    // Hint grid for 3-state LightsOut game.
    req.session.hintGrid3 = Array.from({ length: matrixSize3 }, () =>
        Array(matrixSize3).fill(0)
    );

    // Keep track of button presses
    const buttonPresses = new Array(matrixSize3).fill().map(() =>
        new Array(matrixSize3).fill(0)
    );

    // Apply a series of random moves to make the grid solvable
    const moves = level3; // Adjust the number of moves as needed

    for (let i = 0; i < moves; i++) {
        let randomRow, randomCol;
        
        // Generate unique random values
        do {
            randomRow = Math.floor(Math.random() * matrixSize3);
            randomCol = Math.floor(Math.random() * matrixSize3);
        } while (buttonPresses[randomRow][randomCol] >= 2); // Continue generating until a cell is found with less than 2 button presses

        toggle3Lights(req, initialGrid, randomRow, randomCol);
        buttonPresses[randomRow][randomCol]++;
    }

    console.log(initialGrid);

    return initialGrid;
};


const toggle3Lights = (req,grid, row, col) => {
    // console.log("I am called.");

    // Ensure row and col are within bounds
    // console.log(grid);
    // console.log(grid.length, grid[0].length);
    if (isValidPosition(row, col, grid)) {
        // Toggle through the three colors (0, 1, 2)
        grid[row][col] = (grid[row][col] + 1) % 3;
        req.session.hintGrid3[row][col] = (req.session.hintGrid3[row][col] + 2) % 3;
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


// var board3;
// var matrixSize3 = 3;
// Home route
app.get("/state3", (req, res) => {
    req.session.hint = true;
    req.session.matrixSize3 = req.session.matrixSize3 || 3;
    req.session.level3 = req.session.level3 || 1;
    // const level = 2;
    req.session.board3 = create3Grid(req,req.session.matrixSize3, req.session.level3);
    req.session.sumOfValues = 0;
    if (req.session.hintGrid3) {
    
        // Iterate over each row in the 2D array
        for (let i = 0; i < req.session.hintGrid3.length; i++) {
            // Iterate over each element in the current row
            for (let j = 0; j < req.session.hintGrid3[i].length; j++) {
                // Add the current element to the sum
                req.session.sumOfValues += req.session.hintGrid3[i][j];
            }
        }
    }
    console.log(req.session.sumOfValues);
  
    if (req.isAuthenticated()) {
        res.render("3state.ejs", { board:req.session.board3,target:req.session.sumOfValues, level:req.session.level3, matrixSize:req.session.matrixSize3, name: req.user.name, profileImage:req.user.profile_image });
        // res.render("submit.ejs");
    } else {
        // res.redirect("/login");
        res.render("3state.ejs", { board:req.session.board3,target:req.session.sumOfValues, level:req.session.level3, matrixSize:req.session.matrixSize3, name: "Login" });
    }
    // res.render("3state.ejs", { board: board3, level: level3, matrixSize: matrixSize3 });
});


app.get('/levels3', (req, res) => {
    const { id, CurrLevel } = req.query;
    // console.log("Current level was: ", level3, id, CurrLevel);
    if (id === '0' && req.session.level3 > 1) {
        req.session.level3 = parseInt(CurrLevel) - 1;

    } else if (id === '1' && req.session.level3 < 10) {

        req.session.level3 = parseInt(CurrLevel) + 1;
    } else {
        return res.send('<script>alert("Crossing the edge limit!");window.location.href = "/state3";</script>');
    }

    req.session.matrixSize3 = matrixSizeOptions[req.session.level3 - 1];
    res.redirect("/state3");
});

// API endpoint to toggle lights based on user input
app.post("/api/toggle3Lights", (req, res) => {
    let { row, col } = req.body;
    row = parseInt(row), col = parseInt(col); // parsing string to number.
    // console.log(typeof (row));
    // Toggle lights on the server 
    toggle3Lights(req,req.session.board3, row, col);
    // console.log(board3);
    console.log(req.session.board3);
    // Check if the game has ended
    const gameEnded = req.session.board3.every(row => row.every(c => !c));
    // console.log(gameEnded);

    if (req.isAuthenticated() && gameEnded && req.session.hint) {
        const { email } = req.user;
        const {clickCount } = req.body; // Assuming level and clickCount are available from the request body
    
        // Check if data already exists for the email and level
        db.query(
            "SELECT moves, targetMoves FROM UserProgress3 WHERE email = $1 AND level = $2",
            [email, req.session.level3]
        )
        .then(result => {
            if (result.rows.length > 0) {
                // Data exists for the email and level, check if current moves is less than stored moves
                const storedMoves = result.rows[0].moves;
                const storedTargetMoves = result.rows[0].targetMoves;
    
                if (clickCount < storedMoves) {
                    // Update the existing record with the new moves if current moves is less
                    db.query(
                        "UPDATE UserProgress3 SET moves = $1 WHERE email = $2 AND level = $3",
                        [clickCount, email, req.session.level3]
                    )
                    .then(() => {
                        console.log(`Updated moves for level ${req.session.level3} and email ${email}`);
                    })
                    .catch(error => {
                        console.error("Error updating moves:", error);
                    });
                }
                // If current moves is not less than stored moves, do nothing (leave it as is)
            } else {
                // Data does not exist for the email and level, insert a new record
                db.query(
                    "INSERT INTO UserProgress3 (email, level, moves, targetMoves) VALUES ($1, $2, $3, $4)",
                    [email, req.session.level3, clickCount, req.session.sumOfValues]
                )
                .then(() => {
                    console.log(`Inserted new progress for level ${req.session.level3} and email ${email}`);
                })
                .catch(error => {
                    console.error("Error inserting progress:", error);
                });
            }
        })
        .catch(error => {
            console.error("Error checking existing progress:", error);
        });
    }

    res.json({ board3:req.session.board3, gameEnded });
});

// var level3 = 1;
app.post("/levels3", (req, res) => {
    // console.log(req.body);
    req.session.level3 = parseInt(req.body.level);

    req.session.matrixSize3 = matrixSizeOptions[req.session.level3 - 1];
    res.redirect('/state3');
})

// 3-state lights out game ends here.


// OTP verification part starts here 

// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'lightsout1811@gmail.com',
        pass: process.env.E_PASSWORD
    }
});


// Endpoint for sending OTP and storing in temporary table
app.post('/signup', (req, res) => {
    const { name, email, password } = req.body;

    // Check if user already exists
    db.query("SELECT * FROM Users WHERE email = $1", [email])
        .then(result => {
            if (result.rows.length > 0) {
                // User already exists, handle accordingly (e.g., show error message)
                res.render("login.ejs", { page: 'login', message: 'user already exists!', name: "Login" });
            } else {
                // User does not exist, generate OTP and continue with signup process
                const OTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: true });
                const expirationTime = new Date();
                expirationTime.setMinutes(expirationTime.getMinutes() + 3); // Set expiration time to 3 minute from now
                expirationTime.toUTCString();
                // console.log(expirationTime);

                const mailOptions = {
                    from: 'lightsout1811@gmail.com',
                    to: email,
                    subject: '🌟 Lights-Out Game: Email Verification OTP 🌟',
                    html: `
                    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                        <h2 style="color: #007bff; text-align: center;">Welcome to the Lights-Out Game!</h2>
                        <p>Dear ${name},</p>
                        <p>Thank you for joining our exciting Lights-Out game project! 🎉 To ensure the security of your account and protect your gaming experience, we kindly ask you to verify your email address.</p>
                        <p style="font-weight: bold;">Your One-Time Password (OTP) for email verification is:</p>
                        <p style="font-size: 24px; padding: 10px 0; text-align: center; background-color: #f0f0f0; border-radius: 5px;">${OTP}</p>
                        <p>Please enter this OTP within the game interface to verify your email address and unlock the full potential of the Lights-Out experience.</p>
                        <p>If you did not request this verification, please disregard this email.</p>
                        <p>Thank you for being part of our gaming community!</p>
                        <p style="margin-top: 30px;">Best regards,</p>
                        <p>The Lights-Out Game Team</p>
                    </div>
                `
                };

                
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending OTP:', error);
                        res.render("login", { page: "OTP", message: "Error sending OTP" , name: "Login"});
                        // return res.status(500).send('Error sending OTP');
                    } else {
                        // console.log('Email sent:', info.response);
                        const partial = hideEmailPhone(email);
                        // console.log(partial); // Output: e*****@example.com
                        // Store email, OTP, and expiration time in temporary table OTP
                        db.query("INSERT INTO OTP (email, otp, expiration_time) VALUES ($1, $2, $3)", [email, OTP, expirationTime]);
                        res.render("login", { page: "OTP", name: name, email: email, password: password, partialEmail: partial });
                    }
                });
            }
        })
        .catch(error => {
            console.error('Error checking user existence:', error);
            return res.status(500).send('Error checking user existence');
        });
});

// Assuming 'db' is your database connection

app.post('/verifyOTP', async (req, res) => {
    const { name, email, password, enteredOTP } = req.body;
    const partial = hideEmailPhone(email);

    if (!email || !enteredOTP) {
        return res.status(400).send('Invalid OTP data');
    }

    try {
        // Fetch stored OTP and expiration time corresponding to the email
        const otpQuery = {
            text: 'SELECT otp, expiration_time FROM OTP WHERE email = $1',
            values: [email],
        };

        const result = await db.query(otpQuery);

        if (result.rows.length === 0) {
            return res.status(404).send('Email not found or OTP expired');
        }

        const storedOTP = result.rows[0].otp;
        const expirationTime = new Date(result.rows[0].expiration_time);

        // Check if OTP is expired
        if (expirationTime <= new Date()) {
            return res.status(400).send('OTP expired');
        }

        if (enteredOTP === storedOTP) {
            // OTP is valid, move user data to permanent Users table
            bcrypt.hash(password, saltRounds, async (err, hashedPassword) => {
                if (err) {
                    console.error('Error hashing password:', err);
                    return res.status(500).send('Error hashing password');
                }

                const insertUserQuery = {
                    text: 'INSERT INTO Users (name, email, password) VALUES ($1, $2, $3)',
                    values: [name, email, hashedPassword],
                };

                try {
                    

                    // Delete email and OTP from temporary table OTP
                    const deleteOTPQuery = {
                        text: 'DELETE FROM OTP WHERE email = $1',
                        values: [email],
                    };

                    await db.query(deleteOTPQuery);
                    // Authenticate user and set session/cookie
                    req.login({ name, email, password },async (err) => {
                        if (err) {
                            console.error('Error logging in:', err);
                            return res.status(500).send('Error logging in');
                        }
                        
                        await db.query(insertUserQuery);
                        // return res.status(200).send('OTP verified and user registered successfully');
                        res.redirect("/");
                    });
                } catch (error) {
                    console.error('Error inserting user:', error);
                    return res.status(500).send('Error inserting user');
                }
            });
        } else {
            // Wrong OTP handling (redirect or render login with error message)
            res.render('login', { page: 'OTP', name, email, password, partialEmail: partial, message: "OTP entered is wrong! Try again." });
        }
    } catch (error) {
        console.error('Error fetching OTP:', error);
        // return res.status(500).send('Error fetching OTP');
            res.render('login', { page: 'OTP', name, email, password, partialEmail: partial, message: "Error fetching OTP" });
    }
});

// section for resetting password starts here

app.get('/forgot-password', (req, res) => {
    res.render("forgetPassword", { page: 'enterEmail', name: "Login"  })
})


app.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    // Check if the email already exists in the Users table
    db.query("SELECT * FROM Users WHERE email = $1", [email])
        .then(result => {
            if (result.rows.length == 0) {
                // User don't exists, redirect to signup page with a message
                res.render("login.ejs", { page: 'signup', userExists: 'false',name: "Login" });
            } else {
                // User does not exist, generate OTP and continue with the process
                const OTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: true });
                const expirationTime = new Date();
                expirationTime.setMinutes(expirationTime.getMinutes() + 3); // Set expiration time to 3 minutes from now
                expirationTime.toUTCString();

                const mailOptions = {
                    from: 'lightsout1811@gmail.com',
                    to: email,
                    subject: '🌟 Lights-Out Game: Forgot Password OTP 🌟',
                    html: `
              <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                  <h2 style="color: #007bff; text-align: center;">Forgot Password OTP</h2>
                  <p>Your One-Time Password (OTP) for password reset is:</p>
                  <p style="font-size: 24px; padding: 10px 0; text-align: center; background-color: #f0f0f0; border-radius: 5px;">${OTP}</p>
                  <p>Please use this OTP to reset your password.</p>
                  <p>If you did not request this, please ignore this email.</p>
              </div>
          `
                };

                // Store email, OTP, and expiration time in a temporary table (Assuming you have a table named OTP)
                db.query("INSERT INTO OTP (email, otp, expiration_time) VALUES ($1, $2, $3)", [email, OTP, expirationTime])
                    .then(() => {
                        // Send the OTP to the user's email
                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                console.error('Error sending OTP:', error);
                                // return res.status(500).send('Error sending OTP');
                                res.render("forgetPassword", { page: "enterEmail", email: email, message: "Error sending OTP! Try again." , name: "Login" });
                            } else {
                                // console.log('Email sent:', info.response);
                                // Render the forgetPassword page with the page set to "enterOTP"
                                res.render("forgetPassword", { page: "enterOTP", email: email, name: "Login" });
                            }
                        });
                    })
                    .catch(error => {
                        console.error('Error storing OTP in the database:', error);
                        // return res.status(500).send('Error storing OTP');
                        res.render("forgetPassword", { page: "enterEmail", email: email, message: "Error storing OTP! Try again." , name: "Login" });
                    });
            }
        })
        .catch(error => {
            console.error('Error checking user existence:', error);
            // return res.status(500).send('Error checking user existence');
            res.render("forgetPassword", { page: "enterEmail", email: email, message: "Error checking user existence! Try again." , name: "Login" });
        });
});

app.post('/enter-otp', (req, res) => {
    const { email, enteredOTP } = req.body;
    console.log(email,enteredOTP);
    // console.log("EnteredOTp",req.body);

    // Fetch stored OTP and expiration time corresponding to the email
    const otpQuery = {
        text: 'SELECT otp, expiration_time FROM OTP WHERE email = $1',
        values: [email],
    };

    db.query(otpQuery)
        .then(result => {
            if (result.rows.length === 0) {
                res.render("forgetPassword", { page: 'enterEmail', message: "Email not found!", name: "Login" });
            }

            const storedOTP = result.rows[0].otp;
            // console.log("StoredOTP",storedOTP);
            const expirationTime = new Date(result.rows[0].expiration_time);

            // Check if OTP is expired
            if (expirationTime <= new Date().toUTCString()) {
                res.render("forgetPassword", { page: 'enterEmail', message: "OTP is expired!" , name: "Login"});
            }
console.log("I am above otp matching.");
if (enteredOTP === storedOTP) {
                console.log("I am above otp matching.");
                // OTP is valid, render resetPassword page
                res.render("forgetPassword", { page: "resetPassword", email: email, name: "Login" });

                //Delete otp from temporary table.
                db.query("DELETE FROM otp WHERE email = $1", [email]); 
            } else {
                // Invalid OTP, render enterOTP page with error message
                res.render("forgetPassword", { page: "enterOTP", message: "Invalid OTP", email: email, name: "Login" });
            }
        })
        .catch(error => {
            console.error('Error fetching OTP:', error);
            // return res.status(500).send('Error fetching OTP');
            res.render("forgetPassword", { page: "enterOTP", message: "Error fetching OTP! Try again.", email: email, name: "Login" });
        });
});

app.post("/resend-otp", (req, res) => {
    const { email } = req.body;

    // Check if OTP already exists for the email
    db.query("SELECT * FROM OTP WHERE email = $1", [email])
        .then(result => {
            if (result.rows.length > 0) {
                // OTP already exists, delete the existing row
                db.query("DELETE FROM OTP WHERE email = $1", [email])
                    .then(() => {
                        // Proceed with generating a new OTP and sending it
                        const OTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: true });
                        const expirationTime = new Date();
                        expirationTime.setMinutes(expirationTime.getMinutes() + 3); // Set expiration time to 3 minutes from now
                        expirationTime.toUTCString();
                        // Store the new OTP in the OTP table
                        db.query("INSERT INTO OTP (email, otp, expiration_time) VALUES ($1, $2, $3)", [email, OTP, expirationTime])
                            .then(() => {
                                // Send the new OTP to the user
                                const mailOptions = {
                                    from: 'lightsout1811@gmail.com',
                                    to: email,
                                    subject: '🌟 Lights-Out Game: Email Verification OTP 🌟',
                                    html: `
                                        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                                            <h2 style="color: #007bff; text-align: center;">Welcome back to the Lights-Out Game!</h2>
                                            <p>Dear user,</p>
                                            <p>Your request for a new OTP has been received. Please use the following OTP to verify your email address:</p>
                                            <p style="font-size: 24px; padding: 10px 0; text-align: center; background-color: #f0f0f0; border-radius: 5px;">${OTP}</p>
                                            <p>If you did not request this OTP, please disregard this email.</p>
                                            <p>Thank you for being part of our gaming community!</p>
                                            <p style="margin-top: 30px;">Best regards,</p>
                                            <p>The Lights-Out Game Team</p>
                                        </div>
                                    `
                                };

                                transporter.sendMail(mailOptions, (error, info) => {
                                    if (error) {
                                        console.error('Error sending OTP:', error);
                                        // return res.status(500).send('Error sending OTP');
                                        res.render("forgetPassword", { page: "enterEmail", message: "Error sending OTP! Try again." , name: "Login" });
                                    } else {
                                        console.log('Email sent:', info.response);
                                        // res.send('OTP has been resent successfully');
                                        res.render("forgetPassword", { page: "enterOTP", email: email, name: "Login" });
                                    }
                                });
                            })
                            .catch(error => {
                                console.error('Error storing new OTP:', error);

                                // return res.status(500).send('Error storing new OTP');
                                res.render("forgetPassword", { page: "enterEmail", message: "Error storing new OTP! Try again." , name: "Login" });
                            });
                    })
                    .catch(error => {
                        console.error('Error deleting existing OTP:', error);
                        return res.status(500).send('Error deleting existing OTP');
                    });
            } else {
                // No existing OTP found for the email
                res.status(404).send('No existing OTP found for the provided email');
            }
        })
        .catch(error => {
            console.error('Error checking existing OTP:', error);
            return res.status(500).send('Error checking existing OTP');
        });
});


app.post('/reset-password', (req, res) => {
    const { email, password, confirmPassword } = req.body;

    // Check if password and confirmPassword match
    if (password !== confirmPassword) {
        return res.status(400).send('Passwords do not match');
    }

    // Hash the password
    bcrypt.hash(password, saltRounds, (err, hashedPassword) => {
        if (err) {
            console.error('Error hashing password:', err);
            return res.status(500).send('Error hashing password');
        }

        // Update the password in the Users table
        const updatePasswordQuery = {
            text: 'UPDATE Users SET password = $1 WHERE email = $2',
            values: [hashedPassword, email],
        };

        db.query(updatePasswordQuery)
            .then(() => {
                // Password updated successfully
                res.status(200).send('Password updated successfully');
            })
            .catch(error => {
                console.error('Error updating password:', error);
                res.status(500).send('Error updating password');
            });
    });
});

app.get("/userProfile", (req, res) => {
    if (req.isAuthenticated()) {
        const userEmail = req.user.email;

        // Fetch user profile data
        const queryUserProfile = {
            text: 'SELECT name, email, profile_image, id FROM public.users WHERE email = $1',
            values: [userEmail]
        };

        // Fetch user progress data for 2-state
        const query2State = {
            text: 'SELECT level, moves, targetmoves FROM userprogress WHERE email = $1',
            values: [userEmail]
        };

        // Fetch user progress data for 3-state
        const query3State = {
            text: 'SELECT level, moves, targetmoves FROM userprogress3 WHERE email = $1',
            values: [userEmail]
        };

        const fetchUserData = async () => {
            try {
                const resultUserProfile = await db.query(queryUserProfile);
                const result2State = await db.query(query2State);
                const result3State = await db.query(query3State);

                const userProfile = resultUserProfile.rows[0];
                console.log(userProfile);
                const progress2State = result2State.rows;
                const progress3State = result3State.rows;

                // Calculate overall accuracy across all levels
                const allProgress = [...progress2State, ...progress3State];
                const totalLevels = allProgress.length;
                let totalTargetMoves = 0;
                let totalMoves = 0;

                allProgress.forEach(item => {
                    totalTargetMoves += item.targetmoves;
                    totalMoves += item.moves;
                });

                const overallAccuracy = totalMoves > 0 ? ((totalTargetMoves / totalMoves) * 100).toFixed(2) : 0;
console.log(userProfile.profile_image);
                res.render("userProfile", {
                    name: userProfile.name,
                    email: userProfile.email,
                    profileImage: userProfile.profile_image,
                    progress2State: progress2State,
                    userID: userProfile.id,
                    progress3State: progress3State,
                    overallAccuracy: overallAccuracy
                });
            } catch (err) {
                console.error("Error fetching user data:", err);
                res.status(500).send("Internal Server Error");
            }
        };

        fetchUserData();
    } else {
        res.redirect("/login");
    }
});

// app.get("/edit-profile", (req,res)=> {

//     // console.log(req.user);
//     if(req.isAuthenticated()) {

//         res.render("edit-profile",{name: req.user.name, email: req.user.email, id:req.user.id, profileImage: req.user.profile_image});
//     } else {

//         res.render("login",{name:"Login",page:"login"});
//     }
// });

// Assuming you have a route for updating the user's name
app.post('/update-name', async (req, res) => {
    const { newName } = req.body;

    try {
        // Update user's name in the database
        const queryUserProfile = {
            text: 'UPDATE public.users SET name = $1 WHERE email = $2',
            values: [newName, req.user.email]
        };

        // Execute the SQL query using the pool
        const result = await db.query(queryUserProfile);

        if (result.rowCount > 0) {
            // Successfully updated the user's name
            res.redirect('/userProfile');
        } else {
            // User with the specified email not found
            res.status(404).json({ error: 'User not found or name not updated' });
        }
    } catch (error) {
        // Handle database query error
        console.error('Error updating user name:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



app.post('/update-profile-picture/:id', upload.single('profileImage'), async (req, res) => {
    const userID = req.params.id;
    const profileImageDataBuffer = req.file ? req.file.buffer : null;
    console.log("update profile picture",req.file.buffer);

    try {
        // Update profile picture in the Users table
        const query = `
            UPDATE public.users
            SET profile_image = $1
            WHERE id = $2
            RETURNING *;
        `;
        
        const result = await db.query(query, [profileImageDataBuffer, userID]);

        if (result.rows.length > 0) {
            // Profile picture updated successfully
            res.redirect("/userProfile");
        } else {
            // User not found
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating profile picture:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});



// app.post('/update-profile/:id', upload.single('profileImage'), async (req, res) => {
//     const userID = req.params.id;
//     const { name, email, password } = req.body;
//     console.log(password.length);

//     try {
//         // Construct the SQL query to update user's profile
//         let query;
//         let queryValues;

//         if (password.length>0) {
//             // Update profile including password
//             query = `
//                 UPDATE public.users
//                 SET name = $1, email = $2, password = $3
//                 WHERE id = $4
//                 RETURNING *;
//             `;
//             queryValues = [name, email, password, userID];
//         } else {
//             // Update profile excluding password
//             query = `
//                 UPDATE public.users
//                 SET name = $1, email = $2
//                 WHERE id = $3
//                 RETURNING *;
//             `;
//             queryValues = [name, email, userID];
//         }
        
//         // Execute the SQL query with parameters
//         const result = await db.query(query, queryValues);

//         // Send back the updated user data
//         res.json({ message: 'Profile updated successfully', user: result.rows[0] });
//     } catch (error) {
//         console.error('Error updating profile:', error);
//         res.status(500).json({ error: 'Internal Server Error' });
//     }
// });



// Add route to handle profile updates
// app.post('/edit-profile', (req, res) => {
//     const { name } = req.body;
//     const email = req.session.user.email; // Assuming you're using session for authentication

//     // Update the name in the Users table
//     const updateNameQuery = {
//         text: 'UPDATE Users SET name = $1 WHERE email = $2',
//         values: [name, email],
//     };

//     db.query(updateNameQuery)
//         .then(() => {
//             // Name updated successfully, render userProfile with updated name
//             res.render("userProfile", { name: name, email: email });
//         })
//         .catch(error => {
//             console.error('Error updating name:', error);
//             res.status(500).send('Error updating name');
//         });
// });


app.get("/leaderboard", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            // Query to calculate accuracy for both 2-state and 3-state games
            const accuracyQuery = {
                text: `WITH all_progress AS (
                            SELECT email, 
                                   SUM(moves) AS total_moves, 
                                   SUM(targetmoves) AS total_target_moves,
                                   COUNT(DISTINCT level) AS total_levels_played
                            FROM (
                                SELECT email, moves, targetmoves, level FROM userprogress
                                UNION ALL
                                SELECT email, moves, targetmoves, level FROM userprogress3
                            ) AS combined_progress
                            GROUP BY email
                        )
                        SELECT users.name, 
                               users.profile_image, 
                               ((SUM(total_target_moves) / SUM(total_moves)) * 100)::numeric AS accuracy,
                               SUM(total_levels_played) AS total_levels_played
                        FROM all_progress
                        INNER JOIN users ON all_progress.email = users.email
                        GROUP BY users.name, users.profile_image
                        ORDER BY accuracy DESC, total_levels_played DESC
                        LIMIT 5`
            };

            const accuracyResult = await db.query(accuracyQuery);
            const topPlayers = accuracyResult.rows;
            
            res.render("leaderboard", {
                profileImage: req.user.profile_image,
                name: req.user.name,
                topPlayers: topPlayers
            });
        } catch (err) {
            console.error("Error fetching leaderboard data:", err);
            res.status(500).send("Internal Server Error");
        }
    } else {
        res.redirect("/login");
    }
});

// Define Passport Local Strategy
passport.use('local', new Strategy({
    usernameField: 'email',
    passwordField: 'password',
    passReqToCallback: true // Allow passing req to the callback
}, async (req, email, password, cb) => {
    try {
        const result = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password;

            bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                if (err) {
                    return cb(err); // Return error to the callback
                } else {
                    if (valid) {
                        return cb(null, user); // Return user to indicate successful authentication
                    } else {
                        req.flash('error', 'Incorrect password');
                        // console.log("password is incorrect.");
                        // console.log("password is: ",req.flash('error')[0]);
                        return cb(null, false); // Indicate failed authentication
                    }
                }
            });
        } else {
            req.flash('error', 'User not found');
            return cb(null, false); // Indicate failed authentication
        }
    } catch (err) {
        return cb(err); // Return error to the callback
    }
}));

passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "https://lightsout-w861.onrender.com/auth/google/userProfile",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
      },
      async (accessToken, refreshToken, profile, cb) => {
        try {
            const pictureUrl = profile.photos[0].value && profile.photos[0].value.length > 0 ? profile.photos[0].value : null;

    let pictureBuffer = null;

    if (pictureUrl) {
      // Fetch the image and convert to buffer
      const response = await axios.get(pictureUrl, { responseType: 'arraybuffer' });
      if (response.status === 200) {
        pictureBuffer = Buffer.from(response.data, 'binary');
      }
    }
          console.log(profile);
          const result = await db.query("SELECT * FROM users WHERE email = $1", [
            profile.email,
          ]);
          if (result.rows.length === 0) {
            // If user doesn't exist, insert the user into the database with profile image data
            const newUser = await db.query(
              "INSERT INTO users (name, email, password, profile_image) VALUES ($1, $2, $3, $4) RETURNING *",
              [profile.displayName, profile.emails[0].value, "google", pictureBuffer]
            );
            return cb(null, newUser.rows[0]);
          } else {
            return cb(null, result.rows[0]);
          }
        } catch (err) {
          return cb(err);
        }
      }
    )
  );
  // GitHub authentication route
app.get(
    "/auth/github",
    passport.authenticate("github", {
      scope: ["user:email"],
    })
  );
  
  // Redirect route after successful GitHub authentication
  app.get(
    "/auth/github/userProfile",
    passport.authenticate("github", {
      successRedirect: "/userProfile",
      failureRedirect: "/login",
    })
  );
  
  // GitHub strategy configuration
  passport.use(
    "github",
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: "https://lightsout-w861.onrender.com/auth/github/userProfile",
      },
      async (accessToken, refreshToken, profile, cb) => {
        
        try {
          const avatarUrl = profile.photos[0].value;
          let avatarBuffer = null;
  
          if (avatarUrl) {
            // Fetch the image and convert to buffer
            const response = await axios.get(avatarUrl, { responseType: 'arraybuffer' });
            if (response.status === 200) {
              avatarBuffer = Buffer.from(response.data, 'binary');
            }
          }
  
          const result = await db.query("SELECT * FROM users WHERE email = $1", [profile.username]);
          if (result.rows.length === 0) {
            // If user doesn't exist, insert the user into the database with profile image data
            const newUser = await db.query(
              "INSERT INTO users (name, email, password, profile_image) VALUES ($1, $2, $3, $4) RETURNING *",
              [profile.displayName, profile.username, "github", avatarBuffer]
            );
            return cb(null, newUser.rows[0]);
          } else {
            return cb(null, result.rows[0]);
          }
        } catch (err) {
          return cb(err);
        }
      }
    )
  );
  
// Serialize and deserialize user
passport.serializeUser((user, cb) => {
    cb(null, user.email); // Assuming 'id' is a unique identifier for the user
});

passport.deserializeUser(async (email, cb) => {
    try {
        const result = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            cb(null, user);
        } else {
            cb(new Error('User not found'));
        }
    } catch (err) {
        cb(err);
    }
});

// Route for user login using Passport.js
app.post('/login', passport.authenticate('local', {
    successRedirect: '/userProfile',
    failureRedirect: '/login',
    failureFlash: true // Enable flash messages for failure redirects
}));

// Logout route
app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});


app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


// 5*5 matrix minimal solution function starts here.
function performMatrixOperations5(matrix01) {
  const matrix02 = [
    [0, 1, 1, 1, 0],
    [1, 0, 1, 0, 1],
    [1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1],
    [0, 1, 1, 1, 0],
  ];

  const matrix03 = [
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
  ];

  const matrix1 = matrix(matrix01);

  const resultMatrix1 = add(matrix1, matrix(matrix02));
  const resultMatrix2 = add(matrix1, matrix(matrix03));
  const resultMatrix3 = add(matrix1, matrix(matrix02), matrix(matrix03));

  const modifiedResult1 = resultMatrix1.toArray().map(row => row.map(value => value % 2));
  const modifiedResult2 = resultMatrix2.toArray().map(row => row.map(value => value % 2));
  const modifiedResult3 = resultMatrix3.toArray().map(row => row.map(value => value % 2));

  const countOnesMatrix01 = countOnesInArray(matrix01);
  const countOnesResult1 = countOnesInArray(modifiedResult1);
  const countOnesResult2 = countOnesInArray(modifiedResult2); 
  const countOnesResult3 = countOnesInArray(modifiedResult3);

  const leastOnesCount = Math.min(countOnesMatrix01, countOnesResult1, countOnesResult2, countOnesResult3);

  if (countOnesMatrix01 === leastOnesCount) {
    return matrix01;
  } else if (countOnesResult1 === leastOnesCount) {
    return modifiedResult1;
  } else if (countOnesResult2 === leastOnesCount) {
    return modifiedResult2;
  } else {
    return modifiedResult3;
  }
}
// 5*5 matrix minimal solution function ends here.

function countOnesInArray(array) {
  let count = 0;

  for (let i = 0; i < array.length; i++) {
    for (let j = 0; j < array[i].length; j++) {
      if (array[i][j] === 1) {
        count++;
      }
    }
  }

  return count;
}

// 4*4 matrix minimal solution function starts here.
function performMatrixOperations4(matrix1) {
    // Define matrices as 2D arrays
    const matrix02 = [
          [0,1,1,1],
          [1,0,1,0],
          [1,1,0,0],
          [1,0,0,0],
        ];
  
        const matrix03 = [
          [1,1,0,1],
          [0,0,0,1],
          [1,1,1,0],
          [0,1,0,0],
        ];
  
        const matrix04 = [
          [1,0,1,1],
          [1,0,0,0],
          [0,1,1,1],
          [0,0,1,0],
        ];
  
        const matrix05 = [
          [1,1,1,0],
          [0,1,0,1],
          [0,0,1,1],
          [0,0,0,1],
    ];
  
    // Convert input matrix to mathjs matrix
    const matrix01 = matrix(matrix1);
  
    // Add matrices
    const resultMatrix1 = add(matrix01, matrix(matrix02));
    const resultMatrix2 = add(matrix01, matrix(matrix03));
    const resultMatrix3 = add(matrix01, matrix(matrix04));
    const resultMatrix4 = add(matrix01, matrix(matrix05));
    
    const resultMatrix5 = add(matrix01, matrix(matrix02), matrix(matrix03));
    const resultMatrix6 = add(matrix01, matrix(matrix02), matrix(matrix04));
    const resultMatrix7 = add(matrix01, matrix(matrix02), matrix(matrix05));
    const resultMatrix8 = add(matrix01, matrix(matrix03), matrix(matrix04));
    const resultMatrix9 = add(matrix01, matrix(matrix03), matrix(matrix05));
    const resultMatrix10 = add(matrix01, matrix(matrix04), matrix(matrix05));
    
    const resultMatrix11 = add(matrix01, matrix(matrix02), matrix(matrix03), matrix(matrix04));
    const resultMatrix12 = add(matrix01, matrix(matrix03), matrix(matrix04), matrix(matrix05));
    const resultMatrix13 = add(matrix01, matrix(matrix04), matrix(matrix05), matrix(matrix02));
    const resultMatrix14 = add(matrix01, matrix(matrix05), matrix(matrix02), matrix(matrix03));
    
    const resultMatrix15 = add(matrix01, matrix(matrix02), matrix(matrix03), matrix(matrix04), matrix(matrix05));
  
    // Modify result matrices by taking modulo 2
    const modifiedResult1 = resultMatrix1.toArray().map(row => row.map(value => value % 2));
    const modifiedResult2 = resultMatrix2.toArray().map(row => row.map(value => value % 2));
    const modifiedResult3 = resultMatrix3.toArray().map(row => row.map(value => value % 2));
    
    const modifiedResult4 = resultMatrix4.toArray().map(row => row.map(value => value % 2));
    const modifiedResult5 = resultMatrix5.toArray().map(row => row.map(value => value % 2));
    const modifiedResult6 = resultMatrix6.toArray().map(row => row.map(value => value % 2));
    
    const modifiedResult7 = resultMatrix7.toArray().map(row => row.map(value => value % 2));
    const modifiedResult8 = resultMatrix8.toArray().map(row => row.map(value => value % 2));
    const modifiedResult9 = resultMatrix9.toArray().map(row => row.map(value => value % 2));
    
    const modifiedResult10 = resultMatrix10.toArray().map(row => row.map(value => value % 2));
    const modifiedResult11 = resultMatrix11.toArray().map(row => row.map(value => value % 2));
    const modifiedResult12 = resultMatrix12.toArray().map(row => row.map(value => value % 2));
    
    const modifiedResult13 = resultMatrix13.toArray().map(row => row.map(value => value % 2));
    const modifiedResult14 = resultMatrix14.toArray().map(row => row.map(value => value % 2));
    const modifiedResult15 = resultMatrix15.toArray().map(row => row.map(value => value % 2));
  
    // Count number of '1's in each matrix
    const countOnesMatrix01 = countOnesInArray(matrix1);
    
    const countOnesResult1 = countOnesInArray(modifiedResult1);
    const countOnesResult2 = countOnesInArray(modifiedResult2);
    const countOnesResult3 = countOnesInArray(modifiedResult3);
    
    const countOnesResult4 = countOnesInArray(modifiedResult4);
    const countOnesResult5 = countOnesInArray(modifiedResult5);
    const countOnesResult6 = countOnesInArray(modifiedResult6);
    
    const countOnesResult7 = countOnesInArray(modifiedResult7);
    const countOnesResult8 = countOnesInArray(modifiedResult8);
    const countOnesResult9 = countOnesInArray(modifiedResult9);
    
    const countOnesResult10 = countOnesInArray(modifiedResult10);
    const countOnesResult11 = countOnesInArray(modifiedResult11);
    const countOnesResult12 = countOnesInArray(modifiedResult12);
    
    const countOnesResult13 = countOnesInArray(modifiedResult13);
    const countOnesResult14 = countOnesInArray(modifiedResult14);
    const countOnesResult15 = countOnesInArray(modifiedResult15);
  
    // Determine the matrix with the least number of '1's
    const leastOnesCount = Math.min(countOnesMatrix01, countOnesResult1, countOnesResult2, countOnesResult3, countOnesResult4, countOnesResult5, countOnesResult6, countOnesResult7, countOnesResult8, countOnesResult9, countOnesResult10, countOnesResult11, countOnesResult12, countOnesResult13, countOnesResult14, countOnesResult15);
  
    // Return the matrix (2D array) with the least number of '1's
    if (countOnesMatrix01 === leastOnesCount) {
      return matrix1;
    } else if (countOnesResult1 === leastOnesCount) {
      return modifiedResult1;
    } else if (countOnesResult2 === leastOnesCount) {
      return modifiedResult2;
    } else if (countOnesResult3 === leastOnesCount) {
      return modifiedResult3;
    } else if (countOnesResult4 === leastOnesCount) {
      return modifiedResult4;
    } else if (countOnesResult5 === leastOnesCount) {
      return modifiedResult5;
    } else if (countOnesResult6 === leastOnesCount) {
      return modifiedResult6;
    } else if (countOnesResult7 === leastOnesCount) {
      return modifiedResult7;
    } else if (countOnesResult8 === leastOnesCount) {
      return modifiedResult8;
    } else if (countOnesResult9 === leastOnesCount) {
      return modifiedResult9;
    } else if (countOnesResult10 === leastOnesCount) {
      return modifiedResult10;
    } else if (countOnesResult11 === leastOnesCount) {
      return modifiedResult11;
    } else if (countOnesResult12 === leastOnesCount) {
      return modifiedResult12;
    } else if (countOnesResult13 === leastOnesCount) {
      return modifiedResult13;
    } else if (countOnesResult14 === leastOnesCount) {
      return modifiedResult14;
    } else {
      return modifiedResult15;
    }
  }

// 4*4 matrix minimal solution function ends here.

// console.log("Matrix with the least number of '1's:");
// console.log(resultMatrix);
