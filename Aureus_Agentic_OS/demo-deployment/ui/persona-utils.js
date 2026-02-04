/**
 * Persona-based Role System for Aureus Agentic OS Demo
 * Simple role simulation without real authentication
 */

const PersonaConfig = {
  personal: {
    name: 'Personal User',
    icon: '👤',
    color: '#3b82f6',
    permissions: {
      viewAgentStudio: true,
      createAgents: true,
      viewWorkflows: true,
      runWorkflows: true,
      viewMonitoring: true,
      viewDeployment: false,
      approveHighRisk: false,
      manageSnapshots: false,
      accessDevOps: false,
      viewAuditLogs: false
    },
    features: [
      'Agent Studio',
      'Basic Workflows',
      'Personal Dashboard',
      'Simple Monitoring'
    ]
  },
  developer: {
    name: 'Agent Developer',
    icon: '👨‍💻',
    color: '#10b981',
    permissions: {
      viewAgentStudio: true,
      createAgents: true,
      viewWorkflows: true,
      runWorkflows: true,
      viewMonitoring: true,
      viewDeployment: true,
      approveHighRisk: false,
      manageSnapshots: false,
      accessDevOps: false,
      viewAuditLogs: true,
      editTools: true,
      runTests: true,
      deployStaging: true
    },
    features: [
      'All Studios',
      'Tool Adapter Wizard',
      'Testing & Validation',
      'Workflow Designer',
      'Deploy to Staging'
    ]
  },
  admin: {
    name: 'Administrator',
    icon: '👔',
    color: '#f59e0b',
    permissions: {
      viewAgentStudio: true,
      createAgents: true,
      viewWorkflows: true,
      runWorkflows: true,
      viewMonitoring: true,
      viewDeployment: true,
      approveHighRisk: true,
      manageSnapshots: true,
      accessDevOps: false,
      viewAuditLogs: true,
      managePolicies: true,
      manageUsers: true
    },
    features: [
      'Policy Management',
      'Risk Approvals',
      'Audit Logs',
      'System Monitoring',
      'User Management'
    ]
  },
  devops: {
    name: 'DevOps Engineer',
    icon: '⚙️',
    color: '#ef4444',
    permissions: {
      viewAgentStudio: true,
      createAgents: false,
      viewWorkflows: true,
      runWorkflows: true,
      viewMonitoring: true,
      viewDeployment: true,
      approveHighRisk: true,
      manageSnapshots: true,
      accessDevOps: true,
      viewAuditLogs: true,
      deployProduction: true,
      executeRollback: true
    },
    features: [
      'Deployment Pipeline',
      'Production Control',
      'Snapshot & Rollback',
      'Infrastructure Ops',
      'Observability Dashboard'
    ]
  }
};

class PersonaManager {
  constructor() {
    this.currentPersona = this.loadPersona();
  }

  loadPersona() {
    return sessionStorage.getItem('aureus_persona') || 'personal';
  }

  setPersona(persona) {
    if (PersonaConfig[persona]) {
      sessionStorage.setItem('aureus_persona', persona);
      sessionStorage.setItem('aureus_persona_selected_at', new Date().toISOString());
      this.currentPersona = persona;
      return true;
    }
    return false;
  }

  getPersona() {
    return this.currentPersona;
  }

  getPersonaConfig() {
    return PersonaConfig[this.currentPersona] || PersonaConfig.personal;
  }

  hasPermission(permission) {
    const config = this.getPersonaConfig();
    return config.permissions[permission] === true;
  }

  getPermissions() {
    return this.getPersonaConfig().permissions;
  }

  getFeatures() {
    return this.getPersonaConfig().features;
  }

  getName() {
    return this.getPersonaConfig().name;
  }

  getIcon() {
    return this.getPersonaConfig().icon;
  }

  getColor() {
    return this.getPersonaConfig().color;
  }

  clearPersona() {
    sessionStorage.removeItem('aureus_persona');
    sessionStorage.removeItem('aureus_persona_selected_at');
    this.currentPersona = 'personal';
  }
}

// Global instance
const personaManager = new PersonaManager();

// UI Helper Functions
function addPersonaBadge() {
  const badge = document.createElement('div');
  badge.id = 'persona-badge';
  badge.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${personaManager.getColor()};
    color: white;
    padding: 10px 20px;
    border-radius: 25px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  `;
  badge.innerHTML = `
    <span style="font-size: 18px;">${personaManager.getIcon()}</span>
    <span>${personaManager.getName()}</span>
    <span style="opacity: 0.7; font-size: 12px;">▼</span>
  `;
  badge.onclick = () => {
    if (confirm('Switch persona?')) {
      window.location.href = '/persona-selector';
    }
  };
  document.body.appendChild(badge);
}

function hideElementIfNoPermission(selector, permission) {
  const elements = document.querySelectorAll(selector);
  if (!personaManager.hasPermission(permission)) {
    elements.forEach(el => {
      el.style.display = 'none';
    });
  }
}

function disableElementIfNoPermission(selector, permission) {
  const elements = document.querySelectorAll(selector);
  if (!personaManager.hasPermission(permission)) {
    elements.forEach(el => {
      el.disabled = true;
      el.style.opacity = '0.5';
      el.style.cursor = 'not-allowed';
      el.title = 'Permission denied for your persona';
    });
  }
}

function showPermissionWarning(action) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
  `;
  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 15px;">🔒</div>
      <h2 style="margin-bottom: 10px; color: #1f2937;">Permission Denied</h2>
      <p style="color: #6b7280; margin-bottom: 20px;">
        Your persona (${personaManager.getName()}) does not have permission to ${action}.
      </p>
      <button onclick="this.parentElement.parentElement.remove()" 
              style="background: #667eea; color: white; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px;">
        OK
      </button>
    </div>
  `;
  document.body.appendChild(modal);
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PersonaManager, personaManager, PersonaConfig };
}
