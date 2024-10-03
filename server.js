const express = require('express');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const { PDFParser } = require('pdf2json');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));

// Function to extract text from PDF
const extractTextFromPDF = (filePath) => {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();
    pdfParser.on('pdfParser_dataError', errData => reject(errData.parserError));
    pdfParser.on('pdfParser_dataReady', pdfData => {
      let extractedText = pdfParser.getRawTextContent();
      resolve(extractedText);
    });
    pdfParser.loadPDF(filePath);
  });
};

// Function to extract items from OCR text
const extractItemsFromText = (ocrOutput) => {
  const items = [];
  const itemRegex = /(\d+)\s+(.+?)\s+\$([\d,\.]+)\s+(\d+)\s+\$([\d,\.]+)/g;
  let match;

  while ((match = itemRegex.exec(ocrOutput)) !== null) {
    items.push({
      Number: match[1],
      Description: match[2].trim(),
      Price: match[3],
      Quantity: match[4],
      Total: match[5],
    });
  }

  return items;
};

const extractPaymentDetailsFromText = (ocrOutput) => {
  const paymentDetails = {};

  // Regular expressions for different variations of payment details
  const totalRegex = /TOTAL\s*[:\s]*\$?([\d,\.]+)/i;
  const taxRegex = /Tax(?: Rate)?\s*[:\s]*\$?([\d,\.]+)/i;
  const accountNumberRegex = /Account #\s*[:\s]*([\d\s]+)/i;
  const accountNameRegex = /A\/C Name\s*[:\s]*(.+)/i;
  const dateRegex = /Date\s*[:\s]*([\d\/]+)/i;
  const termsAndConditionsRegex = /Terms and Conditions\s*([\s\S]+?)\s*(Subtotal|Payment Info|Shipping)/i;

  // Extracting payment details
  const totalMatch = totalRegex.exec(ocrOutput);
  const taxMatch = taxRegex.exec(ocrOutput);
  const accountNumberMatch = accountNumberRegex.exec(ocrOutput);
  const accountNameMatch = accountNameRegex.exec(ocrOutput);
  const dateMatch = dateRegex.exec(ocrOutput);
  const termsAndConditionsMatch = termsAndConditionsRegex.exec(ocrOutput);

  // Storing extracted details in paymentDetails object
  paymentDetails.total = totalMatch ? totalMatch[1] : 'Not found';
  paymentDetails.tax = taxMatch ? taxMatch[1] : 'Not found';
  paymentDetails.accountNumber = accountNumberMatch ? accountNumberMatch[1].trim() : 'Not found';
  paymentDetails.accountName = accountNameMatch ? accountNameMatch[1].trim() : 'Not found';
  paymentDetails.date = dateMatch ? dateMatch[1].trim() : 'Not found';
  paymentDetails.termsAndConditions = termsAndConditionsMatch ? termsAndConditionsMatch[1].replace(/\n/g, ' ').trim() : 'Not found';

  return paymentDetails;
};

// Route to handle file upload and OCR processing
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, file.path);
  const fileExtension = path.extname(file.originalname).toLowerCase();

  try {
    let extractedText = '';

    if (fileExtension === '.pdf') {
      // Extract text from PDF
      extractedText = await extractTextFromPDF(filePath);
    } else if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
      // Extract text from image using Tesseract
      const { data: { text: ocrOutput } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = ocrOutput;
    } else {
      return res.status(400).send('Unsupported file type. Please upload a JPEG, PNG, or PDF.');
    }

    // Extract items and payment details from the text
    const extractedItems = extractItemsFromText(extractedText);
    const paymentDetails = extractPaymentDetailsFromText(extractedText);

    res.send({
      message: 'Text extracted successfully',
      paymentDetails: paymentDetails,
      items: extractedItems,
      text: extractedText,  
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('An error occurred while processing the file.');
  } finally {
    // Clean up the uploaded file
    fs.unlinkSync(filePath);
  }
});

app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
