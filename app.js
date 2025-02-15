import express from 'express';
import pg from 'pg'; // Import the entire pg module
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import busboy from 'busboy'; // Use busboy to handle multipart/form-data
import { dirname, join } from 'path';
import fileUpload from "express-fileupload";
import multer from 'multer';

// Extract Pool from the pg module
const { Pool } = pg;
const storage = multer.memoryStorage(); // Store files in memory as buffers
const upload = multer({ storage });

const app = express();
const PORT = 3000;

// Get the directory name of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(join(__dirname, 'public'))); // Serve static files from the 'public' folder

// PostgreSQL connection pool
const db = new Pool({
    host: 'ep-bitter-thunder-a2gojobu.eu-central-1.pg.koyeb.app',
    port: 5432,
    user: 'koyeb-adm',
    password: 'npg_iZQnc0jfbH1X',
    database: 'koyebdb',
    ssl: {
        rejectUnauthorized: false, // Disable SSL certificate validation
    }
});


app.get('/', (req, res) => {
    res.render('index.ejs');
});

// Signup route
app.get('/signup', (req, res) => {
    res.render('signup.ejs');
});

app.post('/signup', (req, res) => {
    parseMultipartFormData(req, async (fields, fileData) => {
        try {
            const { username, password, company_Type, account_type, phone_number } = fields;

            if (!username || !password || !account_type) {
                return res.status(400).send('All required fields are not provided.');
            }

            // Insert into database without hashing the password
            const query = `
                INSERT INTO users (username, password, company_Type, account_type, phone_number, user_photo)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id
            `;
            const values = [username, password, company_Type, "user", phone_number, fileData];
            const result = await db.query(query, values);
            res.send('User registered successfully!');

        } catch (error) {
            console.error(error);
            res.status(500).send('Error registering user.');
        }
    });
});

// Login route
app.get('/login', (req, res) => {
    res.render('login.ejs');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
        return res.status(400).send('Username and password are required.');
    }

    try {
        // Check users table
        const userQuery = 'SELECT * FROM users WHERE username = $1 AND password = $2';
        const userResult = await db.query(userQuery, [username, password]);

        if (userResult.rows.length > 0) {
            // User found in the users table
            return res.redirect(`/profile/${userResult.rows[0].id}`);
        }

        // If not found in users, check writers table
        const writerQuery = 'SELECT * FROM writers WHERE username = $1 AND password = $2';
        const writerResult = await db.query(writerQuery, [username, password]);

        if (writerResult.rows.length > 0) {
            // Writer found in the writers table
            return res.redirect(`/writer/${writerResult.rows[0].id}`);
        }

        // If neither table matches, return unauthorized
        return res.status(401).send('Invalid username or password.');

    } catch (error) {
        console.error('Error during login:', error.message);
        return res.status(500).send('Error logging in.');
    }
});

