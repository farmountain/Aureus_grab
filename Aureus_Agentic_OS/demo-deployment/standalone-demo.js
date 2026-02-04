/**
 * Standalone Aureus Agentic OS Demo
 * A minimal demo that runs without the full TypeScript build
 * Connects to Podman services: PostgreSQL, Redis, Prometheus, Grafana
 */

const express = require('express');
const { Client } = require('pg');
const redis = require('redis');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));
app.use('/ui', express.static('ui'));

// Database connection
const dbClient = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'aureus'
});

// Redis connection
const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});

// Initialize connections
async function initializeConnections() {
  try {
    await dbClient.connect();
    console.log('✅ Connected to PostgreSQL');
    
    await redisClient.connect();
    console.log('✅ Connected to Redis');
    
    // Initialize database schema
    await initializeDatabase();
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    process.exit(1);
  }
}

async function initializeDatabase() {
  try {
    // Create demo tables
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'idle',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        agent_id INTEGER REFERENCES agents(id),
        status VARCHAR(50) DEFAULT 'pending',
        result JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ Database schema initialized');
  } catch (error) {
    console.log('ℹ️  Database schema already exists or error:', error.message);
  }
}

// UI Routes - Serve the studio HTML pages (with cache-busting headers)

// Persona selector and utilities
app.get('/persona-selector', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('persona-selector.html', { root: __dirname + '/ui' });
});

app.get('/persona-utils.js', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Content-Type', 'application/javascript');
  res.sendFile('persona-utils.js', { root: __dirname + '/ui' });
});

app.get('/agent-studio', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('agent-studio.html', { root: __dirname + '/ui' });
});

app.get('/world-model-studio', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('world-model-studio.html', { root: __dirname + '/ui' });
});

app.get('/perception', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('perception.html', { root: __dirname + '/ui' });
});

app.get('/tool-adapter-wizard', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('tool-adapter-wizard.html', { root: __dirname + '/ui' });
});

app.get('/workflow-wizard', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('workflow-wizard.html', { root: __dirname + '/ui' });
});

app.get('/dag-studio', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('dag-studio.html', { root: __dirname + '/ui' });
});

app.get('/monitoring', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('monitoring.html', { root: __dirname + '/ui' });
});

app.get('/devops', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('devops.html', { root: __dirname + '/ui' });
});

app.get('/test-click', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('test-click.html', { root: __dirname + '/ui' });
});

app.get('/deployment', (req, res) => {
  res.sendFile('deployment.html', { root: __dirname + '/ui' });
});

app.get('/execution-dashboard', (req, res) => {
  res.sendFile('agent-execution-dashboard.html', { root: __dirname + '/ui' });
});

app.get('/test', (req, res) => {
  res.sendFile('test-validate.html', { root: __dirname + '/ui' });
});

// Persona landing pages
app.get('/personal', (req, res) => {
  res.redirect('/agent-studio?persona=personal');
});

app.get('/developer', (req, res) => {
  res.redirect('/workflow-wizard?persona=developer');
});

app.get('/admin', (req, res) => {
  res.redirect('/monitoring?persona=admin');
});

app.get('/devops-persona', (req, res) => {
  res.redirect('/devops?persona=devops');
});

app.get('/end-to-end', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile('end-to-end-demo.html', { root: __dirname + '/ui' });
});

