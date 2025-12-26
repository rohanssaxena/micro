/**
 * Sets common CORS headers on the response
 * @param {http.ServerResponse} res - The HTTP response object
 */
export function setCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Sends a JSON response
 * @param {http.ServerResponse} res - The HTTP response object
 * @param {number} statusCode - HTTP status code
 * @param {Object} data - Data to send as JSON
 */
export function sendJSONResponse(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

