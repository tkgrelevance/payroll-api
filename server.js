const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const https = require('https');

const app = express();

// In-memory storage (we'll upgrade this later)
let payrollData = null;

// NEW: In-memory employee rates storage
let employeeRates = {
  "Kevin Howard": 18.50,
  "Bob Smith": 15.00,
  "Jane Doe": 22.00
  // Default rates - can be managed via admin panel
};

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

// NEW: Get all employee rates
app.get('/api/employee-rates', (req, res) => {
  console.log('📋 Fetching employee rates');
  res.json({
    success: true,
    rates: employeeRates
  });
});

// NEW: Update employee rates
app.post('/api/employee-rates', (req, res) => {
  try {
    const { rates, adminPassword } = req.body;
    
    // Simple password protection (you can enhance this)
    if (adminPassword !== 'payroll2025') {
      return res.status(401).json({
        error: 'Invalid admin password'
      });
    }
    
    console.log('💰 Updating employee rates:', rates);
    employeeRates = { ...rates };
    
    res.json({
      success: true,
      message: 'Employee rates updated',
      rates: employeeRates
    });
  } catch (error) {
    console.error('❌ Error updating rates:', error);
    res.status(500).json({
      error: 'Failed to update rates'
    });
  }
});

// NEW: Get rates for n8n workflow
app.get('/api/rates-for-payroll', (req, res) => {
  console.log('🔍 n8n requesting employee rates');
  res.json({
    success: true,
    employeeRates: employeeRates,
    lastUpdated: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    hasData: !!payrollData,
    employeeCount: Object.keys(employeeRates).length
  });
});

// UPDATED: Real trigger-payroll endpoint that calls n8n
app.post('/api/trigger-payroll', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    console.log('🔄 Triggering payroll workflow with dates:', { startDate, endDate });
    
    // Prepare payload for n8n (now includes rate info)
    const n8nPayload = {
      startDate: startDate,
      endDate: endDate,
      timestamp: new Date().toISOString(),
      rateApiUrl: `${req.protocol}://${req.get('host')}/api/rates-for-payroll`
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
  console.log(`💰 Managing rates for ${Object.keys(employeeRates).length} employees`);
});