// Main console route - redirects to persona selector if no persona set
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Aureus Agentic OS - Demo</title>
      <script src="/persona-utils.js"></script>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px;
          border-radius: 10px;
          margin-bottom: 30px;
        }
        .card {
          background: white;
          padding: 20px;
          margin: 20px 0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .status { display: inline-block; padding: 5px 10px; border-radius: 5px; }
        .status.running { background: #4caf50; color: white; }
        .status.idle { background: #ff9800; color: white; }
        button {
          background: #667eea;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          margin: 5px;
        }
        button:hover { background: #5568d3; }
        #output { 
          background: #263238; 
          color: #aed581; 
          padding: 15px; 
          border-radius: 5px;
          font-family: 'Courier New', monospace;
          max-height: 400px;
          overflow-y: auto;
        }
        .service-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 15px;
          margin: 20px 0;
        }
        .service-card {
          background: white;
          padding: 15px;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🤖 Aureus Agentic OS</h1>
        <p>Production-Grade Operating System for AI Agents - Interactive Demo Environment</p>
        <p style="margin-top: 10px; font-size: 14px;">Running on Podman with PostgreSQL, Redis, Prometheus & Grafana</p>
      </div>

      <div class="card" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none;">
        <h2 style="color: white;">🏭 End-to-End Agent Factory Workflow</h2>
        <p style="opacity: 0.95; margin: 15px 0;">Experience the complete agent lifecycle: blueprint generation → world model → memory engine → reliable execution → risk management → rollback</p>
        <a href="/end-to-end"><button style="background: white; color: #667eea; font-weight: bold;">Launch Complete Demo</button></a>
      </div>

      <div class="card">
        <h2>👤 Choose Your Persona Journey</h2>
        <div class="service-grid">
          <div class="service-card" style="border-left-color: #10b981;">
            <h3>🎯 Personal User</h3>
            <p>Quick agent creation with pre-built templates</p>
            <p style="font-size: 12px; color: #666; margin: 10px 0;">• Agent Studio • Pre-built scenarios • Visual feedback</p>
            <a href="/personal"><button>Start Personal Journey</button></a>
          </div>
          <div class="service-card" style="border-left-color: #3b82f6;">
            <h3>👨‍💻 Agent Developer</h3>
            <p>Build custom agents with SDK and API access</p>
            <p style="font-size: 12px; color: #666; margin: 10px 0;">• SDK Quick Start • Custom Tools • Testing Sandbox</p>
            <a href="/developer"><button>Start Developer Journey</button></a>
          </div>
          <div class="service-card" style="border-left-color: #f59e0b;">
            <h3>👨‍💼 Administrator</h3>
            <p>Multi-tenant management and compliance</p>
            <p style="font-size: 12px; color: #666; margin: 10px 0;">• Policy Config • Tenant Isolation • Audit Trail</p>
            <a href="/admin"><button>Start Admin Journey</button></a>
          </div>
          <div class="service-card" style="border-left-color: #ef4444;">
            <h3>⚙️ DevOps Engineer</h3>
            <p>Infrastructure deployment and monitoring</p>
            <p style="font-size: 12px; color: #666; margin: 10px 0;">• CI/CD Pipelines • Observability • Disaster Recovery</p>
            <a href="/devops-persona"><button>Start DevOps Journey</button></a>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>System Status</h2>
        <div class="service-grid">
          <div class="service-card">
            <h3>PostgreSQL</h3>
            <span class="status running">Running</span>
            <p>Port: 5432</p>
          </div>
          <div class="service-card">
            <h3>Redis</h3>
            <span class="status running">Running</span>
            <p>Port: 6379</p>
          </div>
          <div class="service-card">
            <h3>Prometheus</h3>
            <span class="status running">Running</span>
            <p>Port: 9090</p>
            <a href="http://localhost:9090" target="_blank">Open Dashboard</a>
          </div>
          <div class="service-card">
            <h3>Grafana</h3>
            <span class="status running">Running</span>
            <p>Port: 3001</p>
            <a href="http://localhost:3001" target="_blank">Open Dashboard</a>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>🎨 Interactive Studios & Tools</h2>
        <div class="service-grid">
          <div class="service-card">
            <h3>🏗️ Agent Studio</h3>
            <p>Visual agent builder with drag-and-drop interface</p>
            <a href="/agent-studio" target="_blank"><button>Open Agent Studio</button></a>
          </div>
          <div class="service-card">
            <h3>🌍 World Model Studio</h3>
            <p>Design domain models, entities, and constraints</p>
            <a href="/world-model-studio" target="_blank"><button>Open World Model Studio</button></a>
          </div>
          <div class="service-card">
            <h3>🧠 HipCortex Memory</h3>
            <p>Explore memory system with provenance tracking</p>
            <a href="/perception" target="_blank"><button>Open Memory Browser</button></a>
          </div>
          <div class="service-card">
            <h3>🔧 Tool Adapter Wizard</h3>
            <p>Create custom tool adapters</p>
            <a href="/tool-adapter-wizard" target="_blank"><button>Open Tool Wizard</button></a>
          </div>
          <div class="service-card">
            <h3>🔀 Workflow Wizard</h3>
            <p>Design workflows with DAG visualization</p>
            <a href="/workflow-wizard" target="_blank"><button>Open Workflow Wizard</button></a>
          </div>
          <div class="service-card">
            <h3>✅ Test & Validate</h3>
            <p>CRV validation and reliability testing</p>
            <a href="/test" target="_blank"><button>Open Test Suite</button></a>
          </div>
          <div class="service-card">
            <h3>📊 Monitoring Dashboard</h3>
            <p>Real-time metrics and observability</p>
            <a href="/monitoring" target="_blank"><button>Open Monitoring</button></a>
          </div>
          <div class="service-card">
            <h3>🚀 Deployment Manager</h3>
            <p>Deployment pipelines and release gates</p>
            <a href="/deployment" target="_blank"><button>Open Deployment</button></a>
          </div>
          <div class="service-card">
            <h3>⚙️ DevOps Dashboard</h3>
            <p>Infrastructure monitoring and CI/CD</p>
            <a href="/devops" target="_blank"><button>Open DevOps</button></a>
          </div>
          <div class="service-card">
            <h3>▶️ Execution Dashboard</h3>
            <p>Live agent execution monitoring</p>
            <a href="/execution-dashboard" target="_blank"><button>Open Execution Dashboard</button></a>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>🔬 Enterprise Features</h2>
        <ul style="line-height: 2;">
          <li><strong>Circuit Reasoning Validation (CRV):</strong> Reliable execution with constraint validation</li>
          <li><strong>Multi-Tenant Isolation:</strong> PostgreSQL row-level security, complete data isolation</li>
          <li><strong>HipCortex Memory:</strong> Tiered retention, provenance tracking, snapshot/rollback</li>
          <li><strong>Goal-Guard FSM:</strong> Policy engine with safety rules and compliance</li>
          <li><strong>Deployment Gates:</strong> Approval workflows, automated testing, rollback capabilities</li>
          <li><strong>Observability:</strong> OpenTelemetry tracing, Prometheus metrics, distributed logs</li>
        </ul>
      </div>

      <div class="card">
        <h2>⚡ Quick Actions</h2>
        <button onclick="createAgent()">Create Demo Agent</button>
        <button onclick="listAgents()">List Agents</button>
        <button onclick="runWorkflow()">Run Sample Workflow</button>
        <button onclick="checkHealth()">Health Check</button>
        <button onclick="clearOutput()">Clear Output</button>
      </div>

      <div class="card">
        <h2>Output</h2>
        <div id="output">Ready. Click actions above to interact with the system.</div>
      </div>

      <script>
        const output = document.getElementById('output');
        
        function log(message) {
          const timestamp = new Date().toLocaleTimeString();
          output.innerHTML += '\\n[' + timestamp + '] ' + message;
          output.scrollTop = output.scrollHeight;
        }
        
        function clearOutput() {
          output.innerHTML = 'Output cleared.';
        }
        
        async function createAgent() {
          log('Creating demo agent...');
          try {
            const response = await fetch('/api/agents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: 'Demo Agent ' + Date.now(),
                type: 'autonomous'
              })
            });
            const data = await response.json();
            log('✅ Agent created: ' + JSON.stringify(data.agent));
          } catch (error) {
            log('❌ Error: ' + error.message);
          }
        }
        
        async function listAgents() {
          log('Fetching agents...');
          try {
            const response = await fetch('/api/agents');
            const data = await response.json();
            log('📋 Agents (' + data.agents.length + '):');
            data.agents.forEach(agent => {
              log('  - ' + agent.name + ' (' + agent.type + ') - ' + agent.status);
            });
          } catch (error) {
            log('❌ Error: ' + error.message);
          }
        }
        
        async function runWorkflow() {
          log('Running sample workflow...');
          try {
            const response = await fetch('/api/workflows', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: 'Sample Workflow',
                steps: ['initialize', 'process', 'finalize']
              })
            });
            const data = await response.json();
            log('✅ Workflow started: ' + data.workflow.name);
            log('   Status: ' + data.workflow.status);
          } catch (error) {
            log('❌ Error: ' + error.message);
          }
        }
        
        async function checkHealth() {
          log('Checking system health...');
          try {
            const response = await fetch('/health');
            const data = await response.json();
            log('✅ System health: ' + data.status);
            log('   Database: ' + (data.database ? '✅' : '❌'));
            log('   Redis: ' + (data.redis ? '✅' : '❌'));
          } catch (error) {
            log('❌ Error: ' + error.message);
          }
        }

        // Check if persona is set, if not redirect to selector
        window.addEventListener('DOMContentLoaded', function() {
          if (sessionStorage.getItem('aureus_persona')) {
            addPersonaBadge();
          } else {
            if (confirm('No persona selected. Would you like to choose your persona now?')) {
              window.location.href = '/persona-selector';
            }
          }
        });
      </script>
    </body>
    </html>
  `);
});

app.get('/health', async (req, res) => {
  try {
    await dbClient.query('SELECT 1');
    await redisClient.ping();
    res.json({
      status: 'healthy',
      database: true,
      redis: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/api/agents', async (req, res) => {
  try {
    const result = await dbClient.query('SELECT * FROM agents ORDER BY created_at DESC');
    res.json({ agents: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/agents', async (req, res) => {
  try {
    const { name, type } = req.body;
    const result = await dbClient.query(
      'INSERT INTO agents (name, type, status) VALUES ($1, $2, $3) RETURNING *',
      [name, type, 'idle']
    );
    
    // Cache in Redis
    await redisClient.set(`agent:${result.rows[0].id}`, JSON.stringify(result.rows[0]));
    
    res.json({ agent: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const { name, agentId } = req.body;
    const result = await dbClient.query(
      'INSERT INTO workflows (name, agent_id, status) VALUES ($1, $2, $3) RETURNING *',
      [name, agentId || null, 'running']
    );
    res.json({ workflow: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
initializeConnections().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         🤖 Aureus Agentic OS - Demo Server               ║
║                                                           ║
║  Console:     http://localhost:${PORT}                       ║
║  Grafana:     http://localhost:3001 (admin/admin)        ║
║  Prometheus:  http://localhost:9090                      ║
║                                                           ║
║  Services running via Podman:                            ║
║  • PostgreSQL (port 5432)                                ║
║  • Redis (port 6379)                                     ║
║  • Prometheus (port 9090)                                ║
║  • Grafana (port 3001)                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
});

process.on('SIGINT', async () => {
  console.log('\n\nShutting down...');
  await dbClient.end();
  await redisClient.quit();
  process.exit(0);
});
