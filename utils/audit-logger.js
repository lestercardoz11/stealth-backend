const supabase = require('../config/supabase');

const AUDIT_ACTIONS = {
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  AI_QUERY_PROCESSED: 'AI_QUERY_PROCESSED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  DOCUMENT_ACCESSED: 'DOCUMENT_ACCESSED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS'
};

class AuditLogger {
  async log({
    userId,
    userEmail,
    action,
    resource,
    details,
    ipAddress,
    severity = 'low',
    metadata = {}
  }) {
    try {
      const auditEntry = {
        user_id: userId,
        user_email: userEmail,
        action,
        resource,
        details,
        ip_address: ipAddress,
        severity,
        metadata,
        timestamp: new Date().toISOString()
      };

      // Log to console for development
      console.log('Audit Log:', auditEntry);

      // In production, you might want to store this in a database
      // const { error } = await supabase
      //   .from('audit_logs')
      //   .insert(auditEntry);

      // if (error) {
      //   console.error('Failed to store audit log:', error);
      // }

      return true;
    } catch (error) {
      console.error('Audit logging error:', error);
      return false;
    }
  }
}

const auditLogger = new AuditLogger();

module.exports = {
  auditLogger,
  AUDIT_ACTIONS
};