// Event store for Bridge request/response persistence and replay
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

class EventStore {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '..', '.events');
    this.ensureStorage();
  }

  ensureStorage() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  logEvent(eventType, payload, metadata = {}) {
    const event = {
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      payload,
      metadata
    };

    const filename = `${Date.now()}-${event.eventId}.json`;
    const filepath = path.join(this.storagePath, filename);

    try {
      fs.writeFileSync(filepath, JSON.stringify(event, null, 2));
      return event;
    } catch (err) {
      console.error('Failed to log event:', err);
      return null;
    }
  }

  logIntentReceived(intentEnvelope, requestMeta = {}) {
    return this.logEvent('intent.received', intentEnvelope, {
      source: requestMeta.source || 'unknown',
      clientIp: requestMeta.clientIp
    });
  }

  logPlanGenerated(plan, intentId) {
    return this.logEvent('plan.generated', plan, { intentId });
  }

  logApprovalIssued(approval, planId) {
    return this.logEvent('approval.issued', approval, { planId });
  }

  logApprovalDenied(planId, reason) {
    return this.logEvent('approval.denied', { planId, reason }, {});
  }

  getAllEvents() {
    const files = fs.readdirSync(this.storagePath)
      .filter(f => f.endsWith('.json'))
      .sort();

    return files.map(file => {
      const filepath = path.join(this.storagePath, file);
      const content = fs.readFileSync(filepath, 'utf8');
      return JSON.parse(content);
    });
  }

  getEventsByType(eventType) {
    return this.getAllEvents().filter(e => e.eventType === eventType);
  }

  getEventsByTimeRange(startTime, endTime) {
    return this.getAllEvents().filter(e => {
      const eventTime = new Date(e.timestamp);
      return eventTime >= startTime && eventTime <= endTime;
    });
  }

  clearEvents() {
    const files = fs.readdirSync(this.storagePath)
      .filter(f => f.endsWith('.json'));
    
    files.forEach(file => {
      fs.unlinkSync(path.join(this.storagePath, file));
    });
  }
}

// Singleton instance
let storeInstance = null;

function getEventStore(storagePath) {
  if (!storeInstance) {
    storeInstance = new EventStore(storagePath);
  }
  return storeInstance;
}

module.exports = {
  EventStore,
  getEventStore
};
