#!/usr/bin/env node

/**
 * Master UAT Runner
 * 
 * Executes all domain-specific UAT suites and generates a comprehensive report
 */

import RoboticsUAT from './uat-robotics';
import RetailUAT from './uat-retail';
import TravelUAT from './uat-travel';
import SmartphoneUAT from './uat-smartphone';

interface DomainResult {
  domain: string;
  passed: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  duration: number;
}

class MasterUATRunner {
  private results: DomainResult[] = [];

  async runAll(): Promise<void> {
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(20) + 'AUREUS AGENTIC OS - MASTER UAT' + ' '.repeat(27) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');
    console.log();

    await this.runDomainUAT('Robotics', RoboticsUAT);
    await this.runDomainUAT('Retail', RetailUAT);
    await this.runDomainUAT('Travel', TravelUAT);
    await this.runDomainUAT('Smartphone', SmartphoneUAT);

    this.printMasterSummary();
  }

  async runDomainUAT(domain: string, UATClass: any): Promise<void> {
    console.log();
    console.log('┌' + '─'.repeat(78) + '┐');
    console.log(`│ Starting ${domain} Domain UAT` + ' '.repeat(78 - 25 - domain.length) + '│');
    console.log('└' + '─'.repeat(78) + '┘');
    console.log();

    const startTime = Date.now();
    
    try {
      const uat = new UATClass();
      
      // Capture the results by running the UAT
      await uat.runAll();
      
      // Extract results from the UAT instance
      const results = uat.results || [];
      const totalTests = results.length;
      const passedTests = results.filter((r: any) => r.passed).length;
      const failedTests = totalTests - passedTests;
      const duration = Date.now() - startTime;
      const passed = failedTests === 0;

      this.results.push({
        domain,
        passed,
        totalTests,
        passedTests,
        failedTests,
        duration,
      });

      console.log();
      console.log(`${domain} Domain: ${passed ? '✓ PASSED' : '✗ FAILED'}`);
      console.log();
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        domain,
        passed: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 1,
        duration,
      });

      console.log();
      console.log(`${domain} Domain: ✗ FAILED (Error: ${error.message})`);
      console.log();
    }
  }

  printMasterSummary(): void {
    console.log();
    console.log('╔' + '═'.repeat(78) + '╗');
    console.log('║' + ' '.repeat(28) + 'MASTER UAT SUMMARY' + ' '.repeat(32) + '║');
    console.log('╠' + '═'.repeat(78) + '╣');

    const totalDomains = this.results.length;
    const passedDomains = this.results.filter(r => r.passed).length;
    const failedDomains = totalDomains - passedDomains;
    const totalTests = this.results.reduce((sum, r) => sum + r.totalTests, 0);
    const totalPassed = this.results.reduce((sum, r) => sum + r.passedTests, 0);
    const totalFailed = this.results.reduce((sum, r) => sum + r.failedTests, 0);
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log('║                                                                              ║');
    console.log(`║  Domains Tested:        ${totalDomains.toString().padEnd(56)} ║`);
    console.log(`║  Domains Passed:        ${passedDomains.toString().padEnd(56)} ║`);
    console.log(`║  Domains Failed:        ${failedDomains.toString().padEnd(56)} ║`);
    console.log('║                                                                              ║');
    console.log(`║  Total Tests:           ${totalTests.toString().padEnd(56)} ║`);
    console.log(`║  Total Passed:          ${totalPassed.toString().padEnd(56)} ║`);
    console.log(`║  Total Failed:          ${totalFailed.toString().padEnd(56)} ║`);
    console.log('║                                                                              ║');
    console.log(`║  Total Duration:        ${(totalDuration / 1000).toFixed(2)}s${' '.repeat(50)} ║`);
    console.log('║                                                                              ║');
    console.log('╠' + '═'.repeat(78) + '╣');

    // Domain breakdown
    console.log('║  Domain Breakdown:                                                           ║');
    console.log('║                                                                              ║');

    this.results.forEach(result => {
      const status = result.passed ? '✓' : '✗';
      const statusText = result.passed ? 'PASSED' : 'FAILED';
      const domainLine = `  ${status} ${result.domain.padEnd(15)} ${result.passedTests}/${result.totalTests} tests`;
      const durationText = `${(result.duration / 1000).toFixed(2)}s`;
      
      console.log(`║  ${domainLine.padEnd(60)} ${durationText.padStart(14)} ║`);
    });

    console.log('║                                                                              ║');
    console.log('╠' + '═'.repeat(78) + '╣');

    // Final result
    const allPassed = failedDomains === 0;
    const resultLine = allPassed 
      ? '║  OVERALL RESULT: ✓ ALL DOMAINS PASSED' 
      : `║  OVERALL RESULT: ✗ ${failedDomains} DOMAIN(S) FAILED`;
    
    console.log(resultLine + ' '.repeat(78 - resultLine.length + 1) + '║');
    console.log('╚' + '═'.repeat(78) + '╝');
    console.log();

    // Exit with appropriate code
    if (!allPassed) {
      console.log('⚠️  Some UAT suites failed. Please review the logs above.');
      console.log();
      process.exit(1);
    } else {
      console.log('🎉 All UAT suites passed successfully!');
      console.log();
      process.exit(0);
    }
  }

  async generateReport(): Promise<void> {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDomains: this.results.length,
        passedDomains: this.results.filter(r => r.passed).length,
        failedDomains: this.results.filter(r => !r.passed).length,
        totalTests: this.results.reduce((sum, r) => sum + r.totalTests, 0),
        totalPassed: this.results.reduce((sum, r) => sum + r.passedTests, 0),
        totalFailed: this.results.reduce((sum, r) => sum + r.failedTests, 0),
        totalDuration: this.results.reduce((sum, r) => sum + r.duration, 0),
      },
      domains: this.results,
    };

    console.log('Report:', JSON.stringify(report, null, 2));
  }
}

// Run master UAT if executed directly
if (require.main === module) {
  const runner = new MasterUATRunner();
  runner.runAll().catch(error => {
    console.error('Fatal error running UATs:', error);
    process.exit(1);
  });
}

export default MasterUATRunner;
