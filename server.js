const express = require('express');
const multer = require('multer');
const path = require('path');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static(path.join(__dirname, 'public')));



const extractItemsFromText = (ocrOutput) => {
  const items = [];

const itemRegex = /(\d+)\s+(.+?)\s+\$([\d,\.]+)\s+(\d+)\s+\$([\d,\.]+)/g;
// This regex was for a different invoice format
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

  // General patterns for various invoice formats
  const totalRegex = /\b(?:Total Amount|Total Due|Grand Total|Total Payable|Total)\s*[:\-]?\s*\$?([\d,\.]+)/i;
  const subtotalRegex = /\b(?:Sub-?Total|Item Total|Amount Before Tax|Pre-Tax Total)\s*[:\-]?\s*\$?([\d,\.]+)/i;
  const discountRegex = /\b(?:Discount|Rebate|Promotional Discount|Savings)\s*[:\-]?\s*\$?([\d,\.]+)/i;
  const taxRegex = /\b(?:Tax|Sales Tax|VAT|GST|Tax Rate)\s*[:\-]?\s*\$?([\d,\.]+)/i;
  const accountNumberRegex = /\b(?:Account\s*#|A\/C\s*#|Account\s*Number)\s*[:\-]?\s*([\d\s]+)/i;
  const accountNameRegex = /\b(?:Account Name|A\/C Name|Acc Holder|Account Holder)\s*[:\-]?\s*(.+)/i;
  const dateRegex = /\b(?:Date\s*Issued|Invoice\s*Date|Date)\s*[:\-]?\s*([\d\/\-]+)/i;
  

  // Extracting payment details dynamically
  const totalMatch = totalRegex.exec(ocrOutput);
  const subtotalMatch = subtotalRegex.exec(ocrOutput);
  const discountMatch = discountRegex.exec(ocrOutput);
  const taxMatch = taxRegex.exec(ocrOutput);
  const accountNumberMatch = accountNumberRegex.exec(ocrOutput);
  const accountNameMatch = accountNameRegex.exec(ocrOutput);
  const dateMatch = dateRegex.exec(ocrOutput);
  

  // Storing extracted details in paymentDetails object
  paymentDetails.total = totalMatch ? totalMatch[1] : 'Not found';
  paymentDetails.subtotal = subtotalMatch ? subtotalMatch[1] : 'Not found';
  paymentDetails.discount = discountMatch ? discountMatch[1] : 'Not found';
  paymentDetails.tax = taxMatch ? taxMatch[1] : 'Not found';
  paymentDetails.accountNumber = accountNumberMatch ? accountNumberMatch[1].trim() : 'Not found';
  paymentDetails.accountName = accountNameMatch ? accountNameMatch[1].trim() : 'Not found';
  paymentDetails.date = dateMatch ? dateMatch[1].trim() : 'Not found';
 

  return paymentDetails;
};


// Route to handle file upload and OCR processing
app.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, file.path);
  const fileExtension = path.extname(file.originalname).toLowerCase();

  try {
    let extractedText = '';
 if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
      // Extract text from image using Tesseract
      const { data: { text: ocrOutput } } = await Tesseract.recognize(filePath, 'eng');
      extractedText = ocrOutput;
    } else {
      res.status(400).send('Unsupported file type. Please upload a JPEG, PNG, or PDF.');
      return;
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
