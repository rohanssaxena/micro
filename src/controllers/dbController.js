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

/**
 * Fetches data for the mind map visualization
 * @returns {Promise<Object>} Object with success status and mind map data/error
 */
export async function getMindMapData() {
  try {
    const client = getSupabaseClient();
    
    // Fetch level 1 labels
    const { data: level1Labels, error: error1 } = await client
      .from('labels')
      .select('*')
      .eq('level', 1)
      .order('id', { ascending: true });
    
    if (error1) {
      console.error('[Database] Error fetching level 1 labels:', error1);
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch level 1 labels',
        message: error1.message
      };
    }
    
    // Fetch level 2 labels
    const { data: level2Labels, error: error2 } = await client
      .from('labels')
      .select('*')
      .eq('level', 2)
      .order('id', { ascending: true });
    
    if (error2) {
      console.error('[Database] Error fetching level 2 labels:', error2);
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch level 2 labels',
        message: error2.message
      };
    }
    
    // Fetch stacks - try 'stacks' table first, fallback to 'topics' if it doesn't exist
    let stacks = [];
    let stacksError = null;
    
    const { data: stacksData, error: stacksErr } = await client
      .from('stacks')
      .select('*');
    
    if (stacksErr) {
      // If stacks table doesn't exist, try topics table
      const { data: topicsData, error: topicsErr } = await client
        .from('topics')
        .select('*');
      
      if (topicsErr) {
        console.error('[Database] Error fetching stacks/topics:', topicsErr);
        stacksError = topicsErr;
      } else {
        stacks = topicsData || [];
      }
    } else {
      stacks = stacksData || [];
    }
    
    // Fetch topic progress from view
    const { data: topicProgress, error: progressErr } = await client
      .from('topic_progress')
      .select('topic_id, progress_percent');
    
    if (progressErr) {
      console.error('[Database] Error fetching topic progress:', progressErr);
      // Don't fail the whole request if progress can't be fetched
    }
    
    return {
      success: true,
      statusCode: 200,
      data: {
        level1: level1Labels || [],
        level2: level2Labels || [],
        stacks: stacks,
        topicProgress: topicProgress || []
      }
    };
  } catch (error) {
    console.error('[Database] Unexpected error fetching mind map data:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Database connection error',
      message: error.message
    };
  }
}

/**
 * Fetches questions and answers for a specific topic
 * @param {number|string} topicId - The topic ID (can be integer or UUID)
 * @returns {Promise<Object>} Object with success status and data/error
 */
