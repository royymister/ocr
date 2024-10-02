const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
const poppler = require('pdf-poppler');
require('dotenv').config();
const app = express();

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

 
// Convert PDF to images
const convertPDFToImages = async (filePath) => {
    const outputDir = path.dirname(filePath);
    const fileBaseName = path.basename(filePath, path.extname(filePath));

    const options = {
        format: 'jpeg',
        out_dir: outputDir,
        out_prefix: fileBaseName,
        page: null // Convert all pages
    };

    try {
        await poppler.convert(filePath, options);
        const files = fs.readdirSync(outputDir)
            .filter(file => file.startsWith(fileBaseName) && file.endsWith('.jpg'));

        return files.map(file => path.join(outputDir, file));
    } catch (error) {
        throw new Error('Error converting PDF to images: ' + error.message);
    }
};

// Extract text from images using Tesseract
const extractTextFromImage = async (imagePath) => {
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
        return text;
    } catch (error) {
        throw new Error('Error extracting text with OCR: ' + error.message);
    }
};

// Function to extract items based on headers
const extractItemsFromText = (text) => {
    const lines = text.split('\n');
    const items = [];
    let headers = {};

    lines.forEach(line => {
        const normalizedLine = line.replace(/\s+/g, ' ').trim();

        // Capture header line
        if (!headers.description && normalizedLine.toLowerCase().includes('description')) {
            headers = {
                description: 'description',
                unitCost: 'unit cost',
                quantity: 'quantity',
                amount: 'amount',
            };
            return; // Skip to the next line after setting headers
        }

        // Capture item lines after headers
        if (Object.keys(headers).length > 0 && normalizedLine !== "") {
            const itemPattern = /^(?<description>.+?)\s+(?<unitCost>\d+(\.\d{1,2})?)\s+(?<quantity>\d+)\s+(?<amount>[\d$]+)/;
            const match = normalizedLine.match(itemPattern);

            if (match) {
                items.push({
                    description: match.groups.description.trim(),
                    unitCost: match.groups.unitCost,
                    quantity: match.groups.quantity,
                    amount: match.groups.amount,
                });
            }
        }
    });

    return items;
};

const loadPaymentDetailsPatterns = () => {
    const rawData = fs.readFileSync('./paymentDetailsConfig.json');
    return JSON.parse(rawData).paymentDetailsPatterns;
};

const extractPaymentDetails = (text) => {
    const paymentDetails = {};
    const patterns = loadPaymentDetailsPatterns();
    const lines = text.split('\n');

    lines.forEach(line => {
        const normalizedLine = line.replace(/\s+/g, ' ').trim();

        patterns.forEach(pattern => {
            const match = normalizedLine.match(new RegExp(pattern.regex, 'i'));
            if (match) {
                paymentDetails[pattern.key] = match[1].trim();
            }
        });
    });

    return paymentDetails;
};
const extractItemsFromImgText = (ocrOutput) => {
  const items = [];

  // Clean up text to remove unnecessary line breaks
  const cleanedText = ocrOutput.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

  // Find the point in text where the header (SL. Item Description Price Qty. Total) exists
  const headerPattern = /SL\.\s+Item\s+Description\s+Price\s+Qty\.\s+Total/;
  const headerIndex = cleanedText.search(headerPattern);

  // Proceed only if the header is found
  if (headerIndex !== -1) {
    // Extract the text after the header
    const itemText = cleanedText.slice(headerIndex + 'SL. Item Description Price Qty. Total'.length).trim();

    // Regex pattern to match item rows (SL, Description, Price, Qty, Total)
    const itemPattern = /(\d+)\s+([a-zA-Z\s,.]+)\s+\$([\d,.]+)\s+(\d+)\s+\$([\d,.]+)/g;

    let match;
    while ((match = itemPattern.exec(itemText)) !== null) {
      items.push({
        SL: match[1].trim(),            // Extracted SL (item number)
        Description: match[2].trim(),   // Extracted item description
        Price: `$${match[3].trim()}`,   // Extracted price
        Quantity: match[4].trim(),      // Extracted quantity
        Amount: `$${match[5].trim()}`,  // Extracted total amount
      });
    }
  }

  return items;
};

