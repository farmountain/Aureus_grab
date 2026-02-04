"""
Aureus Agentic OS - Policy Engine Stub
Demo implementation for end-to-end showcase
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import logging
import time
import random
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=os.getenv('LOG_LEVEL', 'INFO'))
logger = logging.getLogger(__name__)

# Risk assessment thresholds
RISK_THRESHOLDS = {
    'low': 30,
    'medium': 70,
    'high': 100
}

# Action risk scores (simulated)
ACTION_RISKS = {
    'read_document': 10,
    'send_email': 25,
    'create_task': 20,
    'update_record': 35,
    'delete_record': 85,
    'delete_database': 95,
    'execute_code': 90,
    'modify_permissions': 80,
    'transfer_funds': 95,
    'access_admin': 85
}

def calculate_risk_score(context):
    """Calculate risk score based on intent and context"""
    action = context.get('intent', {}).get('action', 'unknown')
    user_id = context.get('intent', {}).get('user_id', 'unknown')
    
    # Base risk from action type
    base_risk = ACTION_RISKS.get(action, 50)
    
    # Modify based on user (simulate trusted users)
    if 'admin' in user_id.lower() or 'privileged' in user_id.lower():
        base_risk = max(0, base_risk - 15)
    
    # Add randomness for demo purposes
    risk_score = base_risk + random.randint(-5, 10)
    risk_score = max(0, min(100, risk_score))
    
    return risk_score

def assess_risk_level(score):
    """Determine risk level from score"""
    if score < RISK_THRESHOLDS['low']:
        return 'low'
    elif score < RISK_THRESHOLDS['medium']:
        return 'medium'
    else:
        return 'high'

def generate_plan(context, risk_score, risk_level):
    """Generate execution plan based on policy evaluation"""
    intent = context.get('intent', {})
    action = intent.get('action', 'unknown')
    parameters = intent.get('parameters', {})
    
    # Determine if approval is required
    requires_approval = risk_level in ['high', 'medium']
    
    # Generate execution steps
    steps = []
    
    # Pre-execution validation
    steps.append({
        'step_id': 1,
        'type': 'validate',
        'description': f'Validate {action} parameters',
        'required': True
    })
    
    # Main action
    steps.append({
        'step_id': 2,
        'type': 'execute',
        'action': action,
        'parameters': parameters,
        'description': f'Execute {action}',
        'required': True
    })
    
    # Post-execution audit
    steps.append({
        'step_id': 3,
        'type': 'audit',
        'description': f'Log {action} execution to audit trail',
        'required': True
    })
    
    plan = {
        'intent_id': intent.get('intent_id', f'intent_{int(time.time())}'),
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'risk_assessment': {
            'score': risk_score,
            'level': risk_level,
            'factors': [
                f'Action type: {action}',
                f'User: {intent.get("user_id", "unknown")}',
                f'Context: {len(context)} fields provided'
            ]
        },
        'approval_required': requires_approval,
        'approval_reason': f'{risk_level.capitalize()} risk action requires review' if requires_approval else None,
        'execution_plan': {
            'steps': steps,
            'estimated_duration_ms': len(steps) * 100,
            'rollback_supported': True
        },
        'policy_metadata': {
            'policy_version': '1.0.0',
            'evaluation_time_ms': random.randint(50, 150),
            'policies_applied': ['global_security', 'user_permissions', 'action_registry']
        }
    }
    
    return plan

@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'aureus-agentic-os',
        'version': '1.0.0-demo',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    })

@app.route('/api/policy/evaluate', methods=['POST'])
def evaluate_policy():
    """
    Evaluate policy for given context and return execution plan
    
    Request body (context):
    {
        "intent": {
            "intent_id": "uuid",
            "action": "send_email",
            "parameters": {...},
            "user_id": "user123",
            "timestamp": "ISO8601"
        },
        "user_context": {...},
        "system_context": {...}
    }
    
    Response (plan):
    {
        "intent_id": "uuid",
        "risk_assessment": {...},
        "approval_required": true/false,
        "execution_plan": {...}
    }
    """
    try:
        context = request.json
        
        if not context or 'intent' not in context:
            return jsonify({
                'error': 'Invalid request',
                'message': 'Context with intent is required'
            }), 400
        
        logger.info(f"Evaluating policy for intent: {context.get('intent', {}).get('action')}")
        
        # Calculate risk
        risk_score = calculate_risk_score(context)
        risk_level = assess_risk_level(risk_score)
        
        # Generate plan
        plan = generate_plan(context, risk_score, risk_level)
        
        logger.info(f"Policy evaluation complete. Risk: {risk_level} ({risk_score}), Approval required: {plan['approval_required']}")
        
        return jsonify(plan), 200
        
    except Exception as e:
        logger.error(f"Error evaluating policy: {str(e)}", exc_info=True)
        return jsonify({
            'error': 'Policy evaluation failed',
            'message': str(e)
        }), 500

@app.route('/api/memory/store', methods=['POST'])
def store_memory():
    """Store context in vector memory (stub)"""
    try:
        data = request.json
        logger.info(f"Storing memory: {data.get('key', 'unknown')}")
        
        return jsonify({
            'status': 'stored',
            'memory_id': f'mem_{int(time.time())}',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
    except Exception as e:
        logger.error(f"Error storing memory: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/memory/retrieve', methods=['POST'])
def retrieve_memory():
    """Retrieve relevant context from memory (stub)"""
    try:
        query = request.json
        logger.info(f"Retrieving memory for: {query.get('query', 'unknown')}")
        
        # Return mock memories
        return jsonify({
            'status': 'success',
            'memories': [
                {
                    'memory_id': 'mem_001',
                    'content': 'Previous interaction context',
                    'relevance_score': 0.85,
                    'timestamp': datetime.utcnow().isoformat() + 'Z'
                }
            ]
        }), 200
    except Exception as e:
        logger.error(f"Error retrieving memory: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics', methods=['GET'])
def analytics():
    """Get policy analytics (stub for dashboard)"""
    return jsonify({
        'total_evaluations': random.randint(1000, 5000),
        'approval_rate': round(random.uniform(0.80, 0.90), 2),
        'average_risk_score': round(random.uniform(30, 50), 1),
        'high_risk_actions_blocked': random.randint(50, 150),
        'evaluation_latency_ms': {
            'p50': random.randint(80, 120),
            'p95': random.randint(150, 200),
            'p99': random.randint(250, 350)
        }
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV', 'production') == 'development'
    
    logger.info(f"Starting Aureus Agentic OS on port {port}")
    logger.info(f"Debug mode: {debug}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
