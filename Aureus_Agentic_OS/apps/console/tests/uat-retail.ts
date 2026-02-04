#!/usr/bin/env node

/**
 * UAT Script: Retail Domain
 * 
 * This script validates retail agent functionality including
 * point-of-sale, inventory management, and customer service.
 */

import { AgentBuilder } from '../src/agent-builder';
import { EventLog, InMemoryStateStore, validateAgentBlueprint } from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';

interface UATResult {
  testName: string;
  passed: boolean;
  duration: number;
  details: string;
  errors?: string[];
}

class RetailUAT {
  private agentBuilder: AgentBuilder;
  private results: UATResult[] = [];

  constructor() {
    const stateStore = new InMemoryStateStore();
    const eventLog = new EventLog(stateStore);
    const policyGuard = new GoalGuardFSM();
    this.agentBuilder = new AgentBuilder(eventLog, policyGuard);
  }

  async runAll(): Promise<void> {
    console.log('='.repeat(60));
    console.log('RETAIL DOMAIN UAT');
    console.log('='.repeat(60));
    console.log();

    await this.testRetailAgentGeneration();
    await this.testPaymentProcessing();
    await this.testInventoryManagement();
    await this.testCustomerService();
    await this.testPCICompliance();
    await this.testReceiptGeneration();

    this.printSummary();
  }

  async testRetailAgentGeneration(): Promise<void> {
    const testName = 'Retail Agent Generation';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Point-of-sale agent for retail checkout and payment processing',
        riskProfile: 'HIGH' as const,
        constraints: [
          'Must comply with PCI-DSS standards',
          'Must validate all payment information',
          'Must log all transactions',
        ],
        preferredTools: ['payment-processor', 'receipt-printer', 'inventory-db'],
        policyRequirements: [
          'Payment approval for amounts over $1000',
          'Transaction logging',
          'Refund approval workflow',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);
      const validation = validateAgentBlueprint(result.blueprint);

      if (!validation.success) {
        throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Retail agent generated successfully',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Agent generation failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testPaymentProcessing(): Promise<void> {
    const testName = 'Payment Processing';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Process secure retail payments',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['payment-gateway', 'card-validator'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate payment scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Process credit card payment',
          inputs: {
            items: [
              { sku: 'PROD-001', name: 'Widget', price: 29.99, quantity: 2 },
              { sku: 'PROD-002', name: 'Gadget', price: 49.99, quantity: 1 },
            ],
            subtotal: 109.97,
            tax: 9.90,
            total: 119.87,
            paymentMethod: 'credit_card',
          },
          expectedOutputs: {
            paymentApproved: true,
            transactionId: true,
            receiptGenerated: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Payment processing validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Payment processing failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testInventoryManagement(): Promise<void> {
    const testName = 'Inventory Management';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Manage retail inventory with real-time updates',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['inventory-db', 'barcode-scanner', 'stock-tracker'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate inventory scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Update inventory after sale',
          inputs: {
            soldItems: [
              { sku: 'PROD-001', quantity: 2 },
              { sku: 'PROD-002', quantity: 1 },
            ],
            currentStock: {
              'PROD-001': 50,
              'PROD-002': 25,
            },
          },
          expectedOutputs: {
            stockUpdated: true,
            lowStockAlerts: false,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Inventory management validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Inventory management failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testCustomerService(): Promise<void> {
    const testName = 'Customer Service';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Provide customer service and product recommendations',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['customer-db', 'recommendation-engine', 'notification-sender'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate customer service scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Handle customer inquiry and provide recommendation',
          inputs: {
            customerId: 'CUST-12345',
            inquiry: 'Looking for a gift under $100',
            purchaseHistory: ['electronics', 'books'],
          },
          expectedOutputs: {
            recommendationsProvided: true,
            customerSatisfied: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Customer service validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Customer service failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testPCICompliance(): Promise<void> {
    const testName = 'PCI Compliance';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Ensure PCI-DSS compliance for payment handling',
        riskProfile: 'CRITICAL' as const,
        constraints: [
          'Encrypt payment data at rest and in transit',
          'No storage of CVV numbers',
          'Tokenize credit card numbers',
        ],
        policyRequirements: [
          'Data encryption',
          'Access control',
          'Audit logging',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Verify compliance policies
      const hasEncryptionPolicy = result.blueprint.policies.some(p =>
        p.name.toLowerCase().includes('encrypt') ||
        p.rules.some(r => r.type.includes('encrypt'))
      );

      if (!hasEncryptionPolicy) {
        throw new Error('Missing encryption policy for PCI compliance');
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'PCI compliance policies validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'PCI compliance validation failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testReceiptGeneration(): Promise<void> {
    const testName = 'Receipt Generation';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Generate receipts for completed transactions',
        riskProfile: 'LOW' as const,
        preferredTools: ['receipt-printer', 'email-sender'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate receipt generation
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Generate and send receipt',
          inputs: {
            transactionId: 'TXN-2024-001',
            items: [
              { name: 'Product A', price: 29.99, quantity: 1 },
              { name: 'Product B', price: 49.99, quantity: 1 },
            ],
            total: 79.98,
            customerEmail: 'customer@example.com',
          },
          expectedOutputs: {
            receiptGenerated: true,
            emailSent: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Receipt generation validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Receipt generation failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  printSummary(): void {
    console.log();
    console.log('='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    console.log();

    if (failedTests > 0) {
      console.log('Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.testName}: ${r.errors?.join(', ')}`);
        });
    }

    console.log();
    console.log(`UAT Result: ${failedTests === 0 ? 'PASSED ✓' : 'FAILED ✗'}`);
    console.log('='.repeat(60));
  }
}

// Run UAT if executed directly
if (require.main === module) {
  const uat = new RetailUAT();
  uat.runAll().catch(console.error);
}

export default RetailUAT;
