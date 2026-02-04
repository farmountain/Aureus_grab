#!/usr/bin/env node

/**
 * UAT Script: Travel Domain
 * 
 * This script validates travel agent functionality including
 * trip planning, navigation, booking, and recommendations.
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

class TravelUAT {
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
    console.log('TRAVEL DOMAIN UAT');
    console.log('='.repeat(60));
    console.log();

    await this.testTravelAgentGeneration();
    await this.testRouteNavigation();
    await this.testBookingManagement();
    await this.testRecommendationEngine();
    await this.testItineraryPlanning();
    await this.testLocationServices();

    this.printSummary();
  }

  async testTravelAgentGeneration(): Promise<void> {
    const testName = 'Travel Agent Generation';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Travel assistant for navigation, booking, and recommendations',
        riskProfile: 'MEDIUM' as const,
        constraints: [
          'Must verify destination accessibility',
          'Must check travel restrictions',
          'Must provide accurate cost estimates',
        ],
        preferredTools: ['maps-api', 'booking-api', 'weather-api', 'currency-converter'],
        policyRequirements: [
          'Booking confirmation required',
          'Cost threshold alerts',
          'Travel advisory notifications',
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
        details: 'Travel agent generated successfully',
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

  async testRouteNavigation(): Promise<void> {
    const testName = 'Route Navigation';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Provide optimal route navigation with real-time updates',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['maps-api', 'gps-tracker', 'traffic-monitor'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate navigation scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Navigate from New York to Boston',
          inputs: {
            origin: { lat: 40.7128, lon: -74.0060, name: 'New York, NY' },
            destination: { lat: 42.3601, lon: -71.0589, name: 'Boston, MA' },
            travelMode: 'driving',
            avoidTolls: false,
            avoidHighways: false,
          },
          expectedOutputs: {
            routeFound: true,
            estimatedDuration: 14400, // 4 hours in seconds
            estimatedDistance: 215, // miles
            alternativeRoutes: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Route navigation validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Route navigation failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testBookingManagement(): Promise<void> {
    const testName = 'Booking Management';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Manage travel bookings for flights, hotels, and activities',
        riskProfile: 'HIGH' as const,
        preferredTools: ['booking-api', 'payment-processor', 'confirmation-sender'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate booking scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Book round-trip flight and hotel',
          inputs: {
            flightDetails: {
              origin: 'JFK',
              destination: 'LAX',
              departureDate: '2024-07-15',
              returnDate: '2024-07-22',
              passengers: 2,
            },
            hotelDetails: {
              location: 'Los Angeles, CA',
              checkIn: '2024-07-15',
              checkOut: '2024-07-22',
              rooms: 1,
            },
            totalCost: 2500,
          },
          expectedOutputs: {
            flightBooked: true,
            hotelBooked: true,
            confirmationSent: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Booking management validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Booking management failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testRecommendationEngine(): Promise<void> {
    const testName = 'Recommendation Engine';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Provide personalized travel recommendations',
        riskProfile: 'LOW' as const,
        preferredTools: ['recommendation-engine', 'review-aggregator', 'rating-service'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate recommendation scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Recommend activities in San Francisco',
          inputs: {
            destination: 'San Francisco, CA',
            interests: ['museums', 'food', 'outdoor activities'],
            budget: 'medium',
            duration: 3, // days
          },
          expectedOutputs: {
            recommendationsProvided: true,
            minRecommendations: 5,
            includesRatings: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Recommendation engine validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Recommendation engine failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testItineraryPlanning(): Promise<void> {
    const testName = 'Itinerary Planning';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Create optimized travel itineraries',
        riskProfile: 'MEDIUM' as const,
        preferredTools: ['itinerary-planner', 'calendar-api', 'notification-sender'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate itinerary planning scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Plan 5-day European trip',
          inputs: {
            destinations: ['Paris', 'Amsterdam', 'Brussels'],
            startDate: '2024-08-01',
            endDate: '2024-08-05',
            preferences: {
              pace: 'moderate',
              interests: ['culture', 'history', 'cuisine'],
            },
          },
          expectedOutputs: {
            itineraryCreated: true,
            daysPlanned: 5,
            activitiesPerDay: 3,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Itinerary planning validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Itinerary planning failed',
        errors: [error.message],
      });

      console.log(`✗ ${testName} - FAILED: ${error.message}`);
    }
  }

  async testLocationServices(): Promise<void> {
    const testName = 'Location Services';
    const startTime = Date.now();

    try {
      const request = {
        goal: 'Provide location-based services and information',
        riskProfile: 'LOW' as const,
        preferredTools: ['gps-service', 'poi-finder', 'local-search'],
      };

      const result = await this.agentBuilder.generateAgent(request);

      // Simulate location services scenario
      const simulation = await this.agentBuilder.simulateAgent({
        blueprint: result.blueprint,
        testScenario: {
          description: 'Find nearby restaurants and attractions',
          inputs: {
            currentLocation: { lat: 37.7749, lon: -122.4194 },
            searchRadius: 1, // miles
            categories: ['restaurants', 'attractions', 'transportation'],
          },
          expectedOutputs: {
            resultsFound: true,
            minResults: 10,
            sortedByDistance: true,
          },
        },
        dryRun: true,
      });

      this.results.push({
        testName,
        passed: true,
        duration: Date.now() - startTime,
        details: 'Location services validated',
      });

      console.log(`✓ ${testName} - PASSED`);
    } catch (error: any) {
      this.results.push({
        testName,
        passed: false,
        duration: Date.now() - startTime,
        details: 'Location services failed',
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
  const uat = new TravelUAT();
  uat.runAll().catch(console.error);
}

export default TravelUAT;
