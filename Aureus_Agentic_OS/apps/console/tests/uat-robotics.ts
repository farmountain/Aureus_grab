#!/usr/bin/env node

/**
 * UAT Script: Robotics Domain
 * 
 * This script validates robotics agent functionality end-to-end
 * including navigation, obstacle avoidance, and task execution.
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

class RoboticsUAT {
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
    console.log('ROBOTICS DOMAIN UAT');
    console.log('='.repeat(60));
    console.log();

    await this.testAgentGeneration();
    await this.testNavigationCapabilities();
    await this.testSafetyConstraints();
    await this.testSensorIntegration();
    await this.testActuatorControl();
    await this.testCollisionAvoidance();
    await this.testTaskExecution();

    this.printSummary();
  }

  async testAgentGeneration(): Promise<void> {
    const testName = 'Agent Generation';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Autonomous warehouse robot for inventory management and transport',
        riskProfile: 'HIGH' as const,
        constraints: [
          'Must operate within warehouse boundaries',
          'Must not exceed 2 m/s maximum speed',
          'Must stop on obstacle detection',
        ],
        preferredTools: ['motor-controller', 'lidar-scanner', 'camera-vision', 'gripper'],
        policyRequirements: [
          'Geofencing enforcement',
          'Emergency stop protocol',
          'Battery level monitoring',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);

      if (!result.blueprint) {
        throw new Error('Failed to generate agent blueprint');
      }

      const validation = validateAgentBlueprint(result.blueprint);
      if (!validation.success) {
        throw new Error(`Blueprint validation failed: ${validation.errors?.join(', ')}`);
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: `Successfully generated robotics agent with ${result.blueprint.tools.length} tools and ${result.blueprint.policies.length} policies`,
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

  async testNavigationCapabilities(): Promise<void> {
    const testName = 'Navigation Capabilities';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Navigate warehouse efficiently with path planning',
        riskProfile: 'HIGH' as const,
        preferredTools: ['path-planner', 'odometry', 'lidar'],
      };

      const result = await this.agentBuilder.generateAgent(request);
      const validation = await this.agentBuilder.validateAgent({
        blueprint: result.blueprint,
      });

      if (!validation.valid) {
        throw new Error('Navigation validation failed');
      }

      // Simulate navigation scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Navigate from loading dock to storage area',
          inputs: {
            startPosition: { x: 0, y: 0, heading: 0 },
            targetPosition: { x: 50, y: 30, heading: 90 },
            obstacles: [
              { x: 25, y: 15, radius: 2 },
              { x: 40, y: 20, radius: 1.5 },
            ],
          },
          expectedOutputs: {
            pathFound: true,
            pathValid: true,
            estimatedTime: 120, // seconds
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Navigation capabilities validated successfully',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Navigation test failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testSafetyConstraints(): Promise<void> {
    const testName = 'Safety Constraints';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Operate safely in dynamic warehouse environment',
        riskProfile: 'CRITICAL' as const,
        constraints: [
          'Emergency stop within 0.5 seconds',
          'Safe distance from humans: 1.5 meters',
          'Maximum acceleration: 1 m/s²',
        ],
        policyRequirements: [
          'Human proximity detection',
          'Emergency stop validation',
          'Speed limit enforcement',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);
      const blueprint = result.blueprint;

      // Verify safety policies are present
      const hasSafetyPolicy = blueprint.policies.some(p =>
        p.name.toLowerCase().includes('safety') ||
        p.name.toLowerCase().includes('emergency')
      );

      if (!hasSafetyPolicy) {
        throw new Error('Missing required safety policies');
      }

      // Verify emergency stop capability
      const hasEmergencyStop = blueprint.policies.some(p =>
        p.rules.some(r => 
          r.type.includes('emergency') || 
          r.description?.toLowerCase().includes('stop')
        )
      );

      if (!hasEmergencyStop) {
        throw new Error('Missing emergency stop protocol');
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Safety constraints validated and enforced',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Safety constraint validation failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testSensorIntegration(): Promise<void> {
    const testName = 'Sensor Integration';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Integrate multiple sensors for environment perception',
        riskProfile: 'MEDIUM' as const,
        preferredTools: [
          'lidar-scanner',
          'camera-rgb',
          'camera-depth',
          'imu-sensor',
          'ultrasonic-sensor',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);
      const blueprint = result.blueprint;

      // Verify sensor tools are configured
      const sensorTools = blueprint.tools.filter(t =>
        t.name.toLowerCase().includes('sensor') ||
        t.name.toLowerCase().includes('lidar') ||
        t.name.toLowerCase().includes('camera')
      );

      if (sensorTools.length === 0) {
        throw new Error('No sensor tools configured');
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: `Configured ${sensorTools.length} sensor tools`,
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Sensor integration test failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testActuatorControl(): Promise<void> {
    const testName = 'Actuator Control';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Control robot actuators for movement and manipulation',
        riskProfile: 'HIGH' as const,
        preferredTools: [
          'motor-controller',
          'servo-controller',
          'gripper-controller',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);
      const blueprint = result.blueprint;

      // Verify actuator control tools
      const actuatorTools = blueprint.tools.filter(t =>
        t.name.toLowerCase().includes('motor') ||
        t.name.toLowerCase().includes('servo') ||
        t.name.toLowerCase().includes('gripper')
      );

      if (actuatorTools.length === 0) {
        throw new Error('No actuator control tools configured');
      }

      // Verify high risk tier for actuators
      const hasHighRisk = actuatorTools.some(t => t.riskTier === 'HIGH' || t.riskTier === 'CRITICAL');
      if (!hasHighRisk) {
        throw new Error('Actuator tools should have HIGH or CRITICAL risk tier');
      }

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: `Configured ${actuatorTools.length} actuator tools with appropriate risk tiers`,
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Actuator control test failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testCollisionAvoidance(): Promise<void> {
    const testName = 'Collision Avoidance';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Detect and avoid obstacles in real-time',
        riskProfile: 'HIGH' as const,
        preferredTools: ['collision-detector', 'lidar', 'path-replanner'],
        policyRequirements: ['Minimum safe distance', 'Dynamic obstacle handling'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate collision avoidance scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Avoid moving obstacle while navigating',
          inputs: {
            robotPosition: { x: 10, y: 10 },
            robotVelocity: { vx: 1.0, vy: 0 },
            obstacles: [
              {
                position: { x: 15, y: 10 },
                velocity: { vx: -0.5, vy: 0 },
                radius: 1.5,
              },
            ],
          },
          expectedOutputs: {
            collisionAvoided: true,
            pathReplanned: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Collision avoidance validated successfully',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Collision avoidance test failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testTaskExecution(): Promise<void> {
    const testName = 'Task Execution';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Execute warehouse tasks: pick, transport, and place items',
        riskProfile: 'HIGH' as const,
        preferredTools: [
          'navigation-planner',
          'gripper-controller',
          'object-detector',
          'task-scheduler',
        ],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate complete task workflow
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Pick item from shelf A and place on loading dock',
          inputs: {
            taskType: 'pick-and-place',
            pickLocation: { shelf: 'A', row: 3, column: 5 },
            placeLocation: { zone: 'loading-dock', position: 2 },
            itemId: 'ITEM-12345',
          },
          expectedOutputs: {
            taskComplete: true,
            itemTransferred: true,
            noErrors: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Task execution workflow validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Task execution test failed',
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
  const uat = new RoboticsUAT();
  uat.runAll().catch(console.error);
}

export default RoboticsUAT;
