/**
 * Example demo for Perception Pipeline
 * Demonstrates context ingestion, data contract validation, and conflict handling
 */

import { PerceptionService } from './src/perception-service';
import { RawInput } from '@aureus/perception';

/**
 * Run the perception pipeline demo
 */
async function runPerceptionDemo() {
  console.log('🚀 Perception Pipeline Demo\n');
  console.log('='.repeat(60));
  
  // Create perception service
  const perceptionService = new PerceptionService();
  
  // Example 1: Process text input
  console.log('\n📝 Example 1: Text Input Processing');
  console.log('-'.repeat(60));
  
  const textInput: RawInput = {
    id: 'text-1',
    source: 'text',
    timestamp: new Date(),
    data: 'What is the status of order #12345?',
  };
  
  const result1 = await perceptionService.processInput(textInput);
  console.log('✓ Input processed successfully');
  console.log(`  Intent: ${result1.contract?.intent.type} (${(result1.contract?.intent.confidence! * 100).toFixed(0)}% confidence)`);
  console.log(`  Entities created: ${result1.entities?.length || 0}`);
  
  // Example 2: Process JSON input
  console.log('\n📊 Example 2: JSON Input Processing');
  console.log('-'.repeat(60));
  
  const jsonInput: RawInput = {
    id: 'json-1',
    source: 'json',
    timestamp: new Date(),
    data: {
      orderId: '12345',
      status: 'pending',
      amount: 99.99,
      customer: 'John Doe',
    },
  };
  
  const result2 = await perceptionService.processInput(jsonInput);
  console.log('✓ Input processed successfully');
  console.log(`  Intent: ${result2.contract?.intent.type} (${(result2.contract?.intent.confidence! * 100).toFixed(0)}% confidence)`);
  console.log(`  Entities created: ${result2.entities?.length || 0}`);
  
  // Example 3: Process event input
  console.log('\n🎯 Example 3: Event Input Processing');
  console.log('-'.repeat(60));
  
  const eventInput: RawInput = {
    id: 'event-1',
    source: 'event',
    timestamp: new Date(),
    data: {
      type: 'order-placed',
      payload: {
        orderId: '12346',
        items: ['item1', 'item2'],
        total: 150.00,
      },
    },
  };
  
  const result3 = await perceptionService.processInput(eventInput);
  console.log('✓ Input processed successfully');
  console.log(`  Intent: ${result3.contract?.intent.type} (${(result3.contract?.intent.confidence! * 100).toFixed(0)}% confidence)`);
  console.log(`  Entities created: ${result3.entities?.length || 0}`);
  
  // Example 4: Process sensor input
  console.log('\n🌡️  Example 4: Sensor Input Processing');
  console.log('-'.repeat(60));
  
  const sensorInput: RawInput = {
    id: 'sensor-1',
    source: 'sensor',
    timestamp: new Date(),
    data: {
      sensorId: 'temp-sensor-01',
      readings: {
        temperature: 22.5,
        humidity: 45.3,
      },
      unit: 'celsius',
    },
  };
  
  const result4 = await perceptionService.processInput(sensorInput);
  console.log('✓ Input processed successfully');
  console.log(`  Intent: ${result4.contract?.intent.type} (${(result4.contract?.intent.confidence! * 100).toFixed(0)}% confidence)`);
  console.log(`  Entities created: ${result4.entities?.length || 0}`);
  
  // Example 5: Create a duplicate to demonstrate conflict detection
  console.log('\n⚠️  Example 5: Conflict Detection');
  console.log('-'.repeat(60));
  
  const duplicateInput: RawInput = {
    id: 'json-2',
    source: 'json',
    timestamp: new Date(),
    data: {
      orderId: '12345', // Same as example 2
      status: 'completed', // Different status - conflict!
      amount: 99.99,
      customer: 'John Doe',
    },
  };
  
  const result5 = await perceptionService.processInput(duplicateInput);
  console.log('✓ Input processed successfully');
  console.log(`  Intent: ${result5.contract?.intent.type} (${(result5.contract?.intent.confidence! * 100).toFixed(0)}% confidence)`);
  console.log(`  Entities created: ${result5.entities?.length || 0}`);
  
  if (result5.contract?.conflicts && result5.contract.conflicts.length > 0) {
    console.log(`  ⚠️  Conflicts detected: ${result5.contract.conflicts.length}`);
    for (const conflict of result5.contract.conflicts) {
      console.log(`    - ${conflict.type.toUpperCase()}: ${conflict.description}`);
      console.log(`      Severity: ${conflict.severity}`);
      console.log(`      Conflicting fields: ${conflict.conflictingFields.join(', ')}`);
      if (conflict.resolution) {
        console.log(`      💡 Suggested resolution: ${conflict.resolution.strategy}`);
        console.log(`         ${conflict.resolution.description}`);
      }
    }
  }
  
  // Display summary
  console.log('\n📊 Summary');
  console.log('='.repeat(60));
  
  const stats = perceptionService.getStatistics();
  console.log(`Total results: ${stats.totalResults}`);
  console.log(`Successful: ${stats.successfulResults}`);
  console.log(`Failed: ${stats.failedResults}`);
  console.log(`Total contracts: ${stats.totalContracts}`);
  console.log(`Total conflicts detected: ${stats.totalConflicts}`);
  
  const entities = await perceptionService.getAllEntities();
  console.log(`\n📦 Entities in Symbolic Store: ${entities.length}`);
  
  // Group by type
  const entityTypes = entities.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('\nEntity breakdown by type:');
  for (const [type, count] of Object.entries(entityTypes)) {
    console.log(`  - ${type}: ${count}`);
  }
  
  // Display conflicts
  const conflicts = perceptionService.getAllConflicts();
  if (conflicts.length > 0) {
    console.log('\n⚠️  Detected Conflicts:');
    for (const item of conflicts) {
      console.log(`\n  Contract ${item.contractId}:`);
      for (const conflict of item.conflicts) {
        console.log(`    - ${conflict.type}: ${conflict.description}`);
        console.log(`      Fields: ${conflict.conflictingFields.join(', ')}`);
        console.log(`      Severity: ${conflict.severity}`);
        if (conflict.resolution) {
          console.log(`      Resolution: ${conflict.resolution.strategy} (${(conflict.resolution.confidence * 100).toFixed(0)}% confidence)`);
        }
      }
    }
  }
  
  // Display some entity details
  console.log('\n📋 Sample Entity Details:');
  console.log('-'.repeat(60));
  if (entities.length > 0) {
    const sampleEntity = entities[0];
    console.log(`ID: ${sampleEntity.id}`);
    console.log(`Type: ${sampleEntity.type}`);
    console.log(`Confidence: ${(sampleEntity.confidence * 100).toFixed(0)}%`);
    console.log(`Source: ${sampleEntity.source}`);
    console.log(`Timestamp: ${sampleEntity.timestamp.toISOString()}`);
    console.log('Properties:');
    for (const [key, value] of Object.entries(sampleEntity.properties)) {
      console.log(`  - ${key}: ${JSON.stringify(value).slice(0, 60)}${JSON.stringify(value).length > 60 ? '...' : ''}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Demo completed successfully!');
  console.log('\n💡 To view in the UI:');
  console.log('   1. Start the console server');
  console.log('   2. Navigate to http://localhost:3000/perception');
  console.log('   3. You can process more inputs and view conflicts there\n');
}

// Run the demo
if (require.main === module) {
  runPerceptionDemo()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Demo failed:', error);
      process.exit(1);
    });
}

export { runPerceptionDemo };
