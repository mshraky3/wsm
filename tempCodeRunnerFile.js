app.get('/writer/:id', async (req, res) => {
    const writer_id = req.params.id;
    if (!writer_id) {
        return res.status(401).send('Unauthorized: Writer ID not found.');
    }



        await db.connect();

        // Execute the SQL query
        const query = `
            WITH user_data AS (
                SELECT 
                    u.id AS user_id,
                    u.username AS user_username,
                    c.id AS content_id,
                    c.content_date,
                    c.created_at AS content_created_at,
                    c.description,
                    c.app_name,
                    c.writer_id,
                    ci.image AS content_image,
                    coalesce(json_agg(
                        json_build_object(
                            'id', cm.id,
                            'comment_text', cm.comment_text,
                            'created_at', cm.created_at,
                            'approved', cm.approved,
                            'replies', json_agg(
                                json_build_object(
                                    'id', r.id,
                                    'reply_text', r.reply_text,
                                    'created_at', r.created_at,
                                    'approved', r.approved
                                ) FILTER (WHERE r.id IS NOT NULL)
                            ) FILTER (WHERE r.id IS NOT NULL)
                        ) FILTER (WHERE cm.id IS NOT NULL)
                    ), '[]') AS comments
                FROM 
                    public.users u
                LEFT JOIN 
                    public.content c ON u.id = c.user_id
                LEFT JOIN 
                    public.content_images ci ON c.id = ci.content_id
                LEFT JOIN 
                    public.comments cm ON c.id = cm.content_id
                LEFT JOIN 
                    public.replies r ON cm.id = r.comment_id
                WHERE 
                    c.writer_id = $1
                GROUP BY 
                    u.id, u.username, c.id, c.content_date, c.created_at, c.description, c.app_name, c.writer_id, ci.image
            )
            SELECT 
                user_id,
                user_username,
                json_agg(
                    json_build_object(
                        'id', content_id,
                        'content_date', content_date,
                        'created_at', content_created_at,
                        'description', description,
                        'app_name', app_name,
                        'image', content_image,
                        'comments', comments
                    )
                ) AS contents
            FROM 
                user_data
            GROUP BY 
                user_id, user_username;
        `;

        const result = await db.query(query, [writer_id]);

        // Render the EJS template with the data
        res.render('writer.ejs', { users: result.rows });
});
app.get("/create-content" , (req , res)=>{
    res.render("send_content.ejs")
});

app.post('/create-content', (req, res) => {
    parseMultipartFormData(req, async (fields, fileData) => {
        try {
            const { user_id, content_date, description, app_name, writer_id } = fields;

            // Validate required fields
            if (!user_id || !content_date || !description || !app_name || !writer_id) {
                return res.status(400).send('All fields are required.');
            }

            // Start a transaction
            await db.query('BEGIN');

            // Insert the content into the `content` table
            const contentQuery = `
                INSERT INTO content (user_id, content_date, description, app_name, writer_id)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
            `;
            const contentValues = [user_id, content_date, description, app_name, writer_id];
            const contentResult = await db.query(contentQuery, contentValues);

            // Extract the generated content ID
            const contentId = contentResult.rows[0].id;

            // Check if an image was uploaded
            if (fileData && Object.keys(fileData).length > 0) {
                // Insert the image into the `content_images` table
                const imageQuery = `
                    INSERT INTO content_images (content_id, image)
                    VALUES ($1, $2)
                `;
                const imageValues = [contentId, fileData.image]; // Assuming the file data is stored under the key 'image'
                await db.query(imageQuery, imageValues);
            }

            // Commit the transaction
            await db.query('COMMIT');

            res.send('Content created successfully!');
        } catch (error) {
            // Rollback the transaction in case of an error
            await db.query('ROLLBACK');
            console.error(error);
            res.status(500).send('Error creating content.');
        }
    });
});
