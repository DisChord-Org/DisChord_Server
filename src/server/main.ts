import runtime from '../utils/runtime-instance';
import app from './app';

const PORT = runtime === 'dev' ? 3000 : 45350;

app.listen(PORT, () => {
    console.log(`[DisChord Server] Running on http://localhost:${PORT}`);
});