export async function getTopicQuestions(topicId) {
  try {
    const client = getSupabaseClient();
    
    // First, get the topic to ensure we have the correct ID format
    // This handles cases where the database uses UUIDs even if we pass integers
    const topicIdNum = parseInt(topicId);
    let actualTopicId = topicId;
    
    if (!isNaN(topicIdNum)) {
      // Query topics table to get the actual topic record
      // Supabase might return UUID even if we query by integer
      const { data: topic, error: topicError } = await client
        .from('topics')
        .select('id')
        .eq('id', topicIdNum)
        .maybeSingle();
      
      if (topicError) {
        console.error('[Database] Error fetching topic:', topicError);
        // Continue with original topicId, might still work
      } else if (topic && topic.id) {
        // Use the topic's actual id (Supabase returns the correct format - UUID or integer)
        actualTopicId = topic.id;
        console.log('[Database] Found topic, using ID:', actualTopicId, 'Type:', typeof actualTopicId);
      }
    }
    
    // Fetch questions for the topic using the actual topic ID
    console.log('[Database] Querying questions with topic_id:', actualTopicId, 'Type:', typeof actualTopicId);
    const { data: questions, error: questionsError } = await client
      .from('questions')
      .select('*')
      .eq('topic_id', actualTopicId)
      .order('id', { ascending: true });
    
    if (questionsError) {
      console.error('[Database] Error fetching questions:', questionsError);
      console.error('[Database] Topic ID used:', actualTopicId, 'Type:', typeof actualTopicId);
      
      // If UUID error and we have an integer, the schema might be mismatched
      // Try to find questions by querying through topics join
      if (questionsError.message && questionsError.message.includes('uuid') && !isNaN(topicIdNum)) {
        console.log('[Database] Attempting alternative query with join...');
        const { data: questionsJoin, error: questionsJoinError } = await client
          .from('questions')
          .select('*, topics!inner(id)')
          .eq('topics.id', topicIdNum);
        
        if (!questionsJoinError && questionsJoin) {
          // Extract just the questions data
          const questionsData = questionsJoin.map(q => {
            const { topics, ...question } = q;
            return question;
          });
          return {
            success: true,
            statusCode: 200,
            data: {
              questions: questionsData,
              questionsWithAnswers: questionsData.map(q => ({ ...q, answers: [] }))
            }
          };
        }
      }
      
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch questions',
        message: questionsError.message
      };
    }
    
    if (!questions || questions.length === 0) {
      return {
        success: true,
        statusCode: 200,
        data: {
          questions: [],
          questionsWithAnswers: []
        }
      };
    }
    
    // Fetch answers for all questions
    const questionIds = questions.map(q => q.id);
    const { data: answers, error: answersError } = await client
      .from('answers')
      .select('*')
      .in('question_id', questionIds)
      .order('question_id', { ascending: true });
    
    if (answersError) {
      console.error('[Database] Error fetching answers:', answersError);
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch answers',
        message: answersError.message
      };
    }
    
    // Combine questions with their answers
    const questionsWithAnswers = questions.map(question => {
      const questionAnswers = (answers || []).filter(a => a.question_id === question.id);
      return {
        ...question,
        answers: questionAnswers
      };
    });
    
    return {
      success: true,
      statusCode: 200,
      data: {
        questions: questions,
        questionsWithAnswers: questionsWithAnswers
      }
    };
  } catch (error) {
    console.error('[Database] Unexpected error fetching topic questions:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Database connection error',
      message: error.message
    };
  }
}

/**
 * Gets topic information by topic ID
 * @param {number|string} topicId - The topic ID
 * @returns {Promise<Object>} Object with success status and topic data/error
 */
export async function getTopicInfo(topicId) {
  try {
    const client = getSupabaseClient();
    
    const topicIdNum = parseInt(topicId);
    let actualTopicId = topicId;
    
    // Get the topic with its label information
    if (!isNaN(topicIdNum)) {
      const { data: topic, error: topicError } = await client
        .from('topics')
        .select(`
          *,
          labels!inner (
            id,
            name,
            item,
            level,
            parent_node,
            parent_node_id,
            parent_id,
            parent,
            parent_label_id,
            parent_label
          )
        `)
        .eq('id', topicIdNum)
        .maybeSingle();
      
      if (!topicError && topic) {
        return {
          success: true,
          statusCode: 200,
          data: topic
        };
      }
    }
    
    // Fallback: try direct query
    const { data: topic, error: topicError } = await client
      .from('topics')
      .select('*')
      .eq('id', actualTopicId)
      .maybeSingle();
    
    if (topicError) {
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch topic',
        message: topicError.message
      };
    }
    
    if (!topic) {
      return {
        success: false,
        statusCode: 404,
        error: 'Topic not found'
      };
    }
    
    // Get label information separately
    const { data: label, error: labelError } = await client
      .from('labels')
      .select('*')
      .eq('id', topic.label_id)
      .maybeSingle();
    
    return {
      success: true,
      statusCode: 200,
      data: {
        ...topic,
        label: label
      }
    };
  } catch (error) {
    console.error('[Database] Unexpected error fetching topic info:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Database connection error',
      message: error.message
    };
  }
}

/**
 * Finds the next topic based on the current topic
 * Logic: Same parent label, next item higher. If none, parent label item one higher, first topic.
 * @param {number|string} currentTopicId - The current topic ID
 * @returns {Promise<Object>} Object with success status and next topic data/error
 */
