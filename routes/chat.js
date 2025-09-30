const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Rate limiting configuration
const rateLimiter = {
  requests: new Map(),
  isAllowed: function(key, maxRequests, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const userRequests = this.requests.get(key);
    // Remove old requests outside the window
    const validRequests = userRequests.filter(time => time > windowStart);
    this.requests.set(key, validRequests);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    return true;
  }
};

const RATE_LIMITS = {
  CHAT: {
    maxRequests: 30,
    windowMs: 60000 // 1 minute
  }
};

// Helper functions
function mentionsAttachment(query) {
  const attachmentKeywords = ['attachment', 'document', 'file', 'pdf', 'doc', 'uploaded'];
  return attachmentKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
}

function enhanceContextForAttachments(context) {
  return `The user has mentioned attachments or documents. Here is the relevant content from their uploaded documents:\n\n${context}`;
}

async function searchDocuments(query, documentIds, threshold = 0.2, limit = 8) {
  // Simple text search implementation
  // In production, you'd use vector search
  const { data: documents } = await supabase
    .from('documents')
    .select('id, title, content')
    .in('id', documentIds);

  if (!documents) return [];

  return documents
    .filter(doc => doc.content && doc.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit)
    .map(doc => ({
      document_id: doc.id,
      document_title: doc.title,
      content: doc.content,
      similarity: 0.8 // Mock similarity score
    }));
}

async function generateChatResponse(messages, context) {
  // Simple response generation - replace with your AI service
  const lastMessage = messages[messages.length - 1];
  
  if (context) {
    return `Based on the provided documents, I can help you with: ${lastMessage.content}. 

Context from documents:
${context.substring(0, 500)}...

This is a mock response. Please integrate with your preferred AI service.`;
  }
  
  return `I understand you're asking about: ${lastMessage.content}. This is a mock response. Please integrate with your preferred AI service.`;
}

// Chat stream endpoint
router.post('/stream',
  chatRateLimit,
  validate(validationSchemas.chatRequest),
  asyncHandler(async (req, res) => {
    logger.info('Chat stream API called', { requestId: req.id });

    const { messages, documentIds } = req.body;

    logger.info('Chat request details', {
      messagesCount: messages?.length,
      documentIds,
      requestId: req.id,
    });

    const userQuery = messages[messages.length - 1]?.content;

    if (!userQuery) {
      return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({ 
        error: 'No query provided' 
      });
    }

    // Check if user mentions attachments
    const userMentionsAttachment = mentionsAttachment(userQuery);

    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Rate limiting
    const rateLimitKey = `chat:${user.id}`;
    if (!rateLimiter.isAllowed(rateLimitKey, RATE_LIMITS.CHAT.maxRequests, RATE_LIMITS.CHAT.windowMs)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role, email')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      console.error('User not approved:', profile);
      return res.status(403).json({ error: 'Account not approved' });
    }

    let context = '';
    let sources = [];

    // Process document context if document IDs provided
    if (documentIds && documentIds.length > 0) {
      try {
        console.log('Processing selected documents for context...', documentIds);

        // Get full content of selected documents
        const { data: selectedDocuments, error: docError } = await supabase
          .from('documents')
          .select('id, title, content')
          .in('id', documentIds);

        if (docError) {
          console.error('Error fetching selected documents:', docError);
        } else if (selectedDocuments && selectedDocuments.length > 0) {
          console.log(`Retrieved ${selectedDocuments.length} selected documents`);

          const documentsWithContent = selectedDocuments.filter(
            (doc) => doc.content && doc.content.trim().length > 20
          );

          if (documentsWithContent.length > 0) {
            context = documentsWithContent
              .map((doc) => `=== DOCUMENT: ${doc.title} ===\n\n${doc.content}\n\n=== END DOCUMENT ===`)
              .join('\n\n');

            console.log(`Assembled context from ${documentsWithContent.length} documents with content`);
          } else {
            console.log('No documents with sufficient content found');
            context = selectedDocuments
              .map((doc) => `Document "${doc.title}" was selected but contains no readable content.`)
              .join('\n');
          }

          // Search for relevant chunks for source attribution
          try {
            const relevantChunks = await searchDocuments(userQuery, documentIds, 0.2, 8);

            if (relevantChunks && relevantChunks.length > 0) {
              sources = relevantChunks.map((chunk) => ({
                documentId: chunk.document_id,
                documentTitle: chunk.document_title,
                similarity: chunk.similarity,
                content: chunk.content.substring(0, 300) + (chunk.content.length > 300 ? '...' : ''),
              }));
            } else {
              sources = selectedDocuments
                .filter((doc) => doc.content)
                .map((doc) => ({
                  documentId: doc.id,
                  documentTitle: doc.title,
                  similarity: 0.95,
                  content: (doc.content || '').substring(0, 300) + ((doc.content || '').length > 300 ? '...' : ''),
                }));
            }
          } catch (searchError) {
            console.error('Vector search error (non-fatal):', searchError);
            sources = selectedDocuments
              .filter((doc) => doc.content)
              .map((doc) => ({
                documentId: doc.id,
                documentTitle: doc.title,
                similarity: 0.9,
                content: (doc.content || '').substring(0, 300) + ((doc.content || '').length > 300 ? '...' : ''),
              }));
          }
        }
      } catch (contextError) {
        console.error('Error assembling document context:', contextError);
        context = '';
        sources = [];
      }
    }

    // Enhance context if user mentions attachments
    if (userMentionsAttachment && context) {
      context = enhanceContextForAttachments(context);
    }

    console.log('Final context length:', context.length);
    console.log('Number of sources:', sources.length);

    const response = await generateChatResponse(messages, context);

    console.log('Chat response generated successfully');

    res.json({
      response,
      sources,
    });
  } catch (error) {
    console.error('Chat stream API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;