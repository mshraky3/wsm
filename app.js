import express from 'express';import pg from 'pg';import bodyParser from 'body-parser';import{fileURLToPath}from 'url';import path from 'path';import fs from 'fs';import busboy from 'busboy';import{dirname,join}from 'path';import fileUpload from "express-fileupload";import multer from 'multer';import session from 'express-session'
import{console}from 'inspector';const{Pool}=pg;const storage=multer.memoryStorage();const upload=multer({storage});const app=express();app.use(session({secret:'Ejc9c123',resave:!1,saveUninitialized:!1,isWriter:0,User:{isUser:0,id:null,username:null}}));const __filename=fileURLToPath(import.meta.url);const __dirname=dirname(__filename);app.use(bodyParser.urlencoded({extended:!0}));app.use(express.static(join(__dirname,'public')));const db=new Pool({host:'ep-green-paper-a2v2q280.eu-central-1.pg.koyeb.app',port:5432,user:'koyeb-adm',password:'npg_eWvwuxlqL7V8',database:'koyebdb',ssl:{rejectUnauthorized:!1,}});async function user_by_id(user_id){const data=await db.query('SELECT * FROM users WHERE id = $1',[user_id])
return(data.rows[0])}
app.get('/',(req,res)=>{req.session.isUser=!1;res.render('index.ejs')});app.get('/signup',(req,res)=>{res.render('signup.ejs')});app.post('/signup',upload.single('user_photo'),async(req,res)=>{try{const{username,password,company_Type,account_type,phone_number,instagram_account,x_account,linked_in_account,tiktok_account}=req.body;const userPhoto=req.file?req.file.buffer:null;const query=`
            INSERT INTO users (username, password, company_Type, account_type, phone_number, user_photo, instagram_account, x_account, linked_in_account, tiktok_account)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
        `;const values=[username,password,company_Type,"user",phone_number,userPhoto,instagram_account,x_account,linked_in_account,tiktok_account];const result=await db.query(query,values);res.redirect(`/profile/${result.rows[0].id}`)}catch(error){console.error(error);res.redirect("/signup")}});app.get('/login',(req,res)=>{res.render('login.ejs')});app.post('/login',async(req,res)=>{const{username,password}=req.body;try{const userQuery='SELECT * FROM users WHERE username = $1 AND password = $2';const userResult=await db.query(userQuery,[username,password]);if(userResult.rows.length>0){req.session.isUser=!0;return res.redirect(`/profile/${userResult.rows[0].id}`)}
const writerQuery='SELECT * FROM writers WHERE username = $1 AND password = $2';const writerResult=await db.query(writerQuery,[username,password]);if(writerResult.rows.length>0){req.session.isWriter=!0;return res.redirect(`/writer/${writerResult.rows[0].id}`)}
console.log("Invalid username or password.")
return res.redirect('login')}catch(error){console.error('Error during login:',error.message);return res.status(500).send('Error from the server')}});app.get("/profile/:id",async(req,res)=>{try{const userId=req.params.id;const user=await user_by_id(userId);if(!user){return res.status(404).send("User not found")}
const contentQuery=`
            SELECT 
                c.id, 
                c.content_date, 
                c.description AS caption, 
                c.app_name ,
                c.approved
            FROM content c
            WHERE c.user_id = $1 
            ORDER BY c.content_date DESC
        `;const contentResult=await db.query(contentQuery,[userId]);const contents=await Promise.all(contentResult.rows.map(async(content)=>{const imageQuery=`
                SELECT 
                    ci.id AS image_id,
                    encode(ci.image, 'base64') AS image_base64
                FROM content_images ci
                WHERE ci.content_id = $1
            `;const imageResult=await db.query(imageQuery,[content.id]);return{...content,images:imageResult.rows.map(img=>({image_id:img.image_id,image_url:`data:image/jpeg;base64,${img.image_base64}`}))}}));res.render("profile.ejs",{user,contents})}catch(error){console.error(error);res.status(500).send("Server error")}});app.get("/writer/:id",async(req,res)=>{try{const writer_id=req.params.id;const rusaltuserid=(await(db.query('select  user_id from content where writer_id = $1',[writer_id])));if(rusaltuserid.rows.length<1){res.redirect(`add-content/${writer_id}`)}else{const userid=rusaltuserid.rows[0].user_id;const users=await user_by_id(userid);const check_writer=await db.query("SELECT id FROM writers WHERE id = $1",[writer_id]);if(check_writer.rows.length<1){return res.redirect("/login")}
req.session.isWriter=writer_id;const contentQuery=`
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
            `;const contentResult=await db.query(contentQuery,[writer_id]);const contents=await Promise.all(contentResult.rows.map(async(content)=>{const imageQuery=`
                    SELECT 
                        ci.id AS image_id,
                        encode(ci.image, 'base64') AS image_base64
                    FROM content_images ci
                    WHERE ci.content_id = $1
                `;const imageResult=await db.query(imageQuery,[content.content_id]);return{...content,images:imageResult.rows.map(img=>({image_id:img.image_id,image_url:`data:image/jpeg;base64,${img.image_base64}`}))}}));res.render("writer.ejs",{writer_id,users,contents,isWriter:req.session.isWriter})}}catch(error){console.error(error);res.status(500).send("Server error")}});app.get("/writer/add-content/:writer_id",async(req,res)=>{try{const writer_id=req.params.writer_id;const usersQuery=`
            SELECT id, username, encode(user_photo, 'base64') AS image_base64 
            FROM users
        `;const usersResult=await db.query(usersQuery);const users=usersResult.rows.map(user=>({id:user.id,username:user.username,image_url:user.image_base64?`data:image/jpeg;base64,${user.image_base64}`:null}));res.render("send_content.ejs",{writer_id,users})}catch(error){console.error(error);res.status(500).send("Server error")}});app.post("/new_content",upload.array('images',10),async(req,res)=>{try{const{user_id,description,app_name,writer_id,content_date}=req.body;const insertContentQuery=`
            INSERT INTO content (user_id, content_date, description, app_name, writer_id, approved)
            VALUES ($1, $2, $3, $4, $5, false)
            RETURNING id
        `;const contentResult=await db.query(insertContentQuery,[user_id,content_date,description,app_name,writer_id]);const contentId=contentResult.rows[0].id;if(req.files&&req.files.length>0){const insertImageQuery=`
                INSERT INTO content_images (content_id, image)
                VALUES ($1, $2)
            `;for(const image of req.files){await db.query(insertImageQuery,[contentId,image.buffer])}}
res.redirect(`/writer/${writer_id}`)}catch(error){console.error(error);res.status(500).send("Server error")}});app.get("/content_det/:id/",async(req,res)=>{try{const contentId=req.params.id;const userid=(await(db.query('select  user_id from content where id = $1',[contentId]))).rows[0].user_id
const user=await user_by_id(userid)
const contentQuery="SELECT * FROM content WHERE id = $1";const contentResult=await db.query(contentQuery,[contentId]);const content=contentResult.rows[0];if(!content){return res.status(404).send("Content not found")}
const imagesQuery=`
            SELECT 
                ci.id AS image_id,
                encode(ci.image, 'base64') AS image_base64
            FROM content_images ci
            WHERE ci.content_id = $1
        `;const imagesResult=await db.query(imagesQuery,[contentId]);const images=imagesResult.rows.map(img=>({image_id:img.image_id,image_url:`data:image/jpeg;base64,${img.image_base64}`}));const commentsQuery=`
            SELECT 
                c.id AS comment_id,
                c.writer_id AS comment_writer_id,
                c.user_id AS comment_user_id,
                c.comment_text,
                c.created_at AS comment_created_at,
                c.approved AS comment_approved
            FROM comments c
            WHERE c.content_id = $1
        `;const commentsResult=await db.query(commentsQuery,[contentId]);const comments=commentsResult.rows;const commentIds=comments.map(comment=>comment.comment_id);res.render("content.ejs",{content,images,comments,user,isWriter:req.session.isWriter})}catch(error){console.error(error);res.status(500).send("Server error")}});app.post("/comments",async(req,res)=>{try{const commentText=req.body.commentText;const user_id=req.body.user_id
const postId=req.body.postId
if(!commentText){return res.status(400).json({error:"Comment text is required."})}
var query;if(req.session.isWriter){var query=`
           INSERT INTO comments(
            content_id,  writer_id, comment_text)
           VALUES ($1, $2, $3);
           `}else{var query=`
           INSERT INTO comments(
            content_id,  user_id, comment_text)
           VALUES ($1, $2, $3);
           `}
const newComment=await db.query(query,[postId,user_id,commentText])
res.redirect(`/content_det/${postId}`)}catch(error){console.error(error);res.status(500).json({error:"Failed to add comment."})}});app.post("/approved",(req,res)=>{const id=req.body.user_id;const post_id=req.body.postId;try{const query=`UPDATE content SET approved = true WHERE id = $1;`
db.query(query,[post_id]);res.redirect(`/content_det/${post_id}`)}catch(error){console.error(error)
res.redirect("/")}})
app.listen(3000,()=>{console.log(`Server running on http://localhost:${3000}`)})