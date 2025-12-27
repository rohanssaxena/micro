import http from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { handleLLMRequest } from './src/controllers/llmController.js';
import { getLabels, getMindMapData, getTopicQuestions, getTopicInfo, getNextTopic } from './src/controllers/dbController.js';
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
  const learnActive = activeSection === 'learn' ? 'active' : '';
  
  return renderHTML(template, {
    CONTENT: content,
    CHAT_ACTIVE: chatActive,
    DATA_ACTIVE: dataActive,
    LEARN_ACTIVE: learnActive
  });
}

// Helper function to generate mind map HTML
function generateMindMap(level1, level2, stacks, topicProgress = []) {
  // Create a map of topic_id to progress_percent
  const progressMap = new Map();
  topicProgress.forEach(progress => {
    const progressValue = progress.progress_percent !== null && progress.progress_percent !== undefined 
      ? progress.progress_percent 
      : 0;
    progressMap.set(progress.topic_id, progressValue);
  });
  
  // Helper function to get progress for a node
  const getProgress = (node) => {
    // For topics/stacks, use topic_id
    if (node.id) {
      return progressMap.get(node.id) || 0;
    }
    return 0;
  };
  if (!level1 || level1.length === 0) {
    return '<div class="mind-map-empty">No level 1 labels found</div>';
  }
  
  // Sort level 1 nodes by item in ascending order
  const sortedLevel1 = [...level1].sort((a, b) => {
    const itemA = (a.item || '').toString().toLowerCase();
    const itemB = (b.item || '').toString().toLowerCase();
    return itemA.localeCompare(itemB);
  });
  
  // Create a map for quick lookups
  const level1Map = new Map();
  sortedLevel1.forEach(node => {
    level1Map.set(node.id, node);
    level1Map.set(node.name, node);
  });
  
  // Sort level 2 nodes: first by parent's item, then by own item
  const sortedLevel2 = [...level2].sort((a, b) => {
    // Find parent nodes
    const getParentNode = (node) => {
      const parentNodeValue = node.parent_node || 
                             node.parent_node_id || 
                             node.parent_id || 
                             node.parent ||
                             node.parent_label_id ||
                             node.parent_label;
      
      if (parentNodeValue !== null && parentNodeValue !== undefined) {
        return sortedLevel1.find(n => {
          if (n.id === parentNodeValue) return true;
          if (n.id === parseInt(parentNodeValue)) return true;
          if (String(n.id) === String(parentNodeValue)) return true;
          if (n.name === parentNodeValue) return true;
          if (n.name === String(parentNodeValue)) return true;
          return false;
        });
      }
      return null;
    };
    
    const parentA = getParentNode(a);
    const parentB = getParentNode(b);
    
    // First compare by parent's item
    const parentItemA = parentA ? (parentA.item || '').toString().toLowerCase() : '';
    const parentItemB = parentB ? (parentB.item || '').toString().toLowerCase() : '';
    const parentCompare = parentItemA.localeCompare(parentItemB);
    
    if (parentCompare !== 0) {
      return parentCompare;
    }
    
    // Then compare by own item
    const itemA = (a.item || '').toString().toLowerCase();
    const itemB = (b.item || '').toString().toLowerCase();
    return itemA.localeCompare(itemB);
  });
  
  const level2Map = new Map();
  sortedLevel2.forEach(node => {
    level2Map.set(node.id, node);
    level2Map.set(node.name, node);
  });
  
  const stacksMap = new Map();
  stacks.forEach(stack => {
    const labelId = stack.label_id || stack.label;
    const labelName = stack.label || stack.name;
    if (!stacksMap.has(labelId)) {
      stacksMap.set(labelId, []);
    }
    if (!stacksMap.has(labelName)) {
      stacksMap.set(labelName, []);
    }
    stacksMap.get(labelId).push(stack);
    stacksMap.get(labelName).push(stack);
  });
  
  // Sort stacks/topics: by parent's parent's item, then parent's item, then own item
  const sortedStacks = [...stacks].sort((a, b) => {
    // Find parent level 2 nodes
    const getParentNode2 = (stack) => {
      const stackLabel = stack.label_id || stack.label || stack.name;
      return sortedLevel2.find(n => n.id === stackLabel || n.name === stackLabel);
    };
    
    // Find parent's parent (level 1) nodes
    const getParentNode1 = (node2) => {
      if (!node2) return null;
      const parentNodeValue = node2.parent_node || 
                             node2.parent_node_id || 
                             node2.parent_id || 
                             node2.parent ||
                             node2.parent_label_id ||
                             node2.parent_label;
      
      if (parentNodeValue !== null && parentNodeValue !== undefined) {
        return sortedLevel1.find(n => {
          if (n.id === parentNodeValue) return true;
          if (n.id === parseInt(parentNodeValue)) return true;
          if (String(n.id) === String(parentNodeValue)) return true;
          if (n.name === parentNodeValue) return true;
          if (n.name === String(parentNodeValue)) return true;
          return false;
        });
      }
      return null;
    };
    
    const parent2A = getParentNode2(a);
    const parent2B = getParentNode2(b);
    const parent1A = getParentNode1(parent2A);
    const parent1B = getParentNode1(parent2B);
    
    // First: compare by parent's parent's item (level 1 item)
    const parent1ItemA = parent1A ? (parent1A.item || '').toString().toLowerCase() : '';
    const parent1ItemB = parent1B ? (parent1B.item || '').toString().toLowerCase() : '';
    const parent1Compare = parent1ItemA.localeCompare(parent1ItemB);
    if (parent1Compare !== 0) return parent1Compare;
    
    // Second: compare by parent's item (level 2 item)
    const parent2ItemA = parent2A ? (parent2A.item || '').toString().toLowerCase() : '';
    const parent2ItemB = parent2B ? (parent2B.item || '').toString().toLowerCase() : '';
    const parent2Compare = parent2ItemA.localeCompare(parent2ItemB);
    if (parent2Compare !== 0) return parent2Compare;
    
    // Third: compare by own item
    const itemA = (a.item || '').toString().toLowerCase();
    const itemB = (b.item || '').toString().toLowerCase();
    return itemA.localeCompare(itemB);
  });
  
  // Generate connections
  const connections = [];
  
  // Build connection map for positioning
  const nodeSpacing = 120; // Base spacing between nodes
  
  // First, calculate positions for column 3 (stacks) - they determine positions
  const stackPositions = new Map();
  let stackY = 0;
  sortedStacks.forEach((stack, stackIdx) => {
    const stackId = `stack-${stack.id || stackIdx}`;
    stackPositions.set(stackId, stackY);
    stackY += nodeSpacing;
  });
  
  // Then calculate positions for column 2 - align with first child stack
  const level2Positions = new Map();
  sortedLevel2.forEach((node2, idx2) => {
    const node2Id = `node-l2-${node2.id || idx2}`;
    
    // Find first stack that belongs to this level 2 node
    const firstStack = sortedStacks.find(stack => {
      const stackLabel = stack.label_id || stack.label || stack.name;
      return stackLabel === node2.id || stackLabel === node2.name;
    });
    
    if (firstStack) {
      const firstStackId = `stack-${firstStack.id || sortedStacks.indexOf(firstStack)}`;
      const firstStackY = stackPositions.get(firstStackId);
      level2Positions.set(node2Id, firstStackY);
    } else {
      // If no stacks, position at end
      level2Positions.set(node2Id, stackY);
      stackY += nodeSpacing;
    }
  });
  
  // Finally, calculate positions for column 1 - align with first child level 2 node
  const level1Positions = new Map();
  sortedLevel1.forEach((node1, idx1) => {
    const nodeId = `node-l1-${node1.id || idx1}`;
    
    // Find first level 2 node that belongs to this level 1 node
    const firstLevel2 = sortedLevel2.find(node2 => {
      const parentValue = node2.parent_node || 
                         node2.parent_node_id || 
                         node2.parent_id || 
                         node2.parent ||
                         node2.parent_label_id ||
                         node2.parent_label;
      return parentValue === node1.id || 
             parentValue === node1.name ||
             String(parentValue) === String(node1.id) ||
             String(parentValue) === String(node1.name);
    });
    
    if (firstLevel2) {
      const firstLevel2Id = `node-l2-${firstLevel2.id || sortedLevel2.indexOf(firstLevel2)}`;
      const firstLevel2Y = level2Positions.get(firstLevel2Id);
      level1Positions.set(nodeId, firstLevel2Y);
    } else {
      // If no level 2 children, position at end
      level1Positions.set(nodeId, stackY);
      stackY += nodeSpacing;
    }
  });
  
  // Calculate container height based on maximum position
  const maxHeight = Math.max(
    ...Array.from(level1Positions.values()),
    ...Array.from(level2Positions.values()),
    ...Array.from(stackPositions.values())
  ) + nodeSpacing;
  
  // Column 1: Level 1 nodes (sorted) - with absolute positioning
  let column1Html = '<div class="mind-map-column mind-map-column-1">';
  sortedLevel1.forEach((node1, idx1) => {
    const nodeId = `node-l1-${node1.id || idx1}`;
    const top = level1Positions.get(nodeId) || 0;
    const progress1 = getProgress(node1);
    column1Html += `
      <div class="mind-map-node mind-map-node-l1" id="${nodeId}" data-node-id="${node1.id}" data-node-name="${escapeHtml(node1.name)}" style="top: ${top}px;">
        <div class="mind-map-node-content">
          <div class="mind-map-node-title">${escapeHtml(node1.name || 'Unnamed')}</div>
          ${node1.description ? `<div class="mind-map-node-desc">${escapeHtml(node1.description)}</div>` : ''}
        </div>
        <div class="mind-map-node-progress-container">
          <div class="mind-map-progress-bar">
            <div class="mind-map-progress-fill" style="width: ${progress1}%"></div>
          </div>
          <span class="mind-map-progress-text">${progress1}%</span>
        </div>
      </div>
    `;
  });
  column1Html += '</div>';
  
  // Column 2: Level 2 nodes (sorted) - with absolute positioning
  let column2Html = '<div class="mind-map-column mind-map-column-2">';
  sortedLevel2.forEach((node2, idx2) => {
    const node2Id = `node-l2-${node2.id || idx2}`;
    const top = level2Positions.get(node2Id) || 0;
    
    // Find parent level 1 node - check multiple possible field names
    let parentNode1 = null;
    
    // Check all possible parent field variations
    const parentNodeValue = node2.parent_node || 
                           node2.parent_node_id || 
                           node2.parent_id || 
                           node2.parent ||
                           node2.parent_label_id ||
                           node2.parent_label;
    
    if (parentNodeValue !== null && parentNodeValue !== undefined) {
      // Try to match by ID first (exact match, string match, parsed int)
      parentNode1 = sortedLevel1.find(n => {
        if (n.id === parentNodeValue) return true;
        if (n.id === parseInt(parentNodeValue)) return true;
        if (String(n.id) === String(parentNodeValue)) return true;
        if (n.name === parentNodeValue) return true;
        if (n.name === String(parentNodeValue)) return true;
        return false;
      });
    }
    
    if (parentNode1) {
      const parentId = `node-l1-${parentNode1.id || sortedLevel1.indexOf(parentNode1)}`;
      // Only add connection if it doesn't already exist
      if (!connections.some(c => c.from === parentId && c.to === node2Id)) {
        connections.push({ from: parentId, to: node2Id, type: 'l1-l2' });
      }
    }
    
    const progress2 = getProgress(node2);
    column2Html += `
      <div class="mind-map-node mind-map-node-l2" id="${node2Id}" data-node-id="${node2.id}" data-node-name="${escapeHtml(node2.name)}" style="top: ${top}px;">
        <div class="mind-map-node-content">
          <div class="mind-map-node-title">${escapeHtml(node2.name || 'Unnamed')}</div>
          ${node2.description ? `<div class="mind-map-node-desc">${escapeHtml(node2.description)}</div>` : ''}
        </div>
        <div class="mind-map-node-progress-container">
          <div class="mind-map-progress-bar">
            <div class="mind-map-progress-fill" style="width: ${progress2}%"></div>
          </div>
          <span class="mind-map-progress-text">${progress2}%</span>
        </div>
      </div>
    `;
  });
  column2Html += '</div>';
  
  // Column 3: Stacks (sorted) - with absolute positioning
  let column3Html = '<div class="mind-map-column mind-map-column-3">';
  sortedStacks.forEach((stack, stackIdx) => {
    const stackId = `stack-${stack.id || stackIdx}`;
    const top = stackPositions.get(stackId) || 0;
    const stackLabel = stack.label_id || stack.label || stack.name;
    const parentNode2 = sortedLevel2.find(n => n.id === stackLabel || n.name === stackLabel);
    const parent2Id = parentNode2 ? `node-l2-${parentNode2.id}` : null;
    
    // Create connection from level 2 to stack if not already exists
    if (parent2Id && !connections.some(c => c.from === parent2Id && c.to === stackId)) {
      connections.push({ from: parent2Id, to: stackId, type: 'l2-stack' });
    }
    
    const stackName = stack.name || stack.topic || stack.title || 'Unnamed Stack';
    const progress3 = getProgress(stack);
    const topicId = stack.id; // For topics/stacks, the id is the topic_id
    column3Html += `
      <div class="mind-map-node mind-map-node-stack" id="${stackId}" data-stack-id="${stack.id}" data-topic-id="${topicId}" style="top: ${top}px;">
        <div class="mind-map-node-content">
          <div class="mind-map-node-title">${escapeHtml(stackName)}</div>
          ${stack.description ? `<div class="mind-map-node-desc">${escapeHtml(stack.description)}</div>` : ''}
        </div>
        <div class="mind-map-node-progress-container">
          <div class="mind-map-progress-bar">
            <div class="mind-map-progress-fill" style="width: ${progress3}%"></div>
          </div>
          <span class="mind-map-progress-text">${progress3}%</span>
        </div>
      </div>
    `;
  });
  column3Html += '</div>';
  
  // Log connections for debugging
  console.log(`[MindMap] Total connections created: ${connections.length}`);
  console.log(`[MindMap] L1->L2 connections: ${connections.filter(c => c.type === 'l1-l2').length}`);
  console.log(`[MindMap] L2->Stack connections: ${connections.filter(c => c.type === 'l2-stack').length}`);
  
  // Generate SVG for connections (using paths for curves)
  let svgConnections = '';
  connections.forEach((conn, idx) => {
    svgConnections += `<path class="mind-map-connection mind-map-connection-${conn.type}" 
      d="M 0,0 Q 0,0 0,0"
      data-from="${conn.from}" data-to="${conn.to}" 
      fill="none" stroke-width="2" />`;
  });
  
  return `
    <div class="mind-map-container" style="min-height: ${maxHeight}px;">
      <svg class="mind-map-connections" xmlns="http://www.w3.org/2000/svg">
        ${svgConnections}
      </svg>
      <div class="mind-map-columns">
        ${column1Html}
        ${column2Html}
        ${column3Html}
      </div>
    </div>
  `;
}

