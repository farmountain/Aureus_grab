/**
 * Performance Profiler
 * 
 * Identifies bottlenecks and performance issues:
 * - Function execution time tracking
 * - Call stack profiling
 * - Memory usage monitoring
 * - Flame graph data generation
 * 
 * Week 10: Performance & Load Testing
 */

const { performance } = require('perf_hooks');
const { EventEmitter } = require('events');

/**
 * Function profiler - tracks execution time
 */
class FunctionProfiler {
  constructor() {
    this.profiles = new Map();
  }

  /**
   * Wrap a function to profile it
   */
  wrap(fn, name = fn.name || 'anonymous') {
    const self = this;

    return function wrapped(...args) {
      const start = performance.now();
      const callStack = new Error().stack;

      try {
        const result = fn.apply(this, args);

        // Handle promises
        if (result && typeof result.then === 'function') {
          return result.then(
            (value) => {
              self._recordCall(name, performance.now() - start, callStack, true);
              return value;
            },
            (error) => {
              self._recordCall(name, performance.now() - start, callStack, false);
              throw error;
            }
          );
        }

        self._recordCall(name, performance.now() - start, callStack, true);
        return result;
      } catch (error) {
        self._recordCall(name, performance.now() - start, callStack, false);
        throw error;
      }
    };
  }

