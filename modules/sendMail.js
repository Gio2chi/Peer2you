require('dotenv').config()
const mailer = require('nodemailer');

const transport = mailer.createTransport({
    host: 'in.mailjet.com',
    port: 2525,
    auth: {
        user: process.env.MAILJET_API_KEY,
        pass: process.env.MAILJET_API_SECRET,
    },
});

function mailjet({ from = process.env.PROJECT_EMAIL, to, subject, text, attachments }) {
    const json = transport.sendMail({
        from, // From address
        to, // To address
        subject, // Subject
        html: text, // Content
        attachments
    });

    return json;
}

module.exports = mailjet;