app.get("/profile/:id", async (req, res) => {
    try {
        const userId = req.params.id;

        // Fetch user details
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await db.query(userQuery, [userId]);
        const user = userResult.rows[0];
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Fetch user content along with images
        const contentQuery = `
            SELECT 
                c.id, 
                c.content_date, 
                c.description AS caption, 
                c.app_name 
            FROM content c
            WHERE c.user_id = $1 
            ORDER BY c.content_date DESC
        `;
        const contentResult = await db.query(contentQuery, [userId]);

        // Map over the content and fetch associated images
        const contents = await Promise.all(contentResult.rows.map(async (content) => {
            // Query the content_images table for images related to this content
            const imageQuery = `
                SELECT 
                    ci.id AS image_id,
                    encode(ci.image, 'base64') AS image_base64
                FROM content_images ci
                WHERE ci.content_id = $1
            `;
            const imageResult = await db.query(imageQuery, [content.id]);

            // Attach the images to the content object
            return {
                ...content,
                images: imageResult.rows.map(img => ({
                    image_id: img.image_id,
                    image_url: `data:image/jpeg;base64,${img.image_base64}`
                }))
            };
        }));

        
        res.render("profile.ejs", { user, contents });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


app.get("/writer/:id", async (req, res) => {
    try {
        const writer_id = req.params.id;

        // Step 1: Check if the writer exists
        const check_writer = await db.query("SELECT id FROM writers WHERE id = $1", [writer_id]);
        if (check_writer.rows.length < 1) {
            return res.redirect("/login"); 
        }

        
        const users = await db.query("SELECT * FROM users");

        
        const contentQuery = `
            SELECT 
                c.id AS content_id,
                c.user_id,
                c.content_date,
                c.description,
                c.app_name,
                c.created_at,
                c.approved
            FROM content c
            WHERE c.writer_id = $1
            ORDER BY c.content_date DESC
        `;
        const contentResult = await db.query(contentQuery, [writer_id]);

        const contents = await Promise.all(contentResult.rows.map(async (content) => {
            
            const imageQuery = `
                SELECT 
                    ci.id AS image_id,
                    encode(ci.image, 'base64') AS image_base64
                FROM content_images ci
                WHERE ci.content_id = $1
            `;
            const imageResult = await db.query(imageQuery, [content.content_id]);
            return {
                ...content,
                images: imageResult.rows.map(img => ({
                    image_id: img.image_id,
                    image_url: `data:image/jpeg;base64,${img.image_base64}`
                }))
            };
        }));

        
        res.render("writer.ejs", { writer_id, users, contents });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


app.get("/add-content/:writer_id", async (req, res) => {
    try {
        const writer_id = req.params.writer_id;

        // Fetch all users from the database
        const usersQuery = "SELECT id, username FROM users";
        const usersResult = await db.query(usersQuery);
        const users = usersResult.rows;

        // Render the add-content page with the writer_id and users
        res.render("send_content.ejs", { writer_id, users });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


app.post("/new_content", upload.array('images', 10), async (req, res) => {
    try {
        const { user_id, description, app_name, writer_id } = req.body;
        const images = req.files; // Array of uploaded images

        // Validate required fields
        if (!user_id || !description || !app_name || !writer_id) {
            return res.status(400).send("Missing required fields");
        }

        // Insert the new content into the `content` table
        const insertContentQuery = `
            INSERT INTO content (user_id, content_date, description, app_name, writer_id, approved)
            VALUES ($1, CURRENT_DATE, $2, $3, $4, false)
            RETURNING id
        `;
        const contentResult = await db.query(insertContentQuery, [user_id, description, app_name, writer_id]);
        const contentId = contentResult.rows[0].id;

        // If images are uploaded, insert them into the `content_images` table
        if (images && images.length > 0) {
            const insertImageQuery = `
                INSERT INTO content_images (content_id, image)
                VALUES ($1, $2)
            `;
            for (const image of images) {
                await db.query(insertImageQuery, [contentId, image.buffer]); // Store the image buffer in the database
            }
        }

        res.redirect(`/writer/${writer_id}`); // Redirect to the writer's dashboard
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});

app.get("/content_det/:id", async (req, res) => {
    try {
        const contentId = req.params.id;

        // Step 1: Fetch content details
        const contentQuery = "SELECT * FROM content WHERE id = $1";
        const contentResult = await db.query(contentQuery, [contentId]);
        const content = contentResult.rows[0];
        if (!content) {
            return res.status(404).send("Content not found");
        }

        // Step 2: Fetch images for the content
        const imagesQuery = `
            SELECT 
                ci.id AS image_id,
                encode(ci.image, 'base64') AS image_base64
            FROM content_images ci
            WHERE ci.content_id = $1
        `;
        const imagesResult = await db.query(imagesQuery, [contentId]);
        const images = imagesResult.rows.map(img => ({
            image_id: img.image_id,
            image_url: `data:image/jpeg;base64,${img.image_base64}`
        }));

        // Step 3: Fetch comments for the content
        const commentsQuery = `
            SELECT 
                c.id AS comment_id,
                c.writer_id AS comment_writer_id,
                c.user_id AS comment_user_id,
                c.comment_text,
                c.created_at AS comment_created_at,
                c.approved AS comment_approved
            FROM comments c
            WHERE c.content_id = $1
        `;
        const commentsResult = await db.query(commentsQuery, [contentId]);
        const comments = commentsResult.rows;

        // Step 4: Fetch replies for each comment
        const repliesQuery = `
            SELECT 
                r.id AS reply_id,
                r.comment_id,
                r.writer_id AS reply_writer_id,
                r.user_id AS reply_user_id,
                r.reply_text,
                r.created_at AS reply_created_at,
                r.approved AS reply_approved
            FROM replies r
            WHERE r.comment_id = ANY($1)
        `;
        const commentIds = comments.map(comment => comment.comment_id);
        const repliesResult = await db.query(repliesQuery, [commentIds]);
        const replies = repliesResult.rows;

        // Organize replies by comment_id
        const repliesByCommentId = {};
        replies.forEach(reply => {
            if (!repliesByCommentId[reply.comment_id]) {
                repliesByCommentId[reply.comment_id] = [];
            }
            repliesByCommentId[reply.comment_id].push(reply);
        });

        // Attach replies to their respective comments
        comments.forEach(comment => {
            comment.replies = repliesByCommentId[comment.comment_id] || [];
        });

        // Render the EJS template with all data
        res.render("content.ejs", { content, images, comments });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});