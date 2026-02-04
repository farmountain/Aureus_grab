#!/usr/bin/env node

/**
 * Aureus Sentinel End-to-End Demo Client
 * 
 * Demonstrates the complete flow:
 * 1. User intent submitted to OpenClaw
 * 2. OpenClaw forwards context to Aureus OS
 * 3. Aureus OS evaluates policy and returns plan
 * 4. Plan sent to Bridge for cryptographic signing
 * 5. Signed approval returned to OpenClaw
 * 6. OpenClaw executes with signature verification
 * 7. Execution report sent back for audit
 */

const axios = require('axios');
const crypto = require('crypto');
const chalk = require('chalk');

// Service URLs (configure for your environment)
const SERVICES = {
    openclaw: process.env.OPENCLAW_URL || 'http://localhost:8080',
    bridge: process.env.BRIDGE_URL || 'http://localhost:3000',
    aureusOS: process.env.AUREUS_OS_URL || 'http://localhost:5000'
};

const API_KEY = process.env.BRIDGE_API_KEY || 'dev_bridge_key_change_in_prod';

// Demo scenarios
const DEMO_SCENARIOS = {
    lowRisk: {
        name: 'Low Risk Action (Auto-Approved)',
        intent: {
            intent_id: `intent_${Date.now()}_1`,
            action: 'read_document',
            parameters: {
                document_id: 'doc-123',
                user_id: 'demo-user'
            },
            user_id: 'demo-user',
            timestamp: new Date().toISOString()
        }
    },
    mediumRisk: {
        name: 'Medium Risk Action (Requires Approval)',
        intent: {
            intent_id: `intent_${Date.now()}_2`,
            action: 'send_email',
            parameters: {
                to: 'user@example.com',
                subject: 'Demo Email',
                body: 'This is a demo email from Aureus Sentinel'
            },
            user_id: 'demo-user',
            timestamp: new Date().toISOString()
        }
    },
    highRisk: {
        name: 'High Risk Action (Blocked)',
        intent: {
            intent_id: `intent_${Date.now()}_3`,
            action: 'delete_database',
            parameters: {
                database: 'production',
                confirm: true
            },
            user_id: 'demo-user',
            timestamp: new Date().toISOString()
        }
    }
};

class DemoClient {
    constructor() {
        this.results = [];
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const prefix = {
            'info': chalk.blue('ℹ'),
            'success': chalk.green('✓'),
            'error': chalk.red('✗'),
            'warning': chalk.yellow('⚠'),
            'step': chalk.cyan('→')
        }[type] || 'ℹ';
        
        console.log(`${prefix} ${chalk.gray(`[${timestamp.split('T')[1].split('.')[0]}]`)} ${message}`);
    }

    separator() {
        console.log(chalk.gray('─'.repeat(80)));
    }

    async checkHealth() {
        this.log(chalk.bold('Checking service health...'), 'step');
        
        const services = [
            { name: 'Bridge', url: `${SERVICES.bridge}/health` },
            { name: 'Aureus OS', url: `${SERVICES.aureusOS}/api/health` }
        ];
        
        for (const service of services) {
            try {
                const response = await axios.get(service.url, { timeout: 5000 });
                this.log(`${service.name}: ${chalk.green('HEALTHY')} (${response.data.version || 'unknown'})`, 'success');
            } catch (error) {
                this.log(`${service.name}: ${chalk.red('UNAVAILABLE')} - ${error.message}`, 'error');
                throw new Error(`${service.name} is not available. Please start the services first.`);
            }
        }
        
        console.log();
    }

