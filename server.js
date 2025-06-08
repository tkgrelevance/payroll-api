const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');

const app = express();

// In-memory storage (we'll upgrade this later)
let payrollData = null;

app.use(cors());
app.use(express.json());

// Endpoint for n8n to send data
app.post('/api/payroll-data', (req, res) => {
  console.log('📊 Received payroll data from n8n');
  
  // Handle if data is wrapped in "0" key
  const cleanData = req.body["0"] || req.body;
  payrollData = {
    ...cleanData,
    lastUpdated: new Date().toISOString()
  };
  
  res.json({
    success: true,
    message: 'Payroll data received',
    employees: payrollData.summary?.totalEmployees || payrollData.totalEmployees || 0
  });
});

// Endpoint for dashboard to get data
app.get('/api/payroll-data', (req, res) => {
  if (!payrollData) {
    return res.status(404).json({
      error: 'No payroll data available'
    });
  }
  
  res.json(payrollData);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    hasData: !!payrollData
  });
});

// UPDATED: Real trigger-payroll endpoint that calls n8n
app.post('/api/trigger-payroll', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    console.log('🔄 Triggering payroll workflow with dates:', { startDate, endDate });
    
    // Prepare payload for n8n
    const n8nPayload = {
      startDate: startDate,
      endDate: endDate,
      timestamp: new Date().toISOString()
    };
    
    console.log('📤 Sending to n8n:', n8nPayload);
    
    // Call n8n webhook
    const n8nResponse = await fetch('https://aiops.relevancepros.com/webhook/trigger-payroll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(n8nPayload)
    });
    
    console.log('📡 n8n Response status:', n8nResponse.status);
    
    if (n8nResponse.ok) {
      const responseData = await n8nResponse.json().catch(() => ({}));
      console.log('✅ n8n workflow triggered successfully');
      
      res.json({
        success: true,
        message: 'Payroll workflow triggered successfully',
        n8nResponse: responseData,
        dateRange: { startDate, endDate }
      });
    } else {
      console.error('❌ n8n workflow trigger failed:', n8nResponse.status);
      const errorText = await n8nResponse.text().catch(() => 'Unknown error');
      
      res.status(500).json({
        error: 'Failed to trigger workflow',
        status: n8nResponse.status,
        details: errorText
      });
    }
  } catch (error) {
    console.error('❌ Error triggering workflow:', error);
    res.status(500).json({
      error: 'Failed to trigger workflow',
      details: error.message
    });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Payroll API running on port ${PORT}`);
});
