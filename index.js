import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { handleLLMRequest } from './src/controllers/llmController.js';
import { getRequestBody } from './src/utils/requestParser.js';
import { renderHTML } from './src/utils/htmlRenderer.js';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Handle home page GET request
  if (req.url === '/' && req.method === 'GET') {
    try {
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      const renderedHtml = renderHTML(html, {});
      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(renderedHtml);
    } catch (error) {
      res.statusCode = 500;
      res.end('Error loading page');
    }
  }
  // Handle form submission POST request
  else if (req.url === '/' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const prompt = body.prompt || '';

      // Use the LLM controller to handle the request
      const result = await handleLLMRequest(prompt);

      // Read HTML template
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      
      // Render HTML with response
      const renderedHtml = renderHTML(html, {
        prompt: prompt,
        response: result.success ? result.response : result.message || result.error,
        error: !result.success
      });

      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(renderedHtml);
    } catch (error) {
      console.error('[Server] Unexpected error handling request:', error);
      try {
        const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
        const renderedHtml = renderHTML(html, {
          prompt: '',
          response: `Error: ${error.message}`,
          error: true
        });
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 500;
        res.end(renderedHtml);
      } catch (e) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  }
  // Handle JSON API request (for backwards compatibility)
  else if (req.url === '/api/gemini' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const prompt = body.prompt;

      // Use the LLM controller to handle the request
      const result = await handleLLMRequest(prompt);

      res.setHeader('Content-Type', 'application/json');
      if (result.success) {
        res.statusCode = result.statusCode;
        res.end(JSON.stringify({ response: result.response }));
      } else {
        res.statusCode = result.statusCode;
        res.end(JSON.stringify({ 
          error: result.error,
          message: result.message 
        }));
      }
    } catch (error) {
      console.error('[Server] Unexpected error handling request:', error);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: error.message
      }));
    }
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html');
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop the server`);
});
