// Suppress url.parse deprecation warning from dependencies
process.noDeprecation = true;

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import peopleRoutes from './routes/people.js';
import relationshipsRoutes from './routes/relationships.js';
import importExportRoutes from './routes/import-export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// API Routes
app.use('/api/people', peopleRoutes);
app.use('/api/relationships', relationshipsRoutes);
app.use('/api', importExportRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