// Helper function to generate Learn page HTML
function generateLearnPage(questions, topicId, topicInfo = null, nextTopic = null) {
  const totalQuestions = questions.length;
  const topicName = topicInfo?.topic || topicInfo?.name || 'Topic';
  // Handle nextTopic - it should have a 'topic' field from the topics table
  const nextTopicName = nextTopic?.topic || nextTopic?.name || null;
  const nextTopicId = nextTopic?.id || null;
  
  // Debug logging
  console.log('[Learn] Topic Info:', { topicName, topicInfo: topicInfo?.topic });
  console.log('[Learn] Next Topic Result:', { 
    hasNextTopic: !!nextTopic, 
    nextTopicName, 
    nextTopicId, 
    nextTopicKeys: nextTopic ? Object.keys(nextTopic) : null,
    nextTopicFull: nextTopic 
  });
  
  // Build questions HTML
  let questionsHtml = '';
  questions.forEach((question, index) => {
    const questionId = `question-${question.id}`;
    let answersHtml = '';
    
    question.answers.forEach((answer, ansIndex) => {
      const answerId = `answer-${question.id}-${answer.id}`;
      // Handle boolean or string correct field
      const isCorrect = answer.correct === true || answer.correct === 'true' || answer.correct === 1 || answer.correct === '1';
      answersHtml += `
        <label class="answer-option">
          <input type="radio" name="question-${question.id}" value="${answer.id}" data-correct="${isCorrect}" data-explanation="${escapeHtml(answer.explanation || '')}">
          <span class="answer-text">${escapeHtml(answer.answer)}</span>
        </label>
      `;
    });
    
    questionsHtml += `
      <div class="learn-question" data-question-id="${question.id}" data-question-index="${index}" style="display: ${index === 0 ? 'block' : 'none'};">
        <div class="learn-question-text">
          <h2>${escapeHtml(question.question)}</h2>
          ${question.description ? `<p class="question-description">${escapeHtml(question.description)}</p>` : ''}
        </div>
        <div class="learn-answers">
          ${answersHtml}
        </div>
      </div>
    `;
  });
  
  return `
    <div class="learn-container">
      <div class="learn-progress-container" id="learn-progress-container">
        <div class="learn-progress-bar">
          <div class="learn-progress-fill" id="learn-progress-fill" style="width: 0%"></div>
        </div>
        <div class="learn-progress-text" id="learn-progress-text">0 / ${totalQuestions} correct</div>
      </div>
      <div class="learn-questions-container" id="learn-questions-container">
        ${questionsHtml}
      </div>
      <div class="learn-actions-wrapper">
        <div class="learn-explanation-banner" id="learn-explanation-banner" style="display: none;"></div>
        <div class="learn-actions" id="learn-actions">
          <button class="learn-skip-btn" id="learn-skip-btn">Skip</button>
          <button class="learn-submit-btn" id="learn-submit-btn" disabled>Select an answer</button>
        </div>
      </div>
      <div class="learn-congratulations" id="learn-congratulations" style="display: none;">
        <div class="congratulations-content">
          <div class="congratulations-graphic">🎉</div>
          <h1 class="congratulations-title">Congratulations!</h1>
          <p class="congratulations-topic">You've mastered: <strong>${escapeHtml(topicName)}</strong></p>
          <p class="congratulations-score" id="congratulations-score"></p>
          <div class="congratulations-next-topic" id="congratulations-next-topic" style="display: none;">
            <p class="next-topic-label">Next Topic:</p>
            <p class="next-topic-name" id="next-topic-name"></p>
          </div>
        </div>
        <div class="congratulations-actions">
          <button class="congratulations-btn congratulations-btn-back" id="congratulations-back-btn">Back to Course</button>
          <button class="congratulations-btn congratulations-btn-continue" id="congratulations-continue-btn" ${nextTopicId ? '' : 'disabled'}>Continue</button>
        </div>
      </div>
    <script>
      // Learn page functionality
      (function() {
        const questions = ${JSON.stringify(questions)};
        const topicName = ${JSON.stringify(topicName)};
        const nextTopicName = ${JSON.stringify(nextTopicName)};
        const nextTopicId = ${JSON.stringify(nextTopicId)};
        let currentQuestionIndex = 0;
        let correctAnswers = 0;
        let answeredQuestions = new Set();
        
        function showCongratulations(correct, total) {
          // Hide question container and related elements
          document.getElementById('learn-questions-container').style.display = 'none';
          document.getElementById('learn-explanation-banner').style.display = 'none';
          document.getElementById('learn-actions').style.display = 'none';
          document.getElementById('learn-progress-container').style.display = 'none';
          
          // Show congratulations screen
          const congratsScreen = document.getElementById('learn-congratulations');
          congratsScreen.style.display = 'block';
          
          // Update score
          document.getElementById('congratulations-score').textContent = 
            'You got ' + correct + ' out of ' + total + ' questions correct!';
          
          // Show next topic if available
          const continueBtn = document.getElementById('congratulations-continue-btn');
          if (nextTopicName && nextTopicId) {
            document.getElementById('congratulations-next-topic').style.display = 'block';
            document.getElementById('next-topic-name').textContent = nextTopicName;
            continueBtn.style.display = 'block';
            continueBtn.disabled = false;
          } else {
            document.getElementById('congratulations-next-topic').style.display = 'none';
            continueBtn.style.display = 'block';
            continueBtn.disabled = true;
          }
        }
        
        function updateProgress() {
          const progressPercent = (correctAnswers / questions.length) * 100;
          document.getElementById('learn-progress-fill').style.width = progressPercent + '%';
          document.getElementById('learn-progress-text').textContent = correctAnswers + ' / ' + questions.length + ' correct';
        }
        
        let questionAnswered = false;
        let skippedQuestions = new Set();
        
        function showQuestion(index) {
          document.querySelectorAll('.learn-question').forEach((q, i) => {
            q.style.display = i === index ? 'block' : 'none';
          });
          
          // Reset state
          const currentQuestion = document.querySelectorAll('.learn-question')[index];
          const radioButtons = currentQuestion.querySelectorAll('input[type="radio"]');
          const answerOptions = currentQuestion.querySelectorAll('.answer-option');
          
          // Reset all radio buttons and answer options
          radioButtons.forEach(rb => {
            rb.checked = false;
            rb.disabled = false;
          });
          answerOptions.forEach(opt => {
            opt.classList.remove('disabled', 'correct-answer', 'incorrect-answer');
            opt.style.opacity = '1';
            opt.style.pointerEvents = 'auto';
          });
          
          // Reset buttons and banner
          const submitBtn = document.getElementById('learn-submit-btn');
          submitBtn.disabled = true;
          submitBtn.textContent = 'Select an answer';
          const banner = document.getElementById('learn-explanation-banner');
          banner.style.display = 'none';
          banner.classList.remove('learn-explanation-correct', 'learn-explanation-incorrect');
          
          questionAnswered = false;
        }
        
        function disableAllAnswers(currentQuestion, selectedAnswer, isCorrect) {
          const answerOptions = currentQuestion.querySelectorAll('.answer-option');
          const radioButtons = currentQuestion.querySelectorAll('input[type="radio"]');
          
          if (isCorrect) {
            // If correct, disable all answers
            answerOptions.forEach(opt => {
              const radio = opt.querySelector('input[type="radio"]');
              const isSelected = radio === selectedAnswer;
              
              // Disable all radio buttons
              radio.disabled = true;
              
              if (isSelected) {
                // Keep correct answer styling - don't add any class, just disable
                // The existing checked styling (blue text, bold) will remain
              } else {
                // Grey out other options
                opt.classList.add('disabled');
                opt.style.opacity = '0.5';
                opt.style.pointerEvents = 'none';
              }
            });
          } else {
            // If incorrect, only disable the incorrectly selected answer
            // Other answers remain clickable
            answerOptions.forEach(opt => {
              const radio = opt.querySelector('input[type="radio"]');
              const isSelected = radio === selectedAnswer;
              
              if (isSelected) {
                // Mark incorrect selected answer and disable it
                opt.classList.add('incorrect-answer');
                radio.disabled = true;
              } else {
                // Keep other answers enabled and clickable
                radio.disabled = false;
                opt.classList.remove('disabled');
                opt.style.opacity = '1';
                opt.style.pointerEvents = 'auto';
              }
            });
          }
        }
        
        function submitAnswer() {
          if (questionAnswered) return;
          
          const currentQuestion = document.querySelectorAll('.learn-question')[currentQuestionIndex];
          const selectedAnswer = currentQuestion.querySelector('input[type="radio"]:checked');
          const banner = document.getElementById('learn-explanation-banner');
          const submitBtn = document.getElementById('learn-submit-btn');
          
          if (!selectedAnswer) {
            return;
          }
          
          // Check if answer is correct
          const correctValue = selectedAnswer.dataset.correct;
          const isCorrect = correctValue === 'true' || correctValue === true;
          const explanation = selectedAnswer.dataset.explanation || '';
          
          if (isCorrect) {
            questionAnswered = true;
            
            // Disable all answer choices
            disableAllAnswers(currentQuestion, selectedAnswer, true);
            
            banner.className = 'learn-explanation-banner learn-explanation-correct';
            banner.textContent = explanation || 'Correct!';
            banner.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Continue';
            
            // Track correct answer (only once per question)
            const questionId = currentQuestion.dataset.questionId;
            if (!answeredQuestions.has(questionId)) {
              correctAnswers++;
              answeredQuestions.add(questionId);
              updateProgress();
            }
          } else {
            // Incorrect answer - show error but keep other answers clickable
            disableAllAnswers(currentQuestion, selectedAnswer, false);
            
            banner.className = 'learn-explanation-banner learn-explanation-incorrect';
            banner.textContent = explanation || 'Incorrect. Please try again.';
            banner.style.display = 'block';
            submitBtn.disabled = true;
            submitBtn.textContent = 'Try again';
            
            // Don't set questionAnswered = true, so user can try again
          }
        }
        
        // Add event listeners to radio buttons
        document.querySelectorAll('input[type="radio"]').forEach(radio => {
          radio.addEventListener('change', () => {
            const submitBtn = document.getElementById('learn-submit-btn');
            const banner = document.getElementById('learn-explanation-banner');
            const selectedAnswer = document.querySelector('input[type="radio"]:checked');
            
            // If question was already answered correctly, don't allow changes
            if (questionAnswered) return;
            
            // If there was an error banner from a previous incorrect answer, hide it
            if (banner.style.display === 'block' && banner.classList.contains('learn-explanation-incorrect')) {
              banner.style.display = 'none';
              
              // Remove incorrect styling from previously selected answer
              const currentQuestion = document.querySelectorAll('.learn-question')[currentQuestionIndex];
              const answerOptions = currentQuestion.querySelectorAll('.answer-option');
              answerOptions.forEach(opt => {
                opt.classList.remove('incorrect-answer');
                const radio = opt.querySelector('input[type="radio"]');
                if (radio && !radio.disabled) {
                  radio.disabled = false;
                }
              });
            }
            
            if (selectedAnswer) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Submit';
            } else {
              submitBtn.disabled = true;
              submitBtn.textContent = 'Select an answer';
            }
          });
        });
        
        // Submit button handler
        document.getElementById('learn-submit-btn').addEventListener('click', () => {
          if (questionAnswered) {
            // Continue to next question
            const currentQuestion = document.querySelectorAll('.learn-question')[currentQuestionIndex];
            const selectedAnswer = currentQuestion.querySelector('input[type="radio"]:checked');
            const correctValue = selectedAnswer ? selectedAnswer.dataset.correct : null;
            const isCorrect = correctValue === 'true' || correctValue === true;
            
            if (isCorrect && currentQuestionIndex < questions.length - 1) {
              currentQuestionIndex++;
              showQuestion(currentQuestionIndex);
            } else if (isCorrect && currentQuestionIndex === questions.length - 1) {
              // All questions completed - show congratulations screen
              showCongratulations(correctAnswers, questions.length);
            }
          } else {
            // Submit the answer
            submitAnswer();
          }
        });
        
        // Skip button handler
        document.getElementById('learn-skip-btn').addEventListener('click', () => {
          const currentQuestion = document.querySelectorAll('.learn-question')[currentQuestionIndex];
          const questionId = currentQuestion.dataset.questionId;
          
          // Mark as skipped
          skippedQuestions.add(questionId);
          
          // Move to next question
          if (currentQuestionIndex < questions.length - 1) {
            currentQuestionIndex++;
            showQuestion(currentQuestionIndex);
          } else {
            // All questions completed (some skipped) - show congratulations screen
            showCongratulations(correctAnswers, questions.length);
          }
        });
        
        // Button handlers
        document.getElementById('congratulations-back-btn').addEventListener('click', () => {
          window.location.href = '/data';
        });
        
        document.getElementById('congratulations-continue-btn').addEventListener('click', () => {
          if (nextTopicId && !document.getElementById('congratulations-continue-btn').disabled) {
            window.location.href = '/learn?topic_id=' + nextTopicId;
          }
        });
        
        // Initialize
        updateProgress();
        showQuestion(0);
      })();
    </script>
  `;
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
      const mindMapResult = await getMindMapData();
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      
      let dataContent = '';
      
      // Build mind map
      let mindMapHtml = '';
      if (mindMapResult.success && mindMapResult.data) {
        const { level1, level2, stacks, topicProgress } = mindMapResult.data;
        
        // Generate mind map HTML
        mindMapHtml = generateMindMap(level1, level2, stacks, topicProgress || []);
      } else {
        mindMapHtml = '<div class="mind-map-error">Unable to load mind map data</div>';
      }
      
      dataContent = `
        <div class="mind-map-card">
          ${mindMapHtml}
        </div>
      `;
      
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
  // Handle Learn page GET request
  else if (pathname === '/learn' && req.method === 'GET') {
    try {
      const topicId = url.searchParams.get('topic_id');
      
      if (!topicId) {
        const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
        const learnContent = `
          <div class="learn-container">
            <h1>Learn</h1>
            <div class="learn-error">
              <p>No topic selected. Please select a topic from the mind map and click "Learn".</p>
            </div>
          </div>
        `;
        const renderedHtml = renderPage(html, learnContent, 'learn');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 200;
        res.end(renderedHtml);
        return;
      }
      
      // Try to parse as integer first, but keep as string if it might be UUID
      // The database might have topic_id as UUID, so we'll pass it as-is
      const result = await getTopicQuestions(topicId);
      const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
      
      if (result.success && result.data && result.data.questionsWithAnswers.length > 0) {
        const questions = result.data.questionsWithAnswers;
        const totalQuestions = questions.length;
        
        // Get topic info and next topic for congratulations screen
        const topicInfoResult = await getTopicInfo(topicId);
        const nextTopicResult = await getNextTopic(topicId);
        
        const topicInfo = topicInfoResult.success ? topicInfoResult.data : null;
        const nextTopic = nextTopicResult.success ? nextTopicResult.data : null;
        
        // Generate Learn page HTML
        const learnContent = generateLearnPage(questions, topicId, topicInfo, nextTopic);
        const renderedHtml = renderPage(html, learnContent, 'learn');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 200;
        res.end(renderedHtml);
      } else if (result.success && result.data && result.data.questionsWithAnswers.length === 0) {
        const learnContent = `
          <div class="learn-container">
            <h1>Learn</h1>
            <div class="learn-error">
              <p>No questions found for this topic.</p>
            </div>
          </div>
        `;
        const renderedHtml = renderPage(html, learnContent, 'learn');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 200;
        res.end(renderedHtml);
      } else {
        const learnContent = `
          <div class="learn-container">
            <h1>Learn</h1>
            <div class="learn-error">
              <p>Error loading questions: ${escapeHtml(result.message || result.error || 'Unknown error')}</p>
            </div>
          </div>
        `;
        const renderedHtml = renderPage(html, learnContent, 'learn');
        res.setHeader('Content-Type', 'text/html');
        res.statusCode = 200;
        res.end(renderedHtml);
      }
    } catch (error) {
      console.error('[Server] Error loading learn page:', error);
      try {
        const html = readFileSync(join(__dirname, 'public', 'index.html'), 'utf8');
        const learnContent = `
          <div class="learn-container">
            <h1>Learn</h1>
            <div class="learn-error">
              <p>Error: ${escapeHtml(error.message)}</p>
            </div>
          </div>
        `;
        const renderedHtml = renderPage(html, learnContent, 'learn');
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
