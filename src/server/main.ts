import express from 'express';
import runtime from '../utils/runtime-instance';
import apiRouter from './routes/api';

const app = express();
const PORT = runtime === 'dev' ? 3000 : 45350;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));
app.use('/', apiRouter); 

app.listen(PORT, () => {
    console.log(`[DisChord Server] Running on http://localhost:${PORT}`);
});