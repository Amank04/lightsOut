import express from "express";
import bodyParser from "body-parser";
import env from "dotenv";
import cors from "cors";
import nodemailer from 'nodemailer';
import otpGenerator from 'otp-generator';
import hideEmailPhone from 'partially-hide-email-phone';
import pg from "pg";
import bcrypt from 'bcrypt';
import session from "express-session";
import cookieParser from "cookie-parser";
import { Strategy } from "passport-local";
import passport from "passport";
import dotenv from 'dotenv';

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
        maxAge: 1000 * 60 * 60 * 24,
    }
}));


app.use(passport.initialize());
app.use(passport.session());

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
let board, hintGrid, hintGrid3;
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

    hintGrid = Array.from({ length: matrixSize }, () =>
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
    board = createGrid(matrixSize, level, 2);
    // console.log("Game board:", board);
    // console.log("Hint board: ", hintGrid);
    if (req.isAuthenticated()) {
        res.render("index.ejs", { board, level, matrixSize, name: req.user.name });
        // res.render("submit.ejs");
    } else {
        // res.redirect("/login");
        res.render("index.ejs", { board, level, matrixSize, name: "Login" });
    }
});

app.get("/login", (req, res) => {

    if (req.isAuthenticated()) {
        res.redirect("/userProfile");
    } else {
        // res.redirect("/login");
        res.render("login.ejs", { page: 'login' });
    }
});

app.get('/signup', (req, res) => {
    res.render('login.ejs', { page: 'signup' });
});