    async runScenario(scenario) {
        this.separator();
        console.log(chalk.bold.cyan(`\n📋 Scenario: ${scenario.name}\n`));
        
        try {
            // Step 1: Submit intent to OpenClaw (simulated - direct to Aureus OS for demo)
            this.log('Step 1: Submitting intent to system', 'step');
            console.log(chalk.gray(JSON.stringify(scenario.intent, null, 2)));
            console.log();
            
            // Step 2: Aureus OS evaluates policy
            this.log('Step 2: Aureus OS evaluating policy...', 'step');
            const context = {
                intent: scenario.intent,
                user_context: {
                    user_id: scenario.intent.user_id,
                    session_id: `session_${Date.now()}`,
                    ip_address: '127.0.0.1'
                },
                system_context: {
                    timestamp: new Date().toISOString(),
                    environment: 'demo'
                }
            };
            
            const policyResponse = await axios.post(
                `${SERVICES.aureusOS}/api/policy/evaluate`,
                context,
                { timeout: 10000 }
            );
            
            const plan = policyResponse.data;
            this.log(`Risk Assessment: ${chalk.yellow(plan.risk_assessment.level.toUpperCase())} (score: ${plan.risk_assessment.score}/100)`, 'info');
            this.log(`Approval Required: ${plan.approval_required ? chalk.red('YES') : chalk.green('NO')}`, 'info');
            this.log(`Execution Steps: ${plan.execution_plan.steps.length}`, 'info');
            console.log();
            
            // Step 3: Send plan to Bridge for signing
            this.log('Step 3: Sending plan to Bridge for cryptographic signing...', 'step');
            const signRequest = {
                plan: plan,
                requester_id: scenario.intent.user_id,
                timestamp: new Date().toISOString(),
                ttl_seconds: 300
            };
            
            const signResponse = await axios.post(
                `${SERVICES.bridge}/sign`,
                signRequest,
                {
                    headers: {
                        'x-api-key': API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            
            const approval = signResponse.data;
            this.log(`Signature generated: ${approval.signature.substring(0, 32)}...`, 'success');
            this.log(`Expires at: ${approval.expires_at}`, 'info');
            console.log();
            
            // Step 4: Verify signature (executor wrapper simulation)
            this.log('Step 4: Verifying signature before execution...', 'step');
            const verifyResponse = await axios.post(
                `${SERVICES.bridge}/verify`,
                {
                    plan: plan,
                    signature: approval.signature
                },
                {
                    headers: {
                        'x-api-key': API_KEY,
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );
            
            if (verifyResponse.data.valid) {
                this.log('Signature verification: ' + chalk.green('VALID ✓'), 'success');
            } else {
                this.log('Signature verification: ' + chalk.red('INVALID ✗'), 'error');
                throw new Error('Signature verification failed');
            }
            console.log();
            
            // Step 5: Execute action (simulated)
            this.log('Step 5: Executing action with verified approval...', 'step');
            if (plan.approval_required && plan.risk_assessment.level === 'high') {
                this.log(chalk.yellow('⚠️  High risk action blocked - requires manual approval'), 'warning');
                this.log('In production, this would create a pending approval request for administrators', 'info');
            } else {
                this.log(chalk.green('✓ Action executed successfully'), 'success');
                this.log('Execution result logged to audit trail', 'info');
            }
            
            console.log();
            this.log(chalk.green.bold('✓ Scenario completed successfully'), 'success');
            
            this.results.push({
                scenario: scenario.name,
                status: 'success',
                riskLevel: plan.risk_assessment.level,
                riskScore: plan.risk_assessment.score,
                approvalRequired: plan.approval_required,
                signatureValid: verifyResponse.data.valid
            });
            
        } catch (error) {
            this.log(chalk.red(`✗ Scenario failed: ${error.message}`), 'error');
            if (error.response) {
                console.log(chalk.gray('Response data:'), error.response.data);
            }
            
            this.results.push({
                scenario: scenario.name,
                status: 'failed',
                error: error.message
            });
        }
    }

    printSummary() {
        this.separator();
        console.log(chalk.bold.cyan('\n📊 Demo Summary\n'));
        
        console.table(this.results);
        
        const successful = this.results.filter(r => r.status === 'success').length;
        const total = this.results.length;
        
        console.log();
        this.log(`Completed ${successful}/${total} scenarios successfully`, successful === total ? 'success' : 'warning');
        console.log();
    }

    async run() {
        console.log(chalk.bold.cyan('\n🚀 Aureus Sentinel End-to-End Demo\n'));
        console.log(chalk.gray('This demo showcases the complete flow from user intent to secure execution.\n'));
        
        // Check health
        await this.checkHealth();
        
        // Run scenarios
        await this.runScenario(DEMO_SCENARIOS.lowRisk);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.runScenario(DEMO_SCENARIOS.mediumRisk);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.runScenario(DEMO_SCENARIOS.highRisk);
        
        // Print summary
        this.printSummary();
        
        this.separator();
        console.log(chalk.bold.green('\n✓ Demo completed!\n'));
        console.log(chalk.gray('Access Points:'));
        console.log(chalk.gray(`  • Bridge API: ${SERVICES.bridge}`));
        console.log(chalk.gray(`  • Aureus OS API: ${SERVICES.aureusOS}`));
        console.log(chalk.gray(`  • Grafana Dashboards: http://localhost:3001 (admin/admin)`));
        console.log(chalk.gray(`  • Prometheus Metrics: http://localhost:9090`));
        console.log();
    }
}

// Run demo if executed directly
if (require.main === module) {
    const demo = new DemoClient();
    demo.run().catch(error => {
        console.error(chalk.red('\n✗ Demo failed:'), error.message);
        process.exit(1);
    });
}

module.exports = DemoClient;
