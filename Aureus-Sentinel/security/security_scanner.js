/**
 * Security Scanner - Automated security testing suite
 * 
 * Integrates multiple security tools for comprehensive security auditing:
 * - OWASP ZAP: Penetration testing and vulnerability scanning
 * - Trivy: Container and dependency vulnerability scanning
 * - Snyk: Supply chain security and license compliance
 * - Custom tests: Authentication, authorization, input validation
 * 
 * Usage:
 *   node security/security_scanner.js --all
 *   node security/security_scanner.js --tool=zap
 *   node security/security_scanner.js --tool=trivy
 *   node security/security_scanner.js --tool=snyk
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

class SecurityScanner {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './security-reports',
      verbose: options.verbose || false,
      failOnCritical: options.failOnCritical !== false,
      targetUrl: options.targetUrl || 'http://localhost:3000',
      ...options
    };
    
    this.results = {
      timestamp: new Date().toISOString(),
      scanId: crypto.randomBytes(8).toString('hex'),
      tools: {},
      summary: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      },
      status: 'pending'
    };
    
    this.ensureOutputDir();
  }
  
  ensureOutputDir() {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
  }
  
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      debug: '🔍'
    }[level] || 'ℹ️';
    
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }
  
  async runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        shell: true,
        ...options
      });
      
      let stdout = '';
      let stderr = '';
      
      if (!this.options.verbose) {
        proc.stdout?.on('data', (data) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });
      }
      
      proc.on('close', (code) => {
        if (code === 0 || options.ignoreExitCode) {
          resolve({ code, stdout, stderr });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });
      
      proc.on('error', reject);
    });
  }
  
  /**
   * OWASP ZAP Penetration Testing
   * Runs baseline and active scans against the bridge API
   */
  async runZAPScan() {
    this.log('Starting OWASP ZAP penetration testing...', 'info');
    
    const zapResults = {
      tool: 'OWASP ZAP',
      version: 'latest',
      scanType: 'baseline',
      startTime: new Date().toISOString(),
      findings: [],
      status: 'running'
    };
    
    try {
      // Check if ZAP is installed
      const zapCheck = await this.runCommand('docker', ['--version'], { ignoreExitCode: true });
      
      if (zapCheck.code !== 0) {
        this.log('Docker not found, skipping ZAP scan (requires Docker)', 'warning');
        zapResults.status = 'skipped';
        zapResults.reason = 'Docker not installed';
        this.results.tools.zap = zapResults;
        return zapResults;
      }
      
      // Run ZAP baseline scan using Docker
      this.log(`Scanning ${this.options.targetUrl} with ZAP baseline...`, 'info');
      
      const zapReportPath = path.join(this.options.outputDir, `zap-report-${this.results.scanId}.html`);
      const zapJsonPath = path.join(this.options.outputDir, `zap-report-${this.results.scanId}.json`);
      
      // ZAP baseline scan
      const zapArgs = [
        'run', '--rm',
        '-v', `${path.resolve(this.options.outputDir)}:/zap/wrk/:rw`,
        'ghcr.io/zaproxy/zaproxy:stable',
        'zap-baseline.py',
        '-t', this.options.targetUrl,
        '-r', `zap-report-${this.results.scanId}.html`,
        '-J', `zap-report-${this.results.scanId}.json`,
        '-I', // Ignore scan failures (to get report even if issues found)
      ];
      
      try {
        await this.runCommand('docker', zapArgs, { ignoreExitCode: true });
        
        // Parse ZAP JSON report if available
        if (fs.existsSync(zapJsonPath)) {
          const zapData = JSON.parse(fs.readFileSync(zapJsonPath, 'utf8'));
          
          if (zapData.site && zapData.site[0] && zapData.site[0].alerts) {
            zapResults.findings = zapData.site[0].alerts.map(alert => ({
              name: alert.name,
              risk: alert.riskdesc.split(' ')[0].toLowerCase(),
              confidence: alert.confidence,
              description: alert.desc,
              solution: alert.solution,
              references: alert.reference ? alert.reference.split('\n') : [],
              instances: alert.instances?.length || 0
            }));
            
            // Update summary
            zapResults.findings.forEach(finding => {
              this.results.summary[finding.risk] = (this.results.summary[finding.risk] || 0) + 1;
            });
          }
        }
        
        zapResults.status = 'completed';
        zapResults.endTime = new Date().toISOString();
        zapResults.reportPath = zapReportPath;
        
        this.log(`ZAP scan completed. Found ${zapResults.findings.length} potential issues.`, 'success');
      } catch (error) {
        this.log(`ZAP scan failed: ${error.message}`, 'warning');
        zapResults.status = 'failed';
        zapResults.error = error.message;
      }
      
    } catch (error) {
      this.log(`ZAP scan error: ${error.message}`, 'error');
      zapResults.status = 'error';
      zapResults.error = error.message;
    }
    
    this.results.tools.zap = zapResults;
    return zapResults;
  }
  
  /**
   * Trivy Vulnerability Scanning
   * Scans for vulnerabilities in dependencies and container images
   */
  async runTrivyScan() {
    this.log('Starting Trivy vulnerability scanning...', 'info');
    
    const trivyResults = {
      tool: 'Trivy',
      version: 'latest',
      scanType: 'filesystem',
      startTime: new Date().toISOString(),
      findings: [],
      status: 'running'
    };
    
    try {
      // Check if Trivy is installed
      const trivyCheck = await this.runCommand('trivy', ['--version'], { ignoreExitCode: true });
      
      if (trivyCheck.code !== 0) {
        this.log('Trivy not found, attempting to use Docker image...', 'warning');
        
        // Try Docker-based Trivy
        const dockerCheck = await this.runCommand('docker', ['--version'], { ignoreExitCode: true });
        
        if (dockerCheck.code !== 0) {
          this.log('Neither Trivy nor Docker found, skipping Trivy scan', 'warning');
          trivyResults.status = 'skipped';
          trivyResults.reason = 'Trivy and Docker not installed';
          this.results.tools.trivy = trivyResults;
          return trivyResults;
        }
        
        // Use Docker-based Trivy
        return await this.runTrivyDockerScan(trivyResults);
      }
      
      // Run Trivy filesystem scan
      this.log('Scanning filesystem with Trivy...', 'info');
      
      const trivyReportPath = path.join(this.options.outputDir, `trivy-report-${this.results.scanId}.json`);
      
      const trivyArgs = [
        'filesystem',
        '--format', 'json',
        '--output', trivyReportPath,
        '--severity', 'CRITICAL,HIGH,MEDIUM,LOW',
        '--scanners', 'vuln,secret,config',
        '.'
      ];
      
      try {
        await this.runCommand('trivy', trivyArgs, { ignoreExitCode: true });
        
        // Parse Trivy JSON report
        if (fs.existsSync(trivyReportPath)) {
          const trivyData = JSON.parse(fs.readFileSync(trivyReportPath, 'utf8'));
          
          if (trivyData.Results) {
            trivyData.Results.forEach(result => {
              if (result.Vulnerabilities) {
                result.Vulnerabilities.forEach(vuln => {
                  trivyResults.findings.push({
                    name: vuln.VulnerabilityID,
                    severity: vuln.Severity.toLowerCase(),
                    package: vuln.PkgName,
                    installedVersion: vuln.InstalledVersion,
                    fixedVersion: vuln.FixedVersion,
                    title: vuln.Title,
                    description: vuln.Description,
                    references: vuln.References || []
                  });
                  
                  // Update summary
                  const severity = vuln.Severity.toLowerCase();
                  this.results.summary[severity] = (this.results.summary[severity] || 0) + 1;
                });
              }
            });
          }
        }
        
        trivyResults.status = 'completed';
        trivyResults.endTime = new Date().toISOString();
        trivyResults.reportPath = trivyReportPath;
        
        this.log(`Trivy scan completed. Found ${trivyResults.findings.length} vulnerabilities.`, 'success');
      } catch (error) {
        this.log(`Trivy scan failed: ${error.message}`, 'warning');
        trivyResults.status = 'failed';
        trivyResults.error = error.message;
      }
      
    } catch (error) {
      this.log(`Trivy scan error: ${error.message}`, 'error');
      trivyResults.status = 'error';
      trivyResults.error = error.message;
    }
    
    this.results.tools.trivy = trivyResults;
    return trivyResults;
  }
  
  async runTrivyDockerScan(trivyResults) {
    this.log('Using Docker-based Trivy scanner...', 'info');
    
    const trivyReportPath = path.join(this.options.outputDir, `trivy-report-${this.results.scanId}.json`);
    
    const trivyArgs = [
      'run', '--rm',
      '-v', `${process.cwd()}:/scan:ro`,
      '-v', `${path.resolve(this.options.outputDir)}:/output:rw`,
      'aquasec/trivy:latest',
      'filesystem',
      '--format', 'json',
      '--output', `/output/trivy-report-${this.results.scanId}.json`,
      '--severity', 'CRITICAL,HIGH,MEDIUM,LOW',
      '--scanners', 'vuln,secret',
      '/scan'
    ];
    
    try {
      await this.runCommand('docker', trivyArgs, { ignoreExitCode: true });
      
      // Parse results (same as above)
      if (fs.existsSync(trivyReportPath)) {
        const trivyData = JSON.parse(fs.readFileSync(trivyReportPath, 'utf8'));
        
        if (trivyData.Results) {
          trivyData.Results.forEach(result => {
            if (result.Vulnerabilities) {
              result.Vulnerabilities.forEach(vuln => {
                trivyResults.findings.push({
                  name: vuln.VulnerabilityID,
                  severity: vuln.Severity.toLowerCase(),
                  package: vuln.PkgName,
                  installedVersion: vuln.InstalledVersion,
                  fixedVersion: vuln.FixedVersion,
                  title: vuln.Title,
                  description: vuln.Description
                });
                
                const severity = vuln.Severity.toLowerCase();
                this.results.summary[severity] = (this.results.summary[severity] || 0) + 1;
              });
            }
          });
        }
      }
      
      trivyResults.status = 'completed';
      trivyResults.endTime = new Date().toISOString();
      trivyResults.reportPath = trivyReportPath;
      
      this.log(`Trivy scan completed. Found ${trivyResults.findings.length} vulnerabilities.`, 'success');
    } catch (error) {
      this.log(`Trivy Docker scan failed: ${error.message}`, 'warning');
      trivyResults.status = 'failed';
      trivyResults.error = error.message;
    }
    
    this.results.tools.trivy = trivyResults;
    return trivyResults;
  }
  
  /**
   * Snyk Supply Chain Analysis
   * Scans for dependency vulnerabilities and license issues
   */
  async runSnykScan() {
    this.log('Starting Snyk supply chain analysis...', 'info');
    
    const snykResults = {
      tool: 'Snyk',
      version: 'latest',
      scanType: 'dependencies',
      startTime: new Date().toISOString(),
      findings: [],
      licenses: [],
      status: 'running'
    };
    
    try {
      // Check if Snyk is installed
      const snykCheck = await this.runCommand('snyk', ['--version'], { ignoreExitCode: true });
      
      if (snykCheck.code !== 0) {
        this.log('Snyk not found, skipping Snyk scan (install with: npm install -g snyk)', 'warning');
        snykResults.status = 'skipped';
        snykResults.reason = 'Snyk not installed';
        this.results.tools.snyk = snykResults;
        return snykResults;
      }
      
      // Check if authenticated
      const authCheck = await this.runCommand('snyk', ['auth', 'status'], { ignoreExitCode: true });
      
      if (authCheck.code !== 0) {
        this.log('Snyk not authenticated. Run: snyk auth', 'warning');
        snykResults.status = 'skipped';
        snykResults.reason = 'Snyk not authenticated';
        this.results.tools.snyk = snykResults;
        return snykResults;
      }
      
      // Run Snyk test
      this.log('Scanning dependencies with Snyk...', 'info');
      
      const snykReportPath = path.join(this.options.outputDir, `snyk-report-${this.results.scanId}.json`);
      
      try {
        const result = await this.runCommand('snyk', [
          'test',
          '--json',
          '--all-projects'
        ], { ignoreExitCode: true });
        
        // Parse Snyk output
        if (result.stdout) {
          try {
            const snykData = JSON.parse(result.stdout);
            
            if (snykData.vulnerabilities) {
              snykData.vulnerabilities.forEach(vuln => {
                snykResults.findings.push({
                  name: vuln.id,
                  severity: vuln.severity,
                  package: vuln.packageName,
                  version: vuln.version,
                  title: vuln.title,
                  description: vuln.description,
                  fixedIn: vuln.fixedIn,
                  upgradePath: vuln.upgradePath,
                  references: [vuln.url]
                });
                
                this.results.summary[vuln.severity] = (this.results.summary[vuln.severity] || 0) + 1;
              });
            }
            
            // Save report
            fs.writeFileSync(snykReportPath, JSON.stringify(snykData, null, 2));
          } catch (parseError) {
            this.log(`Failed to parse Snyk output: ${parseError.message}`, 'warning');
          }
        }
        
        snykResults.status = 'completed';
        snykResults.endTime = new Date().toISOString();
        snykResults.reportPath = snykReportPath;
        
        this.log(`Snyk scan completed. Found ${snykResults.findings.length} issues.`, 'success');
      } catch (error) {
        // Snyk exits with non-zero when vulnerabilities found, which is expected
        snykResults.status = 'completed';
        snykResults.endTime = new Date().toISOString();
        this.log(`Snyk scan completed with findings.`, 'success');
      }
      
    } catch (error) {
      this.log(`Snyk scan error: ${error.message}`, 'error');
      snykResults.status = 'error';
      snykResults.error = error.message;
    }
    
    this.results.tools.snyk = snykResults;
    return snykResults;
  }
  
  /**
   * Custom Security Tests
   * Application-specific security checks
   */
  async runCustomTests() {
    this.log('Running custom security tests...', 'info');
    
    const customResults = {
      tool: 'Custom Security Tests',
      version: '1.0.0',
      startTime: new Date().toISOString(),
      tests: [],
      status: 'running'
    };
    
    // Test 1: Check for hardcoded secrets
    const secretsTest = await this.checkForHardcodedSecrets();
    customResults.tests.push(secretsTest);
    
    // Test 2: Validate signature verification
    const signatureTest = await this.testSignatureVerification();
    customResults.tests.push(signatureTest);
    
    // Test 3: Test input validation
    const inputValidationTest = await this.testInputValidation();
    customResults.tests.push(inputValidationTest);
    
    // Test 4: Check file permissions
    const permissionsTest = await this.checkFilePermissions();
    customResults.tests.push(permissionsTest);
    
    // Test 5: Audit log integrity
    const auditLogTest = await this.testAuditLogIntegrity();
    customResults.tests.push(auditLogTest);
    
    customResults.status = 'completed';
    customResults.endTime = new Date().toISOString();
    
    const failedTests = customResults.tests.filter(t => t.status === 'failed');
    this.log(`Custom tests completed. ${failedTests.length} failures.`, failedTests.length > 0 ? 'warning' : 'success');
    
    this.results.tools.custom = customResults;
    return customResults;
  }
  
  async checkForHardcodedSecrets() {
    const test = {
      name: 'Hardcoded Secrets Detection',
      description: 'Check for hardcoded API keys, passwords, and tokens',
      status: 'running',
      findings: []
    };
    
    const patterns = [
      { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/ },
      { name: 'Generic API Key', regex: /api[_-]?key["\s:=]+[a-zA-Z0-9]{20,}/ },
      { name: 'Password in Code', regex: /password["\s:=]+"[^"]{8,}"/ },
      { name: 'Private Key', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
      { name: 'Generic Secret', regex: /secret["\s:=]+"[^"]{10,}"/ }
    ];
    
    const scanFiles = (dir, results = []) => {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          if (!file.startsWith('.') && file !== 'node_modules' && file !== 'security-reports') {
            scanFiles(filePath, results);
          }
        } else if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.env')) {
          const content = fs.readFileSync(filePath, 'utf8');
          
          patterns.forEach(pattern => {
            const matches = content.match(pattern.regex);
            if (matches) {
              results.push({
                file: filePath,
                pattern: pattern.name,
                severity: 'high'
              });
            }
          });
        }
      }
      
      return results;
    };
    
    try {
      test.findings = scanFiles('.');
      test.status = test.findings.length === 0 ? 'passed' : 'failed';
      
      if (test.findings.length > 0) {
        this.results.summary.high += test.findings.length;
      }
    } catch (error) {
      test.status = 'error';
      test.error = error.message;
    }
    
    return test;
  }
  
  async testSignatureVerification() {
    const test = {
      name: 'Signature Verification',
      description: 'Test digital signature validation and tamper detection',
      status: 'running',
      findings: []
    };
    
    try {
      // Import signer module if available
      const signerPath = path.join(process.cwd(), 'Aureus-Sentinel', 'bridge', 'signer.js');
      
      if (!fs.existsSync(signerPath)) {
        test.status = 'skipped';
        test.reason = 'Signer module not found';
        return test;
      }
      
      const { Signer } = require(signerPath);
      const signer = new Signer();
      await signer.init();
      
      // Test 1: Valid signature
      const data = JSON.stringify({ test: 'data' });
      const signature = await signer.sign(data);
      const valid = await signer.verify(data, signature);
      
      if (!valid) {
        test.findings.push({
          issue: 'Valid signature failed verification',
          severity: 'critical'
        });
        this.results.summary.critical++;
      }
      
      // Test 2: Tampered data
      const tamperedValid = await signer.verify(data + 'tampered', signature);
      
      if (tamperedValid) {
        test.findings.push({
          issue: 'Tampered data passed verification',
          severity: 'critical'
        });
        this.results.summary.critical++;
      }
      
      // Test 3: Empty signature
      const emptyValid = await signer.verify(data, '');
      
      if (emptyValid) {
        test.findings.push({
          issue: 'Empty signature passed verification',
          severity: 'critical'
        });
        this.results.summary.critical++;
      }
      
      test.status = test.findings.length === 0 ? 'passed' : 'failed';
    } catch (error) {
      test.status = 'error';
      test.error = error.message;
    }
    
    return test;
  }
  
  async testInputValidation() {
    const test = {
      name: 'Input Validation',
      description: 'Test schema validation and malicious input handling',
      status: 'running',
      findings: []
    };
    
    try {
      const validatorPath = path.join(process.cwd(), 'Aureus-Sentinel', 'bridge', 'schema_validator.js');
      
      if (!fs.existsSync(validatorPath)) {
        test.status = 'skipped';
        test.reason = 'Schema validator not found';
        return test;
      }
      
      const { SchemaValidator } = require(validatorPath);
      const validator = new SchemaValidator();
      
      // Test malicious inputs
      const maliciousInputs = [
        { type: 'intent', data: { intentId: '<script>alert(1)</script>' } },
        { type: 'intent', data: { intentId: '../../../etc/passwd' } },
        { type: 'intent', data: { intentId: 'a'.repeat(10000) } },
        { type: 'intent', data: { toolName: 'rm -rf /' } }
      ];
      
      maliciousInputs.forEach(input => {
        const result = validator.validate(input.type, input.data);
        
        if (result.valid) {
          test.findings.push({
            issue: `Malicious input passed validation: ${input.data.intentId || input.data.toolName}`,
            severity: 'medium'
          });
          this.results.summary.medium++;
        }
      });
      
      test.status = test.findings.length === 0 ? 'passed' : 'failed';
    } catch (error) {
      test.status = 'error';
      test.error = error.message;
    }
    
    return test;
  }
  
  async checkFilePermissions() {
    const test = {
      name: 'File Permissions Check',
      description: 'Verify sensitive files have appropriate permissions',
      status: 'running',
      findings: []
    };
    
    const sensitiveFiles = [
      '.env',
      'package.json',
      'Aureus-Sentinel/bridge/kms/aws_kms_adapter.js',
      'Aureus-Sentinel/bridge/signer.js'
    ];
    
    try {
      sensitiveFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const mode = stats.mode.toString(8).slice(-3);
          
          // Check if world-readable or world-writable
          if (mode.endsWith('7') || mode.endsWith('6') || mode.endsWith('4')) {
            test.findings.push({
              file,
              permissions: mode,
              issue: 'File has overly permissive permissions',
              severity: 'medium'
            });
            this.results.summary.medium++;
          }
        }
      });
      
      test.status = test.findings.length === 0 ? 'passed' : 'failed';
    } catch (error) {
      test.status = 'error';
      test.error = error.message;
    }
    
    return test;
  }
  
  async testAuditLogIntegrity() {
    const test = {
      name: 'Audit Log Integrity',
      description: 'Verify audit log tamper-evident chain',
      status: 'running',
      findings: []
    };
    
    try {
      const auditLoggerPath = path.join(process.cwd(), 'Aureus-Sentinel', 'bridge', 'observability', 'audit_logger.js');
      
      if (!fs.existsSync(auditLoggerPath)) {
        test.status = 'skipped';
        test.reason = 'Audit logger not found';
        return test;
      }
      
      const { StructuredAuditLogger, Severity, AuditEventType } = require(auditLoggerPath);
      const logger = new StructuredAuditLogger({ logDir: './.audit-test', enableFile: true });
      await logger.init();
      
      // Create test log entries
      await logger.log(Severity.INFO, AuditEventType.SYSTEM_CONFIG, { test: 'entry1' });
      await logger.log(Severity.INFO, AuditEventType.SYSTEM_CONFIG, { test: 'entry2' });
      
      // Verify hash chain
      const logs = logger.getLogs();
      
      for (let i = 1; i < logs.length; i++) {
        const currentLog = logs[i];
        const previousLog = logs[i - 1];
        
        // Verify hash chain
        if (currentLog.metadata?.previousHash !== previousLog.metadata?.hash) {
          test.findings.push({
            issue: `Hash chain broken at log entry ${i}`,
            severity: 'critical'
          });
          this.results.summary.critical++;
        }
      }
      
      // Cleanup
      await logger.cleanup();
      fs.rmSync('./.audit-test', { recursive: true, force: true });
      
      test.status = test.findings.length === 0 ? 'passed' : 'failed';
    } catch (error) {
      test.status = 'error';
      test.error = error.message;
    }
    
    return test;
  }
  
  /**
   * Generate consolidated security report
   */
  generateReport() {
    this.log('Generating consolidated security report...', 'info');
    
    const reportPath = path.join(this.options.outputDir, `security-report-${this.results.scanId}.json`);
    const htmlReportPath = path.join(this.options.outputDir, `security-report-${this.results.scanId}.html`);
    
    // Save JSON report
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    
    // Generate HTML report
    const html = this.generateHTMLReport();
    fs.writeFileSync(htmlReportPath, html);
    
    this.log(`Reports saved:`, 'success');
    this.log(`  JSON: ${reportPath}`, 'info');
    this.log(`  HTML: ${htmlReportPath}`, 'info');
    
    return { reportPath, htmlReportPath };
  }
  
  generateHTMLReport() {
    const { critical, high, medium, low, info } = this.results.summary;
    const total = critical + high + medium + low + info;
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>Security Scan Report - ${this.results.scanId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin: 20px 0; }
    .summary-card { padding: 20px; border-radius: 6px; text-align: center; color: white; }
    .critical { background: #dc3545; }
    .high { background: #fd7e14; }
    .medium { background: #ffc107; }
    .low { background: #17a2b8; }
    .info { background: #6c757d; }
    .summary-card h3 { margin: 0 0 10px 0; font-size: 24px; }
    .summary-card p { margin: 0; font-size: 14px; text-transform: uppercase; }
    .tool-result { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 6px; }
    .tool-result h3 { margin-top: 0; color: #007bff; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
    .status-completed { background: #28a745; color: white; }
    .status-failed { background: #dc3545; color: white; }
    .status-skipped { background: #6c757d; color: white; }
    .findings { margin-top: 15px; }
    .finding { padding: 10px; margin: 8px 0; border-left: 4px solid #ddd; background: #f8f9fa; }
    .finding.critical { border-color: #dc3545; }
    .finding.high { border-color: #fd7e14; }
    .finding.medium { border-color: #ffc107; }
    .finding.low { border-color: #17a2b8; }
    .timestamp { color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔒 Security Scan Report</h1>
    <p class="timestamp">Scan ID: ${this.results.scanId} | Generated: ${this.results.timestamp}</p>
    
    <h2>Summary</h2>
    <div class="summary">
      <div class="summary-card critical">
        <h3>${critical}</h3>
        <p>Critical</p>
      </div>
      <div class="summary-card high">
        <h3>${high}</h3>
        <p>High</p>
      </div>
      <div class="summary-card medium">
        <h3>${medium}</h3>
        <p>Medium</p>
      </div>
      <div class="summary-card low">
        <h3>${low}</h3>
        <p>Low</p>
      </div>
      <div class="summary-card info">
        <h3>${info}</h3>
        <p>Info</p>
      </div>
    </div>
    
    <h2>Tool Results</h2>
    ${Object.values(this.results.tools).map(tool => `
      <div class="tool-result">
        <h3>${tool.tool} <span class="status-badge status-${tool.status}">${tool.status}</span></h3>
        <p><strong>Scan Type:</strong> ${tool.scanType || 'N/A'}</p>
        <p><strong>Duration:</strong> ${tool.startTime} - ${tool.endTime || 'In Progress'}</p>
        ${tool.reportPath ? `<p><strong>Report:</strong> ${tool.reportPath}</p>` : ''}
        
        ${tool.findings && tool.findings.length > 0 ? `
          <div class="findings">
            <h4>Findings (${tool.findings.length})</h4>
            ${tool.findings.slice(0, 10).map(finding => `
              <div class="finding ${finding.severity || finding.risk}">
                <strong>${finding.name || finding.issue}</strong><br>
                ${finding.description || finding.title || ''}
                ${finding.package ? `<br><em>Package: ${finding.package} ${finding.installedVersion || finding.version || ''}</em>` : ''}
              </div>
            `).join('')}
            ${tool.findings.length > 10 ? `<p><em>... and ${tool.findings.length - 10} more (see full report)</em></p>` : ''}
          </div>
        ` : '<p><em>No findings</em></p>'}
        
        ${tool.tests ? `
          <div class="findings">
            <h4>Tests (${tool.tests.length})</h4>
            ${tool.tests.map(test => `
              <div class="finding">
                <strong>${test.name}</strong> - <span class="status-badge status-${test.status}">${test.status}</span><br>
                ${test.description}<br>
                ${test.findings && test.findings.length > 0 ? `<em>${test.findings.length} issue(s) found</em>` : '<em>No issues</em>'}
              </div>
            `).join('')}
          </div>
        ` : ''}
        
        ${tool.error ? `<p style="color: #dc3545;"><strong>Error:</strong> ${tool.error}</p>` : ''}
      </div>
    `).join('')}
    
    <h2>Recommendations</h2>
    <div style="padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; margin-top: 20px;">
      <ul>
        ${critical > 0 ? `<li><strong>Critical:</strong> Address ${critical} critical issue(s) immediately</li>` : ''}
        ${high > 0 ? `<li><strong>High:</strong> Remediate ${high} high-severity vulnerabilities</li>` : ''}
        ${medium > 0 ? `<li><strong>Medium:</strong> Review and fix ${medium} medium-severity issues</li>` : ''}
        <li>Run security scans regularly as part of CI/CD pipeline</li>
        <li>Keep dependencies up to date</li>
        <li>Follow security best practices for authentication and authorization</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
  }
  
  /**
   * Run full security scan
   */
  async runFullScan() {
    this.log('🔒 Starting comprehensive security scan...', 'info');
    this.log(`Scan ID: ${this.results.scanId}`, 'info');
    
    try {
      // Run all scans
      await this.runCustomTests();
      await this.runTrivyScan();
      await this.runZAPScan();
      await this.runSnykScan();
      
      this.results.status = 'completed';
      this.results.endTime = new Date().toISOString();
      
      // Generate report
      const { reportPath, htmlReportPath } = this.generateReport();
      
      // Print summary
      this.log('\n📊 Security Scan Summary:', 'info');
      this.log(`  Critical: ${this.results.summary.critical}`, this.results.summary.critical > 0 ? 'error' : 'info');
      this.log(`  High: ${this.results.summary.high}`, this.results.summary.high > 0 ? 'warning' : 'info');
      this.log(`  Medium: ${this.results.summary.medium}`, 'info');
      this.log(`  Low: ${this.results.summary.low}`, 'info');
      this.log(`  Info: ${this.results.summary.info}`, 'info');
      
      // Check fail conditions
      if (this.options.failOnCritical && this.results.summary.critical > 0) {
        this.log(`\n❌ Scan failed: ${this.results.summary.critical} critical issue(s) found`, 'error');
        process.exit(1);
      }
      
      this.log('\n✅ Security scan completed successfully!', 'success');
      
      return this.results;
    } catch (error) {
      this.log(`\n❌ Security scan failed: ${error.message}`, 'error');
      this.results.status = 'failed';
      this.results.error = error.message;
      throw error;
    }
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    failOnCritical: !args.includes('--no-fail'),
    targetUrl: args.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000'
  };
  
  const tool = args.find(a => a.startsWith('--tool='))?.split('=')[1];
  
  const scanner = new SecurityScanner(options);
  
  (async () => {
    try {
      if (tool) {
        // Run specific tool
        switch (tool.toLowerCase()) {
          case 'zap':
            await scanner.runZAPScan();
            break;
          case 'trivy':
            await scanner.runTrivyScan();
            break;
          case 'snyk':
            await scanner.runSnykScan();
            break;
          case 'custom':
            await scanner.runCustomTests();
            break;
          default:
            console.error(`Unknown tool: ${tool}`);
            process.exit(1);
        }
        scanner.generateReport();
      } else {
        // Run all scans
        await scanner.runFullScan();
      }
    } catch (error) {
      console.error('Security scan failed:', error);
      process.exit(1);
    }
  })();
}

module.exports = { SecurityScanner };
