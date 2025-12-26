/**
 * Renders HTML template with data
 * @param {string} html - HTML template string
 * @param {Object} data - Data object with prompt, response, error
 * @returns {string} Rendered HTML
 */
export function renderHTML(html, data = {}) {
  let rendered = html;
  
  // Replace prompt value
  rendered = rendered.replace('{{PROMPT}}', escapeHtml(data.prompt || ''));
  
  // Handle response section
  if (data.response) {
    const responseHtml = `
        <div class="response-container ${data.error ? 'error' : ''}">
            <div class="response-label">${data.error ? 'Error' : 'Response'}:</div>
            <div class="response-text">${escapeHtml(data.response)}</div>
        </div>
    `;
    rendered = rendered.replace('{{RESPONSE_SECTION}}', responseHtml);
  } else {
    // Remove the response section placeholder if no response
    rendered = rendered.replace('{{RESPONSE_SECTION}}', '');
  }
  
  return rendered;
}

/**
 * Escapes HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