const extractPaymentDetailsFromText = (ocrOutput) => {
 const paymentDetails = {};

 // Regular expressions for different variations of payment details
 const totalRegex = /TOTAL\s*[:\s]*\$?([\d,\.]+)/i; // More flexible for "TOTAL" with/without $ sign
 const taxRegex = /Tax(?: Rate)?\s*[:\s]*\$?([\d,\.]+)/i; // Handles "Tax" or "Tax Rate"
 const accountNumberRegex = /Account #\s*[:\s]*([\d\s]+)/i; // More flexible matching
 const accountNameRegex = /A\/C Name\s*[:\s]*(.+)/i; // A/C Name
 const dateRegex = /Date\s*[:\s]*([\d\/]+)/i; // Extract date with optional :
//  const termsAndConditionsRegex = /Terms and Conditions\s*([\s\S]+?)\s*(Subtotal|Payment Info|Shipping)/i; // Handle dynamic content

 // Extracting payment details
 const totalMatch = totalRegex.exec(ocrOutput);
 const taxMatch = taxRegex.exec(ocrOutput);
 const accountNumberMatch = accountNumberRegex.exec(ocrOutput);
 const accountNameMatch = accountNameRegex.exec(ocrOutput);
 const dateMatch = dateRegex.exec(ocrOutput);
//  const termsAndConditionsMatch = termsAndConditionsRegex.exec(ocrOutput);

 // Storing extracted details in paymentDetails object
 paymentDetails.total = totalMatch ? totalMatch[1] : 'Not found';
 paymentDetails.tax = taxMatch ? taxMatch[1] : 'Not found';
 paymentDetails.accountNumber = accountNumberMatch ? accountNumberMatch[1].trim() : 'Not found';
 paymentDetails.accountName = accountNameMatch ? accountNameMatch[1].trim() : 'Not found';
 paymentDetails.date = dateMatch ? dateMatch[1].trim() : 'Not found';
//  paymentDetails.termsAndConditions = termsAndConditionsMatch ? termsAndConditionsMatch[1].replace(/\n/g, ' ').trim() : 'Not found';

 return paymentDetails;
};

app.post('/', upload.single('file'), async (req, res) => {
    const file = req.file;

    if (!file) {
        return res.status(400).send('File is required.');
    }

    const filePath = path.join(__dirname, file.path);
    const fileExtension = path.extname(file.originalname).toLowerCase();

    try {
        let extractedText = '';


        if (fileExtension === '.pdf') {
            const imageFiles = await convertPDFToImages(filePath);

            for (const image of imageFiles) {
                const imageText = await extractTextFromImage(image);
                extractedText += imageText + '\n';  
                fs.unlinkSync(image);  
            }
            const items = extractItemsFromText(extractedText);
            const paymentDetails = extractPaymentDetails(extractedText);
    
            res.send({
                message: 'PDF processed successfully',
                extractedItems: items.length > 0 ? items : 'No items found in the PDF.',
                paymentDetails: Object.keys(paymentDetails).length > 0 ? paymentDetails : 'No payment details found in the PDF.',
                text : extractedText,
            });

        }

        else if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
          const { data: { text: ocrOutput } } = await Tesseract.recognize(filePath, 'eng');
          extractedText = ocrOutput;
          const extractedItems = extractItemsFromImgText(extractedText);
          const paymentDetails = extractPaymentDetailsFromText(extractedText);
      
          res.send({
            message: 'Text extracted successfully',
            paymentDetails: paymentDetails,
            items: extractedItems,
            text: extractedText,  
          });
        }
           else {
            return res.status(400).send('Unsupported file type. Please upload a PDF.');
        }

       

    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while processing the file.');
    } finally {
        fs.unlinkSync(filePath);
    }
});

 

app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
});
