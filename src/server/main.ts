import express from 'express';
import runtime from '../utils/runtime-instance';
import apiRouter from './routes/api';

const app = express();
const PORT = runtime === 'dev' ? 3000 : 45350;

app.use(express.json());
app.use('/', apiRouter); 

app.listen(PORT, () => {
    console.log(`[DisChord Server] Running on http://localhost:${PORT}`);
});