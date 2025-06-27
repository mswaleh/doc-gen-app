// Generate basic DOCX
async function generateBasicDocx(content, outputPath) {
  const paragraphs = content.split('\n').map(line => 
    new Paragraph({
      children: [new TextRun(line)]
    })
  );
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs
    }]
  });
  
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
}

// Generate basic PDF
async function generateBasicPdf(content, outputPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(outputPath));
    
    // Split content into lines and add to PDF
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) doc.moveDown();
      doc.text(line, {
        width: 500,
        align: 'left'
      });
    });
    
    doc.end();
    
    doc.on('end', () => {
      resolve();
    });
    
    doc.on('error', (err) => {
      reject(err);
    });
  });
}// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const mammoth = require('mammoth');
const officegen = require('officegen');
const PDFDocument = require('pdfkit');
const pdfParse = require('pdf-parse');
const { PDFDocument: PDFLib, rgb, StandardFonts } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.txt', '.md', '.doc', '.docx', '.pdf'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload .txt, .md, .doc, .docx, or .pdf files.'));
    }
  }
});

// Store templates and their variables
let templates = {};

// Extract text content and formatting from various file types
async function extractContentFromFile(filePath, originalName) {
  const fileExt = path.extname(originalName).toLowerCase();
  
  try {
    switch (fileExt) {
      case '.txt':
      case '.md':
        const textContent = fs.readFileSync(filePath, 'utf8');
        return {
          text: textContent,
          formatting: null,
          type: 'text',
          originalPath: filePath
        };
        
      case '.doc':
      case '.docx':
        // Extract both text and preserve the original file for templating
        const textResult = await mammoth.extractRawText({ path: filePath });
        
        // Store original file for template-based processing
        return {
          text: textResult.value,
          formatting: 'docx',
          type: 'docx',
          originalPath: filePath,
          hasRichFormatting: true
        };
        
      case '.pdf':
        const pdfBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(pdfBuffer);
        
        // Store the original PDF for format preservation
        return {
          text: pdfData.text,
          originalPath: filePath,
          formatting: 'pdf',
          type: 'pdf',
          metadata: pdfData.info,
          hasRichFormatting: true
        };
        
      default:
        throw new Error('Unsupported file format');
    }
  } catch (error) {
    throw new Error(`Failed to extract content from ${fileExt} file: ${error.message}`);
  }
}

