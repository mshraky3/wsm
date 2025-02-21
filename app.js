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
import session from 'express-session'





// Extract Pool from the pg module
const { Pool } = pg;
const storage = multer.memoryStorage(); // Store files in memory as buffers
const upload = multer({ storage });

const app = express();
app.use(session({
    secret: 'Ejc9c123',
    resave: false,
    saveUninitialized: false,
    isWriter: 0,
    User: { isUser: 0, id: null, username: null }
}));
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


//functions
async function user_by_id(user_id) {
    const data = await db.query('SELECT * FROM users WHERE id = $1', [user_id])
    return (data.rows[0]);
}

app.get('/', (req, res) => {

    req.session.isUser = false;
    res.render('index.ejs');
});

app.get('/signup', (req, res) => {
    res.render('signup.ejs');
});

app.post('/signup', upload.single('user_photo'), async (req, res) => {
    try {
        // Extract form fields from req.body
        const { username, password, company_Type, account_type, phone_number, instagram_account, x_account, linked_in_account, tiktok_account } = req.body;

        // Extract uploaded file data from req.file
        const userPhoto = req.file ? req.file.buffer : null; // Use buffer if storing in DB, or filename if saving to disk

        const query = `
            INSERT INTO users (username, password, company_Type, account_type, phone_number, user_photo, instagram_account, x_account, linked_in_account, tiktok_account)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;
        const values = [
            username,
            password,
            company_Type,
            "user",
            phone_number,
            userPhoto, // File buffer or filename
            instagram_account,
            x_account,
            linked_in_account,
            tiktok_account
        ];

        const result = await db.query(query, values);

        res.redirect(`/profile/${result.rows[0].id}`);
    } catch (error) {
        console.error(error);
        res.redirect("/signup");
    }
});

// Login route
app.get('/login', (req, res) => {
    res.render('login.ejs');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Check users table
        const userQuery = 'SELECT * FROM users WHERE username = $1 AND password = $2';
        const userResult = await db.query(userQuery, [username, password]);

        if (userResult.rows.length > 0) {
            // User found in the users table
            req.session.isUser = true;
            return res.redirect(`/profile/${userResult.rows[0].id}`);
        }

        // If not found in users, check writers table
        const writerQuery = 'SELECT * FROM writers WHERE username = $1 AND password = $2';
        const writerResult = await db.query(writerQuery, [username, password]);

        if (writerResult.rows.length > 0) {
            req.session.isWriter = true;

            return res.redirect(`/writer/${writerResult.rows[0].id}`);
        }

        // If neither table matches, return unauthorized
        console.log("Invalid username or password.")
        return res.redirect('login');

    } catch (error) {
        console.error('Error during login:', error.message);
        return res.status(500).send('Error from the server');
    }
});



app.get("/profile/:id", async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await user_by_id(userId);
        if (!user) {
            return res.status(404).send("User not found");
        }

        // Fetch user content along with images
        const contentQuery = `
            SELECT 
                c.id, 
                c.content_date, 
                c.description AS caption, 
                c.app_name ,
                c.approved
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

        const rusaltuserid = (await (db.query('select  user_id from content where writer_id = $1', [writer_id])));
        if (rusaltuserid.rows.length < 1) {
            res.redirect(`add-content/${writer_id}`)
        } else {
            const userid = rusaltuserid.rows[0].user_id;
            const users = await user_by_id(userid);
            const check_writer = await db.query("SELECT id FROM writers WHERE id = $1", [writer_id]);
            if (check_writer.rows.length < 1) {
                return res.redirect("/login");
            }

            req.session.isWriter = writer_id;

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


            res.render("writer.ejs", { writer_id, users, contents, isWriter: req.session.isWriter });
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


app.get("/writer/add-content/:writer_id", async (req, res) => {
    try {
        const writer_id = req.params.writer_id;

        // Fetch all users from the database
        const usersQuery = "SELECT id, username FROM users";
        const usersResult = await db.query(usersQuery);
        const users = usersResult.rows;


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

app.get("/content_det/:id/", async (req, res) => {
    try {
        const contentId = req.params.id;
        const userid = (await (db.query('select  user_id from content where id = $1', [contentId]))).rows[0].user_id
        const user = await user_by_id(userid)
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


        const repliesByCommentId = {};
        replies.forEach(reply => {
            if (!repliesByCommentId[reply.comment_id]) {
                repliesByCommentId[reply.comment_id] = [];
            }
            repliesByCommentId[reply.comment_id].push(reply);
        });


        comments.forEach(comment => {
            comment.replies = repliesByCommentId[comment.comment_id] || [];
        });
        // Render the EJS template with all data
        res.render("content.ejs", { content, images, comments, user, isWriter: req.session.isWriter });
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
});


// Route for submitting a new comment
app.post("/comments", async (req, res) => {



    try {
        const commentText = req.body.commentText;
        const user_id = req.body.user_id
        const postId = req.body.postId

        // Validate input
        if (!commentText) {
            return res.status(400).json({ error: "Comment text is required." });
        }
        var query;
        if (req.session.isWriter) {
            var query =
                `
           INSERT INTO comments(
            content_id,  writer_id, comment_text)
           VALUES ($1, $2, $3);
           `
        } else {
            var query =
                `
           INSERT INTO comments(
            content_id,  user_id, comment_text)
           VALUES ($1, $2, $3);
           `
        }
        const newComment = await db.query(query, [postId, user_id, commentText])
        res.redirect(`/content_det/${postId}`);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add comment." });
    }
});

// Route for submitting a reply to a comment
app.post("/comments/reply/:parentId", async (req, res) => {
    try {
        const { parentId } = req.params;
        const { replyText } = req.body;

        // Validate input
        if (!replyText) {
            return res.status(400).json({ error: "Reply text is required." });
        }

        // Save the reply to the database
        const newReply = await saveReply(parentId, replyText, req.user._id);

        // Redirect back to the post page or send a success response
        res.redirect(`/post/${req.postId}`); // Adjust based on your data structure
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to add reply." });
    }
});




app.post("/approved" , (req , res)=>{
    const id = req.body.user_id;
    const post_id = req.body.postId;
    try {
            const query  = `UPDATE content SET approved = true WHERE id = $1;`
            db.query(query , [post_id]);
            res.redirect(`/content_det/${post_id}`);
    } catch (error) {
        console.error(error)
        res.redirect("/");
    }
    
})
app.listen(3000, () => {
    console.log(`Server running on http://localhost:${3000}`);
});