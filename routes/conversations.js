const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const constants = require('../config/constants');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/error-handler');
const { validateInput, validationRules } = require('../middleware/security');
const { validate, validationSchemas } = require('../utils/validation');

// Generate conversation title
router.post('/generate-title',
  validate(validationSchemas.generateTitle),
  asyncHandler(async (req, res) => {
    const { conversationId, messages } = req.body;

    // Check if user is authenticated and approved
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(constants.HTTP_STATUS.UNAUTHORIZED).json({ 
        error: constants.ERRORS.UNAUTHORIZED 
      });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role, email')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(constants.HTTP_STATUS.FORBIDDEN).json({
          }
      )
    }

    // Verify user owns this conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation || conversation.user_id !== user.id) {
      return res.status(constants.HTTP_STATUS.NOT_FOUND).json({
          }
      )
    }

    const conversationText = messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    // Simple title generation (you can replace this with your AI service)
    const cleanTitle = generateSimpleTitle(conversationText);

    // Update conversation title in database
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ title: cleanTitle })
      .eq('id', conversationId);

    if (updateError) {
      logger.error('Error updating conversation title', { 
        error: updateError.message, 
        conversationId, 
        userId: user.id 
      });
      return res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
          }
      )
    }

    logger.info('Conversation title generated successfully', {
      conversationId,
      userId: user.id,
      title: cleanTitle,
    });

    res.json({ title: cleanTitle });
  })
);

// Simple title generation function (replace with your AI service)
function generateSimpleTitle(conversationText) {
  const firstMessage = conversationText.split('\n')[0];
  const words = firstMessage.replace(/^(user|assistant):\s*/i, '').split(' ');
  return words.slice(0, 8).join(' ') + (words.length > 8 ? '...' : '');
}

module.exports = router;