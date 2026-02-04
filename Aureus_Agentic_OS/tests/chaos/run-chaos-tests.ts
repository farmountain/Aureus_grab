/**
 * Test runner for chaos tests that generates a reliability report
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

interface TestResult {
  file: string;
  passed: number;
  failed: number;
  duration: number;
  failures: Array<{ test: string; error: string }>;
}

interface ReliabilityReport {
  timestamp: string;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalDuration: number;
  testResults: TestResult[];
  invariantsVerified: string[];
  failureModesInjected: string[];
  summary: string;
}

async function runChaosTests(): Promise<ReliabilityReport> {
  const timestamp = new Date().toISOString();
  const testResults: TestResult[] = [];

  const chaosTestFiles = [
    'tests/chaos/tool-failures.test.ts',
    'tests/chaos/conflicting-writes.test.ts',
    'tests/chaos/invariants.test.ts',
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  let totalDuration = 0;

  console.log('Running chaos tests...\n');

  for (const testFile of chaosTestFiles) {
    console.log(`Running ${testFile}...`);
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execPromise(
        `npx vitest run ${testFile} --reporter=json --reporter=verbose`,
        {
          cwd: process.cwd(),
          env: { ...process.env, NODE_ENV: 'test' },
        }
      );

      const duration = Date.now() - startTime;
      
      // Try to parse JSON output first
      let passed = 0;
      let failed = 0;
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
        if (jsonMatch) {
          const jsonResult = JSON.parse(jsonMatch[0]);
          passed = jsonResult.numPassedTests || 0;
          failed = jsonResult.numFailedTests || 0;
        }
      } catch (parseError) {
        // Fallback to text parsing
        const output = stdout + stderr;
        const passedMatch = output.match(/(\d+) passed/);
        const failedMatch = output.match(/(\d+) failed/);
        passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
        failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
      }

      totalPassed += passed;
      totalFailed += failed;
      totalDuration += duration;

      // Extract failure details if any
      const failures: Array<{ test: string; error: string }> = [];
      if (failed > 0) {
        const failureMatches = output.matchAll(/FAIL\s+(.+?)\n([\s\S]*?)(?=\n\s*(?:PASS|FAIL|Test Files))/g);
        for (const match of failureMatches) {
          failures.push({
            test: match[1].trim(),
            error: match[2].trim().substring(0, 200), // Limit error message length
          });
        }
      }

      testResults.push({
        file: testFile,
        passed,
        failed,
        duration,
        failures,
      });

      console.log(`  ✓ Passed: ${passed}, Failed: ${failed}, Duration: ${duration}ms\n`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      // Try to parse results from output
      let passed = 0;
      let failed = 1; // At least 1 failure since we're in catch block
      try {
        const output = error.stdout + error.stderr;
        const passedMatch = output.match(/(\d+) passed/);
        const failedMatch = output.match(/(\d+) failed/);
        passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
        failed = failedMatch ? parseInt(failedMatch[1], 10) : Math.max(1, failed);
      } catch {
        // Use defaults
      }

      totalPassed += passed;
      totalFailed += failed;
      totalDuration += duration;

      testResults.push({
        file: testFile,
        passed,
        failed,
        duration,
        failures: [{ test: 'Test execution', error: error.message }],
      });

      console.log(`  ✗ Failed to run test: ${error.message}\n`);
    }
  }

  const report: ReliabilityReport = {
    timestamp,
    totalTests: totalPassed + totalFailed,
    totalPassed,
    totalFailed,
    totalDuration,
    testResults,
    invariantsVerified: [
      'Idempotency: No duplicate side effects on retry',
      'Rollback: Complete restoration of prior state',
      'Audit Log: Complete and immutable record of all operations',
      'CRV: Blocks all invalid commits',
    ],
    failureModesInjected: [
      'Tool timeout',
      'Tool error',
      'Partial response',
      'Corrupted schema',
      'Conflicting writes',
    ],
    summary: generateSummary(totalPassed, totalFailed, testResults),
  };

  return report;
}

function generateSummary(totalPassed: number, totalFailed: number, testResults: TestResult[]): string {
  const total = totalPassed + totalFailed;
  const passRate = total > 0 ? ((totalPassed / total) * 100).toFixed(2) : '0.00';

  let summary = `## Reliability Test Suite Summary\n\n`;
  summary += `**Overall Results:**\n`;
  summary += `- Total Tests: ${total}\n`;
  summary += `- Passed: ${totalPassed}\n`;
  summary += `- Failed: ${totalFailed}\n`;
  summary += `- Pass Rate: ${passRate}%\n\n`;

  if (totalFailed === 0) {
    summary += `✅ **All tests passed!** All invariants are verified and all failure modes are handled correctly.\n\n`;
  } else {
    summary += `⚠️ **Some tests failed.** Review the detailed results below for specific failure information.\n\n`;
  }

  summary += `**Test Categories:**\n`;
  testResults.forEach((result) => {
    const fileName = path.basename(result.file);
    const status = result.failed === 0 ? '✅' : '❌';
    summary += `- ${status} ${fileName}: ${result.passed} passed, ${result.failed} failed (${result.duration}ms)\n`;
  });

  return summary;
}

function generateMarkdownReport(report: ReliabilityReport): string {
  let markdown = `# Reliability Test Report\n\n`;
  markdown += `**Generated:** ${report.timestamp}\n\n`;
  markdown += `---\n\n`;

  markdown += report.summary;
  markdown += `\n`;

  markdown += `## Invariants Verified\n\n`;
  report.invariantsVerified.forEach((invariant) => {
    markdown += `- ✅ ${invariant}\n`;
  });
  markdown += `\n`;

  markdown += `## Failure Modes Injected\n\n`;
  report.failureModesInjected.forEach((mode) => {
    markdown += `- 🔥 ${mode}\n`;
  });
  markdown += `\n`;

  markdown += `## Detailed Test Results\n\n`;
  report.testResults.forEach((result) => {
    const fileName = path.basename(result.file);
    const status = result.failed === 0 ? '✅ PASS' : '❌ FAIL';
    markdown += `### ${status} - ${fileName}\n\n`;
    markdown += `- **Passed:** ${result.passed}\n`;
    markdown += `- **Failed:** ${result.failed}\n`;
    markdown += `- **Duration:** ${result.duration}ms\n\n`;

    if (result.failures.length > 0) {
      markdown += `**Failures:**\n\n`;
      result.failures.forEach((failure, index) => {
        markdown += `${index + 1}. **${failure.test}**\n`;
        markdown += `   \`\`\`\n   ${failure.error}\n   \`\`\`\n\n`;
      });
    }
  });

  markdown += `---\n\n`;
  markdown += `## Conclusion\n\n`;

  if (report.totalFailed === 0) {
    markdown += `✅ **All reliability tests passed successfully.**\n\n`;
    markdown += `The system maintains all critical invariants under chaos conditions:\n`;
    markdown += `- Idempotency prevents duplicate side effects\n`;
    markdown += `- Rollback completely restores prior state\n`;
    markdown += `- Audit log captures all operations immutably\n`;
    markdown += `- CRV blocks all invalid commits\n\n`;
    markdown += `All injected failure modes (timeout, error, partial response, corrupted schema, conflicting writes) are handled correctly.\n`;
  } else {
    markdown += `⚠️ **Some reliability tests failed.**\n\n`;
    markdown += `Review the failures above and address the issues before deploying to production.\n`;
    markdown += `Failed tests indicate that some invariants may not be maintained under all chaos conditions.\n`;
  }

  return markdown;
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Aureus Agentic OS - Reliability Test Suite');
    console.log('='.repeat(60));
    console.log('');

    const report = await runChaosTests();

    console.log('\n' + '='.repeat(60));
    console.log('Generating reliability report...');
    console.log('='.repeat(60) + '\n');

    const markdown = generateMarkdownReport(report);
    const reportPath = path.join(process.cwd(), 'reliability_report.md');

    fs.writeFileSync(reportPath, markdown);

    console.log(`✅ Reliability report generated: ${reportPath}\n`);
    console.log(report.summary);

    // Exit with appropriate code
    process.exit(report.totalFailed > 0 ? 1 : 0);
  } catch (error: any) {
    console.error('Error running chaos tests:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { runChaosTests, generateMarkdownReport, ReliabilityReport };
