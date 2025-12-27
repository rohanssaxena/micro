import { createClient } from '@supabase/supabase-js';

// Lazy initialization of Supabase client
let supabase = null;

function getSupabaseClient() {
  if (!supabase) {
    // Try multiple common environment variable names
    const supabaseUrl = process.env.SUPABASE_URL || 
                       process.env.NEXT_PUBLIC_SUPABASE_URL ||
                       process.env.VITE_SUPABASE_URL;
    
    const supabaseKey = process.env.SUPABASE_KEY || 
                       process.env.SUPABASE_ANON_KEY ||
                       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                       process.env.VITE_SUPABASE_ANON_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      const missing = [];
      if (!supabaseUrl) missing.push('SUPABASE_URL');
      if (!supabaseKey) missing.push('SUPABASE_KEY or SUPABASE_ANON_KEY');
      
      console.error('[Database] Missing environment variables:', missing.join(', '));
      console.error('[Database] Available env vars with SUPABASE:', 
        Object.keys(process.env).filter(k => k.includes('SUPABASE')).join(', ') || 'none');
      
      throw new Error(`Supabase credentials not configured. Missing: ${missing.join(', ')}. Please check your .env file.`);
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * Fetches all labels from the labels table
 * @returns {Promise<Object>} Object with success status and data/error
 */
export async function getLabels() {
  try {
    const client = getSupabaseClient();
    
    const { data, error } = await client
      .from('labels')
      .select('*')
      .order('id', { ascending: true });
    
    if (error) {
      console.error('[Database] Error fetching labels:', error);
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch labels',
        message: error.message
      };
    }
    
    return {
      success: true,
      statusCode: 200,
      data: data || []
    };
  } catch (error) {
    console.error('[Database] Unexpected error:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Database connection error',
      message: error.message
    };
  }
}