// Generate document with preserved formatting using template approach
async function generateFormattedDocument(templateData, variables, format, outputPath) {
  return new Promise(async (resolve, reject) => {
    try {
      switch (templateData.type) {
        case 'docx':
          if (format === 'docx') {
            // Use docxtemplater for true format preservation
            await generateDocxWithTemplating(templateData.originalPath, variables, outputPath);
          } else if (format === 'pdf') {
            // Convert formatted DOCX to PDF
            await generatePdfFromDocx(templateData.originalPath, variables, outputPath);
          } else {
            // Fallback to text
            const content = replaceVariables(templateData.text, variables);
            fs.writeFileSync(outputPath, content);
          }
          break;
          
        case 'pdf':
          if (format === 'pdf') {
            // Use advanced PDF templating
            await generatePdfWithTemplating(templateData.originalPath, variables, outputPath);
          } else if (format === 'docx') {
            // Convert PDF template to DOCX with variables
            await generateDocxFromPdf(templateData.text, variables, outputPath);
          } else {
            // Text output
            const content = replaceVariables(templateData.text, variables);
            fs.writeFileSync(outputPath, content);
          }
          break;
          
        case 'text':
        default:
          const content = replaceVariables(templateData.text, variables);
          if (format === 'docx') {
            await generateBasicDocx(content, outputPath);
          } else if (format === 'pdf') {
            await generateBasicPdf(content, outputPath);
          } else {
            fs.writeFileSync(outputPath, content);
          }
          break;
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Generate DOCX with preserved formatting using docxtemplater
async function generateDocxWithTemplating(templatePath, variables, outputPath) {
  try {
    // Read the template file
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    
    // Create docxtemplater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // Set template variables
    doc.setData(variables);
    
    try {
      // Render the document
      doc.render();
    } catch (error) {
      // If templater fails, fall back to text replacement approach
      console.warn('Docxtemplater failed, falling back to text replacement:', error);
      await generateDocxFallback(templatePath, variables, outputPath);
      return;
    }
    
    // Generate and save the document
    const buf = doc.getZip().generate({ type: 'nodebuffer' });
    fs.writeFileSync(outputPath, buf);
    
  } catch (error) {
    console.error('DOCX templating failed:', error);
    // Fallback to basic DOCX generation
    const content = replaceVariables(fs.readFileSync(templatePath, 'utf8'), variables);
    await generateBasicDocx(content, outputPath);
  }
}

// Fallback DOCX generation when templating fails
async function generateDocxFallback(templatePath, variables, outputPath) {
  try {
    // Extract text and replace variables
    const result = await mammoth.extractRawText({ path: templatePath });
    const content = replaceVariables(result.value, variables);
    
    // Generate new DOCX with the content
    await generateBasicDocx(content, outputPath);
  } catch (error) {
    throw new Error('Failed to generate DOCX document: ' + error.message);
  }
}

// Generate PDF with advanced templating
async function generatePdfWithTemplating(templatePath, variables, outputPath) {
  try {
    // Read the original PDF
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFLib.load(existingPdfBytes);
    
    // Get all pages
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // Extract text to find variable positions
    const pdfBuffer = fs.readFileSync(templatePath);
    const pdfData = await pdfParse(pdfBuffer);
    let textContent = pdfData.text;
    
    // Replace variables in text content
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      textContent = textContent.replace(regex, value || '');
    }
    
    // Create a new PDF with the processed content overlaid on original
    // This preserves the background formatting while updating text
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      
      // Find and replace variables on each page
      for (const [key, value] of Object.entries(variables)) {
        // This is a simplified approach - in production you'd want more sophisticated text detection
        const variablePattern = `{{${key}}}`;
        
        // For demo purposes, we'll overlay text at common positions
        // In a real implementation, you'd parse the PDF structure to find exact positions
        page.drawText(String(value || ''), {
          x: 50,
          y: height - 100 - (Object.keys(variables).indexOf(key) * 25),
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
    }
    
    // Save the modified PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);
    
  } catch (error) {
    console.error('PDF templating failed, using fallback:', error);
    // Fallback to creating a new PDF
    const content = replaceVariables('Original PDF content:\n\n' + Object.entries(variables).map(([k, v]) => `${k}: ${v}`).join('\n'), {});
    await generateBasicPdf(content, outputPath);
  }
}

// Generate PDF from DOCX template
async function generatePdfFromDocx(templatePath, variables, outputPath) {
  try {
    // First generate DOCX with variables
    const tempDocxPath = outputPath.replace('.pdf', '.temp.docx');
    await generateDocxWithTemplating(templatePath, variables, tempDocxPath);
    
    // Convert DOCX to PDF (this would require additional libraries like libreoffice-convert)
    // For now, we'll extract text and create a PDF
    const result = await mammoth.extractRawText({ path: tempDocxPath });
    await generateBasicPdf(result.value, outputPath);
    
    // Clean up temp file
    if (fs.existsSync(tempDocxPath)) {
      fs.unlinkSync(tempDocxPath);
    }
    
  } catch (error) {
    console.error('DOCX to PDF conversion failed:', error);
    // Fallback
    const content = replaceVariables('Template content with variables:\n\n' + Object.entries(variables).map(([k, v]) => `${k}: ${v}`).join('\n'), {});
    await generateBasicPdf(content, outputPath);
  }
}

// Generate DOCX from PDF template
async function generateDocxFromPdf(textContent, variables, outputPath) {
  const content = replaceVariables(textContent, variables);
  await generateBasicDocx(content, outputPath);
}

// Extract variables from template content
function extractVariables(content) {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = [];
  let match;
  
  while ((match = variableRegex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  
  return variables;
}

// Replace variables in template with actual values
function replaceVariables(template, variables) {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value);
  }
  
  return result;
}

// Routes

// Upload template
app.post('/api/upload-template', upload.single('template'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    // Extract content and formatting from file
    const contentData = await extractContentFromFile(filePath, originalName);
    const variables = extractVariables(contentData.text);
    
    const templateId = Date.now().toString();
    const fileExt = path.extname(originalName).toLowerCase();
    
    templates[templateId] = {
      id: templateId,
      name: originalName,
      contentData: contentData, // Store full content data including formatting
      variables: variables,
      filePath: filePath,
      originalFormat: fileExt.substring(1) // Remove the dot
    };

    res.json({
      templateId: templateId,
      name: originalName,
      variables: variables,
      format: fileExt.substring(1),
      hasFormatting: contentData.hasRichFormatting || false
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all templates
app.get('/api/templates', (req, res) => {
  const templateList = Object.values(templates).map(t => ({
    id: t.id,
    name: t.name,
    variables: t.variables,
    originalFormat: t.originalFormat,
    hasFormatting: t.contentData.hasRichFormatting || false
  }));
  res.json(templateList);
});

// Get specific template
app.get('/api/templates/:id', (req, res) => {
  const template = templates[req.params.id];
  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }
  res.json(template);
});

// Generate document from template
app.post('/api/generate/:templateId', async (req, res) => {
  try {
    const template = templates[req.params.templateId];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const variables = req.body.variables || {};
    const outputFormat = req.body.format || 'txt'; // Default to txt
    const generatedText = replaceVariables(template.contentData.text, variables);
    
    // Determine file extension for output
    const fileExtensions = {
      'txt': '.txt',
      'docx': '.docx',
      'pdf': '.pdf'
    };
    
    const fileExt = fileExtensions[outputFormat] || '.txt';
    const outputFileName = `generated-${Date.now()}${fileExt}`;
    const outputPath = path.join('generated', outputFileName);
    
    if (!fs.existsSync('generated')) {
      fs.mkdirSync('generated');
    }
    
    // Generate document with preserved formatting
    await generateFormattedDocument(template.contentData, variables, outputFormat, outputPath);

    res.json({
      content: generatedText,
      downloadUrl: `/download/${outputFileName}`,
      format: outputFormat,
      filename: outputFileName,
      preservedFormatting: template.contentData.formatting !== null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download generated document
app.get('/download/:filename', (req, res) => {
  const filePath = path.join('generated', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Get example variables for demonstration
app.get('/api/example-variables', (req, res) => {
  const examples = {
    name: "John Doe",
    company: "Acme Corporation",
    date: new Date().toLocaleDateString(),
    position: "Software Developer",
    salary: "$75,000",
    address: "123 Main Street, Anytown, USA",
    phone: "(555) 123-4567",
    email: "john.doe@email.com",
    startDate: "January 15, 2024",
    department: "Engineering",
    manager: "Jane Smith",
    projectName: "Website Redesign",
    amount: "$10,000",
    dueDate: "December 31, 2024"
  };
  
  res.json(examples);
});

// Add these routes to your existing server.js file

// CORS configuration for Salesforce
app.use((req, res, next) => {
  // Allow Salesforce domains
  const allowedOrigins = [
    'https://*.salesforce.com',
    'https://*.force.com',
    'https://*.lightning.force.com',
    'https://*.my.salesforce.com',
    'http://localhost:3000' // For development
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.some(allowed => origin && origin.match(allowed.replace('*', '.*')))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // Allow iframe embedding from same origin
  next();
});

// New route: Get templates with Salesforce-specific metadata
app.get('/api/salesforce/templates', (req, res) => {
  try {
    const salesforceTemplates = Object.values(templates).map(template => ({
      id: template.id,
      name: template.name,
      variables: template.variables,
      originalFormat: template.originalFormat,
      hasFormatting: template.contentData.hasRichFormatting || false,
      variableCount: template.variables.length,
      salesforceCompatible: true,
      mappableFields: getSalesforceFieldMappings(template.variables)
    }));
    
    res.json(salesforceTemplates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// New route: Generate document with Salesforce record data
app.post('/api/salesforce/generate/:templateId', async (req, res) => {
  try {
    const template = templates[req.params.templateId];
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const { recordData, outputFormat = 'pdf', recordId, objectType } = req.body;
    
    // Map Salesforce fields to template variables
    const mappedVariables = mapSalesforceFields(recordData, template.variables);
    
    // Generate the document
    const outputFileName = `${objectType}-${recordId}-${Date.now()}.${outputFormat}`;
    const outputPath = path.join('generated', outputFileName);
    
    if (!fs.existsSync('generated')) {
      fs.mkdirSync('generated');
    }
    
    await generateFormattedDocument(template.contentData, mappedVariables, outputFormat, outputPath);
    
    // Convert to base64 for Salesforce
    const fileBuffer = fs.readFileSync(outputPath);
    const base64Data = fileBuffer.toString('base64');
    
    res.json({
      success: true,
      documentData: base64Data,
      filename: outputFileName,
      downloadUrl: `/download/${outputFileName}`,
      format: outputFormat,
      recordId: recordId,
      templateName: template.name
    });
    
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// New route: Health check for Salesforce
app.get('/api/salesforce/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    templatesCount: Object.keys(templates).length,
    version: '1.0.0'
  });
});

// Helper function to map Salesforce fields to template variables
function mapSalesforceFields(recordData, templateVariables) {
  const mappedVariables = {};
  
  // Common Salesforce field mappings
  const fieldMappings = {
    'name': ['Name', 'FirstName', 'LastName', 'Subject'],
    'company': ['Account.Name', 'Company', 'CompanyName'],
    'email': ['Email', 'Contact.Email'],
    'phone': ['Phone', 'MobilePhone', 'WorkPhone'],
    'address': ['BillingStreet', 'MailingStreet', 'Street'],
    'city': ['BillingCity', 'MailingCity', 'City'],
    'state': ['BillingState', 'MailingState', 'State'],
    'postalcode': ['BillingPostalCode', 'MailingPostalCode', 'PostalCode'],
    'country': ['BillingCountry', 'MailingCountry', 'Country'],
    'date': ['CreatedDate', 'LastModifiedDate', 'CloseDate'],
    'owner': ['Owner.Name', 'OwnerName'],
    'amount': ['Amount', 'AnnualRevenue'],
    'status': ['Status', 'StageName', 'Priority'],
    'description': ['Description', 'Notes'],
    'casenumber': ['CaseNumber'],
    'priority': ['Priority'],
    'type': ['Type'],
    'industry': ['Industry'],
    'title': ['Title'],
    'department': ['Department']
  };
  
  // First, try direct mapping
  templateVariables.forEach(variable => {
    const lowerVar = variable.toLowerCase();
    
    // Direct field match
    if (recordData[variable]) {
      mappedVariables[variable] = recordData[variable];
      return;
    }
    
    // Field mapping match
    if (fieldMappings[lowerVar]) {
      for (const fieldName of fieldMappings[lowerVar]) {
        if (recordData[fieldName]) {
          mappedVariables[variable] = recordData[fieldName];
          break;
        }
      }
    }
    
    // Fuzzy match
    if (!mappedVariables[variable]) {
      const fuzzyMatch = findFuzzyMatch(lowerVar, Object.keys(recordData));
      if (fuzzyMatch && recordData[fuzzyMatch]) {
        mappedVariables[variable] = recordData[fuzzyMatch];
      }
    }
    
    // Default value if no match
    if (!mappedVariables[variable]) {
      mappedVariables[variable] = `{{${variable}}}`;
    }
  });
  
  // Add special computed fields
  mappedVariables['currentDate'] = new Date().toLocaleDateString();
  mappedVariables['currentDateTime'] = new Date().toLocaleString();
  mappedVariables['recordUrl'] = recordData.Id ? `https://yourinstance.salesforce.com/${recordData.Id}` : '';
  
  // Build full address if components exist
  const addressComponents = [
    recordData['BillingStreet'] || recordData['MailingStreet'],
    recordData['BillingCity'] || recordData['MailingCity'],
    recordData['BillingState'] || recordData['MailingState'],
    recordData['BillingPostalCode'] || recordData['MailingPostalCode'],
    recordData['BillingCountry'] || recordData['MailingCountry']
  ].filter(Boolean);
  
  if (addressComponents.length > 0) {
    mappedVariables['fullAddress'] = addressComponents.join(', ');
  }
  
  return mappedVariables;
}

// Helper function for fuzzy matching
function findFuzzyMatch(target, candidates) {
  const targetLower = target.toLowerCase();
  
  // Exact match
  let exactMatch = candidates.find(c => c.toLowerCase() === targetLower);
  if (exactMatch) return exactMatch;
  
  // Contains match
  let containsMatch = candidates.find(c => 
    c.toLowerCase().includes(targetLower) || targetLower.includes(c.toLowerCase())
  );
  if (containsMatch) return containsMatch;
  
  // Similar match (simple algorithm)
  let bestMatch = null;
  let bestScore = 0;
  
  candidates.forEach(candidate => {
    const candLower = candidate.toLowerCase();
    let score = 0;
    
    // Character similarity
    for (let char of targetLower) {
      if (candLower.includes(char)) score++;
    }
    
    // Length similarity bonus
    const lengthDiff = Math.abs(targetLower.length - candLower.length);
    score -= lengthDiff * 0.1;
    
    if (score > bestScore && score > targetLower.length * 0.6) {
      bestScore = score;
      bestMatch = candidate;
    }
  });
  
  return bestMatch;
}

// Helper function to get Salesforce field mappings for a template
function getSalesforceFieldMappings(templateVariables) {
  return templateVariables.map(variable => ({
    templateVariable: variable,
    suggestedSalesforceFields: getSuggestedFields(variable),
    mappingConfidence: getMappingConfidence(variable)
  }));
}

function getSuggestedFields(variable) {
  const lowerVar = variable.toLowerCase();
  
  const suggestions = {
    'name': ['Name', 'FirstName + LastName', 'Subject'],
    'company': ['Account.Name', 'CompanyName'],
    'email': ['Email', 'Contact.Email'],
    'phone': ['Phone', 'MobilePhone'],
    'address': ['BillingStreet', 'MailingStreet'],
    'amount': ['Amount', 'AnnualRevenue'],
    'date': ['CreatedDate', 'CloseDate'],
    'owner': ['Owner.Name']
  };
  
  return suggestions[lowerVar] || [variable];
}

function getMappingConfidence(variable) {
  const highConfidence = ['name', 'email', 'phone', 'company', 'address'];
  const mediumConfidence = ['amount', 'date', 'status', 'owner'];
  
  const lowerVar = variable.toLowerCase();
  
  if (highConfidence.includes(lowerVar)) return 'high';
  if (mediumConfidence.includes(lowerVar)) return 'medium';
  return 'low';
}

// Enhanced HTML page with Salesforce integration
app.get('/salesforce', (req, res) => {
  const { recordId, objectType, templateId } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Document Generator - Salesforce Integration</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/design-system/2.22.2/styles/salesforce-lightning-design-system.min.css">
        <style>
            body { margin: 0; padding: 20px; background: #f3f2f2; }
            .salesforce-mode { border: 2px solid #0176d3; border-radius: 8px; }
        </style>
    </head>
    <body class="slds-scope">
        <div class="slds-card salesforce-mode">
            <div class="slds-card__header">
                <h2 class="slds-text-heading_medium">
                    Document Generator - Salesforce Mode
                </h2>
                <p class="slds-text-body_small">
                    Record ID: ${recordId || 'Not provided'} | Object: ${objectType || 'Not provided'}
                </p>
            </div>
            <div class="slds-card__body slds-card__body_inner">
                <div id="app">Loading...</div>
            </div>
        </div>
        
        <script>
            // Listen for messages from Salesforce LWC
            window.addEventListener('message', function(event) {
                console.log('Received message:', event.data);
                
                if (event.data.source === 'salesforce') {
                    handleSalesforceMessage(event.data);
                }
            });
            
            function handleSalesforceMessage(message) {
                switch(message.action) {
                    case 'recordData':
                        populateRecordData(message.data);
                        break;
                    case 'selectTemplate':
                        selectTemplate(message.data.templateId);
                        break;
                    case 'fillRecordData':
                        fillFormWithRecordData(message.data.variables);
                        break;
                }
            }
            
            function populateRecordData(data) {
                console.log('Record data received:', data);
                // Implement your UI updates here
            }
            
            function selectTemplate(templateId) {
                console.log('Template selected:', templateId);
                // Implement template selection logic
            }
            
            function fillFormWithRecordData(variables) {
                console.log('Filling form with variables:', variables);
                // Implement form filling logic
            }
            
            // Notify Salesforce that the app is ready
            function notifySalesforce(action, data) {
                window.parent.postMessage({
                    action: action,
                    data: data,
                    source: 'nodeapp'
                }, '*');
            }
            
            // Initialize
            document.addEventListener('DOMContentLoaded', function() {
                notifySalesforce('ready', { recordId: '${recordId}', objectType: '${objectType}' });
            });
        </script>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Upload templates and generate documents!');
});