app.get("/team", (req, res) => {
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
    const { row, col} = req.body;
    // console.log(req.body);
    console.log("Current level: ", level);
    toggleLights(board, parseInt(row), parseInt(col), 2);
    console.log(board);

    const gameEnded = board.every(row => row.every(cell => !cell));

    if (req.isAuthenticated() && gameEnded) {
        const { email } = req.user;
        const {clickCount } = req.body; // Assuming level and clickCount are available from the request body
    
        // Check if data already exists for the email and level
        db.query(
            "SELECT moves, targetMoves FROM UserProgress WHERE email = $1 AND level = $2",
            [email, level]
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
                        [clickCount, email, level]
                    )
                    .then(() => {
                        console.log(`Updated moves for level ${level} and email ${email}`);
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
                    [email, level, clickCount, level]
                )
                .then(() => {
                    console.log(`Inserted new progress for level ${level} and email ${email}`);
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
    // console.log("hint api is called successfully.");
    res.json({ hintGrid });
})

app.get("/api/getHint3", (req, res) => {
    // console.log("hint api is called successfully.");
    res.json({ hintGrid3 });
})

app.post("/levels", (req, res) => {
    level = parseInt(req.body.level);
    matrixSize = matrixSizeOptions[level - 1];
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
})

const create3Grid = (matrixSize3, level3) => {
    const initialGrid = new Array(matrixSize3).fill().map(() =>
        new Array(matrixSize3).fill(0) // Initialize with color white (0)
    );

    // Hint grid for 3-state LightsOut game.
    hintGrid3 = Array.from({ length: matrixSize3 }, () =>
        Array(matrixSize3).fill(0)
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
    // console.log(grid);
    // console.log(grid.length, grid[0].length);
    if (isValidPosition(row, col, grid)) {
        // Toggle through the three colors (0, 1, 2)
        grid[row][col] = (grid[row][col] + 1) % 3;
        hintGrid3[row][col] = (hintGrid3[row][col] + 2) % 3;
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
    // console.log("level3:" + level3)
    // console.log({ board3 });
    // console.log(board3.length, board3[0].length)
    res.render("3state.ejs", { board: board3, level: level3, matrixSize: matrixSize3 });
});


app.get('/levels3', (req, res) => {
    const { id, CurrLevel } = req.query;
    console.log("Current level was: ", level3, id, CurrLevel);
    if (id === '0' && level3 > 1) {
        level3 = parseInt(CurrLevel) - 1;

    } else if (id === '1' && level3 < 10) {

        level3 = parseInt(CurrLevel) + 1;
    } else {
        return res.send('<script>alert("Crossing the edge limit!");window.location.href = "/state3";</script>');
    }

    matrixSize3 = matrixSizeOptions[level3 - 1];
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

    matrixSize3 = matrixSizeOptions[level3 - 1];
    res.redirect('/state3');
})

// 3-state lights out game ends here.


// OTP verification part starts here 

// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'lightsout1811@gmail.com',
        pass: 'gquw msim rpvj yprw'
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
                res.render("login.ejs", { page: 'login', userExists: 'true' });
            } else {
                // User does not exist, generate OTP and continue with signup process
                const OTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: true });
                const expirationTime = new Date();
                expirationTime.setMinutes(expirationTime.getMinutes() + 3); // Set expiration time to 1 minute from now

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

                // Store email, OTP, and expiration time in temporary table OTP
                db.query("INSERT INTO OTP (email, otp, expiration_time) VALUES ($1, $2, $3)", [email, OTP, expirationTime]);

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error('Error sending OTP:', error);
                        return res.status(500).send('Error sending OTP');
                    } else {
                        console.log('Email sent:', info.response);
                        const partial = hideEmailPhone(email);
                        console.log(partial); // Output: e*****@example.com
                        res.render("login", { page: "OTP", name: name, email: email, password: password, partialEmail: partial, wrongOTP: "false" });
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
                    await db.query(insertUserQuery);

                    // Delete email and OTP from temporary table OTP
                    const deleteOTPQuery = {
                        text: 'DELETE FROM OTP WHERE email = $1',
                        values: [email],
                    };

                    await db.query(deleteOTPQuery);
                    // Authenticate user and set session/cookie
                    req.login({ name, email, password }, (err) => {
                        if (err) {
                            console.error('Error logging in:', err);
                            return res.status(500).send('Error logging in');
                        }
                        return res.status(200).send('OTP verified and user registered successfully');
                    });
                } catch (error) {
                    console.error('Error inserting user:', error);
                    return res.status(500).send('Error inserting user');
                }
            });
        } else {
            // Wrong OTP handling (redirect or render login with error message)
            res.render('login', { page: 'OTP', name, email, password, partialEmail: partial, wrongOTP: true });
        }
    } catch (error) {
        console.error('Error fetching OTP:', error);
        return res.status(500).send('Error fetching OTP');
    }
});

// section for resetting password starts here

app.get('/forgot-password', (req, res) => {
    res.render("forgetPassword", { page: 'enterEmail' })
})


app.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    // Check if the email already exists in the Users table
    db.query("SELECT * FROM Users WHERE email = $1", [email])
        .then(result => {
            if (result.rows.length == 0) {
                // User don't exists, redirect to signup page with a message
                res.render("login.ejs", { page: 'signup', userExists: 'false' });
            } else {
                // User does not exist, generate OTP and continue with the process
                const OTP = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: true });
                const expirationTime = new Date();
                expirationTime.setMinutes(expirationTime.getMinutes() + 3); // Set expiration time to 3 minutes from now

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
                                return res.status(500).send('Error sending OTP');
                            } else {
                                console.log('Email sent:', info.response);
                                // Render the forgetPassword page with the page set to "enterOTP"
                                res.render("forgetPassword", { page: "enterOTP", email: email });
                            }
                        });
                    })
                    .catch(error => {
                        console.error('Error storing OTP in the database:', error);
                        return res.status(500).send('Error storing OTP');
                    });
            }
        })
        .catch(error => {
            console.error('Error checking user existence:', error);
            return res.status(500).send('Error checking user existence');
        });
});