  _recordCall(name, duration, callStack, success) {
    if (!this.profiles.has(name)) {
      this.profiles.set(name, {
        name,
        callCount: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0,
        callStacks: [],
        errors: 0
      });
    }

    const profile = this.profiles.get(name);
    profile.callCount++;
    profile.totalTime += duration;
    profile.minTime = Math.min(profile.minTime, duration);
    profile.maxTime = Math.max(profile.maxTime, duration);
    profile.avgTime = profile.totalTime / profile.callCount;
    
    if (!success) {
      profile.errors++;
    }

    // Store call stack (limited to last 100)
    if (profile.callStacks.length < 100) {
      profile.callStacks.push({
        duration,
        stack: callStack,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get profiling results
   */
  getResults() {
    const results = Array.from(this.profiles.values())
      .sort((a, b) => b.totalTime - a.totalTime);

    return {
      functions: results,
      summary: {
        totalFunctions: results.length,
        totalCalls: results.reduce((sum, r) => sum + r.callCount, 0),
        totalTime: results.reduce((sum, r) => sum + r.totalTime, 0),
        slowestFunction: results[0]?.name,
        mostCalledFunction: results.sort((a, b) => b.callCount - a.callCount)[0]?.name
      }
    };
  }

  /**
   * Print results as table
   */
  printResults() {
    const { functions, summary } = this.getResults();

    console.log('\n' + '='.repeat(90));
    console.log('FUNCTION PROFILING RESULTS');
    console.log('='.repeat(90));

    console.log(`\n📊 Summary:`);
    console.log(`  Total Functions: ${summary.totalFunctions}`);
    console.log(`  Total Calls:     ${summary.totalCalls}`);
    console.log(`  Total Time:      ${summary.totalTime.toFixed(2)}ms`);
    console.log(`  Slowest:         ${summary.slowestFunction}`);
    console.log(`  Most Called:     ${summary.mostCalledFunction}`);

    console.log(`\n⏱️  Top 10 Slowest Functions:`);
    console.log('─'.repeat(90));
    console.log(
      `${'Function'.padEnd(25)} ${'Calls'.padStart(8)} ` +
      `${'Total (ms)'.padStart(12)} ${'Avg (ms)'.padStart(10)} ` +
      `${'Min (ms)'.padStart(10)} ${'Max (ms)'.padStart(10)}`
    );
    console.log('─'.repeat(90));

    functions.slice(0, 10).forEach(fn => {
      console.log(
        `${fn.name.padEnd(25)} ${fn.callCount.toString().padStart(8)} ` +
        `${fn.totalTime.toFixed(2).padStart(12)} ${fn.avgTime.toFixed(2).padStart(10)} ` +
        `${fn.minTime.toFixed(2).padStart(10)} ${fn.maxTime.toFixed(2).padStart(10)}`
      );
    });

    console.log('='.repeat(90) + '\n');
  }

  /**
   * Reset profiling data
   */
  reset() {
    this.profiles.clear();
  }
}

/**
 * Memory profiler - tracks memory usage over time
 */
class MemoryProfiler extends EventEmitter {
  constructor(interval = 1000) {
    super();
    this.interval = interval;
    this.snapshots = [];
    this.isRunning = false;
    this.timer = null;
  }

  /**
   * Start monitoring memory
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.snapshots = [];

    this.timer = setInterval(() => {
      const memUsage = process.memoryUsage();
      const snapshot = {
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      };

      this.snapshots.push(snapshot);
      this.emit('snapshot', snapshot);

      // Detect memory leaks
      if (this.snapshots.length > 10) {
        const recent = this.snapshots.slice(-10);
        const trend = this._calculateTrend(recent.map(s => s.heapUsed));
        
        if (trend > 0.1) {  // 10% growth rate
          this.emit('leak-detected', {
            growthRate: trend,
            currentHeap: snapshot.heapUsed
          });
        }
      }
    }, this.interval);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  /**
   * Calculate linear trend
   */
  _calculateTrend(values) {
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope / (sumY / n);  // Normalized slope
  }

  /**
   * Get memory report
   */
  getReport() {
    if (this.snapshots.length === 0) {
      return { error: 'No snapshots recorded' };
    }

    const heapValues = this.snapshots.map(s => s.heapUsed);
    const rssValues = this.snapshots.map(s => s.rss);

    return {
      duration: this.snapshots[this.snapshots.length - 1].timestamp - this.snapshots[0].timestamp,
      snapshotCount: this.snapshots.length,
      heap: {
        initial: heapValues[0],
        final: heapValues[heapValues.length - 1],
        min: Math.min(...heapValues),
        max: Math.max(...heapValues),
        avg: heapValues.reduce((a, b) => a + b) / heapValues.length,
        trend: this._calculateTrend(heapValues)
      },
      rss: {
        initial: rssValues[0],
        final: rssValues[rssValues.length - 1],
        min: Math.min(...rssValues),
        max: Math.max(...rssValues),
        avg: rssValues.reduce((a, b) => a + b) / rssValues.length
      },
      snapshots: this.snapshots
    };
  }

  /**
   * Print memory report
   */
  printReport() {
    const report = this.getReport();

    if (report.error) {
      console.log(`❌ ${report.error}`);
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('MEMORY PROFILING RESULTS');
    console.log('='.repeat(70));

    console.log(`\n📊 Duration: ${(report.duration / 1000).toFixed(1)}s`);
    console.log(`   Snapshots: ${report.snapshotCount}`);

    console.log(`\n💾 Heap Memory:`);
    console.log(`   Initial:  ${this._formatBytes(report.heap.initial)}`);
    console.log(`   Final:    ${this._formatBytes(report.heap.final)}`);
    console.log(`   Min:      ${this._formatBytes(report.heap.min)}`);
    console.log(`   Max:      ${this._formatBytes(report.heap.max)}`);
    console.log(`   Average:  ${this._formatBytes(report.heap.avg)}`);
    console.log(`   Trend:    ${(report.heap.trend * 100).toFixed(2)}% growth rate`);

    if (report.heap.trend > 0.1) {
      console.log(`   ⚠️  WARNING: Potential memory leak detected!`);
    }

    console.log(`\n🖥️  RSS (Resident Set Size):`);
    console.log(`   Initial:  ${this._formatBytes(report.rss.initial)}`);
    console.log(`   Final:    ${this._formatBytes(report.rss.final)}`);
    console.log(`   Min:      ${this._formatBytes(report.rss.min)}`);
    console.log(`   Max:      ${this._formatBytes(report.rss.max)}`);

    console.log('='.repeat(70) + '\n');
  }

  _formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }
}

/**
 * Flame graph generator (simplified)
 */
class FlameGraphGenerator {
  constructor() {
    this.stacks = [];
  }

  /**
   * Record a call stack
   */
  recordStack(functionName, duration, stack) {
    this.stacks.push({
      name: functionName,
      duration,
      stack: this._parseStack(stack),
      timestamp: Date.now()
    });
  }

  _parseStack(stackString) {
    const lines = stackString.split('\n').slice(1);  // Skip "Error" line
    return lines.map(line => {
      const match = line.match(/at\s+(.+?)\s+\(/);
      return match ? match[1].trim() : 'unknown';
    });
  }

  /**
   * Generate flame graph data (SVG format compatible)
   */
  generateFlameGraphData() {
    const stackCounts = new Map();

    this.stacks.forEach(({ stack, duration }) => {
      const stackKey = stack.join(';');
      
      if (!stackCounts.has(stackKey)) {
        stackCounts.set(stackKey, { count: 0, totalDuration: 0 });
      }

      const entry = stackCounts.get(stackKey);
      entry.count++;
      entry.totalDuration += duration;
    });

    // Convert to collapsed stacks format
    const flameGraphData = [];
    stackCounts.forEach((value, key) => {
      flameGraphData.push({
        stack: key,
        count: value.count,
        duration: value.totalDuration
      });
    });

    return flameGraphData.sort((a, b) => b.duration - a.duration);
  }

  /**
   * Export collapsed stacks for FlameGraph.pl
   */
  exportCollapsedStacks() {
    const data = this.generateFlameGraphData();
    return data.map(item => `${item.stack} ${item.count}`).join('\n');
  }
}

/**
 * Complete profiler combining all capabilities
 */
class Profiler {
  constructor() {
    this.functionProfiler = new FunctionProfiler();
    this.memoryProfiler = new MemoryProfiler();
    this.flameGraphGenerator = new FlameGraphGenerator();
  }

  /**
   * Profile a function
   */
  profileFunction(fn, name) {
    return this.functionProfiler.wrap(fn, name);
  }

  /**
   * Start comprehensive profiling
   */
  start() {
    this.memoryProfiler.start();
  }

  /**
   * Stop profiling
   */
  stop() {
    this.memoryProfiler.stop();
  }

  /**
   * Get complete results
   */
  getResults() {
    return {
      functions: this.functionProfiler.getResults(),
      memory: this.memoryProfiler.getReport(),
      flameGraph: this.flameGraphGenerator.generateFlameGraphData()
    };
  }

  /**
   * Print complete report
   */
  printReport() {
    this.functionProfiler.printResults();
    this.memoryProfiler.printReport();
  }

  /**
   * Reset all profiling data
   */
  reset() {
    this.functionProfiler.reset();
    this.memoryProfiler.snapshots = [];
    this.flameGraphGenerator.stacks = [];
  }
}

module.exports = {
  Profiler,
  FunctionProfiler,
  MemoryProfiler,
  FlameGraphGenerator
};