export async function getNextTopic(currentTopicId) {
  try {
    const client = getSupabaseClient();
    
    // Get current topic with its label
    const topicResult = await getTopicInfo(currentTopicId);
    if (!topicResult.success || !topicResult.data) {
      return {
        success: false,
        statusCode: 404,
        error: 'Current topic not found'
      };
    }
    
    const currentTopic = topicResult.data;
    const currentLabel = currentTopic.label || currentTopic.labels?.[0];
    
    if (!currentLabel) {
      return {
        success: false,
        statusCode: 404,
        error: 'Label not found for current topic'
      };
    }
    
    const currentLabelId = currentLabel.id;
    const currentItem = (currentLabel.item || '').toString().toLowerCase();
    
    // Get all topics with their labels
    const { data: allTopics, error: topicsError } = await client
      .from('topics')
      .select(`
        *,
        labels!inner (
          id,
          name,
          item,
          level,
          parent_node,
          parent_node_id,
          parent_id,
          parent,
          parent_label_id,
          parent_label
        )
      `);
    
    if (topicsError) {
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to fetch topics',
        message: topicsError.message
      };
    }
    
    // Filter topics with the same parent label
    const sameParentTopics = (allTopics || []).filter(t => {
      const label = t.labels?.[0] || t.label;
      if (!label) return false;
      
      // Get parent label ID
      const parentLabelId = label.parent_node || label.parent_node_id || label.parent_id || 
                           label.parent || label.parent_label_id || label.parent_label;
      const currentParentLabelId = currentLabel.parent_node || currentLabel.parent_node_id || 
                                   currentLabel.parent_id || currentLabel.parent || 
                                   currentLabel.parent_label_id || currentLabel.parent_label;
      
      return parentLabelId === currentParentLabelId || 
             String(parentLabelId) === String(currentParentLabelId);
    });
    
    // Sort by label item
    sameParentTopics.sort((a, b) => {
      const itemA = ((a.labels?.[0] || a.label)?.item || '').toString().toLowerCase();
      const itemB = ((b.labels?.[0] || b.label)?.item || '').toString().toLowerCase();
      return itemA.localeCompare(itemB);
    });
    
    // Find current topic index
    const currentIndex = sameParentTopics.findIndex(t => 
      t.id === currentTopic.id || String(t.id) === String(currentTopic.id)
    );
    
    // Try to find next topic in same parent label with higher item
    if (currentIndex >= 0 && currentIndex < sameParentTopics.length - 1) {
      for (let i = currentIndex + 1; i < sameParentTopics.length; i++) {
        const nextTopic = sameParentTopics[i];
        const nextItem = ((nextTopic.labels?.[0] || nextTopic.label)?.item || '').toString().toLowerCase();
        if (nextItem > currentItem) {
          return {
            success: true,
            statusCode: 200,
            data: nextTopic
          };
        }
      }
    }
    
    // If no next topic in same parent, find parent label with item one higher
    const currentParentLabelId = currentLabel.parent_node || currentLabel.parent_node_id || 
                                 currentLabel.parent_id || currentLabel.parent || 
                                 currentLabel.parent_label_id || currentLabel.parent_label;
    
    if (currentParentLabelId) {
      // Get all level 2 labels (parent labels)
      const { data: parentLabels, error: parentLabelsError } = await client
        .from('labels')
        .select('*')
        .eq('level', 2)
        .order('item', { ascending: true });
      
      if (!parentLabelsError && parentLabels) {
        // Find current parent label
        const currentParentLabel = parentLabels.find(l => 
          l.id === currentParentLabelId || String(l.id) === String(currentParentLabelId)
        );
        
        if (currentParentLabel) {
          const currentParentItem = (currentParentLabel.item || '').toString().toLowerCase();
          
          // Find next parent label with higher item
          const nextParentLabel = parentLabels.find(l => {
            const item = (l.item || '').toString().toLowerCase();
            return item > currentParentItem;
          });
          
          if (nextParentLabel) {
            // Get first topic in that parent label
            const { data: firstTopic, error: firstTopicError } = await client
              .from('topics')
              .select(`
                *,
                labels!inner (
                  id,
                  name,
                  item,
                  level
                )
              `)
              .eq('label_id', nextParentLabel.id)
              .order('id', { ascending: true })
              .limit(1)
              .maybeSingle();
            
            if (!firstTopicError && firstTopic) {
              return {
                success: true,
                statusCode: 200,
                data: firstTopic
              };
            }
          }
        }
      }
    }
    
    // No next topic found
    return {
      success: true,
      statusCode: 200,
      data: null
    };
  } catch (error) {
    console.error('[Database] Unexpected error finding next topic:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Database connection error',
      message: error.message
    };
  }
}
