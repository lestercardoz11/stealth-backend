const supabase = require('../config/supabase');

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check if user is approved
const requireApprovedUser = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role, email')
      .eq('id', req.user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Attach profile to request object
    req.userProfile = profile;
    next();
  } catch (error) {
    console.error('User approval check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.userProfile || req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = {
  authenticateUser,
  requireApprovedUser,
  requireAdmin
};