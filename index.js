import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { handleLLMRequest } from './src/controllers/llmController.js';
import { getLabels } from './src/controllers/dbController.js';
import { getRequestBody } from './src/utils/requestParser.js';
import { renderHTML, escapeHtml } from './src/utils/htmlRenderer.js';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3000;

// Helper function to render page with sidebar
function renderPage(template, content, activeSection = 'chat') {
  const chatActive = activeSection === 'chat' ? 'active' : '';
  const dataActive = activeSection === 'data' ? 'active' : '';
  
  return renderHTML(template, {
    CONTENT: content,
    CHAT_ACTIVE: chatActive,
    DATA_ACTIVE: dataActive
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Handle Chat page GET request
  if (pathname === '/chat' && req.method === 'GET') {
    try {
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      const chatContent = `
        <h1>Gemini Chat</h1>
        <form method="POST" action="/chat">
          <div class="form-group">
            <label for="prompt">Enter your prompt:</label>
            <textarea id="prompt" name="prompt" placeholder="Type your question or prompt here..." required></textarea>
          </div>
          <button type="submit">Submit</button>
        </form>
      `;
      const renderedHtml = renderPage(html, chatContent, 'chat');
      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(renderedHtml);
    } catch (error) {
      res.statusCode = 500;
      res.end('Error loading page');
    }
  }
  // Handle Chat form submission POST request
  else if (pathname === '/chat' && req.method === 'POST') {
    try {
      const body = await getRequestBody(req);
      const prompt = body.prompt || '';

      // Use the LLM controller to handle the request
      const result = await handleLLMRequest(prompt);

      // Read HTML template
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      
      // Build response section
      let responseSection = '';
      const responseText = result.success ? result.response : result.message || result.error;
      if (responseText) {
        const errorClass = !result.success ? 'error' : '';
        responseSection = `
          <div class="response-container ${errorClass}">
            <div class="response-label">${result.success ? 'Response' : 'Error'}</div>
            <div class="response-text">${escapeHtml(responseText)}</div>
          </div>
        `;
      }
      
      // Render HTML with response
      const chatContent = `
        <h1>Gemini Chat</h1>
        <form method="POST" action="/chat">
          <div class="form-group">
            <label for="prompt">Enter your prompt:</label>
            <textarea id="prompt" name="prompt" placeholder="Type your question or prompt here..." required>${escapeHtml(prompt)}</textarea>
          </div>
          <button type="submit">Submit</button>
        </form>
        ${responseSection}
      `;
      
      const renderedHtml = renderPage(html, chatContent, 'chat');
      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(renderedHtml);
    } catch (error) {
      console.error('[Server] Unexpected error handling request:', error);
      try {
        const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
        const chatContent = `
          <h1>Gemini Chat</h1>
          <form method="POST" action="/chat">
            <div class="form-group">
              <label for="prompt">Enter your prompt:</label>
              <textarea id="prompt" name="prompt" placeholder="Type your question or prompt here..." required></textarea>
            </div>
            <button type="submit">Submit</button>
          </form>
          <div class="response-container error">
            <div class="response-label">Error</div>
            <div class="response-text">Error: ${escapeHtml(error.message)}</div>
          </div>
        `;
        const renderedHtml = renderPage(html, chatContent, 'chat');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 500;
        res.end(renderedHtml);
      } catch (e) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  }
  // Handle Data page GET request
  else if (pathname === '/data' && req.method === 'GET') {
    try {
      const result = await getLabels();
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      
      let dataContent = '';
      if (result.success && result.data && result.data.length > 0) {
        // Get column names from first row
        const columns = Object.keys(result.data[0]);
        
        // Build table HTML
        let tableRows = '';
        result.data.forEach((row, index) => {
          tableRows += '<tr>';
          columns.forEach(col => {
            const value = row[col] !== null && row[col] !== undefined ? escapeHtml(String(row[col])) : '';
            tableRows += `<td>${value}</td>`;
          });
          tableRows += '</tr>';
        });
        
        // Build header row
        let headerRow = '';
        columns.forEach(col => {
          headerRow += `<th>${escapeHtml(col)}</th>`;
        });
        
        dataContent = `
          <h1>Labels Data</h1>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>${headerRow}</tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
          </div>
        `;
      } else if (result.success && result.data && result.data.length === 0) {
        dataContent = `
          <h1>Labels Data</h1>
          <div class="data-content">
            <p>No labels found in the database.</p>
          </div>
        `;
      } else {
        dataContent = `
          <h1>Labels Data</h1>
          <div class="data-content error-message">
            <p>Error loading data: ${escapeHtml(result.message || result.error || 'Unknown error')}</p>
          </div>
        `;
      }
      
      const renderedHtml = renderPage(html, dataContent, 'data');
      res.setHeader('Content-Type', 'text/html');
      res.statusCode = 200;
      res.end(renderedHtml);
    } catch (error) {
      console.error('[Server] Error loading data page:', error);
      try {
        const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
        const dataContent = `
          <h1>Labels Data</h1>
          <div class="data-content error-message">
            <p>Error: ${escapeHtml(error.message)}</p>
          </div>
        `;
        const renderedHtml = renderPage(html, dataContent, 'data');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 500;
        res.end(renderedHtml);
      } catch (e) {
        res.statusCode = 500;
        res.end('Internal server error');
      }
    }
  }
  // Redirect root to /chat
  else if (pathname === '/' && req.method === 'GET') {
    res.writeHead(302, { 'Location': '/chat' });
    res.end();
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
