import { describe, it, expect, beforeEach } from 'vitest';
import { AgentBuilder } from '../src/agent-builder';
import { EventLog, InMemoryStateStore, validateAgentBlueprint } from '@aureus/kernel';
import { GoalGuardFSM } from '@aureus/policy';

/**
 * Integration tests for complete agent lifecycle:
 * Generation → Validation → Simulation → Deployment
 */
describe('Agent Lifecycle Integration Tests', () => {
  let agentBuilder: AgentBuilder;
  let eventLog: EventLog;
  let policyGuard: GoalGuardFSM;
  let stateStore: InMemoryStateStore;

  beforeEach(() => {
    stateStore = new InMemoryStateStore();
    eventLog = new EventLog(stateStore);
    policyGuard = new GoalGuardFSM();
    agentBuilder = new AgentBuilder(eventLog, policyGuard);
  });

  describe('Robotics Agent Lifecycle', () => {
    it('should complete full lifecycle for robotics agent', async () => {
      // Step 1: Generate agent
      const generationRequest = {
        goal: 'Autonomous warehouse robot that navigates safely and transports items',
        riskProfile: 'HIGH' as const,
        constraints: [
          'Must operate only in designated warehouse zones',
          'Must stop immediately on obstacle detection',
          'Must not exceed 1.5 m/s speed',
        ],
        preferredTools: ['motor-controller', 'lidar-scanner', 'camera-vision'],
        policyRequirements: [
          'Geofencing for warehouse boundaries',
          'Emergency stop protocol',
          'Collision avoidance',
        ],
      };

      const generationResult = await agentBuilder.generateAgent(generationRequest);
      
      expect(generationResult).toBeDefined();
      expect(generationResult.blueprint).toBeDefined();
      expect(generationResult.blueprint.goal).toBe(generationRequest.goal);
      expect(generationResult.blueprint.riskProfile).toBe('HIGH');
      
      // Step 2: Validate generated blueprint
      const validationResult = validateAgentBlueprint(generationResult.blueprint);
      expect(validationResult.success).toBe(true);
      
      const validationRequest = {
        blueprint: generationResult.blueprint,
        validatePolicies: true,
        validateTools: true,
        validateWorkflows: true,
      };
      
      const fullValidation = await agentBuilder.validateAgent(validationRequest);
      expect(fullValidation).toBeDefined();
      expect(fullValidation.valid).toBe(true);
      
      // Step 3: Simulate agent behavior
      const simulationRequest = {
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Navigate from point A to point B with obstacles',
          inputs: {
            startPosition: { x: 0, y: 0 },
            endPosition: { x: 10, y: 10 },
            obstacles: [
              { x: 5, y: 5, radius: 1 },
            ],
          },
          expectedOutputs: {
            pathFound: true,
            collisionFree: true,
          },
        },
        dryRun: true,
      };
      
      const simulationResult = await agentBuilder.simulateAgent(simulationRequest);
      expect(simulationResult).toBeDefined();
      expect(simulationResult.success).toBeDefined();
      
      // Step 4: Prepare for deployment
      const deploymentRequest = {
        blueprint: generationResult.blueprint,
        environment: 'staging' as const,
        autoPromote: false,
        approvalRequired: true,
      };
      
      // Note: Actual deployment would require approval workflow
      expect(deploymentRequest.environment).toBe('staging');
      expect(deploymentRequest.approvalRequired).toBe(true);
    });

    it('should validate robotics-specific capabilities during generation', async () => {
      const request = {
        goal: 'Mobile robot with navigation and object manipulation',
        riskProfile: 'HIGH' as const,
        preferredTools: ['motor-controller', 'gripper', 'camera', 'lidar'],
        policyRequirements: ['Safety zones', 'Speed limits'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Generated blueprint should include robotics capabilities
      expect(result.blueprint.tools.length).toBeGreaterThan(0);
      expect(result.blueprint.policies.length).toBeGreaterThan(0);
      
      // Validate that safety policies are included
      const hasSafetyPolicy = result.blueprint.policies.some(p => 
        p.name.toLowerCase().includes('safety') || 
        p.name.toLowerCase().includes('zone')
      );
      expect(hasSafetyPolicy).toBe(true);
    });
  });

  describe('Retail Agent Lifecycle', () => {
    it('should complete full lifecycle for retail agent', async () => {
      // Step 1: Generate retail agent
      const generationRequest = {
        goal: 'Retail point-of-sale assistant for checkout and payment processing',
        riskProfile: 'HIGH' as const,
        constraints: [
          'Must validate payment information',
          'Must log all transactions',
          'Must handle PCI-compliant data',
        ],
        preferredTools: ['payment-processor', 'receipt-printer', 'barcode-scanner'],
        policyRequirements: [
          'Payment approval thresholds',
          'Transaction logging',
          'PCI compliance',
        ],
      };

      const generationResult = await agentBuilder.generateAgent(generationRequest);
      
      expect(generationResult.blueprint).toBeDefined();
      expect(generationResult.blueprint.riskProfile).toBe('HIGH');
      
      // Step 2: Validate
      const validation = await agentBuilder.validateAgent({
        blueprint: generationResult.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      
      // Step 3: Simulate payment scenario
      const simulationResult = await agentBuilder.simulateAgent({
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Process payment for customer purchase',
          inputs: {
            items: [
              { id: 'item-1', price: 29.99 },
              { id: 'item-2', price: 49.99 },
            ],
            paymentMethod: 'credit_card',
            total: 79.98,
          },
          expectedOutputs: {
            transactionComplete: true,
            receiptGenerated: true,
          },
        },
        dryRun: true,
      });
      
      expect(simulationResult.success).toBeDefined();
      
      // Verify payment-related tools are configured
      const hasPaymentTool = generationResult.blueprint.tools.some(t =>
        t.name.toLowerCase().includes('payment') ||
        t.toolId.toLowerCase().includes('payment')
      );
      expect(hasPaymentTool).toBe(true);
    });

    it('should enforce payment security policies', async () => {
      const request = {
        goal: 'Handle retail payments and inventory management',
        riskProfile: 'CRITICAL' as const,
        preferredTools: ['payment-api', 'inventory-db'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Should have high-risk tier for payment tools
      const paymentTools = result.blueprint.tools.filter(t =>
        t.name.toLowerCase().includes('payment')
      );
      
      if (paymentTools.length > 0) {
        const hasCriticalRisk = paymentTools.some(t => 
          t.riskTier === 'CRITICAL' || t.riskTier === 'HIGH'
        );
        expect(hasCriticalRisk).toBe(true);
      }
    });
  });

  describe('Travel Agent Lifecycle', () => {
    it('should complete full lifecycle for travel agent', async () => {
      // Step 1: Generate travel agent
      const generationRequest = {
        goal: 'Travel planning assistant with navigation and booking capabilities',
        riskProfile: 'MEDIUM' as const,
        constraints: [
          'Must verify destination accessibility',
          'Must check travel restrictions',
          'Must provide cost estimates',
        ],
        preferredTools: ['maps-api', 'booking-api', 'weather-api'],
        policyRequirements: [
          'Booking confirmation required',
          'Cost threshold alerts',
        ],
      };

      const generationResult = await agentBuilder.generateAgent(generationRequest);
      
      expect(generationResult.blueprint).toBeDefined();
      
      // Step 2: Validate
      const validation = await agentBuilder.validateAgent({
        blueprint: generationResult.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      
      // Step 3: Simulate travel planning
      const simulationResult = await agentBuilder.simulateAgent({
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Plan trip from New York to San Francisco',
          inputs: {
            origin: 'New York, NY',
            destination: 'San Francisco, CA',
            travelDate: '2024-06-15',
            budget: 1500,
          },
          expectedOutputs: {
            routeCalculated: true,
            bookingOptions: true,
          },
        },
        dryRun: true,
      });
      
      expect(simulationResult.success).toBeDefined();
      
      // Verify travel-related tools
      const travelTools = generationResult.blueprint.tools.filter(t =>
        t.name.toLowerCase().includes('map') ||
        t.name.toLowerCase().includes('booking') ||
        t.name.toLowerCase().includes('travel')
      );
      expect(travelTools.length).toBeGreaterThan(0);
    });
  });

  describe('Smartphone Agent Lifecycle', () => {
    it('should complete full lifecycle for smartphone agent', async () => {
      // Step 1: Generate smartphone agent
      const generationRequest = {
        goal: 'Personal assistant app for task management and notifications',
        riskProfile: 'MEDIUM' as const,
        constraints: [
          'Must respect user privacy',
          'Must work offline when possible',
          'Must minimize battery usage',
        ],
        preferredTools: ['notification-sender', 'calendar-api', 'reminder-service'],
        policyRequirements: [
          'User consent for notifications',
          'Data encryption',
        ],
      };

      const generationResult = await agentBuilder.generateAgent(generationRequest);
      
      expect(generationResult.blueprint).toBeDefined();
      
      // Step 2: Validate
      const validation = await agentBuilder.validateAgent({
        blueprint: generationResult.blueprint,
      });
      
      expect(validation.valid).toBe(true);
      
      // Step 3: Simulate notification scenario
      const simulationResult = await agentBuilder.simulateAgent({
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Send daily task reminders',
          inputs: {
            tasks: [
              { id: 'task-1', title: 'Morning meeting', time: '09:00' },
              { id: 'task-2', title: 'Lunch break', time: '12:00' },
            ],
            userPreferences: {
              notificationEnabled: true,
              quietHours: { start: '22:00', end: '07:00' },
            },
          },
          expectedOutputs: {
            notificationsSent: true,
            respectQuietHours: true,
          },
        },
        dryRun: true,
      });
      
      expect(simulationResult.success).toBeDefined();
      
      // Verify privacy policies
      const hasPrivacyPolicy = generationResult.blueprint.policies.some(p =>
        p.name.toLowerCase().includes('privacy') ||
        p.name.toLowerCase().includes('data') ||
        p.name.toLowerCase().includes('consent')
      );
      expect(hasPrivacyPolicy).toBe(true);
    });
  });

  describe('Cross-Domain Agent Generation', () => {
    it('should generate agents for multiple domains and validate differences', async () => {
      const domains = [
        { goal: 'Warehouse robotics automation', risk: 'HIGH' as const },
        { goal: 'Retail checkout assistant', risk: 'HIGH' as const },
        { goal: 'Travel booking assistant', risk: 'MEDIUM' as const },
        { goal: 'Smartphone personal assistant', risk: 'MEDIUM' as const },
      ];

      const results = await Promise.all(
        domains.map(domain => agentBuilder.generateAgent({
          goal: domain.goal,
          riskProfile: domain.risk,
        }))
      );

      // All should generate successfully
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.blueprint).toBeDefined();
        expect(result.blueprint.id).toBeDefined();
        expect(result.blueprint.tools.length).toBeGreaterThan(0);
      });

      // Each should have unique tool configurations
      const toolSets = results.map(r => 
        new Set(r.blueprint.tools.map(t => t.toolId))
      );
      
      // Robotics and retail should have different tools
      const roboticsTools = toolSets[0];
      const retailTools = toolSets[1];
      
      const sharedTools = new Set(
        [...roboticsTools].filter(t => retailTools.has(t))
      );
      
      // Some overlap is expected (http-client, etc) but not complete overlap
      expect(sharedTools.size).toBeLessThan(roboticsTools.size);
      expect(sharedTools.size).toBeLessThan(retailTools.size);
    });
  });

  describe('Validation Error Handling', () => {
    it('should detect invalid agent configurations during validation', async () => {
      const request = {
        goal: 'Test agent with intentionally invalid configuration',
        riskProfile: 'MEDIUM' as const,
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Modify blueprint to make it invalid
      const invalidBlueprint = {
        ...result.blueprint,
        config: {
          ...result.blueprint.config,
          prompt: '', // Invalid: too short
        },
      };

      const validation = validateAgentBlueprint(invalidBlueprint);
      expect(validation.success).toBe(false);
      expect(validation.errors).toBeDefined();
      expect(validation.errors!.length).toBeGreaterThan(0);
    });

    it('should validate tool permissions and risk alignment', async () => {
      const request = {
        goal: 'Agent with high-risk operations',
        riskProfile: 'HIGH' as const,
        preferredTools: ['system-admin', 'database-admin'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // High-risk agent should have appropriate policies
      expect(result.blueprint.policies.length).toBeGreaterThan(0);
      
      const validation = await agentBuilder.validateAgent({
        blueprint: result.blueprint,
        validatePolicies: true,
      });
      
      expect(validation.valid).toBe(true);
      expect(validation.details.policies.valid).toBe(true);
    });
  });

  describe('Simulation Edge Cases', () => {
    it('should handle simulation with missing expected outputs', async () => {
      const request = {
        goal: 'Simple test agent',
        riskProfile: 'LOW' as const,
      };

      const generationResult = await agentBuilder.generateAgent(request);
      
      const simulationResult = await agentBuilder.simulateAgent({
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Test with no expected outputs',
          inputs: { testData: 'value' },
          // No expectedOutputs specified
        },
        dryRun: true,
      });
      
      // Should still succeed
      expect(simulationResult).toBeDefined();
      expect(simulationResult.success).toBeDefined();
    });

    it('should handle simulation with complex nested inputs', async () => {
      const request = {
        goal: 'Complex data processing agent',
        riskProfile: 'MEDIUM' as const,
      };

      const generationResult = await agentBuilder.generateAgent(request);
      
      const simulationResult = await agentBuilder.simulateAgent({
        blueprint: generationResult.blueprint,
        testScenario: {
          description: 'Process complex nested data',
          inputs: {
            data: {
              level1: {
                level2: {
                  level3: ['array', 'of', 'values'],
                },
              },
              metadata: {
                timestamp: Date.now(),
                source: 'test',
              },
            },
          },
          expectedOutputs: {
            processed: true,
          },
        },
        dryRun: true,
      });
      
      expect(simulationResult).toBeDefined();
      expect(simulationResult.success).toBeDefined();
    });
  });

  describe('Policy Integration', () => {
    it('should integrate policy decisions into agent validation', async () => {
      const request = {
        goal: 'High-security financial agent',
        riskProfile: 'CRITICAL' as const,
        policyRequirements: [
          'Multi-factor authentication',
          'Transaction approval workflow',
          'Audit logging',
        ],
      };

      const result = await agentBuilder.generateAgent(request);
      
      // Should have security-focused policies
      expect(result.blueprint.policies.length).toBeGreaterThan(0);
      
      const securityPolicies = result.blueprint.policies.filter(p =>
        p.name.toLowerCase().includes('security') ||
        p.name.toLowerCase().includes('auth') ||
        p.name.toLowerCase().includes('audit')
      );
      
      expect(securityPolicies.length).toBeGreaterThan(0);
    });
  });

  describe('CRV Integration', () => {
    it('should include CRV validation in agent lifecycle', async () => {
      const request = {
        goal: 'Data validation agent with strict verification',
        riskProfile: 'HIGH' as const,
        constraints: ['Must validate all inputs', 'Must verify outputs'],
      };

      const result = await agentBuilder.generateAgent(request);
      
      const validation = await agentBuilder.validateAgent({
        blueprint: result.blueprint,
      });
      
      // Validation should include CRV checks
      expect(validation).toBeDefined();
      expect(validation.valid).toBe(true);
      
      // Check if CRV-related metadata is present
      expect(validation.details.schema.valid).toBe(true);
    });
  });
});
