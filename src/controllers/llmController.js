import { GoogleGenAI } from '@google/genai';

// Lazy initialization of Gemini AI client
let ai = null;

function getAIClient() {
  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }
  return ai;
}

/**
 * Validates that the API key is configured
 * @returns {boolean} True if API key is set, false otherwise
 */
function validateApiKey() {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Extracts text from Gemini API response
 * Handles different possible response structures
 * @param {Object} response - The response object from Gemini API
 * @returns {string} The extracted text content
 */
function extractResponseText(response) {
  if (response.text) {
    return response.text;
  } else if (response.response && response.response.text) {
    return response.response.text;
  } else if (response.candidates && response.candidates[0] && response.candidates[0].content) {
    return response.candidates[0].content.parts[0].text;
  } else {
    console.log('[Gemini] Unexpected response structure, using stringified version');
    return JSON.stringify(response);
  }
}

/**
 * Handles LLM request to Gemini API
 * @param {string} prompt - The user's prompt/question
 * @returns {Promise<Object>} Object with success status and response/error
 */
export async function handleLLMRequest(prompt) {
  // Validate prompt
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
    return {
      success: false,
      statusCode: 400,
      error: 'Prompt is required',
      message: 'Prompt must be a non-empty string'
    };
  }

  // Validate API key
  if (!validateApiKey()) {
    console.log('[Gemini] Error: GEMINI_API_KEY environment variable is not set');
    return {
      success: false,
      statusCode: 500,
      error: 'Server configuration error: API key not set',
      message: 'GEMINI_API_KEY environment variable is required'
    };
  }

  try {
    console.log('[Gemini] Request received - Prompt:', prompt);
    console.log('[Gemini] API Key present: Yes');
    
    // Get AI client (initialized lazily with API key)
    const client = getAIClient();
    
    // Make request to Gemini API
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt.trim(),
    });

    console.log('[Gemini] Raw response structure:', JSON.stringify(response, null, 2));
    
    // Extract text from response
    const responseText = extractResponseText(response);

    console.log('[Gemini] Response succeeded:');
    console.log('Response:', responseText);

    return {
      success: true,
      statusCode: 200,
      response: responseText
    };
  } catch (error) {
    console.log('[Gemini] Response failed:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.cause) {
      console.error('Error cause:', error.cause);
    }
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    return {
      success: false,
      statusCode: 500,
      error: 'Failed to get response from Gemini',
      message: error.message
    };
  }
}