app.post('/enter-otp', (req, res) => {
    const { email, enteredOTP } = req.body;
    // console.log("EnteredOTp",req.body);

    // Fetch stored OTP and expiration time corresponding to the email
    const otpQuery = {
        text: 'SELECT otp, expiration_time FROM OTP WHERE email = $1',
        values: [email],
    };

    db.query(otpQuery)
        .then(result => {
            if (result.rows.length === 0) {
                res.render("forgetPassword", { page: 'enterEmail', message: "Email not found!" });
            }

            const storedOTP = result.rows[0].otp;
            // console.log("StoredOTP",storedOTP);
            const expirationTime = new Date(result.rows[0].expiration_time);

            // Check if OTP is expired
            if (expirationTime <= new Date()) {
                res.render("forgetPassword", { page: 'enterEmail', message: "OTP is expired!" });
            }

            if (enteredOTP === storedOTP) {
                // OTP is valid, render resetPassword page
                res.render("forgetPassword", { page: "resetPassword", email: email });

                //Delete otp from temporary table.
                db.query("DELETE FROM otp WHERE email = $1", [email]);
            } else {
                // Invalid OTP, render enterOTP page with error message
                res.render("forgetPassword", { page: "enterOTP", message: "Invalid OTP", email: email });
            }
        })
        .catch(error => {
            console.error('Error fetching OTP:', error);
            return res.status(500).send('Error fetching OTP');
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
                                        return res.status(500).send('Error sending OTP');
                                    } else {
                                        console.log('Email sent:', info.response);
                                        // res.send('OTP has been resent successfully');
                                        res.render("forgetPassword", { page: "enterOTP", email: email });
                                    }
                                });
                            })
                            .catch(error => {
                                console.error('Error storing new OTP:', error);
                                return res.status(500).send('Error storing new OTP');
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
        // Fetch user progress data from the database
        const userEmail = req.user.email; // Assuming you have the user's email in the req.user object
        const query = {
            text: 'SELECT level, moves, targetmoves FROM userprogress WHERE email = $1',
            values: [userEmail]
        };

        db.query(query)
            .then(result => {
                const progress = result.rows;
                res.render("userProfile", {
                    name: req.user.name,
                    email: req.user.email,
                    progress: progress
                });
            })
            .catch(err => {
                console.error("Error fetching user progress:", err);
                res.status(500).send("Internal Server Error");
            });
    } else {
        res.redirect("/login");
    }
});


// Add route to handle profile updates
app.post('/edit-profile', (req, res) => {
    const { name } = req.body;
    const email = req.session.user.email; // Assuming you're using session for authentication

    // Update the name in the Users table
    const updateNameQuery = {
        text: 'UPDATE Users SET name = $1 WHERE email = $2',
        values: [name, email],
    };

    db.query(updateNameQuery)
        .then(() => {
            // Name updated successfully, render userProfile with updated name
            res.render("userProfile", { name: name, email: email });
        })
        .catch(error => {
            console.error('Error updating name:', error);
            res.status(500).send('Error updating name');
        });
});

// Define Passport Local Strategy
passport.use('local', new Strategy({
    usernameField: 'email', // Assuming 'email' is the field name for username
    passwordField: 'password' // Assuming 'password' is the field name for password
}, async (email, password, cb) => {
    // Your authentication logic here
    try {
        // Query the database to find user by email
        const result = await db.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password;

            // Compare passwords
            bcrypt.compare(password, storedHashedPassword, (err, valid) => {
                if (err) {
                    return cb(err);
                } else {
                    if (valid) {
                        return cb(null, user);
                    } else {
                        return cb(null, false, { message: 'Incorrect password' });
                    }
                }
            });
        } else {
            return cb(null, false, { message: 'User not found' });
        }
    } catch (err) {
        return cb(err);
    }
}));

// Serialize and deserialize user
passport.serializeUser((user, cb) => {
    cb(null, user.id); // Assuming 'id' is a unique identifier for the user
});

passport.deserializeUser(async (id, cb) => {
    try {
        const result = await db.query('SELECT * FROM Users WHERE id = $1', [id]);
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
