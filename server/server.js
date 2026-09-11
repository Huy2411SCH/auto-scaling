const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const os = require('os');
const app = express();
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// --- API routes ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  // hardcoded for now — real user store is future work (see report Conclusion)
  if (username === 'demo' && password === 'demo123') {
    const token = jwt.sign({ username }, SECRET, { expiresIn: '2h' });
    return res.json({ token, user: { username } });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  try {
    req.user = jwt.verify(token, SECRET); // stateless check — works on any instance
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Real compute endpoint — this is the auto-scaling load target
app.get('/api/dashboard', requireAuth, (req, res) => {
  let total = 0;
  for (let i = 0; i < 5_000_000; i++) total += Math.sqrt(i);
  res.json({ user: req.user.username, computedStat: total, instance: os.hostname() });
});

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- Serve the built React app ---
const distPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(distPath));

// Catch-all so React Router (BrowserRouter) handles client-side routes on refresh
app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
