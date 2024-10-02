const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');
 

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Extract text from images using Tesseract
const extractTextFromImage = async (imagePath) => {
    try {
        const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
        return text;
    } catch (error) {
        throw new Error('Error extracting text with OCR: ' + error.message);
    }
};

// Convert PDF to images (consider using a different library)
const convertPDFToImages = async (filePath) => {
    const outputDir = path.dirname(filePath);
    const fileBaseName = path.basename(filePath, path.extname(filePath));
    // You will need to implement this using a suitable library
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

// Main endpoint to handle file upload and processing
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

            res.send({
                message: 'PDF processed successfully',
                extractedItems: items.length > 0 ? items : 'No items found in the PDF.',
                text: extractedText,
            });

        } else if (['.jpg', '.jpeg', '.png'].includes(fileExtension)) {
            const ocrOutput = await extractTextFromImage(filePath);
            extractedText = ocrOutput;
            const extractedItems = extractItemsFromText(extractedText);

            res.send({
                message: 'Text extracted successfully',
                items: extractedItems,
                text: extractedText,
            });
        } else {
            return res.status(400).send('Unsupported file type. Please upload a PDF or image.');
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
