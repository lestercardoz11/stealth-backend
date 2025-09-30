const supabase = require('../config/supabase');
const logger = require('../config/logger');
const constants = require('../config/constants');

const AUDIT_ACTIONS = constants.AUDIT.ACTIONS;
const AUDIT_SEVERITY = constants.AUDIT.SEVERITY;

class AuditLogger {
  async log({
    userId,
    userEmail,
    action,
    resource,
    details,
    ipAddress,
    severity = AUDIT_SEVERITY.LOW,
    metadata = {}
  }) {
    try {
      // Validate severity
      if (!Object.values(AUDIT_SEVERITY).includes(severity)) {
        severity = AUDIT_SEVERITY.LOW;
      }

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

      // Log to Winston logger
      const logLevel = this.getLogLevel(severity);
      logger.log(logLevel, 'Audit Event', auditEntry);

      // Store in database for critical events
      if (severity === AUDIT_SEVERITY.HIGH || severity === AUDIT_SEVERITY.CRITICAL) {
        try {
          const { error } = await supabase
            .from('audit_logs')
            .insert(auditEntry);

          if (error) {
            logger.error('Failed to store audit log in database', { error, auditEntry });
          }
        } catch (dbError) {
          logger.error('Database error while storing audit log', { error: dbError });
        }
      }

      // Send alerts for critical events
      if (severity === AUDIT_SEVERITY.CRITICAL) {
        this.sendAlert(auditEntry);
      }

      return true;
    } catch (error) {
      logger.error('Audit logging error', { error, userId, action });
      return false;
    }
  }

  getLogLevel(severity) {
    const levelMap = {
      [AUDIT_SEVERITY.LOW]: 'info',
      [AUDIT_SEVERITY.MEDIUM]: 'warn',
      [AUDIT_SEVERITY.HIGH]: 'error',
      [AUDIT_SEVERITY.CRITICAL]: 'error',
    };
    return levelMap[severity] || 'info';
  }

  async sendAlert(auditEntry) {
    // Implement alerting mechanism (email, Slack, etc.)
    logger.error('CRITICAL SECURITY EVENT', {
      alert: true,
      ...auditEntry,
    });

    // You can integrate with external alerting services here
    // Example: send to Slack, email, PagerDuty, etc.
  }

  // Log security events with predefined templates
  async logSecurityEvent(type, req, details = {}) {
    const securityEvents = {
      SUSPICIOUS_ACTIVITY: {
        action: AUDIT_ACTIONS.SECURITY_VIOLATION,
        severity: AUDIT_SEVERITY.HIGH,
      },
      BRUTE_FORCE_ATTEMPT: {
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
        severity: AUDIT_SEVERITY.HIGH,
      },
      MALICIOUS_FILE_UPLOAD: {
        action: AUDIT_ACTIONS.SECURITY_VIOLATION,
        severity: AUDIT_SEVERITY.CRITICAL,
      },
      DATA_BREACH_ATTEMPT: {
        action: AUDIT_ACTIONS.SECURITY_VIOLATION,
        severity: AUDIT_SEVERITY.CRITICAL,
      },
    };

    const eventConfig = securityEvents[type];
    if (!eventConfig) {
      logger.warn('Unknown security event type', { type });
      return;
    }

    await this.log({
      userId: req.user?.id,
      userEmail: req.user?.email,
      action: eventConfig.action,
      resource: 'Security Monitor',
      details: `Security event: ${type}`,
      ipAddress: req.ip,
      severity: eventConfig.severity,
      metadata: {
        eventType: type,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method,
        ...details,
      },
    });
  }
}

const auditLogger = new AuditLogger();

module.exports = {
  auditLogger,
  AUDIT_ACTIONS,
  AUDIT_SEVERITY,
};