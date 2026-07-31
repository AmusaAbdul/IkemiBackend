const express = require('express');
const cors = require('cors');
require('dotenv').config();
require('dotenv').config();
console.log('Loaded env keys:', Object.keys(process.env).filter(k =>
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'PORT'].includes(k)
));

const app = express();
app.use(cors());
app.use(express.json());



const requestsRouter = require('./routes/requests.js');
app.use('/api/requests', requestsRouter);



app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});