/**
 * Helper function to read and parse request body
 * @param {http.IncomingMessage} req - The HTTP request object
 * @returns {Promise<Object|string>} Parsed JSON object, form data object, or raw string
 */
export function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const contentType = req.headers['content-type'] || '';
      
      // Handle JSON
      if (contentType.includes('application/json')) {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      }
      // Handle form data (application/x-www-form-urlencoded)
      else if (contentType.includes('application/x-www-form-urlencoded')) {
        const formData = {};
        const params = new URLSearchParams(body);
        for (const [key, value] of params) {
          formData[key] = value;
        }
        resolve(formData);
      }
      // Default: return raw body
      else {
        resolve(body);
      }
    });
    req.on('error', reject);
  });
}

