import express from 'express'
import pg from 'pg';
const app = express();
const db = new pg.Pool(
    {
        host: 'ep-bitter-thunder-a2gojobu.eu-central-1.pg.koyeb.app',
        port: 5432,
        user:'koyeb-adm',
        password: 'npg_iZQnc0jfbH1X',
        database: 'koyebdb',
        ssl: {
            rejectUnauthorized: false, 
        }
    }
)

app.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT NOW() AS current_time');
        console.log('Database connection successful:', result.rows[0].current_time);
        res.send('Connected to PostgreSQL successfully!');
    } catch (err) {
        console.error('Error fetching data:', err.message);
        res.status(500).send('Database connection error');
    }
});


app.listen(3000, () => {
    console.log(`Server is running on http://localhost:3000`);
});
