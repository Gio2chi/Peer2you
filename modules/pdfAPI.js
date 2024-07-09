const fs = require('fs');
const path = require('path');
const pdfParser = require('pdf-parse')

let file = fs.readFileSync(path.join(__dirname, '../pdf/0.pdf'))

pdfParser(file).then(data => {
    console.log(data)
})