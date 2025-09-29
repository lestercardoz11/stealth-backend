const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Generate conversation title
router.post('/generate-title', async (req, res) => {
  try {
    const { conversationId, messages } = req.body;

    if (!conversationId || !messages || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    // Check if user is authenticated and approved
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role, email')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Verify user owns this conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation || conversation.user_id !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
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
      console.error('Error updating conversation title:', updateError);
      return res.status(500).json({ error: 'Failed to update title' });
    }

    res.json({ title: cleanTitle });
  } catch (error) {
    console.error('Generate title error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simple title generation function (replace with your AI service)
function generateSimpleTitle(conversationText) {
  const firstMessage = conversationText.split('\n')[0];
  const words = firstMessage.replace(/^(user|assistant):\s*/i, '').split(' ');
  return words.slice(0, 8).join(' ') + (words.length > 8 ? '...' : '');
}

module.exports = router;