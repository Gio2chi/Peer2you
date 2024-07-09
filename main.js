require('dotenv').config()
const fs = require('fs')
const App = require('./classes/app') 
const schedule = require('node-schedule');

const app = new App(1 * 60 * 1000);

const job = schedule.scheduleJob({hour: 8, dayOfWeek: 1}, () => {
    app.report('./report.json', process.env.REPORT_EMAIL)
});