const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('dotenv').config();
console.log('Loaded env keys:', Object.keys(process.env).filter(k =>
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'PORT'].includes(k)
));

const app = express();
app.use(cors({
    origin: [
        "http://localhost:3000",
        "https://ikemi.vercel.app",
    ]
}));
app.use(express.json());


console.log("RESEND KEY:", process.env.RESEND_API_KEY);

const requestsRouter = require('./routes/requests.js');
app.use('/api/requests', requestsRouter);



app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});